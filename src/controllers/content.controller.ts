import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Req,
    UseGuards,
    UseInterceptors,
    UploadedFiles
} from '@nestjs/common';
import {FilesInterceptor} from '@nestjs/platform-express';
import {JwtAuthGuard} from '../common/guards/jwt-auth.guard';
import {RolesGuard} from '../common/guards/roles.guard';
import {Roles} from '../common/guards/roles.decorator';
import {SystemRole} from '../schema/entities/role.entity';
import {ContentService} from '../services/content.service';
import {StorageService} from '../services/storage.service';
import {CreateContentDto} from '../schema/dtos/create-content.dto';
import {UpdateContentDto} from '../schema/dtos/update-content.dto';
import {Request} from 'express';
import {STORAGE_CONTAINERS} from '../constants/storage';
import * as path from 'path';

@Controller('contents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContentController {
    constructor(
        private readonly contentService: ContentService,
        private readonly storageService: StorageService
    ) {
    }

    @Post()
    @HttpCode(201)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    @UseInterceptors(FilesInterceptor('files', 10))
    async create(
        @Body() body: any,
        @UploadedFiles() files: any[],
        @Req() req: Request
    ) {
        const ownerId = (req as any).user?.id ?? null;

        let uploadedFiles: any[] = [];
        let tempContentId: string | null = null;

        if (files && files.length > 0) {
            const tempContent = await this.contentService.createTempContent(body.course_id, ownerId);
            tempContentId = String(tempContent.content_id);

            const uploadPromises = files.map(async (file, index) => {
                const fileType = this.detectFileType(file.mimetype);
                const container = fileType === 'video' ? STORAGE_CONTAINERS.VIDEOS : STORAGE_CONTAINERS.DOCUMENTS;
                const extension = path.extname(file.originalname);
                const newFilename = `content_${tempContentId}_${index + 1}${extension}`;
                
                const result = await this.storageService.upload(
                    file.buffer,
                    newFilename,
                    file.mimetype,
                    container
                );

                return {
                    title: result.blobName.substring(0, result.blobName.lastIndexOf('.')) || result.blobName,
                    filename: result.blobName,
                    url: result.url,
                    file_type: fileType,
                    file_size: result.contentLength,
                    mime_type: result.contentType,
                    order_index: index + 1,
                    is_preview: 'N'
                };
            });

            const results = await Promise.all(uploadPromises);
            uploadedFiles.push(...results);
        }

        const dto: CreateContentDto = {
            title: body.title,
            description: body.description,
            course_id: body.course_id,
            section_id: body.section_id,
            is_preview: body.is_preview,
            files: body.files ? JSON.parse(body.files) : uploadedFiles
        };

        const created = await this.contentService.create(dto, ownerId);

        if ('id' in created) {
            if (tempContentId && uploadedFiles.length > 0) {
                await this.contentService.updateContentFiles(tempContentId, uploadedFiles);
            }
            return {
                pendingId: String(created.id),
                courseId: String(created.course?.course_id),
                submittedBy: created.submittedBy?.id,
                status: created.status,
                createdAt: created.createdAt,
            };
        }

        const contentId = String(created.content_id);
        if (uploadedFiles.length > 0 && tempContentId !== contentId) {
            await this.contentService.updateContentFiles(contentId, uploadedFiles);
        }

        return {contentId, filesCount: uploadedFiles.length};
    }

    private detectFileType(mimeType: string): string {
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType === 'application/pdf') return 'pdf';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
        if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'document';
        if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'document';
        if (mimeType === 'text/plain') return 'text';
        return 'document';
    }


    @Get('course/:courseId')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async findAllByCourse(@Param('courseId') courseId: string, @Req() req: Request) {
        const ownerId = (req as any).user?.id ?? null;
        const {contents, course} = await this.contentService.findAllByCourse(courseId, ownerId);

        const formattedContents = contents.map(content => ({
            contentId: String(content.content_id),
            title: content.title,
            description: content.description,
            courseId: String(content.courses_id),
            sectionId: content.section_id ? String(content.section_id) : null,
            sectionTitle: content.section?.title || null,
            createdAt: content.created_at,
            files: content.files?.map(file => ({
                fileId: String(file.file_id),
                title: file.title,
                filename: file.filename,
                url: file.url,
                fileType: file.file_type,
                fileSize: file.file_size,
                mimeType: file.mime_type,
                orderIndex: file.order_index,
                isActive: file.is_active,
                createdAt: file.created_at,
            })) || [],
        }));

        return {
            contents: formattedContents,
            courseInfo: {
                courseDuration: course.course_duration,
                teacher: course.teacher,
                thumbnailUrl: course.thumbnail_url,
                discountAmount: course.discount_amount,
            }
        };
    }

    @Get('section/:sectionId')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async findAllBySection(@Param('sectionId') sectionId: string, @Req() req: Request) {
        const ownerId = (req as any).user?.id ?? null;
        const user = (req as any).user;
        const role = user?.role ?? null;
        const contents = await this.contentService.findAllBySection(sectionId, ownerId, role);


        const formattedContents = await Promise.all(
            contents.map(async (content) => {
                const filesWithSasUrls = await Promise.all(
                    (content.files || []).map(async (file) => {
                        let sasUrl = null;


                        if (file.url) {
                            try {
                                sasUrl = await this.storageService.generateSasUrlFromUrl(
                                    file.url,
                                    file.file_type
                                );
                            } catch (error) {
                                console.error('Error generating SAS URL for file:', error);
                                sasUrl = null;
                            }
                        }

                        return {
                            fileId: String(file.file_id),
                            title: file.title,
                            filename: file.filename,
                            url: sasUrl,
                            fileType: file.file_type,
                            fileSize: file.file_size,
                            mimeType: file.mime_type,
                            orderIndex: file.order_index,
                            isActive: file.is_active,
                            createdAt: file.created_at,
                        };
                    })
                );

                return {
                    contentId: String(content.content_id),
                    title: content.title,
                    description: content.description,
                    courseId: String(content.courses_id),
                    sectionId: String(content.section_id),
                    sectionTitle: content.section?.title || null,
                    createdAt: content.created_at,
                    files: filesWithSasUrls,
                };
            })
        );

        return formattedContents;
    }

    @Get(':contentId')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async findOne(@Param('contentId') contentId: string, @Req() req: Request) {
        const user = (req as any).user;
        const content = await this.contentService.findOne(contentId,  user?.id ?? null, user?.role);

        return {
            contentId: String(content.content_id),
            title: content.title,
            description: content.description,
            courseId: String(content.courses_id),
            sectionId: content.section_id ? String(content.section_id) : null,
            sectionTitle: content.section?.title || null,
            createdAt: content.created_at,
            files: content.files?.map(file => ({
                fileId: String(file.file_id),
                title: file.title,
                filename: file.filename,
                url: file.url,
                fileType: file.file_type,
                fileSize: file.file_size,
                mimeType: file.mime_type,
                orderIndex: file.order_index,
                isActive: file.is_active,
                createdAt: file.created_at,
            })) || [],
        };
    }

    @Patch(':contentId')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    @UseInterceptors(FilesInterceptor('files', 10))
    async update(
        @Param('contentId') contentId: string,
        @Body() body: any,
        @UploadedFiles() files: any[],
        @Req() req: Request
    ) {
        const ownerId = (req as any).user?.id ?? null;

        let uploadedFiles: any[] = [];

        if (files && files.length > 0) {
            const timestamp = Date.now();
            const uploadPromises = files.map(async (file, index) => {
                const fileType = this.detectFileType(file.mimetype);
                const container = fileType === 'video' ? STORAGE_CONTAINERS.VIDEOS : STORAGE_CONTAINERS.DOCUMENTS;
                const extension = path.extname(file.originalname);
                const newFilename = `content_${contentId}_${timestamp}_${index + 1}${extension}`;

                const result = await this.storageService.upload(
                    file.buffer,
                    newFilename,
                    file.mimetype,
                    container
                );

                return {
                    title: result.blobName.substring(0, result.blobName.lastIndexOf('.')) || result.blobName,
                    filename: result.blobName,
                    url: result.url,
                    file_type: fileType,
                    file_size: result.contentLength,
                    mime_type: result.contentType,
                    order_index: index + 1,
                    is_preview: 'N'
                };
            });

            const results = await Promise.all(uploadPromises);
            uploadedFiles.push(...results);
        }

        const dto: UpdateContentDto = {
            title: body.title,
            description: body.description,
            section_id: body.section_id,
            files: body.files ? JSON.parse(body.files) : uploadedFiles
        };

        const updated = await this.contentService.update(contentId, dto, ownerId);

        if ('id' in updated) {
            return {
                pendingId: String(updated.id),
                courseId: String(updated.course?.course_id),
                submittedBy: updated.submittedBy?.id,
                status: updated.status,
                updatedAt: updated.updatedAt,
            };
        }

        return {contentId: String(updated.content_id), filesCount: uploadedFiles.length};
    }


    @Delete(':contentId')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async remove(@Param('contentId') contentId: string, @Req() req: Request) {
        const ownerId = (req as any).user?.id ?? null;
        await this.contentService.remove(contentId, ownerId);

        return null;
    }
}
