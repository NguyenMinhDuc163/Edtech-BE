import { Injectable, BadRequestException, Logger } from '@nestjs/common'; // THÊM Logger
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course, CourseStatus } from '../schema/entities/course.entity';
import { CourseApproval, ApprovalStatus } from '../schema/entities/course-approval.entity';
import { EmailService } from './auth-email.service';
import { StorageService } from './storage.service';
import { UserService } from './user.service';

@Injectable()
export class ApproveService {
  private readonly logger = new Logger(ApproveService.name);
  constructor(
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,

    @InjectRepository(CourseApproval)
    private readonly approvalRepo: Repository<CourseApproval>,
    private readonly emailService: EmailService,
    private storageService: StorageService,
    private readonly userService: UserService,
  ) { }

  async approveCourse(courseId: string, adminId: string) {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
      relations: ['owner'],
    });
    if (!course) throw new BadRequestException('Khóa học không tồn tại');

    if (course.status !== CourseStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể phê duyệt khóa học đang chờ duyệt');
    }

    let thumbnailUrlWithSas: string | null = course.thumbnail_url;

    if (course.thumbnail_url) {
      try {
        thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
          course.thumbnail_url,
          'image',
          1
        );
      } catch (error) {
        console.error('Failed to generate SAS token for thumbnail:', error);
        thumbnailUrlWithSas = null;
      }
    }

    const approval = this.approvalRepo.create({
      course_id: courseId,
      admin_id: adminId,
      status: ApprovalStatus.APPROVED,
      comment: 'Khóa học đã được phê duyệt',
      rejected_at: null,
    });

    await this.approvalRepo.save(approval);
    if (course.owner) {
      await this.userService.increaseTrustScore(course.owner.id, 5);
    }
    if (course.owner?.email) {
      try {
        await this.emailService.sendCourseApprovedEmail(
          course.owner.email,
          course.title,
          'Khóa học đã được phê duyệt thành công!'
        );
      } catch (emailError) {
        this.logger.warn(
          `Không thể gửi email duyệt cho ${course.owner.email}:`,
          emailError
        );
      }
    }

    course.status = CourseStatus.APPROVED;
    await this.courseRepo.save(course);

    return {
      message: 'Khóa học đã được phê duyệt',
      course: {
        ...course,
        thumbnail_url: thumbnailUrlWithSas,
        owner: course.owner
          ? { id: course.owner.id, name: course.owner.full_name ?? course.owner.username }
          : null,

      },
    };
  }

  async rejectCourse(courseId: string, adminId: string, reason: string) {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
      relations: ['owner'],
    });
    if (!course) throw new BadRequestException('Khóa học không tồn tại');

    if (course.status !== CourseStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể từ chối khóa học đang chờ duyệt');
    }

    if (!reason || reason.trim() === '') {
      throw new BadRequestException('Cần ghi rõ lý do từ chối');
    }

    const approval = this.approvalRepo.create({
      course_id: courseId,
      admin_id: adminId,
      status: ApprovalStatus.REJECTED,
      comment: reason,
      rejected_at: new Date(),
    });

    await this.approvalRepo.save(approval);
    if (course.owner) {
      await this.userService.decreaseTrustScore(course.owner.id, 5);
    }
    course.status = CourseStatus.REJECTED;
    await this.courseRepo.save(course);
    if (course.owner?.email) {
      await this.emailService.sendCourseRejectedEmail(
        course.owner.email,
        course.title,
        reason
      );
    }
    return { message: 'Khóa học đã bị từ chối', reason };
  }

  async listPendingCourses() {
    const pendingCourses = await this.courseRepo.find({
      where: { status: CourseStatus.PENDING },
      order: { created_at: 'DESC' },
      relations: ['owner'],
    });

    const coursesWithSas = await Promise.all(
      pendingCourses.map(async (course) => {
        let thumbnailUrlWithSas: string | null = course.thumbnail_url;

        if (course.thumbnail_url) {
          try {
            thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
              course.thumbnail_url,
              'image',
              1
            );
          } catch (error) {
            console.error('Failed to generate SAS token for thumbnail:', error);
            thumbnailUrlWithSas = null;
          }
        }

        return {
          ...course,
          thumbnail_url: thumbnailUrlWithSas,
          owner: course.owner
            ? { id: course.owner.id, name: course.owner.full_name ?? course.owner.username }
            : null,
        };
      })
    );

    return coursesWithSas;
  }

  async getApprovalHistory(courseId: string) {
    return await this.approvalRepo.find({
      where: { course_id: courseId },
      relations: ['admin'],
      order: { created_at: 'DESC' },
    });
  }
}
