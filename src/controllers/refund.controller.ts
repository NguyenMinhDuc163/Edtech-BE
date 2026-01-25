import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards, BadRequestException, Param } from '@nestjs/common';
import { VnpayService } from '../services/vnpay.service';
import { RefundService } from '../services/refund.service';
import { PaymentService } from '../services/payment.service';
import { StorageService } from '../services/storage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/roles.decorator';
import { SystemRole } from '../schema/entities/role.entity';
import { RefundTransactionType } from '../schema/entities/refund.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { CourseRegistration } from '../schema/entities/course-registration.entity';
import { Payment, PaymentStatus } from '../schema/entities/payment.entity';
import { Refund, RefundStatus } from '../schema/entities/refund.entity';

@Controller('api/refund')
export class RefundController {
    constructor(
        private readonly vnpayService: VnpayService,
        private readonly refundService: RefundService,
        private readonly paymentService: PaymentService,
        private readonly storageService: StorageService,
        @InjectRepository(CourseRegistration)
        private readonly registrationRepo: Repository<CourseRegistration>,
        @InjectRepository(Payment)
        private readonly paymentRepo: Repository<Payment>,
        @InjectRepository(Refund)
        private readonly refundRepo: Repository<Refund>,
    ) { }

    @Post('create')
    @HttpCode(201)
    @UseGuards(JwtAuthGuard)
    async createRefund(@Body() body: any, @Req() req: any) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestException('Thiếu thông tin người dùng');
        }

        if (!body.courseId) {
            throw new BadRequestException('Thiếu thông tin khóa học');
        }

        if (!body.reason || body.reason.trim() === '') {
            throw new BadRequestException('Thiếu lý do hoàn tiền');
        }

        const payment = await this.paymentRepo.findOne({
            where: {
                user_id: userId,
                course_id: body.courseId,
                status: PaymentStatus.SUCCESS,
            },
            order: { created_at: 'DESC' },
        });

        if (!payment) {
            throw new BadRequestException('Không tìm thấy giao dịch thanh toán thành công cho khóa học này');
        }

        const existingRefund = await this.refundRepo.findOne({
            where: {
                vnp_txn_ref: payment.txn_ref,
                status: In([RefundStatus.PEND, RefundStatus.PROC, RefundStatus.SUCC]),
            },
        });

        if (existingRefund) {
            throw new BadRequestException('Giao dịch này đã có yêu cầu hoàn tiền hoặc đã được hoàn tiền');
        }

        const amount = parseFloat(payment.amount);
        const orderInfo = `Hoan tien khoa hoc ${body.courseId}`;
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

        const refund = await this.refundService.createRefund({
            paymentId: payment.payment_id,
            amount: amount,
            transactionType: RefundTransactionType.FULL,
            orderInfo,
            reason: body.reason,
            createdBy: userId,
            ipAddr: clientIp,
        });

        return {
            success: true,
            message: 'Tạo yêu cầu hoàn tiền thành công. Vui lòng chờ admin phê duyệt.',
            data: {
                refundId: refund.refund_id,
                vnpRequestId: refund.vnp_request_id,
                amount: refund.amount,
                status: refund.status,
                reason: refund.reason,
            },
        };
    }

    @Get('all')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(SystemRole.ADMIN)
    async getAllRefunds() {
        const refunds = await this.refundService.getAllRefunds();

        // Generate SAS URLs for avatars
        const refundsWithSasUrls = await Promise.all(
            refunds.map(async (refund) => {
                // Generate SAS URL for creator avatar
                let creatorAvatarSasUrl = null;
                if (refund.creator?.avatar_url) {
                    try {
                        creatorAvatarSasUrl = await this.storageService.generateSasUrlFromUrl(
                            refund.creator.avatar_url,
                            'image',
                            24
                        );
                    } catch (error) {
                        console.error('Error generating SAS URL for creator avatar:', error);
                        creatorAvatarSasUrl = null;
                    }
                }

                // Generate SAS URL for approver avatar
                let approverAvatarSasUrl = null;
                if (refund.approver?.avatar_url) {
                    try {
                        approverAvatarSasUrl = await this.storageService.generateSasUrlFromUrl(
                            refund.approver.avatar_url,
                            'image',
                            24
                        );
                    } catch (error) {
                        console.error('Error generating SAS URL for approver avatar:', error);
                        approverAvatarSasUrl = null;
                    }
                }

                return {
                    ...refund,
                    creator: refund.creator ? {
                        ...refund.creator,
                        avatar_url: creatorAvatarSasUrl,
                    } : null,
                    approver: refund.approver ? {
                        ...refund.approver,
                        avatar_url: approverAvatarSasUrl,
                    } : null,
                };
            })
        );

        return {
            success: true,
            data: {
                refunds: refundsWithSasUrls,
            },
        };
    }

    @Get('detail/:vnpRequestId')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    async getRefundDetail(@Param('vnpRequestId') vnpRequestId: string) {
        const refund = await this.refundService.getRefundByRequestId(vnpRequestId);

        if (!refund) {
            throw new BadRequestException('Không tìm thấy yêu cầu hoàn tiền');
        }

        let creatorAvatarSasUrl = null;
        if (refund.creator?.avatar_url) {
            try {
                creatorAvatarSasUrl = this.storageService.generateSasUrlFromUrl(
                    refund.creator.avatar_url,
                    'image',
                    24
                );
            } catch (error) {
                console.error('Error generating SAS URL for creator avatar:', error);
                creatorAvatarSasUrl = null;
            }
        }

        let courseThumbnailSasUrl = null;
        if (refund.payment?.course?.thumbnail_url) {
            try {
                courseThumbnailSasUrl = await this.storageService.generateSasUrlFromUrl(
                    refund.payment.course.thumbnail_url,
                    'image',
                    24
                );
            } catch (error) {
                console.error('Error generating SAS URL for course thumbnail:', error);
                courseThumbnailSasUrl = null;
            }
        }

        const refundWithSasUrl = {
            ...refund,
            creator: refund.creator ? {
                ...refund.creator,
                avatar_url: creatorAvatarSasUrl,
            } : null,
            payment: refund.payment ? {
                ...refund.payment,
                course: refund.payment.course ? {
                    course_id: refund.payment.course.course_id,
                    title: refund.payment.course.title,
                    description: refund.payment.course.description,
                    price: refund.payment.course.price,
                    currency: refund.payment.course.currency,
                    teacher: refund.payment.course.teacher,
                    course_duration: refund.payment.course.course_duration,
                    discount_amount: refund.payment.course.discount_amount,
                    is_paid: refund.payment.course.is_paid,
                    thumbnail_url: courseThumbnailSasUrl,
                } : null,
            } : null,
        };

        return {
            success: true,
            data: refundWithSasUrl,
        };
    }

    @Post('approve')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(SystemRole.ADMIN)
    async approveRefund(
        @Body() body: any,
        @Req() req: any
    ) {
        const adminId = req.user?.id;
        if (!adminId) {
            throw new BadRequestException('Thiếu thông tin admin');
        }

        if (!body.vnpRequestIds || !Array.isArray(body.vnpRequestIds) || body.vnpRequestIds.length === 0) {
            throw new BadRequestException('vnpRequestIds phải là mảng và không được rỗng');
        }

        if (!body.action || (body.action !== 'APPROVE' && body.action !== 'REJECT')) {
            throw new BadRequestException('Action phải là APPROVE hoặc REJECT');
        }

        if (body.action === 'REJECT' && (!body.rejectReason || body.rejectReason.trim() === '')) {
            throw new BadRequestException('Thiếu lý do từ chối');
        }

        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const vnpRequestId of body.vnpRequestIds) {
            try {
                if (body.action === 'APPROVE') {
                    const refund = await this.refundService.approveRefund({
                        vnpRequestId,
                        action: body.action,
                        adminId,
                    });

                    const payment = await this.paymentService.getPaymentByTxnRef(refund.vnp_txn_ref);
                    if (!payment || !payment.transaction_no) {
                        throw new Error('Không tìm thấy thông tin giao dịch VNPay');
                    }

                    const refundParams = {
                        vnpRequestId: refund.vnp_request_id,
                        vnpTxnRef: refund.vnp_txn_ref,
                        amount: parseFloat(refund.amount),
                        transactionNo: payment.transaction_no,
                        transactionDate: refund.vnp_transaction_date,
                        transactionType: refund.transaction_type,
                        createBy: adminId,
                        ipAddr: clientIp,
                        orderInfo: refund.order_info,
                    };

                    const vnpayResponse = await this.vnpayService.requestRefund(refundParams);

                    await this.refundService.updateRefundStatus({
                        vnpRequestId: refund.vnp_request_id,
                        vnpResponseId: vnpayResponse.vnp_ResponseId || '',
                        responseCode: vnpayResponse.vnp_ResponseCode,
                        responseMessage: vnpayResponse.vnp_Message,
                        vnpTransactionNo: vnpayResponse.vnp_TransactionNo,
                        transactionStatus: vnpayResponse.vnp_TransactionStatus,
                        bankCode: vnpayResponse.vnp_BankCode,
                        payDate: vnpayResponse.vnp_PayDate,
                    });

                    if (vnpayResponse.vnp_ResponseCode === '00') {
                        if (payment.course_id) {
                            const registration = await this.registrationRepo.findOne({
                                where: {
                                    user_id: payment.user_id,
                                    course_id: payment.course_id,
                                },
                            });

                            if (registration) {
                                await this.registrationRepo.remove(registration);
                            }
                        }

                        results.push({
                            vnpRequestId,
                            success: true,
                            message: 'Phê duyệt và hoàn tiền thành công',
                        });
                        successCount++;
                    } else {
                        results.push({
                            vnpRequestId,
                            success: false,
                            message: `Phê duyệt thành công nhưng hoàn tiền thất bại: ${vnpayResponse.vnp_Message}`,
                        });
                        failCount++;
                    }
                } else {
                    await this.refundService.approveRefund({
                        vnpRequestId,
                        action: body.action,
                        adminId,
                        rejectReason: body.rejectReason,
                    });

                    results.push({
                        vnpRequestId,
                        success: true,
                        message: 'Đã từ chối yêu cầu hoàn tiền',
                    });
                    successCount++;
                }
            } catch (error) {
                results.push({
                    vnpRequestId,
                    success: false,
                    message: error instanceof Error ? error.message : 'Có lỗi xảy ra',
                });
                failCount++;
            }
        }

        return {
            success: true,
            message: `Xử lý ${body.vnpRequestIds.length} yêu cầu: ${successCount} thành công, ${failCount} thất bại`,
            data: {
                results,
            },
        };
    }

    @Post('cancel/:vnpRequestId')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    async cancelRefund(
        @Param('vnpRequestId') vnpRequestId: string,
        @Req() req: any
    ) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestException('Thiếu thông tin người dùng');
        }

        await this.refundService.cancelRefund(vnpRequestId, userId);

        return {
            success: true,
            message: 'Đã hủy yêu cầu hoàn tiền',
        };
    }
}
