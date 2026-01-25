import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Refund, RefundStatus, RefundTransactionType } from '../schema/entities/refund.entity';
import { Payment } from '../schema/entities/payment.entity';
import * as crypto from 'crypto';

@Injectable()
export class RefundService {
  constructor(
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  async createRefund(data: {
    paymentId: string;
    amount: number;
    transactionType: RefundTransactionType;
    orderInfo: string;
    reason: string;
    createdBy: string;
    ipAddr: string;
  }): Promise<Refund> {
    const payment = await this.paymentRepo.findOne({
      where: { payment_id: data.paymentId },
      relations: ['refunds'],
    });

    if (!payment) {
      throw new BadRequestException('Không tìm thấy giao dịch thanh toán');
    }

    if (payment.status !== 'SUCCESS') {
      throw new BadRequestException('Chỉ có thể hoàn tiền cho giao dịch thành công');
    }

    // Nếu payment không có vnp_create_date, dùng created_at và convert sang format VNPay
    let vnpTransactionDate = payment.vnp_create_date;
    if (!vnpTransactionDate) {
      vnpTransactionDate = this.formatDateToVnpay(payment.created_at);
    }

    const totalRefunded = await this.getTotalRefunded(data.paymentId);
    const paymentAmount = parseFloat(payment.amount);
    const refundAmount = data.amount;

    if (totalRefunded + refundAmount > paymentAmount) {
      throw new BadRequestException(
        `Tổng tiền hoàn (${totalRefunded + refundAmount}) vượt quá số tiền thanh toán (${paymentAmount})`
      );
    }

    const actualTransactionType = (refundAmount >= paymentAmount)
      ? RefundTransactionType.FULL
      : RefundTransactionType.PARTIAL;

    const vnpRequestId = `REF${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const refund = this.refundRepo.create({
      payment_id: data.paymentId,
      vnp_request_id: vnpRequestId,
      vnp_txn_ref: payment.txn_ref,
      amount: Math.round(refundAmount).toString(),
      transaction_type: actualTransactionType,
      order_info: data.orderInfo,
      reason: data.reason,
      created_by: data.createdBy,
      ip_addr: data.ipAddr,
      vnp_transaction_date: vnpTransactionDate,
      status: RefundStatus.PEND,
    });

    return await this.refundRepo.save(refund);
  }

  async updateRefundStatus(data: {
    vnpRequestId: string;
    vnpResponseId: string;
    responseCode: string;
    responseMessage: string;
    vnpTransactionNo?: string;
    transactionStatus?: string;
    bankCode?: string;
    payDate?: string;
  }): Promise<Refund> {
    const refund = await this.refundRepo.findOne({
      where: { vnp_request_id: data.vnpRequestId },
    });

    if (!refund) {
      throw new BadRequestException('Không tìm thấy yêu cầu hoàn tiền');
    }

    refund.vnp_response_id = data.vnpResponseId;
    refund.response_code = data.responseCode;
    refund.response_message = data.responseMessage;
    refund.vnp_transaction_no = data.vnpTransactionNo || null;
    refund.transaction_status = data.transactionStatus || null;
    refund.bank_code = data.bankCode || null;

    if (data.responseCode === '00') {
      refund.status = RefundStatus.SUCC;
      if (data.payDate) {
        refund.refunded_at = this.parseVnpayDate(data.payDate);
      } else {
        refund.refunded_at = new Date();
      }
    } else if (data.responseCode === '94') {
      refund.status = RefundStatus.PROC;
    } else {
      refund.status = RefundStatus.FAIL;
    }

    return await this.refundRepo.save(refund);
  }

  async getTotalRefunded(paymentId: string): Promise<number> {
    const result = await this.refundRepo
      .createQueryBuilder('refund')
      .select('SUM(refund.amount)', 'total')
      .where('refund.payment_id = :paymentId', { paymentId })
      .andWhere('refund.status = :status', { status: RefundStatus.SUCC })
      .getRawOne();

    return parseFloat(result?.total || '0');
  }

  async getRefundsByPayment(paymentId: string): Promise<Refund[]> {
    return await this.refundRepo.find({
      where: { payment_id: paymentId },
      order: { created_at: 'DESC' },
    });
  }

  async getRefundByRequestId(vnpRequestId: string): Promise<Refund | null> {
    return await this.refundRepo.findOne({
      where: { vnp_request_id: vnpRequestId },
      relations: ['payment', 'payment.course', 'creator'],
    });
  }

  async getAllRefunds(): Promise<Refund[]> {
    return await this.refundRepo.find({
      relations: ['payment', 'creator', 'approver'],
      order: { created_at: 'DESC' },
    });
  }

  async approveRefund(data: {
    vnpRequestId: string;
    action: 'APPROVE' | 'REJECT';
    adminId: string;
    rejectReason?: string;
  }): Promise<Refund> {
    const refund = await this.refundRepo.findOne({
      where: { vnp_request_id: data.vnpRequestId },
    });

    if (!refund) {
      throw new BadRequestException('Không tìm thấy yêu cầu hoàn tiền');
    }

    if (refund.status !== RefundStatus.PEND) {
      throw new BadRequestException('Chỉ có thể phê duyệt yêu cầu đang chờ (PEND)');
    }

    if (data.action === 'REJECT') {
      refund.status = RefundStatus.REJECT;
      refund.reject_reason = data.rejectReason || 'Rejected by admin';
      refund.approved_by = data.adminId;
      refund.approved_at = new Date();
    } else {
      refund.approved_by = data.adminId;
      refund.approved_at = new Date();
    }

    return await this.refundRepo.save(refund);
  }

  async cancelRefund(vnpRequestId: string, userId: string): Promise<Refund> {
    const refund = await this.refundRepo.findOne({
      where: { vnp_request_id: vnpRequestId },
    });

    if (!refund) {
      throw new BadRequestException('Không tìm thấy yêu cầu hoàn tiền');
    }

    if (refund.created_by !== userId) {
      throw new BadRequestException('Bạn không có quyền hủy yêu cầu này');
    }

    if (refund.status !== RefundStatus.PEND) {
      throw new BadRequestException('Chỉ có thể hủy yêu cầu đang chờ (PEND)');
    }

    refund.status = RefundStatus.REJECT;
    refund.reject_reason = 'Cancelled by student';
    refund.approved_at = new Date();

    return await this.refundRepo.save(refund);
  }

  private parseVnpayDate(dateStr: string): Date {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(dateStr.substring(8, 10));
    const minute = parseInt(dateStr.substring(10, 12));
    const second = parseInt(dateStr.substring(12, 14));
    return new Date(year, month, day, hour, minute, second);
  }

  private formatDateToVnpay(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hour}${minute}${second}`;
  }
}
