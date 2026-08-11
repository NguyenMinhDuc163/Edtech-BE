import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus, PaymentMethod } from '../schema/entities/payment.entity';
import { Course } from '../schema/entities/course.entity';
import { CourseRegistration } from '../schema/entities/course-registration.entity';
import { CourseAccessSource } from '../schema/entities/course-registration.entity';
import { CourseAccessService } from './course-access.service';
import { MasteryService } from './mastery.service';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseRegistration)
    private readonly registrationRepo: Repository<CourseRegistration>,
    private readonly courseAccessService: CourseAccessService,
    private readonly masteryService: MasteryService,
  ) { }

  async getCourseCheckoutAmount(courseId: string): Promise<number> {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) throw new BadRequestException('Khóa học không tồn tại');
    if (!course.is_paid) {
      throw new BadRequestException('Khóa học miễn phí không cần thanh toán');
    }
    const amount = Number(course.price);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Giá khóa học không hợp lệ');
    }
    return Math.round(amount);
  }

  /**
   * Tạo payment record khi bắt đầu thanh toán
   */
  async createPayment(data: {
    userId: string;
    courseId: string;
    amount: number;
    orderInfo: string;
    txnRef: string;
    vnpCreateDate?: string;
    paymentMethod?: PaymentMethod;
  }): Promise<Payment> {
    const course = await this.courseRepo.findOne({
      where: { course_id: data.courseId },
    });

    if (!course) {
      throw new BadRequestException('Khóa học không tồn tại');
    }

    const existingRegistration = await this.registrationRepo.findOne({
      where: {
        user_id: data.userId,
        course_id: data.courseId,
        payment_status: 'PAID',
      },
    });

    if (existingRegistration) {
      throw new BadRequestException('Bạn đã mua khóa học này rồi');
    }

    // Đảm bảo luôn có vnp_create_date (nếu không truyền vào thì tạo từ thời điểm hiện tại)
    let vnpCreateDate = data.vnpCreateDate;
    if (!vnpCreateDate) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      const second = String(now.getSeconds()).padStart(2, '0');
      vnpCreateDate = `${year}${month}${day}${hour}${minute}${second}`;
    }

    const payment = this.paymentRepo.create({
      user_id: data.userId,
      course_id: data.courseId,
      amount: Math.round(data.amount).toString(),
      order_info: data.orderInfo,
      txn_ref: data.txnRef,
      vnp_create_date: vnpCreateDate,
      payment_method: data.paymentMethod || PaymentMethod.VNPAY,
      status: PaymentStatus.PENDING,
    });

    return await this.paymentRepo.save(payment);
  }

  /**
   * Cập nhật payment sau khi nhận callback từ VNPay
   */
  async updatePaymentStatus(data: {
    txnRef: string;
    responseCode: string;
    transactionNo?: string;
    bankCode?: string;
    paidAt?: Date;
  }): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { txn_ref: data.txnRef },
      relations: ['user', 'course'],
    });

    if (!payment) {
      throw new BadRequestException('Không tìm thấy giao dịch');
    }

    if (payment.status === PaymentStatus.SUCCESS && data.responseCode !== '00') {
      return payment;
    }

    // Cập nhật thông tin
    payment.response_code = data.responseCode;
    payment.transaction_no = data.transactionNo || null;
    payment.bank_code = data.bankCode || null;

    // Xác định status dựa trên response code
    if (data.responseCode === '00') {
      payment.status = PaymentStatus.SUCCESS;
      payment.paid_at = data.paidAt || new Date();

    } else if (data.responseCode === '24') {
      payment.status = PaymentStatus.CANCELLED;
    } else {
      payment.status = PaymentStatus.FAILED;
    }

    const savedPayment = await this.paymentRepo.save(payment);
    if (savedPayment.status === PaymentStatus.SUCCESS && savedPayment.course_id) {
      await this.createOrUpdateCourseRegistration(savedPayment);
      await this.masteryService.initializeCourseMastery(
        savedPayment.user_id,
        savedPayment.course_id,
      );
    }
    return savedPayment;
  }

  /**
   * Tạo hoặc cập nhật CourseRegistration sau khi thanh toán thành công
   */
  private async createOrUpdateCourseRegistration(payment: Payment): Promise<void> {
    if (!payment.course_id) {
      throw new BadRequestException('Có lỗi trong quá trình giao dịch, khóa học không tồn tại trong hệ thống');
    }
    await this.courseAccessService.grantAccess({
      userId: payment.user_id,
      courseId: payment.course_id,
      source: CourseAccessSource.VNPAY,
      amountPaid: payment.amount,
      paymentMethod: PaymentMethod.VNPAY,
      transactionId: payment.txn_ref,
      purchaseDate: payment.paid_at ?? new Date(),
    });
  }

  /**
   * Lấy lịch sử thanh toán của user
   */
  async getUserPayments(userId: string): Promise<Payment[]> {
    return await this.paymentRepo.find({
      where: { user_id: userId },
      relations: ['course', 'refunds'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Lấy chi tiết payment theo txnRef
   */
  async getPaymentByTxnRef(txnRef: string): Promise<Payment | null> {
    return await this.paymentRepo.findOne({
      where: { txn_ref: txnRef },
      relations: ['user', 'course'],
    });
  }

  /**
   * Lấy chi tiết payment cho invoice (có validate user ownership)
   */
  async getPaymentInvoice(paymentId: string, userId: string): Promise<Payment | null> {
    return await this.paymentRepo.findOne({
      where: { payment_id: paymentId, user_id: userId },
      relations: ['user', 'course', 'refunds'],
    });
  }

  /**
   * Lấy chi tiết payment cho admin (không cần validate user)
   */
  async getPaymentDetailForAdmin(paymentId: string): Promise<Payment | null> {
    return await this.paymentRepo.findOne({
      where: { payment_id: paymentId },
      relations: ['user', 'course', 'refunds', 'refunds.creator', 'refunds.approver'],
    });
  }

  /**
   * Lấy tất cả payments cho admin với filters và statistics
   */
  async getAllPaymentsForAdmin(filters: {
    dateFrom?: string;
    dateTo?: string;
    status?: PaymentStatus;
    userId?: string;
    courseId?: string;
    paymentMethod?: PaymentMethod;
    transactionStatus?: string;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{
    payments: any[];
    statistics: any;
    total: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  }> {
    const queryBuilder = this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.user', 'user')
      .leftJoinAndSelect('payment.course', 'course')
      .leftJoinAndSelect('payment.refunds', 'refunds');

    // Apply filters
    if (filters.dateFrom) {
      queryBuilder.andWhere('payment.created_at >= :dateFrom', {
        dateFrom: new Date(filters.dateFrom),
      });
    }

    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('payment.created_at <= :dateTo', { dateTo });
    }

    if (filters.status) {
      queryBuilder.andWhere('payment.status = :status', {
        status: filters.status,
      });
    }

    if (filters.userId) {
      queryBuilder.andWhere('payment.user_id = :userId', {
        userId: filters.userId,
      });
    }

    if (filters.courseId) {
      queryBuilder.andWhere('payment.course_id = :courseId', {
        courseId: filters.courseId,
      });
    }

    if (filters.paymentMethod) {
      queryBuilder.andWhere('payment.payment_method = :paymentMethod', {
        paymentMethod: filters.paymentMethod,
      });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(payment.txn_ref LIKE :search OR payment.transaction_no LIKE :search OR user.email LIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    // Order by created_at DESC
    queryBuilder.orderBy('payment.created_at', 'DESC');

    // Get total count before pagination
    const total = await queryBuilder.getCount();

    // Apply pagination if provided
    let page: number | undefined;
    let limit: number | undefined;
    let totalPages: number | undefined;

    if (filters.limit) {
      limit = filters.limit;
      page = filters.page || 1;
      const skip = (page - 1) * limit;
      queryBuilder.skip(skip).take(limit);
      totalPages = Math.ceil(total / limit);
    }

    // Get payments
    const payments = await queryBuilder.getMany();

    // Calculate statistics
    const statsQuery = this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoin('payment.refunds', 'refunds');

    // Apply same filters for statistics
    if (filters.dateFrom) {
      statsQuery.andWhere('payment.created_at >= :dateFrom', {
        dateFrom: new Date(filters.dateFrom),
      });
    }
    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      statsQuery.andWhere('payment.created_at <= :dateTo', { dateTo });
    }
    if (filters.status) {
      statsQuery.andWhere('payment.status = :status', {
        status: filters.status,
      });
    }
    if (filters.userId) {
      statsQuery.andWhere('payment.user_id = :userId', {
        userId: filters.userId,
      });
    }
    if (filters.courseId) {
      statsQuery.andWhere('payment.course_id = :courseId', {
        courseId: filters.courseId,
      });
    }
    if (filters.paymentMethod) {
      statsQuery.andWhere('payment.payment_method = :paymentMethod', {
        paymentMethod: filters.paymentMethod,
      });
    }
    if (filters.search) {
      statsQuery.andWhere(
        '(payment.txn_ref LIKE :search OR payment.transaction_no LIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    const allPayments = await statsQuery.getMany();

    // Calculate statistics
    let totalAmountSuccess = 0;
    let totalAmountFailed = 0;
    let totalAmountRefunded = 0;
    const countByStatus: any = {
      SUCCESS: 0,
      FAILED: 0,
      PENDING: 0,
      CANCELLED: 0,
      REFUNDED_FULL: 0,
      REFUNDED_PARTIAL: 0,
      REFUND_PROCESSING: 0,
    };

    for (const payment of allPayments) {
      const amount = parseFloat(payment.amount);
      const transactionStatus = this.calculateTransactionStatus(payment);

      countByStatus[transactionStatus]++;

      if (payment.status === PaymentStatus.SUCCESS) {
        totalAmountSuccess += amount;
      } else if (
        payment.status === PaymentStatus.FAILED ||
        payment.status === PaymentStatus.CANCELLED
      ) {
        totalAmountFailed += amount;
      }

      // Calculate refunded amount
      if (payment.refunds && payment.refunds.length > 0) {
        const refundedAmount = payment.refunds
          .filter((r: any) => r.status === 'SUCCESS')
          .reduce((sum: number, r: any) => sum + parseFloat(r.amount), 0);
        totalAmountRefunded += refundedAmount;
      }
    }

    // Filter by transactionStatus if provided
    let filteredPayments = payments;
    if (filters.transactionStatus) {
      filteredPayments = payments.filter(
        (p) =>
          this.calculateTransactionStatus(p) === filters.transactionStatus,
      );
    }

    const statistics = {
      total_transactions: total,
      total_amount_success: totalAmountSuccess,
      total_amount_failed: totalAmountFailed,
      total_amount_refunded: totalAmountRefunded,
      count_by_status: countByStatus,
    };

    const result: any = {
      payments: filteredPayments,
      statistics,
      total: filters.transactionStatus ? filteredPayments.length : total,
    };

    if (filters.limit) {
      result.page = page;
      result.limit = limit;
      result.totalPages = totalPages;
    }

    return result;
  }

  /**
   * Tính toán transaction status tổng hợp
   */
  private calculateTransactionStatus(payment: Payment): string {
    if (
      payment.status === PaymentStatus.FAILED ||
      payment.status === PaymentStatus.CANCELLED
    ) {
      return payment.status;
    }

    if (payment.status === PaymentStatus.PENDING) {
      return PaymentStatus.PENDING;
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      if (!payment.refunds || payment.refunds.length === 0) {
        return 'SUCCESS';
      }

      const successRefunds = payment.refunds.filter(
        (r: any) => r.status === 'SUCCESS',
      );
      const processingRefunds = payment.refunds.filter(
        (r: any) => r.status === 'PENDING' || r.status === 'PROCESSING',
      );

      if (processingRefunds.length > 0) {
        return 'REFUND_PROCESSING';
      }

      if (successRefunds.length > 0) {
        const totalRefunded = successRefunds.reduce(
          (sum: number, r: any) => sum + parseFloat(r.amount),
          0,
        );
        const paymentAmount = parseFloat(payment.amount);

        if (totalRefunded >= paymentAmount) {
          return 'REFUNDED_FULL';
        } else {
          return 'REFUNDED_PARTIAL';
        }
      }

      return 'SUCCESS';
    }

    return payment.status;
  }
}
