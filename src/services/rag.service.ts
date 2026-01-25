import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ContentFile, ChunkStatus } from '../schema/entities/content-file.entity';
import { TranscriptChunk } from '../schema/entities/transcript-chunk.entity';
import { CourseContent } from '../schema/entities/course-content.entity';
import { SystemParameter } from '../schema/entities/system-parameter.entity';
import { SystemParameterService } from './system-parameter.service';
import { StorageService } from './storage.service';
import { UpdateRagScheduleDto } from '../schema/dtos/update-rag-schedule.dto';

@Injectable()
export class RagService implements OnModuleInit {
    private readonly logger = new Logger(RagService.name);
    private readonly ragApiUrl = 'https://rag.nguyenduc.click/transcribe';
    private readonly intervalName = 'rag-chunking-job';
    private isProcessing = false;

    constructor(
        @InjectRepository(ContentFile)
        private readonly contentFileRepo: Repository<ContentFile>,
        @InjectRepository(TranscriptChunk)
        private readonly transcriptChunkRepo: Repository<TranscriptChunk>,
        @InjectRepository(CourseContent)
        private readonly courseContentRepo: Repository<CourseContent>,
        @InjectRepository(SystemParameter)
        private readonly systemParamRepo: Repository<SystemParameter>,
        private readonly systemParamService: SystemParameterService,
        private readonly storageService: StorageService,
        private readonly dataSource: DataSource,
        private readonly schedulerRegistry: SchedulerRegistry,
    ) {}

    async onModuleInit() {
        const isEnabled = await this.systemParamService.getValue('IS_SCHEDULE', 'N', true);
        if (isEnabled === 'Y') {
            const scheduleSeconds = await this.systemParamService.getNumber('RAG_SCHEDULE', 3600);
            this.startSchedule(scheduleSeconds);
        }
    }

    startSchedule(intervalSeconds: number) {
        if (this.schedulerRegistry.doesExist('interval', this.intervalName)) {
            this.schedulerRegistry.deleteInterval(this.intervalName);
        }

        const interval = setInterval(() => {
            this.processChunking();
        }, intervalSeconds * 1000);

        this.schedulerRegistry.addInterval(this.intervalName, interval);
        this.logger.log(`RAG job started: chạy mỗi ${intervalSeconds}s`);
    }

    stopSchedule() {
        if (this.schedulerRegistry.doesExist('interval', this.intervalName)) {
            this.schedulerRegistry.deleteInterval(this.intervalName);
            this.logger.log('RAG job stopped');
        }
    }

    async updateSchedule(dto?: UpdateRagScheduleDto) {
        if (dto?.is_schedule !== undefined) {
            await this.systemParamRepo.update(
                { param_key: 'IS_SCHEDULE' },
                { param_value: dto.is_schedule }
            );
            this.systemParamService.clearCache('IS_SCHEDULE');
        }

        if (dto?.schedule_seconds !== undefined) {
            await this.systemParamRepo.update(
                { param_key: 'RAG_SCHEDULE' },
                { param_value: String(dto.schedule_seconds) }
            );
            this.systemParamService.clearCache('RAG_SCHEDULE');
        }

        const isEnabled = await this.systemParamService.getValue('IS_SCHEDULE', 'N', true);

        if (isEnabled !== 'Y') {
            this.stopSchedule();
            return { message: 'Job đã dừng (IS_SCHEDULE = N)' };
        }

        const scheduleSeconds = await this.systemParamService.getNumber('RAG_SCHEDULE', 3600);
        this.startSchedule(scheduleSeconds);

        return {
            message: 'Job đã cập nhật',
            interval_seconds: scheduleSeconds,
            status: 'running'
        };
    }

    async processChunking(): Promise<{ processed: number; failed: number; skipped: number }> {
        if (this.isProcessing) {
            this.logger.warn('Job đang chạy, bỏ qua lần này');
            return { processed: 0, failed: 0, skipped: 0 };
        }

        this.isProcessing = true;
        let processed = 0;
        let failed = 0;
        let skipped = 0;

        try {
            const isScheduleEnabled = await this.systemParamService.getValue('IS_SCHEDULE', 'N', true);
            const scheduleSeconds = await this.systemParamService.getNumber('RAG_SCHEDULE', 3600);
            const jobLimit = await this.systemParamService.getNumber('JOB_LIMIT', 10);

            this.logger.log('=== RAG JOB PARAMETERS ===');
            this.logger.log(`IS_SCHEDULE: ${isScheduleEnabled}`);
            this.logger.log(`RAG_SCHEDULE: ${scheduleSeconds} seconds`);
            this.logger.log(`JOB_LIMIT: ${jobLimit}`);
            this.logger.log('========================');

            const files = await this.contentFileRepo.find({
                where: { status_chunks: ChunkStatus.NEW },
                take: jobLimit,
                relations: ['content'],
            });

            this.logger.log(`Tìm thấy ${files.length} file cần xử lý`);

            for (const file of files) {
                try {
                    await this.contentFileRepo.update(
                        { file_id: file.file_id },
                        { status_chunks: ChunkStatus.PEND }
                    );

                    await this.processFile(file);
                    processed++;
                } catch (error: any) {
                    this.logger.error(`Lỗi khi xử lý file ${file.file_id}: ${error.message}`);

                    await this.contentFileRepo.update(
                        { file_id: file.file_id },
                        { status_chunks: ChunkStatus.FAIL }
                    );

                    failed++;
                }
            }

            this.logger.log(`Hoàn thành: ${processed} thành công, ${failed} lỗi`);
        } catch (error: any) {
            this.logger.error(`Lỗi khi chạy job: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }

        return { processed, failed, skipped };
    }

    private async processFile(file: ContentFile): Promise<void> {
        this.logger.log(`Đang xử lý file: ${file.file_id} - ${file.filename}`);

        const sasUrl = await this.storageService.generateSasUrlFromUrl(file.url, file.file_type, 2);

        const requestBody = { url: sasUrl };
        this.logger.log(`\n=== CURL COMMAND ===`);
        this.logger.log(`curl --location '${this.ragApiUrl}' \\`);
        this.logger.log(`--header 'Content-Type: application/json' \\`);
        this.logger.log(`--data '${JSON.stringify(requestBody)}'`);
        this.logger.log(`===================\n`);

        const response = await fetch(this.ragApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(`RAG API error: ${response.status}`);
            throw new Error(`RAG API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (data.status !== 200 || !data.data?.chunks) {
            throw new Error('Invalid response from RAG API');
        }

        this.logger.log(`Nhận được ${data.data.total_chunks} chunks từ RAG API`);

        const courseContent = await this.courseContentRepo.findOne({
            where: { content_id: file.content_id },
        });

        const courseId = courseContent?.courses_id || null;

        await this.dataSource.transaction(async (manager) => {
            for (const chunk of data.data.chunks) {
                await manager.query(
                    `INSERT INTO transcript_chunks
                     (content_id, course_id, chunk_text, chunk_index, start_time, end_time, embedding, chunk_text_tsv)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector('simple', $3))`,
                    [
                        file.content_id,
                        courseId,
                        chunk.chunk_text,
                        chunk.chunk_index,
                        chunk.start_time || null,
                        chunk.end_time || null,
                        JSON.stringify(chunk.embedding),
                    ]
                );
            }

            file.status_chunks = ChunkStatus.SUCC;
            await manager.save(file);
        });

        this.logger.log(`File ${file.file_id} đã được chunks thành công`);
    }
}
