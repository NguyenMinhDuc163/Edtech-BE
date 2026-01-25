import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as qs from 'qs';

@Injectable()
export class VnpayService {
    private readonly tmnCode: string;
    private readonly secretKey: string;
    private readonly vnpUrl: string;
    private readonly returnUrl: string;

    constructor() {
        this.tmnCode = process.env.VNPAY_TMN_CODE || '02E53Q96';
        this.secretKey = process.env.VNPAY_HASH_SECRET || 'U9Q34TWMKQ0UW9JGDXIVI08BA';
        this.vnpUrl = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn';
        this.returnUrl = process.env.VNPAY_REDIRECT || 'http://localhost:3000/api/vnpay-ipn';
    }

    private sortObject(obj: any) {
        const sorted: any = {};
        const str: string[] = [];
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                str.push(encodeURIComponent(key));
            }
        }
        str.sort();
        for (let i = 0; i < str.length; i++) {
            const encodedKey = str[i] as string;
            const originalKey = decodeURIComponent(encodedKey);
            sorted[encodedKey] = encodeURIComponent(String(obj[originalKey] || '')).replace(/%20/g, '+');
        }
        return sorted;
    }

    private createSignature(data: any): string {
        const sortedData = this.sortObject(data);
        const signData = qs.stringify(sortedData, { encode: false });
        const hmac = crypto.createHmac('sha512', this.secretKey);
        return hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    }

    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }

    buildPaymentUrl(params: {
        amount: number;
        ipAddr: string;
        txnRef: string;
        orderInfo: string;
        returnUrl?: string;
    }): { paymentUrl: string; vnpCreateDate: string } {
        const createDate = new Date();
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + 1);

        const vnpCreateDate = this.formatDate(createDate);

        const vnpParams: any = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: this.tmnCode,
            vnp_Amount: params.amount * 100,
            vnp_CurrCode: 'VND',
            vnp_TxnRef: params.txnRef,
            vnp_OrderInfo: params.orderInfo,
            vnp_OrderType: 'other',
            vnp_Locale: 'vn',
            vnp_ReturnUrl: this.returnUrl || params.returnUrl,
            vnp_IpAddr: params.ipAddr,
            vnp_CreateDate: vnpCreateDate,
            vnp_ExpireDate: this.formatDate(expireDate),
        };

        const secureHash = this.createSignature(vnpParams);
        vnpParams.vnp_SecureHash = secureHash;

        const paymentUrl = `${this.vnpUrl}/paymentv2/vpcpay.html?${qs.stringify(vnpParams, { encode: false })}`;

        return {
            paymentUrl,
            vnpCreateDate,
        };
    }

    verifyReturnUrl(query: any) {
        const secureHash = query.vnp_SecureHash;
        delete query.vnp_SecureHash;
        delete query.vnp_SecureHashType;

        const signed = this.createSignature(query);
        const isVerified = secureHash === signed;

        return {
            isVerified,
            ...query,
        };
    }

    verifyIpnCall(query: any) {
        return this.verifyReturnUrl(query);
    }

    createRefundSignature(data: {
        vnpRequestId: string;
        vnpTxnRef: string;
        amount: number;
        transactionNo: string;
        transactionDate: string;
        createBy: string;
        createDate: string;
        ipAddr: string;
        orderInfo: string;
        transactionType: string;
    }): string {
        const signData = [
            data.vnpRequestId,
            '2.1.0',
            'refund',
            this.tmnCode,
            data.transactionType,
            data.vnpTxnRef,
            (data.amount * 100).toString(),
            data.transactionNo,
            data.transactionDate,
            data.createBy,
            data.createDate,
            data.ipAddr,
            data.orderInfo,
        ].join('|');

        const hmac = crypto.createHmac('sha512', this.secretKey);
        return hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    }

    verifyRefundResponse(response: any): {
        isVerified: boolean;
        data: any;
    } {
        const secureHash = response.vnp_SecureHash;

        const signData = [
            response.vnp_ResponseId,
            response.vnp_Command,
            response.vnp_ResponseCode,
            response.vnp_Message,
            response.vnp_TmnCode,
            response.vnp_TxnRef,
            response.vnp_Amount,
            response.vnp_BankCode,
            response.vnp_PayDate || '',
            response.vnp_TransactionNo,
            response.vnp_TransactionType,
            response.vnp_TransactionStatus,
            response.vnp_OrderInfo,
        ].join('|');

        const hmac = crypto.createHmac('sha512', this.secretKey);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        return {
            isVerified: secureHash === signed,
            data: response,
        };
    }

    async requestRefund(params: {
        vnpRequestId: string;
        vnpTxnRef: string;
        amount: number;
        transactionNo: string;
        transactionDate: string;
        transactionType: '02' | '03';
        createBy: string;
        ipAddr: string;
        orderInfo: string;
    }): Promise<any> {
        const createDate = this.formatDate(new Date());

        const secureHash = this.createRefundSignature({
            vnpRequestId: params.vnpRequestId,
            vnpTxnRef: params.vnpTxnRef,
            amount: params.amount,
            transactionNo: params.transactionNo,
            transactionDate: params.transactionDate,
            createBy: params.createBy,
            createDate: createDate,
            ipAddr: params.ipAddr,
            orderInfo: params.orderInfo,
            transactionType: params.transactionType,
        });

        const requestData = {
            vnp_RequestId: params.vnpRequestId,
            vnp_Version: '2.1.0',
            vnp_Command: 'refund',
            vnp_TmnCode: this.tmnCode,
            vnp_TransactionType: params.transactionType,
            vnp_TxnRef: params.vnpTxnRef,
            vnp_Amount: Math.round(params.amount * 100),
            vnp_OrderInfo: params.orderInfo,
            vnp_TransactionNo: params.transactionNo,
            vnp_TransactionDate: params.transactionDate,
            vnp_CreateBy: params.createBy,
            vnp_CreateDate: createDate,
            vnp_IpAddr: params.ipAddr,
            vnp_SecureHash: secureHash,
        };

        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`${this.vnpUrl}/merchant_webapi/api/transaction`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
        });

        const result = await response.json();
        return result;
    }
}
