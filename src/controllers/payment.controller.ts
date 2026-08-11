import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards, BadRequestException, Res, Param, NotFoundException, Logger } from '@nestjs/common';
import { VnpayService } from '../services/vnpay.service';
import { PaymentService } from '../services/payment.service';
import { StorageService } from '../services/storage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/roles.decorator';
import { SystemRole } from '../schema/entities/role.entity';
import { AdminPaymentsQueryDto } from '../schema/dtos/admin-payments.dto';
import * as crypto from 'crypto';
import { Response } from "express";
import { IapPurchaseService } from '../services/iap-purchase.service';
import { SystemParameterService } from '../services/system-parameter.service';

@Controller('api')
export class PaymentController {
    constructor(
        private readonly vnpayService: VnpayService,
        private readonly paymentService: PaymentService,
        private readonly storageService: StorageService,
        private readonly iapPurchaseService: IapPurchaseService,
        private readonly systemParameterService: SystemParameterService,
    ) { }

    @Post('create-qr')
    @HttpCode(201)
    @UseGuards(JwtAuthGuard)
    async createPaymentQr(@Body() body: any, @Req() req: any) {
        const webVnpayEnabled = await this.systemParameterService.getValue(
            'WEB_VNPAY_ENABLED',
            'Y',
        );
        if (webVnpayEnabled.trim().toUpperCase() !== 'Y') {
            throw new BadRequestException('VNPay hiện đang tạm dừng');
        }
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestException('Thiếu thông tin người dùng');
        }

        if (!body.courseId) {
            throw new BadRequestException('Thiếu thông tin khóa học');
        }

        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
        const courseId = body.courseId;
        const amount = await this.paymentService.getCourseCheckoutAmount(courseId);
        const orderInfo = body.orderInfo || `Thanh toan khoa hoc ${courseId}`;

