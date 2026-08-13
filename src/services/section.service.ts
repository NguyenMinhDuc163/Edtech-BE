import {Injectable, NotFoundException, ForbiddenException, BadRequestException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {CourseSection} from '../schema/entities/course-section.entity';
import {Course} from '../schema/entities/course.entity';
import {CreateSectionDto} from '../schema/dtos/create-section.dto';
import {UpdateSectionDto} from '../schema/dtos/update-section.dto';
import { PendingChangeService } from './pending-change.service';
import { PendingChange } from 'src/schema/entities/pending-change.entity';
import { SystemRole } from 'src/schema/entities/role.entity';
@Injectable()
export class SectionService {
    constructor(
        @InjectRepository(CourseSection)
        private readonly sectionRepo: Repository<CourseSection>,
        @InjectRepository(Course)
        private readonly courseRepo: Repository<Course>,
        private readonly pendingChangeService: PendingChangeService
    ) {
    }

    async create(createDto: CreateSectionDto, ownerId: string | null, isFromPending = false): Promise<CourseSection | PendingChange> {
        if (!ownerId) {
            throw new ForbiddenException('Thiếu thông tin người tạo');
        }


        const course = await this.courseRepo.findOne({
            where: {course_id: createDto.course_id}
        });

        if (!course) {
            throw new NotFoundException('Khóa học không tồn tại');
        }

        if (course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền tạo section cho khóa học này');
        }     

        if (course.status === 'APPROVED' && !isFromPending) {
            const exists = await this.sectionRepo.findOne({
                where: {
                course_id: course.course_id,
                title: createDto.title,
                },
            });
            if (exists) {
                throw new BadRequestException('Tên section đã tồn tại trong khóa học này');
            }   
            const pendingChange = await this.pendingChangeService.createPendingChange(
                ownerId,
                course.course_id,
                {
                    type: 'ADD_SECTION',
                    data: createDto,
                },
            );

            return pendingChange;
        }

        let orderIndex: number;
        if (createDto.order_index) {
            orderIndex = createDto.order_index;
        } else {
            const maxOrder = await this.sectionRepo
                .createQueryBuilder('section')
                .select('MAX(section.order_index)', 'max')
                .where('section.course_id = :courseId', {courseId: createDto.course_id})
                .getRawOne();

            orderIndex = (maxOrder?.max || 0) + 1;
        }

        const section = this.sectionRepo.create({
            title: createDto.title,
            description: createDto.description || null,
            order_index: orderIndex,
            course_id: createDto.course_id,
        });

        return await this.sectionRepo.save(section);
    }

    async findAllByCourse(courseId: string, ownerId: string | null, role: SystemRole | null): Promise<CourseSection[]> {
    const course = await this.courseRepo.findOne({
        where: { course_id: courseId },
        relations: ['owner'], 
    });

    if (!course) {
        throw new NotFoundException('Khóa học không tồn tại');
    }

    if (role !== SystemRole.ADMIN && course.owner?.id !== ownerId) {
        throw new ForbiddenException('Bạn không có quyền xem sections của khóa học này');
    }

    return await this.sectionRepo.find({
        where: { course_id: courseId },
        order: { order_index: 'ASC' },
        relations: ['contents'],
    });
    }


    async findOne(sectionId: string, ownerId: string | null): Promise<CourseSection> {
        const section = await this.sectionRepo.findOne({
            where: {section_id: sectionId},
            relations: ['course', 'contents'],
        });

        if (!section) {
            throw new NotFoundException('Section không tồn tại');
        }

        if (section.course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền xem section này');
        }

        return section;
    }

    async update(sectionId: string, updateDto: UpdateSectionDto, ownerId: string | null, isFromPending = false): Promise<CourseSection | PendingChange> {
        if (!ownerId) {
            throw new ForbiddenException('Thiếu thông tin người cập nhật');
        }

        const section = await this.sectionRepo.findOne({
            where: {section_id: sectionId},
            relations: ['course'],
        });

        if (!section) {
            throw new NotFoundException('Section không tồn tại');
        }

        if (section.course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền cập nhật section này');
        }
        if (section.course.status === 'APPROVED' && !isFromPending) {
            const pendingChange = await this.pendingChangeService.createPendingChange(
                ownerId,
                section.course.course_id,
                {
                    type: 'UPDATE_SECTION',
                    target_id: sectionId,
                    data: updateDto,
                },
            );

            return pendingChange;
        }

        if (updateDto.title !== undefined) section.title = updateDto.title;
        if (updateDto.description !== undefined) section.description = updateDto.description;
        if (updateDto.order_index !== undefined) section.order_index = updateDto.order_index;
        if (updateDto.is_active !== undefined) section.is_active = updateDto.is_active;

        return await this.sectionRepo.save(section);
    }

    async remove(sectionId: string, ownerId: string | null): Promise<void> {
        if (!ownerId) {
            throw new ForbiddenException('Thiếu thông tin người xóa');
        }

        const section = await this.sectionRepo.findOne({
            where: {section_id: sectionId},
            relations: ['course'],
        });

        if (!section) {
            throw new NotFoundException('Section không tồn tại');
        }

        if (section.course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền xóa section này');
        }

        await this.sectionRepo.remove(section);
    }

    async reorderSections(courseId: string, sectionOrders: {
        sectionId: string;
        orderIndex: number
    }[], ownerId: string | null): Promise<void> {
        if (!ownerId) {
            throw new ForbiddenException('Thiếu thông tin người cập nhật');
        }


        const course = await this.courseRepo.findOne({
            where: {course_id: courseId}
        });

        if (!course) {
            throw new NotFoundException('Khóa học không tồn tại');
        }

        if (course.user_id !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền sắp xếp lại sections của khóa học này');
        }


        for (const {sectionId, orderIndex} of sectionOrders) {
            await this.sectionRepo.update(
                {section_id: sectionId, course_id: courseId},
                {order_index: orderIndex}
            );
        }
    }

    async findAllPublicByCourse(courseId: string, accessLevel: string) {
        const course = await this.courseRepo.findOne({ where: { course_id: courseId } });
        if (!course?.content_enabled) return [];

        if (accessLevel === 'FULL') {
            return await this.sectionRepo.find({
                where: { course_id: courseId, is_active: true },
                relations: ['course'],
                order: { order_index: 'ASC' },
            });
        }

        return await this.sectionRepo.find({
            where: [
                {
                    course_id: courseId,
                    is_active: true,
                    is_preview: 'Y'
                },
                {
                    course_id: courseId,
                    is_active: true,
                    course: {
                        is_preview: 'Y'
                    }
                }
            ],
            relations: ['course'],
            order: { order_index: 'ASC' },
        });
    }

    async findPublicById(sectionId: string, courseId: string, accessLevel: string) {
        const course = await this.courseRepo.findOne({ where: { course_id: courseId } });
        if (!course?.content_enabled) return null;

        if (accessLevel === 'FULL') {
            return await this.sectionRepo.findOne({
                where: {
                    section_id: sectionId,
                    course_id: courseId,
                    is_active: true
                },
                relations: ['course'],
            });
        }

        return await this.sectionRepo.findOne({
            where: [
                {
                    section_id: sectionId,
                    course_id: courseId,
                    is_active: true,
                    is_preview: 'Y'
                },
                {
                    section_id: sectionId,
                    course_id: courseId,
                    is_active: true,
                    course: {
                        is_preview: 'Y'
                    }
                }
            ],
            relations: ['course'],
        });
    }
}
