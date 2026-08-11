import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { Course, CourseStatus, CourseVisibility } from '../schema/entities/course.entity';
import {
  CourseAccessSource,
  CourseRegistration,
} from '../schema/entities/course-registration.entity';
import {
  IapPurchase,
  IapPurchaseStatus,
} from '../schema/entities/iap-purchase.entity';
import {
  Payment,
  PaymentStatus,
} from '../schema/entities/payment.entity';

export type CourseAccessLevel = 'FREE' | 'FULL';

@Injectable()
export class CourseAccessService {
  constructor(
    @InjectRepository(CourseRegistration)
    private readonly registrationRepo: Repository<CourseRegistration>,
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    @InjectRepository(IapPurchase)
    private readonly iapPurchaseRepo: Repository<IapPurchase>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
  ) {}

  async resolveAccess(
    userId: string | null | undefined,
    course: Course,
  ): Promise<{
    accessLevel: CourseAccessLevel;
    owned: boolean;
    registration: CourseRegistration | null;
    source: CourseAccessSource | null;
  }> {
    if (!userId) {
      return {
        accessLevel: 'FREE',
        owned: false,
        registration: null,
        source: null,
      };
    }

    const registration = await this.registrationRepo.findOne({
      where: {
        user_id: userId,
        course_id: course.course_id,
        payment_status: 'PAID',
      },
    });

    if (!course.is_paid) {
      return {
        accessLevel: 'FULL',
        owned: Boolean(registration),
        registration,
        source: registration?.access_source ?? CourseAccessSource.FREE,
      };
    }

    return {
      accessLevel: registration ? 'FULL' : 'FREE',
      owned: Boolean(registration),
      registration,
      source: registration?.access_source ?? null,
    };
  }

  async resolveByCourseId(
    userId: string | null | undefined,
    courseId: string,
  ) {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Khóa học không tồn tại');
    }
    return this.resolveAccess(userId, course);
  }

  async grantAccess(
    input: {
      userId: string;
      courseId: string;
      source: CourseAccessSource;
      amountPaid?: string | number;
      paymentMethod: string;
      transactionId?: string | null;
      purchaseDate?: Date;
      iapPurchaseId?: string | null;
    },
    entityManager?: EntityManager,
  ): Promise<CourseRegistration> {
    if (!entityManager) {
      return this.dataSource.transaction((manager) =>
        this.grantAccess(input, manager),
      );
    }
    const repo = entityManager
      ? entityManager.getRepository(CourseRegistration)
      : this.registrationRepo;

    await entityManager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${input.userId}:${input.courseId}`,
    ]);

    let registration = await repo.findOne({
      where: { user_id: input.userId, course_id: input.courseId },
    });

    // A user who already has access from another source must never lose or
    // silently change that source because a duplicate purchase arrives.
    if (registration?.payment_status === 'PAID') {
      return registration;
    }

    if (!registration) {
      registration = repo.create({
        user_id: input.userId,
        course_id: input.courseId,
        registered_at: new Date(),
        progress: 0,
      });
    }

    registration.payment_status = 'PAID';
    registration.amount_paid = String(input.amountPaid ?? 0);
    registration.payment_method = input.paymentMethod;
    registration.transaction_id = input.transactionId ?? null;
    registration.purchase_date = input.purchaseDate ?? new Date();
    registration.access_source = input.source;
    registration.iap_purchase_id = input.iapPurchaseId ?? null;
    registration.revoked_at = null;

    return repo.save(registration);
  }

  async revokeIapAccess(
    purchase: IapPurchase,
    entityManager?: EntityManager,
  ): Promise<void> {
    const registrationRepo = entityManager
      ? entityManager.getRepository(CourseRegistration)
      : this.registrationRepo;
    const courseRepo = entityManager
      ? entityManager.getRepository(Course)
      : this.courseRepo;
    const iapRepo = entityManager
      ? entityManager.getRepository(IapPurchase)
      : this.iapPurchaseRepo;
    const paymentRepo = entityManager
      ? entityManager.getRepository(Payment)
      : this.paymentRepo;

    const registration = await registrationRepo.findOne({
      where: {
        user_id: purchase.user_id,
        course_id: purchase.course_id,
        payment_status: 'PAID',
      },
    });
    if (!registration || registration.iap_purchase_id !== purchase.id) return;

    const course = await courseRepo.findOne({
      where: { course_id: purchase.course_id },
    });
    if (course && !course.is_paid) return;

    const otherIap = await iapRepo.findOne({
      where: {
        user_id: purchase.user_id,
        course_id: purchase.course_id,
        status: IapPurchaseStatus.ACTIVE,
        id: Not(purchase.id),
      },
    });
    const successfulWebPayment = await paymentRepo.findOne({
      where: {
        user_id: purchase.user_id,
        course_id: purchase.course_id,
        status: PaymentStatus.SUCCESS,
      },
    });
    if (otherIap || successfulWebPayment) return;

    registration.payment_status = 'REFD';
    registration.revoked_at = purchase.revoked_at ?? new Date();
    await registrationRepo.save(registration);
  }

  async enrollFree(userId: string, courseId: string): Promise<CourseRegistration> {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) throw new NotFoundException('Khóa học không tồn tại');
    if (
      course.status !== CourseStatus.APPROVED ||
      course.visibility !== CourseVisibility.PUBLIC
    ) {
      throw new BadRequestException('Khóa học chưa sẵn sàng để đăng ký');
    }
    if (course.is_paid) {
      throw new BadRequestException('Đây không phải khóa học miễn phí');
    }

    return this.grantAccess({
      userId,
      courseId,
      source: CourseAccessSource.FREE,
      amountPaid: 0,
      paymentMethod: 'FREE',
      transactionId: null,
      purchaseDate: new Date(),
    });
  }
}
