import { Controller, Get, HttpCode, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { SystemRole } from '../../schema/entities/role.entity';
import { CourseService } from '../../services/course.service';
import { SectionService } from '../../services/section.service';
import { ContentService } from '../../services/content.service';
import { StorageService } from '../../services/storage.service';
import { CourseRegistration } from '../../schema/entities/course-registration.entity';
import { QuestionBank, QuizStatus } from '../../schema/entities/question-bank.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { FilterResultsStudentDto } from '../../schema/dtos/filter-results.dto';
import { QuizResultService } from '../../services/quiz-result.service';
import { SystemParameterService } from '../../services/system-parameter.service';

@Controller('student/courses')
export class StudentCourseController {
    constructor(
        private readonly courseService: CourseService,
        private readonly sectionService: SectionService,
        private readonly contentService: ContentService,
        private readonly storageService: StorageService,
        @InjectRepository(CourseRegistration)
        private readonly registrationRepo: Repository<CourseRegistration>,
        @InjectRepository(QuestionBank)
        private readonly questionBankRepo: Repository<QuestionBank>,
        private readonly quizResultService: QuizResultService,
        private readonly systemParamService: SystemParameterService,
    ) {
    }

    @Get()
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async findAllPublicCourses(@Req() req: Request) {
        const studentId = (req as any).user?.id ?? null;


        const courses = await this.courseService.findAllPublic();


        const coursesWithStatus = await Promise.all(
            courses.map(async (course) => {
                let registration = null;
                if (studentId) {
                    registration = await this.registrationRepo.findOne({
                        where: {
                            user_id: studentId,
                            course_id: course.course_id
                        }
                    });
                }


                let accessStatus = 'NONE'; // NONE, FREE, PAID
                if (registration && registration.payment_status === 'PAID') {
                    accessStatus = 'PAID';
                } else {
                    accessStatus = 'FREE';
                }

                let thumbnailSasUrl = null;
                if (course.thumbnail_url) {
                    try {
                        thumbnailSasUrl = await this.storageService.generateSasUrlFromUrl(
                            course.thumbnail_url,
                            'image',
                            24
                        );
                    } catch (error) {
                        console.error('Error generating SAS URL for thumbnail:', error);
                        thumbnailSasUrl = null;
                    }
                }

                return {
                    courseId: String(course.course_id),
                    title: course.title,
                    description: course.description,
                    price: course.price,
                    currency: course.currency,
                    category: course.category,
                    status: course.status,
                    visibility: course.visibility,
                    courseDuration: course.course_duration,
                    teacher: course.teacher,
                    discountAmount: course.discount_amount,
                    courseDescription: course.course_description,
                    thumbnailUrl: thumbnailSasUrl,
                    createdAt: course.created_at,
                    isPaid: course.is_paid,
                    accessStatus, // NONE, FREE, PAID
                    progress: registration?.progress || 0,
                };
            })
        );

        return coursesWithStatus;
    }

    @Get('stats')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(SystemRole.STUDENT)
    async getResultsForStudent(
        @Query() filter: FilterResultsStudentDto,
        @Req() req: Request,
    ) {
        const studentId = (req as any).user?.id ?? null;

        return this.quizResultService.getResultsForStudent(studentId, filter);
    }

    @Get(':courseId')
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async findCourseDetail(@Param('courseId') courseId: string, @Req() req: Request) {
        const studentId = (req as any).user?.id ?? null;


        const course = await this.courseService.findPublicById(courseId);
        if (!course) {
            throw new Error('Khóa học không tồn tại hoặc không public');
        }

        let registration = null;
        if (studentId) {
            registration = await this.registrationRepo.findOne({
                where: {
                    user_id: studentId,
                    course_id: courseId
                }
            });
        }


        let accessLevel = 'FREE'; // FREE, FULL
        if (registration && registration.payment_status === 'PAID') {
            accessLevel = 'FULL';
        }

        const sections = await this.sectionService.findAllPublicByCourse(courseId, accessLevel);

        const quizzes = await this.questionBankRepo
            .createQueryBuilder('qb')
            .innerJoin('qb.content', 'content')
            .where('content.courses_id = :courseId', { courseId })
            .andWhere('qb.status = :status', { status: QuizStatus.PUBLISHED })
            .select(['qb.question_bank_id', 'qb.course_content', 'qb.quiz_title'])
            .getMany();

        const quizMap = new Map<string, { questionBankId: string; quizTitle: string | null }>();
        quizzes.forEach(quiz => {
            if (quiz.course_content && !quizMap.has(quiz.course_content)) {
                quizMap.set(quiz.course_content, {
                    questionBankId: quiz.question_bank_id,
                    quizTitle: quiz.quiz_title,
                });
            }
        });

        const sectionsWithContents = await Promise.all(
            sections.map(async (section) => {
                const contents = await this.contentService.findAllPublicBySection(
                    section.section_id,
                    accessLevel
                );

                const contentsWithSasUrls = await Promise.all(
                    contents.map(async (content) => {
                        const filesWithSasUrls = await Promise.all(
                            (content.files || []).map(async (file) => {
                                let secureUrl = null;

                                if (file.isPreview || accessLevel === 'FULL') {
                                    try {
                                        secureUrl = await this.storageService.generateSasUrlFromUrl(
                                            file.url,
                                            file.file_type
                                        );
                                    } catch (error) {
                                        console.error('Error generating SAS URL:', error);
                                        secureUrl = null;
                                    }
                                }

                                return {
                                    fileId: String(file.file_id),
                                    title: file.title,
                                    fileType: file.file_type,
                                    isPreview: file.isPreview,
                                    url: secureUrl,
                                };
                            })
                        );

                        const contentQuiz = quizMap.get(content.content_id) || null;

                        return {
                            contentId: String(content.content_id),
                            title: content.title,
                            description: content.description,
                            isPreview: content.isPreview,
                            files: filesWithSasUrls,
                            quiz: contentQuiz,
                        };
                    })
                );

                return {
                    sectionId: String(section.section_id),
                    title: section.title,
                    description: section.description,
                    orderIndex: section.order_index,
                    contents: contentsWithSasUrls,
                };
            })
        );

        let thumbnailSasUrl = null;
        if (course.thumbnail_url) {
            try {
                thumbnailSasUrl = await this.storageService.generateSasUrlFromUrl(
                    course.thumbnail_url,
                    'image',
                    24
                );
            } catch (error) {
                console.error('Error generating SAS URL for thumbnail:', error);
                thumbnailSasUrl = null;
            }
        }

        let daysLeftToCancel = 0;
        if (registration && registration.purchase_date) {
            const cancelPeriodDays = await this.systemParamService.getNumber('COURSE_CANCEL_PERIOD_DAYS', 7);
            const purchaseTime = new Date(registration.purchase_date).getTime();
            const currentTime = Date.now();
            const diffMs = currentTime - purchaseTime;
            const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            const remainingDays = cancelPeriodDays - diffDays;
            daysLeftToCancel = remainingDays > 0 ? remainingDays : 0;
        }

        return {
            courseId: String(course.course_id),
            title: course.title,
            description: course.description,
            price: course.price,
            currency: course.currency,
            isPaid: course.is_paid,
            courseDuration: course.course_duration,
            teacher: course.teacher,
            thumbnailUrl: thumbnailSasUrl,
            discountAmount: course.discount_amount,
            accessLevel,
            progress: registration?.progress || 0,
            daysLeftToCancel,
            sections: sectionsWithContents,
        };
    }

    @Get(':courseId/sections/:sectionId')
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async findSectionDetail(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Req() req: Request
    ) {
        const studentId = (req as any).user?.id ?? null;


        const course = await this.courseService.findPublicById(courseId);
        if (!course) {
            throw new Error('Khóa học không tồn tại');
        }

        let registration = null;
        if (studentId) {
            registration = await this.registrationRepo.findOne({
                where: {
                    user_id: studentId,
                    course_id: courseId
                }
            });
        }


        let accessLevel = 'FREE';
        if (registration && registration.payment_status === 'PAID') {
            accessLevel = 'FULL';
        }

        const section = await this.sectionService.findPublicById(sectionId, courseId, accessLevel);
        if (!section) {
            throw new Error('Section không tồn tại');
        }

        const contents = await this.contentService.findAllPublicBySection(
            sectionId,
            accessLevel
        );

        const contentsWithSasUrls = await Promise.all(
            contents.map(async (content) => {
                const filesWithSasUrls = await Promise.all(
                    (content.files || []).map(async (file) => {
                        let secureUrl = null;

                        // Chỉ generate SAS URL nếu user có quyền truy cập
                        if (file.isPreview || accessLevel === 'FULL') {
                            try {
                                secureUrl = await this.storageService.generateSasUrlFromUrl(
                                    file.url,
                                    file.file_type
                                );
                            } catch (error) {
                                secureUrl = null;
                            }
                        }

                        return {
                            fileId: String(file.file_id),
                            title: file.title,
                            fileType: file.file_type,
                            isPreview: file.isPreview,
                            url: secureUrl, // SAS URL có thời hạn
                        };
                    })
                );

                return {
                    contentId: String(content.content_id),
                    title: content.title,
                    description: content.description,
                    isPreview: content.isPreview,
                    files: filesWithSasUrls,
                };
            })
        );

        return {
            sectionId: String(section.section_id),
            title: section.title,
            description: section.description,
            orderIndex: section.order_index,
            contents: contentsWithSasUrls,
        };
    }

    @Get(':courseId/syllabus')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(SystemRole.STUDENT)
    async getCourseSyllabus(
        @Param('courseId') courseId: string,
        @Req() req: Request,
    ) {
        const studentId = (req as any).user.id;
        return this.courseService.getStudentSyllabus(courseId, studentId);
    }
}
