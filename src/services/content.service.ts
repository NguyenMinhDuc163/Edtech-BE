import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { forwardRef, Inject } from '@nestjs/common';
import { CourseContent } from '../schema/entities/course-content.entity';
import { ContentFile } from '../schema/entities/content-file.entity';
import { Course } from '../schema/entities/course.entity';
import { CourseSection } from '../schema/entities/course-section.entity';
import { CreateContentDto } from '../schema/dtos/create-content.dto';
import { UpdateContentDto } from '../schema/dtos/update-content.dto';
import { PendingChangeService } from './pending-change.service';
import { PendingChange } from 'src/schema/entities/pending-change.entity';
import { SystemRole } from 'src/schema/entities/role.entity';
import { StorageService } from './storage.service';

@Injectable()
export class ContentService {
    constructor(
        @InjectRepository(CourseContent)
        private readonly contentRepo: Repository<CourseContent>,
        @InjectRepository(ContentFile)
        private readonly fileRepo: Repository<ContentFile>,
        @InjectRepository(Course)
        private readonly courseRepo: Repository<Course>,
        @InjectRepository(CourseSection)
        private readonly sectionRepo: Repository<CourseSection>,
        @Inject(forwardRef(() => PendingChangeService))
        private readonly pendingChangeService: PendingChangeService,
        private readonly storageService: StorageService,
    ) {
    }

    async create(createDto: CreateContentDto, ownerId: string | null, isFromPending = false,): Promise<CourseContent | PendingChange> {
        if (!ownerId) {
            throw new ForbiddenException('Thiếu thông tin người tạo');
        }


        const course = await this.courseRepo.findOne({
            where: { course_id: createDto.course_id }
        });

        if (!course) {
            throw new NotFoundException('Khóa học không tồn tại');
        }

        if (course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền tạo nội dung cho khóa học này');
        }

        if (createDto.section_id) {
            const section = await this.sectionRepo.findOne({
                where: {
                    section_id: createDto.section_id,
                    course_id: createDto.course_id
                }
            });

            if (!section) {
                throw new BadRequestException('Section không tồn tại hoặc không thuộc về khóa học này');
            }
        }

        // Nếu course đã được duyệt → lưu vào pending change
        if (course.status === 'APPROVED' && !isFromPending) {
            if (createDto.section_id) {
                const contentExists = await this.contentRepo.findOne({
                    where: {
                        section_id: createDto.section_id,
                        title: createDto.title,
                    },
                });
                if (contentExists) {
                    throw new BadRequestException('Tên lesson đã tồn tại trong section này');
                }
            }
            const pendingChange = await this.pendingChangeService.createPendingChange(
                ownerId,
                course.course_id,
                {
                    type: 'ADD_CONTENT',
                    data: createDto,
                },
            );
            return pendingChange;
        }

        const content = this.contentRepo.create({
            title: createDto.title,
            description: createDto.description || null,
            is_preview: createDto.is_preview || 'N',
            courses_id: createDto.course_id,
            section_id: createDto.section_id || null,
        });

        const savedContent = await this.contentRepo.save(content);


        if (createDto.files && createDto.files.length > 0) {
            const files = createDto.files.map((fileDto, index) =>
                this.fileRepo.create({
                    title: fileDto.title,
                    filename: fileDto.filename,
                    url: fileDto.url,
                    file_type: fileDto.file_type,
                    file_size: fileDto.file_size || null,
                    mime_type: fileDto.mime_type || null,
                    order_index: fileDto.order_index || index + 1,
                    is_preview: fileDto.is_preview || 'N',
                    content_id: savedContent.content_id,
                })
            );

            await this.fileRepo.save(files);
        }

        return await this.contentRepo.findOne({
            where: { content_id: savedContent.content_id },
            relations: ['files'],
        }) as CourseContent;
    }

    async createTempContent(courseId: string, ownerId: string | null): Promise<CourseContent> {
        if (!ownerId) {
            throw new ForbiddenException('Thiếu thông tin người tạo');
        }

        const course = await this.courseRepo.findOne({
            where: { course_id: courseId }
        });

        if (!course) {
            throw new NotFoundException('Khóa học không tồn tại');
        }

        if (course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền tạo nội dung cho khóa học này');
        }

        const content = this.contentRepo.create({
            title: 'TEMP',
            description: null,
            is_preview: 'N',
            courses_id: courseId,
            section_id: null,
        });

        return await this.contentRepo.save(content);
    }

    async updateContentFiles(contentId: string, files: any[]): Promise<void> {
        const content = await this.contentRepo.findOne({
            where: { content_id: contentId },
        });
        if (!content) {
            throw new NotFoundException('Nội dung không tồn tại');
        }

        const fileEntities = files.map((fileDto, index) =>
            this.fileRepo.create({
                title: fileDto.title,
                filename: fileDto.filename,
                url: fileDto.url,
                file_type: fileDto.file_type,
                file_size: fileDto.file_size || null,
                mime_type: fileDto.mime_type || null,
                order_index: fileDto.order_index || index + 1,
                is_preview: fileDto.is_preview || 'N',
                content_id: contentId,
            })
        );

        await this.fileRepo.save(fileEntities);
    }

    async findAllByCourse(courseId: string, ownerId: string | null): Promise<{ contents: CourseContent[], course: Course }> {

        const course = await this.courseRepo.findOne({
            where: { course_id: courseId }
        });

        if (!course) {
            throw new NotFoundException('Khóa học không tồn tại');
        }

        if (course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền xem nội dung của khóa học này');
        }

        const contents = await this.contentRepo.find({
            where: { courses_id: courseId },
            relations: ['section', 'files'],
            order: { created_at: 'ASC' },
        });

        return { contents, course };
    }