        // Tự động gen txnRef (unique)
        const txnRef = `VNP${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        // Tạo VNPay payment URL
        const { paymentUrl, vnpCreateDate } = await this.vnpayService.buildPaymentUrl({
            amount,
            ipAddr: clientIp,
            txnRef,
            orderInfo,
            returnUrl: process.env.VNPAY_RETURN_URL || 'http://localhost:3000/api/check-payment-vnpay',
        });

        // Tạo payment record trong DB
        const payment = await this.paymentService.createPayment({
            userId,
            courseId,
            amount,
            orderInfo,
            txnRef,
            vnpCreateDate,
        });

        return {
            paymentUrl,
            txnRef,
        };
    }

    @Get('check-payment-vnpay')
    @HttpCode(200)
    async checkPaymentVnpay(@Query() query: any) {
        const verified = this.vnpayService.verifyReturnUrl(query);

        if (!verified.isVerified) {
            return {
                success: false,
                message: 'Invalid signature',
            };
        }

        // Parse thời gian thanh toán từ VNPay (format: yyyyMMddHHmmss)
        let paidAt: Date | undefined = undefined;
        if (verified.vnp_PayDate) {
            const dateStr = verified.vnp_PayDate;
            const year = parseInt(dateStr.substring(0, 4));
            const month = parseInt(dateStr.substring(4, 6)) - 1;
            const day = parseInt(dateStr.substring(6, 8));
            const hour = parseInt(dateStr.substring(8, 10));
            const minute = parseInt(dateStr.substring(10, 12));
            const second = parseInt(dateStr.substring(12, 14));
            paidAt = new Date(year, month, day, hour, minute, second);
        }

        // Cập nhật payment status trong DB
        const updateData: {
            txnRef: string;
            responseCode: string;
            transactionNo?: string;
            bankCode?: string;
            paidAt?: Date;
        } = {
            txnRef: verified.vnp_TxnRef,
            responseCode: verified.vnp_ResponseCode,
            transactionNo: verified.vnp_TransactionNo,
            bankCode: verified.vnp_BankCode,
        };

        if (paidAt) {
            updateData.paidAt = paidAt;
        }

        const payment = await this.paymentService.updatePaymentStatus(updateData);

        if (verified.vnp_ResponseCode === '00') {
            return {
                success: true,
                message: 'Payment successful',
                data: {
                    paymentId: payment.payment_id,
                    orderId: verified.vnp_TxnRef,
                    amount: verified.vnp_Amount,
                    transactionNo: verified.vnp_TransactionNo,
                    bankCode: verified.vnp_BankCode,
                    payDate: verified.vnp_PayDate,
                },
            };
        } else {
            return {
                success: false,
                message: 'Payment failed',
                code: verified.vnp_ResponseCode,
                paymentId: payment.payment_id,
            };
        }
    }

    @Get('vnpay-ipn')
    @HttpCode(200)
    async vnpayReturn(@Query() query: any, @Res({ passthrough: false }) res: Response) {
        const verified = this.vnpayService.verifyReturnUrl(query);

        if (!verified.isVerified) {
            return res.redirect(`${process.env.STUDENT_PAYMENT_RETURN_URL}?status=failed&code=97`);
        }

        const txnRef = query.vnp_TxnRef;
        const code = query.vnp_ResponseCode;

        const updateData: {
            txnRef: string;
            responseCode: string;
            transactionNo?: string;
            bankCode?: string;
            paidAt?: Date;
        } = {
            txnRef,
            responseCode: code,
            transactionNo: query.vnp_TransactionNo,
            bankCode: query.vnp_BankCode,
        };
        const paidAt = this.parseVnpDate(query.vnp_PayDate);
        if (paidAt) updateData.paidAt = paidAt;
        await this.paymentService.updatePaymentStatus(updateData);

        if (code === '00') {
            return res.redirect(
                `${process.env.STUDENT_PAYMENT_RETURN_URL}?status=success&txnRef=${txnRef}`
            );
        } else {
            return res.redirect(`${process.env.STUDENT_PAYMENT_RETURN_URL}?status=failed&code=${code}`);
        }
    }

    private parseVnpDate(value?: string): Date | undefined {
        if (!value || value.length !== 14) return undefined;
        const year = Number(value.substring(0, 4));
        const month = Number(value.substring(4, 6)) - 1;
        const day = Number(value.substring(6, 8));
        const hour = Number(value.substring(8, 10));
        const minute = Number(value.substring(10, 12));
        const second = Number(value.substring(12, 14));
        const date = new Date(year, month, day, hour, minute, second);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }

    @Get('my-payments')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    async getMyPayments(@Req() req: any) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestException('Thiếu thông tin người dùng');
        }

        const payments = await this.paymentService.getUserPayments(userId);
        const iapPurchases = await this.iapPurchaseService.getUserPurchaseHistory(userId);

        const vnpayPaymentsList = await Promise.all(payments.map(async (payment) => {
            const latestRefund = payment.refunds && payment.refunds.length > 0
                ? payment.refunds.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                : null;

            let thumbnailUrlWithSas: string | null = null;
            if (payment.course?.thumbnail_url) {
                try {
                    thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
                        payment.course.thumbnail_url,
                        'image',
                        24
                    );
                } catch (error) {
                    console.error('Error generating SAS URL for thumbnail:', error);
                    thumbnailUrlWithSas = null;
                }
            }

            return {
                payment_id: payment.payment_id,
                course_title: payment.course?.title || null,
                course_price: payment.course?.price || null,
                thumbnail_url: thumbnailUrlWithSas,
                amount: payment.amount,
                currency: 'VND',
                paid_at: payment.paid_at || payment.created_at,
                refund_status: latestRefund?.status || null,
                vnp_request_id: latestRefund?.vnp_request_id || null,
                payment_method: payment.payment_method,
                status: payment.status,
                source_type: 'VNPAY',
            };
        }));

        const iapPaymentsList = await Promise.all(iapPurchases.map(async (purchase) => {
            let thumbnailUrlWithSas: string | null = null;
            if (purchase.course?.thumbnail_url) {
                try {
                    thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
                        purchase.course.thumbnail_url,
                        'image',
                        24,
                    );
                } catch {
                    thumbnailUrlWithSas = null;
                }
            }
            return {
                payment_id: `iap_${purchase.id}`,
                course_title: purchase.course?.title || null,
                course_price: purchase.course?.price || null,
                thumbnail_url: thumbnailUrlWithSas,
                amount: purchase.price || '0',
                currency: purchase.currency,
                paid_at: purchase.purchased_at,
                refund_status: purchase.status === 'ACTIVE' ? null : purchase.status,
                vnp_request_id: null,
                payment_method: purchase.store,
                status: purchase.status,
                source_type: 'IAP',
            };
        }));
        const paymentsList = [...vnpayPaymentsList, ...iapPaymentsList].sort(
            (a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime(),
        );

        return {
            success: true,
            data: {
                payments: paymentsList,
            },
        };
    }

    @Get('my-payments/:paymentId')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    async getPaymentInvoice(@Param('paymentId') paymentId: string, @Req() req: any) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestException('Thiếu thông tin người dùng');
        }

        if (paymentId.startsWith('iap_')) {
            const purchase = await this.iapPurchaseService.getUserPurchase(
                userId,
                paymentId.substring(4),
            );
            if (!purchase) throw new NotFoundException('Không tìm thấy hóa đơn IAP');

            let thumbnailUrl: string | null = null;
            if (purchase.course?.thumbnail_url) {
                try {
                    thumbnailUrl = await this.storageService.generateSasUrlFromUrl(
                        purchase.course.thumbnail_url,
                        'image',
                        24,
                    );
                } catch {
                    thumbnailUrl = null;
                }
            }
            return {
                success: true,
                data: {
                    invoice: {
                        payment_id: `iap_${purchase.id}`,
                        txn_ref: purchase.transaction_id,
                        transaction_no: purchase.original_transaction_id,
                        amount: purchase.price || '0',
                        currency: purchase.currency,
                        payment_method: purchase.store,
                        status: purchase.status,
                        bank_code: null,
                        paid_at: purchase.purchased_at,
                        created_at: purchase.created_at,
                        buyer: {
                            full_name: purchase.user?.full_name || null,
                            email: purchase.user?.email || null,
                            phone: purchase.user?.phone || null,
                        },
                        course: purchase.course ? {
                            course_id: purchase.course.course_id,
                            title: purchase.course.title,
                            price: purchase.course.price,
                            thumbnail_url: thumbnailUrl,
                            teacher: purchase.course.teacher,
                        } : null,
                        refunds: [],
                        is_iap: true,
                    },
                },
            };
        }

        const payment = await this.paymentService.getPaymentInvoice(paymentId, userId);

        if (!payment) {
            throw new NotFoundException('Không tìm thấy hóa đơn');
        }

        let thumbnailUrl: string | null = null;
        if (payment.course?.thumbnail_url) {
            try {
                thumbnailUrl = await this.storageService.generateSasUrlFromUrl(
                    payment.course.thumbnail_url,
                    'image',
                    24
                );
            } catch (error) {
                thumbnailUrl = null;
            }
        }

        const refunds = payment.refunds && payment.refunds.length > 0
            ? payment.refunds
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map(refund => ({
                    refund_id: refund.refund_id,
                    amount: refund.amount,
                    status: refund.status,
                    reason: refund.reason,
                    created_at: refund.created_at,
                }))
            : [];

        return {
            success: true,
            data: {
                invoice: {
                    payment_id: payment.payment_id,
                    txn_ref: payment.txn_ref,
                    transaction_no: payment.transaction_no,
                    amount: payment.amount,
                    currency: 'VND',
                    payment_method: payment.payment_method,
                    status: payment.status,
                    bank_code: payment.bank_code,
                    paid_at: payment.paid_at,
                    created_at: payment.created_at,
                    buyer: {
                        full_name: payment.user?.full_name || null,
                        email: payment.user?.email || null,
                        phone: payment.user?.phone || null,
                    },
                    course: payment.course ? {
                        course_id: payment.course.course_id,
                        title: payment.course.title,
                        price: payment.course.price,
                        thumbnail_url: thumbnailUrl,
                        teacher: payment.course.teacher,
                    } : null,
                    refunds,
                    is_iap: false,
                },
            },
        };
    }

    @Get('admin/payments/:paymentId')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(SystemRole.ADMIN)
    async getAdminPaymentDetail(@Param('paymentId') paymentId: string) {
        const payment = await this.paymentService.getPaymentDetailForAdmin(paymentId);

        if (!payment) {
            throw new NotFoundException('Không tìm thấy giao dịch');
        }

        let thumbnailUrl: string | null = null;
        if (payment.course?.thumbnail_url) {
            try {
                thumbnailUrl = await this.storageService.generateSasUrlFromUrl(
                    payment.course.thumbnail_url,
                    'image',
                    24
                );
            } catch (error) {
                thumbnailUrl = null;
            }
        }

        const refunds = payment.refunds && payment.refunds.length > 0
            ? payment.refunds
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map(refund => ({
                    refund_id: refund.refund_id,
                    vnp_request_id: refund.vnp_request_id,
                    vnp_txn_ref: refund.vnp_txn_ref,
                    amount: refund.amount,
                    transaction_type: refund.transaction_type,
                    order_info: refund.order_info,
                    reason: refund.reason,
                    status: refund.status,
                    vnp_transaction_date: refund.vnp_transaction_date,
                    vnp_response_id: refund.vnp_response_id,
                    vnp_transaction_no: refund.vnp_transaction_no,
                    response_code: refund.response_code,
                    response_message: refund.response_message,
                    transaction_status: refund.transaction_status,
                    bank_code: refund.bank_code,
                    reject_reason: refund.reject_reason,
                    creator: refund.creator ? {
                        user_id: refund.creator.id,
                        full_name: refund.creator.full_name,
                        email: refund.creator.email,
                    } : null,
                    approver: refund.approver ? {
                        user_id: refund.approver.id,
                        full_name: refund.approver.full_name,
                        email: refund.approver.email,
                    } : null,
                    approved_at: refund.approved_at,
                    refunded_at: refund.refunded_at,
                    created_at: refund.created_at,
                }))
            : [];

        return {
            success: true,
            data: {
                payment_id: payment.payment_id,
                txn_ref: payment.txn_ref,
                transaction_no: payment.transaction_no,
                amount: payment.amount,
                payment_method: payment.payment_method,
                status: payment.status,
                bank_code: payment.bank_code,
                paid_at: payment.paid_at,
                created_at: payment.created_at,
                buyer: {
                    user_id: payment.user?.id || null,
                    full_name: payment.user?.full_name || null,
                    email: payment.user?.email || null,
                    phone: payment.user?.phone || null,
                },
                course: payment.course ? {
                    course_id: payment.course.course_id,
                    title: payment.course.title,
                    price: payment.course.price,
                    thumbnail_url: thumbnailUrl,
                    teacher: payment.course.teacher,
                } : null,
                refunds,
            },
        };
    }

    @Get('admin/payments')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(SystemRole.ADMIN)
    async getAdminPayments(@Query() query: AdminPaymentsQueryDto) {
        const result = await this.paymentService.getAllPaymentsForAdmin(query);

        const formattedPayments = await Promise.all(
            result.payments.map(async (payment) => {
                let thumbnailUrl: string | null = null;
                if (payment.course?.thumbnail_url) {
                    try {
                        thumbnailUrl = await this.storageService.generateSasUrlFromUrl(
                            payment.course.thumbnail_url,
                            'image',
                            24
                        );
                    } catch (error) {
                        console.error('Error generating SAS URL:', error);
                    }
                }

                const successRefunds = payment.refunds?.filter((r: any) => r.status === 'SUCCESS') || [];
                const totalRefunded = successRefunds.reduce((sum: number, r: any) => sum + parseFloat(r.amount), 0);
                const latestRefund = payment.refunds?.length > 0
                    ? payment.refunds.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                    : null;

                const transactionStatus = this.calculateTransactionStatus(payment);

                return {
                    payment_id: payment.payment_id,
                    txn_ref: payment.txn_ref,
                    transaction_no: payment.transaction_no,
                    user: {
                        user_id: payment.user?.id,
                        email: payment.user?.email,
                        full_name: payment.user?.full_name,
                    },
                    course: payment.course ? {
                        course_id: payment.course.course_id,
                        title: payment.course.title,
                        price: payment.course.price,
                        thumbnail_url: thumbnailUrl,
                    } : null,
                    amount: payment.amount,
                    payment_method: payment.payment_method,
                    bank_code: payment.bank_code,
                    original_status: payment.status,
                    transaction_status: transactionStatus,
                    refund_info: payment.refunds?.length > 0 ? {
                        total_refunded: totalRefunded.toFixed(2),
                        refund_count: payment.refunds.length,
                        latest_refund: latestRefund ? {
                            refund_id: latestRefund.refund_id,
                            amount: latestRefund.amount,
                            status: latestRefund.status,
                            created_at: latestRefund.created_at,
                        } : null,
                    } : null,
                    paid_at: payment.paid_at,
                    created_at: payment.created_at,
                };
            })
        );

        const response: any = {
            success: true,
            data: {
                statistics: result.statistics,
                payments: formattedPayments,
            },
            total: result.total,
        };

        if (result.page !== undefined) {
            response.page = result.page;
            response.limit = result.limit;
            response.totalPages = result.totalPages;
        }

        return response;
    }

    private calculateTransactionStatus(payment: any): string {
        if (payment.status === 'FAILED' || payment.status === 'CANCELLED') {
            return payment.status;
        }

        if (payment.status === 'PENDING') {
            return 'PENDING';
        }

        if (payment.status === 'SUCCESS') {
            if (!payment.refunds || payment.refunds.length === 0) {
                return 'SUCCESS';
            }

            const successRefunds = payment.refunds.filter((r: any) => r.status === 'SUCCESS');
            const processingRefunds = payment.refunds.filter((r: any) => r.status === 'PENDING' || r.status === 'PROCESSING');

            if (processingRefunds.length > 0) {
                return 'REFUND_PROCESSING';
            }

            if (successRefunds.length > 0) {
                const totalRefunded = successRefunds.reduce((sum: number, r: any) => sum + parseFloat(r.amount), 0);
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
