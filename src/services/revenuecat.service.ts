import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

export interface RevenueCatNonSubscriptionTransaction {
  id: string;
  purchase_date: string;
  original_purchase_date?: string;
  is_sandbox?: boolean;
  store?: string;
}

export interface RevenueCatSubscriberResponse {
  subscriber: {
    entitlements?: Record<
      string,
      {
        product_identifier?: string;
        purchase_date?: string;
        expires_date?: string | null;
      }
    >;
    non_subscriptions?: Record<
      string,
      RevenueCatNonSubscriptionTransaction[]
    >;
  };
}

export type RevenueCatPurchaseVerificationReason =
  | 'VERIFIED_TRANSACTION_ID'
  | 'VERIFIED_PURCHASE_DATE'
  | 'ENTITLEMENT_MISSING'
  | 'ENTITLEMENT_PRODUCT_MISMATCH'
  | 'ENTITLEMENT_EXPIRED'
  | 'PURCHASE_MISSING'
  | 'PURCHASE_STORE_MISMATCH'
  | 'TRANSACTION_MISMATCH';

export interface RevenueCatPurchaseVerification {
  verified: boolean;
  reason: RevenueCatPurchaseVerificationReason;
}

interface VerifyNonSubscriptionPurchaseInput {
  entitlementId: string;
  productId: string;
  transactionIds: string[];
  purchasedAtMs?: number;
  store?: string;
}

const PURCHASE_DATE_TOLERANCE_MS = 5 * 60 * 1000;

export function verifyNonSubscriptionPurchase(
  customer: RevenueCatSubscriberResponse,
  input: VerifyNonSubscriptionPurchaseInput,
): RevenueCatPurchaseVerification {
  const entitlement =
    customer.subscriber.entitlements?.[input.entitlementId];
  if (!entitlement) {
    return { verified: false, reason: 'ENTITLEMENT_MISSING' };
  }
  if (entitlement.product_identifier !== input.productId) {
    return { verified: false, reason: 'ENTITLEMENT_PRODUCT_MISMATCH' };
  }
  if (
    entitlement.expires_date &&
    new Date(entitlement.expires_date).getTime() <= Date.now()
  ) {
    return { verified: false, reason: 'ENTITLEMENT_EXPIRED' };
  }

  const transactions =
    customer.subscriber.non_subscriptions?.[input.productId] ?? [];
  if (!transactions.length) {
    return { verified: false, reason: 'PURCHASE_MISSING' };
  }

  const expectedStore = normalizeRevenueCatStore(input.store);
  const storeTransactions = expectedStore
    ? transactions.filter(
        (transaction) =>
          normalizeRevenueCatStore(transaction.store) === expectedStore,
      )
    : transactions;
  if (!storeTransactions.length) {
    return { verified: false, reason: 'PURCHASE_STORE_MISMATCH' };
  }

  const expectedIds = new Set(input.transactionIds.filter(Boolean));
  if (
    expectedIds.size &&
    storeTransactions.some((transaction) => expectedIds.has(transaction.id))
  ) {
    return { verified: true, reason: 'VERIFIED_TRANSACTION_ID' };
  }

  const purchasedAtMs = Number(input.purchasedAtMs);
  const entitlementPurchasedAtMs = Date.parse(entitlement.purchase_date ?? '');
  if (
    Number.isFinite(purchasedAtMs) &&
    Number.isFinite(entitlementPurchasedAtMs) &&
    Math.abs(entitlementPurchasedAtMs - purchasedAtMs) <=
      PURCHASE_DATE_TOLERANCE_MS &&
    storeTransactions.some((transaction) => {
      const transactionPurchasedAtMs = Date.parse(transaction.purchase_date);
      return (
        Number.isFinite(transactionPurchasedAtMs) &&
        Math.abs(transactionPurchasedAtMs - purchasedAtMs) <=
          PURCHASE_DATE_TOLERANCE_MS
      );
    })
  ) {
    return { verified: true, reason: 'VERIFIED_PURCHASE_DATE' };
  }

  return { verified: false, reason: 'TRANSACTION_MISMATCH' };
}

export function hasVerifiedNonSubscriptionPurchase(
  customer: RevenueCatSubscriberResponse,
  entitlementId: string,
  productId: string,
  transactionIds: string[],
): boolean {
  return verifyNonSubscriptionPurchase(customer, {
    entitlementId,
    productId,
    transactionIds,
  }).verified;
}

function normalizeRevenueCatStore(value: string | undefined): string | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized || null;
}

@Injectable()
export class RevenueCatService {
  private readonly apiBaseUrl =
    process.env.REVENUECAT_API_BASE_URL || 'https://api.revenuecat.com/v1';

  constructor(private readonly httpService: HttpService) {}

  async getSubscriber(
    revenueCatAppUserId: string,
  ): Promise<RevenueCatSubscriberResponse> {
    const secretApiKey = process.env.REVENUECAT_SECRET_API_KEY;
    if (!secretApiKey) {
      throw new ServiceUnavailableException(
        'RevenueCat server API chưa được cấu hình',
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<RevenueCatSubscriberResponse>(
          `${this.apiBaseUrl}/subscribers/${encodeURIComponent(revenueCatAppUserId)}`,
          {
            headers: {
              Authorization: `Bearer ${secretApiKey}`,
              Accept: 'application/json',
            },
            timeout: 10000,
          },
        ),
      );
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return { subscriber: { entitlements: {}, non_subscriptions: {} } };
      }
      throw new BadGatewayException('Không thể xác minh giao dịch RevenueCat');
    }
  }

  verifyWebhook(
    authorizationHeader: string | undefined,
    signatureHeader: string | undefined,
    rawBody: Buffer | undefined,
  ): void {
    const configuredAuth = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN;
    if (!configuredAuth) {
      throw new ServiceUnavailableException(
        'RevenueCat webhook authorization chưa được cấu hình',
      );
    }

    const acceptedHeaders = new Set([
      configuredAuth,
      `Bearer ${configuredAuth}`,
    ]);
    if (!authorizationHeader || !acceptedHeaders.has(authorizationHeader)) {
      throw new UnauthorizedException('RevenueCat webhook authorization không hợp lệ');
    }

    const hmacSecret = process.env.REVENUECAT_WEBHOOK_HMAC_SECRET;
    if (!hmacSecret) {
      throw new ServiceUnavailableException(
        'RevenueCat webhook HMAC chưa được cấu hình',
      );
    }
    if (!signatureHeader || !rawBody) {
      throw new UnauthorizedException('Thiếu RevenueCat webhook signature');
    }

    const fields = Object.fromEntries(
      signatureHeader.split(',').map((part) => {
        const [key, value] = part.trim().split('=', 2);
        return [key, value];
      }),
    );
    const timestamp = Number(fields.t);
    const provided = fields.v1;
    if (!Number.isFinite(timestamp) || !provided) {
      throw new UnauthorizedException('RevenueCat webhook signature sai định dạng');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > 300) {
      throw new UnauthorizedException('RevenueCat webhook đã hết hạn');
    }

    const expected = crypto
      .createHmac('sha256', hmacSecret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    let providedBuffer: Buffer;
    try {
      providedBuffer = Buffer.from(provided, 'hex');
    } catch {
      throw new UnauthorizedException('RevenueCat webhook signature không hợp lệ');
    }

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException('RevenueCat webhook signature không hợp lệ');
    }
  }
}