    async findAllBySection(sectionId: string, ownerId: string | null, role: SystemRole | null): Promise<CourseContent[]> {
        const section = await this.sectionRepo.findOne({
            where: { section_id: sectionId },
            relations: ['course'],
        });

        if (!section) {
            throw new NotFoundException('Section không tồn tại');
        }
        if (role !== SystemRole.ADMIN && section.course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền xem nội dung của section này');
        }

        return await this.contentRepo.find({
            where: { section_id: sectionId },
            relations: ['section', 'files'],
            order: { created_at: 'ASC' },
        });
    }

    async findOne(
        contentId: string,
        ownerId: string | null,
        role: SystemRole,
    ) {
        const qb = this.contentRepo
            .createQueryBuilder('content')
            .leftJoin('content.course', 'course')
            .leftJoin('content.section', 'section')
            .leftJoin('content.files', 'file')
            .where('content.content_id = :contentId', { contentId })
            .select([
                // content
                'content.content_id',
                'content.title',
                'content.description',
                'content.courses_id',
                'content.section_id',
                'content.created_at',

                // course (chỉ để check quyền)
                'course.user_id',

                // section
                'section.title',

                // files
                'file.file_id',
                'file.title',
                'file.filename',
                'file.url',
                'file.file_type',
                'file.file_size',
                'file.mime_type',
                'file.order_index',
                'file.is_active',
                'file.created_at',
            ]);

        const content = await qb.getOne();

        if (!content) {
            throw new NotFoundException('Nội dung không tồn tại');
        }

        // ===== CHECK QUYỀN =====
        if (role === SystemRole.TEACHER) {
            if (content.course?.user_id !== ownerId) {
                throw new ForbiddenException('Bạn không có quyền xem nội dung này');
            }
        }

        const files = content.files?.length
            ? await Promise.all(
                content.files.map(async (file) => {
                    let secureUrl = file.url;

                    try {
                        secureUrl = await this.storageService.generateSasUrlFromUrl(
                            file.url,
                            file.file_type,
                        );
                    } catch (err) {
                        console.error(`SAS URL error for file ${file.file_id}`, err);
                    }

                    return {
                        file_id: file.file_id,
                        title: file.title,
                        filename: file.filename,
                        url: secureUrl,
                        file_type: file.file_type,
                        file_size: file.file_size,
                        mime_type: file.mime_type,
                        order_index: file.order_index,
                        is_active: file.is_active,
                        created_at: file.created_at,
                    };
                }),
            )
            : [];

        return {
            content_id: content.content_id,
            title: content.title,
            description: content.description,
            courses_id: content.courses_id,
            section_id: content.section_id,
            section: content.section
                ? { title: content.section.title }
                : null,
            created_at: content.created_at,
            files,
        };
    }

    async update(contentId: string, updateDto: UpdateContentDto, ownerId: string | null, isFromPending = false,): Promise<CourseContent | PendingChange> {
        if (!ownerId) {
            throw new ForbiddenException('Thiếu thông tin người cập nhật');
        }

        const content = await this.contentRepo.findOne({
            where: { content_id: contentId },
            relations: ['course'],
        });

        if (!content) {
            throw new NotFoundException('Nội dung không tồn tại');
        }

        if (content.course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền cập nhật nội dung này');
        }

        if (content.course.status !== 'DRAFT' && !isFromPending) {
            const pendingChange = await this.pendingChangeService.createPendingChange(
                ownerId,
                content.course.course_id,
                {
                    type: 'UPDATE_CONTENT',
                    target_id: contentId,
                    data: updateDto,
                },
            );

            return pendingChange;
        }

        if (updateDto.section_id && updateDto.section_id !== content.section_id) {
            const section = await this.sectionRepo.findOne({
                where: {
                    section_id: updateDto.section_id,
                    course_id: content.courses_id
                }
            });

            if (!section) {
                throw new BadRequestException('Section không tồn tại hoặc không thuộc về khóa học này');
            }
        }


        if (updateDto.title !== undefined) content.title = updateDto.title;
        if (updateDto.description !== undefined) content.description = updateDto.description;
        if (updateDto.section_id !== undefined) content.section_id = updateDto.section_id;

        const savedContent = await this.contentRepo.save(content);

        if (updateDto.files && updateDto.files.length > 0) {
            await this.updateContentFiles(contentId, updateDto.files);
        }

        return savedContent;
    }

    async remove(contentId: string, ownerId: string | null): Promise<void> {
        if (!ownerId) {
            throw new ForbiddenException('Thiếu thông tin người xóa');
        }

        const content = await this.contentRepo.findOne({
            where: { content_id: contentId },
            relations: ['course'],
        });

        if (!content) {
            throw new NotFoundException('Nội dung không tồn tại');
        }

        if (content.course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền xóa nội dung này');
        }

        await this.contentRepo.remove(content);
    }

    async findAllPublicBySection(sectionId: string, accessLevel: string) {
        const contents = await this.contentRepo.find({
            where: { section_id: sectionId },
            relations: ['files'],
            order: { created_at: 'ASC' },
        });

        // Lọc nội dung theo mức độ truy cập
        const filteredContents = contents.filter((content) => {
            if (accessLevel === 'FULL') {
                return true; // Đã mua: xem tất cả
            }
            return content.is_preview === 'Y'; // Chưa mua: chỉ xem preview
        });

        return filteredContents.map((content) => {
            // Xác định content có phải preview không
            const isPreview = accessLevel === 'FREE' && content.is_preview === 'Y';

            return {
                ...content,
                isPreview,
                files: content.files?.map(file => {
                    // Xác định file có phải preview không
                    const fileIsPreview = isPreview || file.is_preview === 'Y';

                    return {
                        ...file,
                        isPreview: fileIsPreview,
                    };
                }) || [],
            };
        });
    }
}
