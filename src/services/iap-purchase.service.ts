import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Course } from '../schema/entities/course.entity';
import {
  CourseStoreProduct,
  StorePlatform,
  StoreProductType,
  StoreProvider,
} from '../schema/entities/course-store-product.entity';
import {
  IapEnvironment,
  IapPurchase,
  IapPurchaseStatus,
} from '../schema/entities/iap-purchase.entity';
import {
  RevenueCatWebhookEvent,
  WebhookProcessingStatus,
} from '../schema/entities/revenuecat-webhook-event.entity';
import { User } from '../schema/entities/user.entity';
import {
  CreateCourseStoreProductDto,
  IapSyncReason,
  MobileIapSyncDto,
  UpdateCourseStoreProductDto,
} from '../schema/dtos/mobile-iap.dto';
import { RevenueCatService } from './revenuecat.service';
import { CourseAccessService } from './course-access.service';
import { CourseAccessSource } from '../schema/entities/course-registration.entity';
import { MasteryService } from './mastery.service';
import { SystemParameterService } from './system-parameter.service';

interface VerifiedPurchaseInput {
  user: User;
  product: CourseStoreProduct;
  transactionId: string;
  originalTransactionId?: string | null;
  environment: IapEnvironment;
  purchasedAt: Date;
  price?: number | null;
  currency?: string | null;
  countryCode?: string | null;
  rawEvent?: Record<string, unknown> | null;
}

@Injectable()
export class IapPurchaseService {
  private readonly logger = new Logger(IapPurchaseService.name);

  constructor(
    @InjectRepository(CourseStoreProduct)
    private readonly productRepo: Repository<CourseStoreProduct>,
    @InjectRepository(IapPurchase)
    private readonly purchaseRepo: Repository<IapPurchase>,
    @InjectRepository(RevenueCatWebhookEvent)
    private readonly webhookEventRepo: Repository<RevenueCatWebhookEvent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    private readonly revenueCatService: RevenueCatService,
    private readonly accessService: CourseAccessService,
    private readonly masteryService: MasteryService,
    private readonly systemParameterService: SystemParameterService,
    private readonly dataSource: DataSource,
  ) {}

  async isGloballyEnabled(): Promise<boolean> {
    const value = await this.systemParameterService.getValue(
      'MOBILE_IAP_ENABLED',
      'N',
      true,
    );
    return value.trim().toUpperCase() === 'Y';
  }

  async getConfig(userId: string, platform: StorePlatform) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return {
      enabled: await this.isGloballyEnabled(),
      platform,
      revenuecatAppUserId: user.revenuecat_app_user_id,
    };
  }

  async getCoursePurchaseOption(
    course: Course,
    userId: string | null | undefined,
    platform?: StorePlatform,
  ) {
    const access = await this.accessService.resolveAccess(userId, course);
    if (!course.is_paid) {
      return {
        owned: access.owned,
        state: 'FREE_COURSE',
        mobileIap: null,
      };
    }
    if (access.accessLevel === 'FULL') {
      return { owned: true, state: 'OWNED', mobileIap: null };
    }

    const globalEnabled = await this.isGloballyEnabled();
    if (!globalEnabled || !course.mobile_iap_enabled) {
      return {
        owned: false,
        state: 'IAP_DISABLED',
        mobileIap: { enabled: false, productId: null, entitlementId: null },
      };
    }
    if (!platform) {
      return {
        owned: false,
        state: 'PRODUCT_NOT_CONFIGURED',
        mobileIap: { enabled: false, productId: null, entitlementId: null },
      };
    }

    const product = await this.productRepo.findOne({
      where: { course_id: course.course_id, platform, is_active: true },
    });
    if (!product) {
      return {
        owned: false,
        state: 'PRODUCT_NOT_CONFIGURED',
        mobileIap: { enabled: false, productId: null, entitlementId: null },
      };
    }

    return {
      owned: false,
      state: 'AVAILABLE',
      mobileIap: {
        enabled: true,
        productId: product.product_id,
        entitlementId: product.entitlement_id,
      },
    };
  }

  async syncUserPurchases(userId: string, dto: MobileIapSyncDto) {
    if (!(await this.isGloballyEnabled()) && dto.reason === IapSyncReason.PURCHASE) {
      return {
        status: 'IAP_DISABLED',
        courseId: dto.courseId ?? null,
        accessLevel: 'FREE',
      };
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    const customer = await this.revenueCatService.getSubscriber(
      user.revenuecat_app_user_id,
    );
    const nonSubscriptions = customer.subscriber.non_subscriptions ?? {};
    const entitlements = customer.subscriber.entitlements ?? {};
    const productIds = Object.keys(nonSubscriptions);

    if (dto.productId && !productIds.includes(dto.productId)) {
      const access = dto.courseId
        ? await this.accessService.resolveByCourseId(userId, dto.courseId)
        : null;
      return {
        status: access?.accessLevel === 'FULL' ? 'ACTIVE' : 'NOT_OWNED',
        courseId: dto.courseId ?? null,
        accessLevel: access?.accessLevel ?? 'FREE',
      };
    }

    const products = productIds.length
      ? await this.productRepo.find({
          where: { product_id: In(productIds), is_active: true },
        })
      : [];

    const activatedCourseIds = new Set<string>();
    const unchangedCourseIds = new Set<string>();

    for (const product of products) {
      const entitlement = entitlements[product.entitlement_id];
      if (!this.isEntitlementActive(entitlement, product.product_id)) continue;

      const transactions = [...(nonSubscriptions[product.product_id] ?? [])].sort(
        (a, b) =>
          new Date(b.purchase_date).getTime() -
          new Date(a.purchase_date).getTime(),
      );
      const transaction = transactions[0];
      if (!transaction?.id || !transaction.purchase_date) continue;

      const transactionStore = transaction.store
        ? this.normalizeStore(transaction.store)
        : product.store;
      if (transactionStore && transactionStore !== product.store) continue;

      const purchase = await this.upsertVerifiedPurchase({
        user,
        product,
        transactionId: transaction.id,
        originalTransactionId: transaction.id,
        environment: transaction.is_sandbox
          ? IapEnvironment.SANDBOX
          : IapEnvironment.PRODUCTION,
        purchasedAt: new Date(transaction.purchase_date),
        rawEvent: this.sanitizePayload(transaction as unknown as Record<string, unknown>),
      });

      if (purchase.created) activatedCourseIds.add(product.course_id);
      else unchangedCourseIds.add(product.course_id);
    }

    if (dto.productId) {
      const mapped = products.find((product) => product.product_id === dto.productId);
      if (!mapped || (dto.courseId && mapped.course_id !== dto.courseId)) {
        return {
          status: 'PRODUCT_MISMATCH',
          courseId: dto.courseId ?? null,
          accessLevel: 'FREE',
        };
      }
    }

    if (dto.courseId) {
      const access = await this.accessService.resolveByCourseId(userId, dto.courseId);
      return {
        status: access.accessLevel === 'FULL' ? 'ACTIVE' : 'PENDING',
        courseId: dto.courseId,
        accessLevel: access.accessLevel,
        paymentMethod: access.source,
      };
    }

    return {
      status: 'ACTIVE',
      activatedCourseIds: [...activatedCourseIds],
      unchangedCourseIds: [...unchangedCourseIds],
    };
  }

  async getCourseStatus(userId: string, courseId: string) {
    const access = await this.accessService.resolveByCourseId(userId, courseId);
    return {
      courseId,
      accessLevel: access.accessLevel,
      owned: access.owned,
      source: access.source,
    };
  }

  async processWebhook(payload: any): Promise<{ duplicate?: boolean; status: string }> {
    if (payload?.api_version !== '1.0' || !payload?.event?.id || !payload?.event?.type) {
      throw new BadRequestException('RevenueCat webhook payload không hợp lệ');
    }
    const event = payload.event;
    this.validateWebhookScope(event);

    const existing = await this.webhookEventRepo.findOne({
      where: { event_id: event.id },
    });
    let eventRecord: RevenueCatWebhookEvent;
    if (existing) {
      if (existing.processing_status !== WebhookProcessingStatus.FAILED) {
        return { duplicate: true, status: existing.processing_status };
      }
      const claimed = await this.webhookEventRepo.update(
        {
          id: existing.id,
          processing_status: WebhookProcessingStatus.FAILED,
        },
        {
          processing_status: WebhookProcessingStatus.RECEIVED,
          failure_reason: null,
          processed_at: null,
        },
      );
      if (!claimed.affected) {
        return { duplicate: true, status: WebhookProcessingStatus.RECEIVED };
      }
      eventRecord = await this.webhookEventRepo.findOneByOrFail({ id: existing.id });
    } else {
      eventRecord = this.webhookEventRepo.create({
        event_id: event.id,
        event_type: event.type,
        environment: event.environment ?? null,
        app_id: event.app_id ?? null,
        processing_status: WebhookProcessingStatus.RECEIVED,
        failure_reason: null,
        payload: this.sanitizePayload(event),
        processed_at: null,
      });
      try {
        eventRecord = await this.webhookEventRepo.save(eventRecord);
      } catch (error: any) {
        if (error?.code === '23505') {
          return { duplicate: true, status: WebhookProcessingStatus.RECEIVED };
        }
        throw error;
      }
    }

    try {
      switch (event.type) {
        case 'NON_RENEWING_PURCHASE':
          await this.processPurchaseEvent(event);
          eventRecord.processing_status = WebhookProcessingStatus.PROCESSED;
          break;
        case 'CANCELLATION':
          await this.processCancellationEvent(event);
          eventRecord.processing_status = WebhookProcessingStatus.PROCESSED;
          break;
        case 'REFUND_REVERSED':
          await this.processPurchaseEvent(event);
          eventRecord.processing_status = WebhookProcessingStatus.PROCESSED;
          break;
        case 'TRANSFER':
          await this.processTransferEvent(event);
          eventRecord.processing_status = WebhookProcessingStatus.PROCESSED;
          break;
        case 'TEST':
        default:
          eventRecord.processing_status = WebhookProcessingStatus.IGNORED;
          break;
      }
      eventRecord.processed_at = new Date();
      await this.webhookEventRepo.save(eventRecord);
      return { status: eventRecord.processing_status };
    } catch (error: any) {
      eventRecord.processing_status = WebhookProcessingStatus.FAILED;
      eventRecord.failure_reason = String(error?.message ?? error).slice(0, 2000);
      eventRecord.processed_at = new Date();
      await this.webhookEventRepo.save(eventRecord);
      throw error;
    }
  }

  private async processPurchaseEvent(event: any): Promise<void> {
    if (!event.product_id || !event.transaction_id || !event.purchased_at_ms) {
      throw new BadRequestException('RevenueCat purchase event thiếu trường bắt buộc');
    }
    const store = this.normalizeStore(event.store);
    if (!store) throw new BadRequestException('RevenueCat store không được hỗ trợ');

    const product = await this.productRepo.findOne({
      where: { product_id: event.product_id, store, is_active: true },
    });
    if (!product) {
      throw new BadRequestException(`Không tìm thấy mapping cho product ${event.product_id}`);
    }
    if (!(event.entitlement_ids ?? []).includes(product.entitlement_id)) {
      throw new BadRequestException('RevenueCat entitlement không khớp khóa học');
    }

    const user = await this.findUserForEvent(event);
    await this.upsertVerifiedPurchase({
      user,
      product,
      transactionId: event.transaction_id,
      originalTransactionId: event.original_transaction_id ?? null,
      environment: this.normalizeEnvironment(event.environment),
      purchasedAt: new Date(Number(event.purchased_at_ms)),
      price: event.price_in_purchased_currency ?? event.price ?? null,
      currency: event.currency ?? null,
      countryCode: event.country_code ?? null,
      rawEvent: this.sanitizePayload(event),
    });
  }

  private async processCancellationEvent(event: any): Promise<void> {
    const store = this.normalizeStore(event.store);
    if (!store) throw new BadRequestException('RevenueCat store không được hỗ trợ');
    const environment = this.normalizeEnvironment(event.environment);
    const ids = [event.transaction_id, event.original_transaction_id].filter(Boolean);
    if (!ids.length) throw new BadRequestException('Thiếu transaction ID để revoke');

    const purchase = await this.purchaseRepo.findOne({
      where: ids.flatMap((id: string) => [
        { store, environment, transaction_id: id },
        { store, environment, original_transaction_id: id },
      ]),
    });
    if (!purchase) {
      throw new NotFoundException('Không tìm thấy IAP purchase cần revoke');
    }

    await this.dataSource.transaction(async (manager) => {
      purchase.status = IapPurchaseStatus.REFUNDED;
      purchase.revoked_at = new Date();
      purchase.raw_last_event = this.sanitizePayload(event);
      await manager.getRepository(IapPurchase).save(purchase);
      await this.accessService.revokeIapAccess(purchase, manager);
    });
  }

  private async processTransferEvent(event: any): Promise<void> {
    const destinationIds = (event.transferred_to ?? []).filter((id: string) =>
      this.isUuid(id),
    );
    for (const revenueCatId of destinationIds) {
      const user = await this.userRepo.findOne({
        where: { revenuecat_app_user_id: revenueCatId },
      });
      if (!user) continue;
      this.logger.warn(`Reconciling unexpected RevenueCat transfer for user ${user.id}`);
      await this.syncUserPurchases(user.id, { reason: IapSyncReason.RESTORE });
    }
  }

  private async upsertVerifiedPurchase(input: VerifiedPurchaseInput): Promise<{
    purchase: IapPurchase;
    created: boolean;
  }> {
    let created = false;
    const purchase = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(IapPurchase);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${input.product.store}:${input.environment}:${input.transactionId}`,
      ]);
      let entity = await repo.findOne({
        where: {
          store: input.product.store,
          environment: input.environment,
          transaction_id: input.transactionId,
        },
      });
      if (entity && entity.user_id !== input.user.id) {
        throw new ConflictException('Giao dịch đã thuộc một tài khoản EduTech khác');
      }
      if (!entity) {
        created = true;
        entity = repo.create({
          user_id: input.user.id,
          course_id: input.product.course_id,
          store_product_id: input.product.id,
          revenuecat_app_user_id: input.user.revenuecat_app_user_id,
          store: input.product.store,
          environment: input.environment,
          product_id: input.product.product_id,
          entitlement_id: input.product.entitlement_id,
          transaction_id: input.transactionId,
          original_transaction_id: input.originalTransactionId ?? null,
          purchased_at: input.purchasedAt,
        });
      }

      entity.status = IapPurchaseStatus.ACTIVE;
      entity.revoked_at = null;
      entity.price = input.price == null ? entity.price ?? null : String(input.price);
      entity.currency = input.currency ?? entity.currency ?? null;
      entity.country_code = input.countryCode ?? entity.country_code ?? null;
      entity.raw_last_event = input.rawEvent ?? entity.raw_last_event ?? null;
      entity = await repo.save(entity);

      await this.accessService.grantAccess(
        {
          userId: input.user.id,
          courseId: input.product.course_id,
          source: this.accessSourceForStore(input.product.store),
          amountPaid: entity.price ?? 0,
          paymentMethod: input.product.store,
          transactionId: entity.transaction_id,
          purchaseDate: entity.purchased_at,
          iapPurchaseId: entity.id,
        },
        manager,
      );
      return entity;
    });

    await this.masteryService.initializeCourseMastery(
      input.user.id,
      input.product.course_id,
    );
    return { purchase, created };
  }

  async listCourseProducts(courseId: string) {
    await this.requireCourse(courseId);
    return this.productRepo.find({
      where: { course_id: courseId },
      order: { platform: 'ASC', created_at: 'DESC' },
    });
  }

  async createCourseProduct(courseId: string, dto: CreateCourseStoreProductDto) {
    const course = await this.requireCourse(courseId);
    if (!course.is_paid) {
      throw new BadRequestException('Chỉ khóa học trả phí mới có store product');
    }
    this.validateStorePlatform(dto.platform, dto.store);

    if (dto.isActive) {
      await this.deactivatePlatformProducts(courseId, dto.platform);
    }
    const product = this.productRepo.create({
      course_id: courseId,
      platform: dto.platform,
      store: dto.store,
      product_id: dto.productId,
      entitlement_id: dto.entitlementId,
      product_type: dto.productType ?? StoreProductType.NON_CONSUMABLE,
      is_active: dto.isActive ?? false,
    });
    return this.productRepo.save(product);
  }

  async updateCourseProduct(
    courseId: string,
    id: string,
    dto: UpdateCourseStoreProductDto,
  ) {
    const product = await this.productRepo.findOne({
      where: { id, course_id: courseId },
    });
    if (!product) throw new NotFoundException('Store product không tồn tại');

    if (dto.productId && dto.productId !== product.product_id) {
      const purchaseCount = await this.purchaseRepo.count({
        where: { store_product_id: product.id },
      });
      if (purchaseCount > 0) {
        throw new ConflictException(
          'Product đã có giao dịch; hãy tạo version mới thay vì đổi product ID',
        );
      }
      product.product_id = dto.productId;
    }
    if (dto.entitlementId !== undefined) {
      product.entitlement_id = dto.entitlementId;
    }
    if (dto.isActive === true) {
      await this.deactivatePlatformProducts(courseId, product.platform, product.id);
    }
    if (dto.isActive !== undefined) product.is_active = dto.isActive;
    return this.productRepo.save(product);
  }

  async updateCourseMobileIap(
    courseId: string,
    mobileIapEnabled: boolean,
    isPaid?: boolean,
  ) {
    const course = await this.requireCourse(courseId);
    if (isPaid !== undefined) course.is_paid = isPaid;
    if (!course.is_paid && mobileIapEnabled) {
      throw new BadRequestException('Khóa học miễn phí không thể bật IAP');
    }
    if (mobileIapEnabled) {
      const activeProducts = await this.productRepo.count({
        where: { course_id: courseId, is_active: true },
      });
      if (!activeProducts) {
        throw new BadRequestException('Chưa có store product active cho khóa học');
      }
    }
    course.mobile_iap_enabled = course.is_paid ? mobileIapEnabled : false;
    return this.courseRepo.save(course);
  }

  async getUserPurchaseHistory(userId: string) {
    return this.purchaseRepo.find({
      where: { user_id: userId },
      relations: ['course'],
      order: { purchased_at: 'DESC' },
    });
  }

  async getUserPurchase(userId: string, purchaseId: string) {
    return this.purchaseRepo.findOne({
      where: { id: purchaseId, user_id: userId },
      relations: ['course', 'user'],
    });
  }

  private async requireCourse(courseId: string): Promise<Course> {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) throw new NotFoundException('Khóa học không tồn tại');
    return course;
  }

  private async deactivatePlatformProducts(
    courseId: string,
    platform: StorePlatform,
    exceptId?: string,
  ): Promise<void> {
    const query = this.productRepo
      .createQueryBuilder()
      .update(CourseStoreProduct)
      .set({ is_active: false })
      .where('course_id = :courseId', { courseId })
      .andWhere('platform = :platform', { platform });
    if (exceptId) query.andWhere('id != :exceptId', { exceptId });
    await query.execute();
  }

  private validateStorePlatform(platform: StorePlatform, store: StoreProvider) {
    const valid =
      (platform === StorePlatform.IOS && store === StoreProvider.APP_STORE) ||
      (platform === StorePlatform.ANDROID && store === StoreProvider.PLAY_STORE) ||
      (platform === StorePlatform.TEST_STORE && store === StoreProvider.TEST_STORE);
    if (!valid) throw new BadRequestException('Platform và store không khớp');
  }

  private isEntitlementActive(
    entitlement:
      | { product_identifier?: string; expires_date?: string | null }
      | undefined,
    productId: string,
  ): boolean {
    if (!entitlement || entitlement.product_identifier !== productId) return false;
    return !entitlement.expires_date || new Date(entitlement.expires_date) > new Date();
  }

  private normalizeStore(value: string | undefined): StoreProvider | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (['APP_STORE', 'MAC_APP_STORE'].includes(normalized)) {
      return StoreProvider.APP_STORE;
    }
    if (normalized === 'PLAY_STORE') return StoreProvider.PLAY_STORE;
    if (normalized === 'TEST_STORE') return StoreProvider.TEST_STORE;
    return null;
  }

  private normalizeEnvironment(value: string | undefined): IapEnvironment {
    return String(value ?? '').toUpperCase() === IapEnvironment.PRODUCTION
      ? IapEnvironment.PRODUCTION
      : IapEnvironment.SANDBOX;
  }

  private accessSourceForStore(store: StoreProvider): CourseAccessSource {
    return store === StoreProvider.APP_STORE
      ? CourseAccessSource.APP_STORE
      : CourseAccessSource.PLAY_STORE;
  }

  private async findUserForEvent(event: any): Promise<User> {
    const candidateIds = [
      event.app_user_id,
      event.original_app_user_id,
      ...(event.aliases ?? []),
    ].filter((id, index, values) => this.isUuid(id) && values.indexOf(id) === index);
    if (!candidateIds.length) {
      throw new BadRequestException('Webhook không chứa RevenueCat App User ID hợp lệ');
    }
    const users = await this.userRepo.find({
      where: { revenuecat_app_user_id: In(candidateIds) },
    });
    if (users.length !== 1) {
      throw new ConflictException(
        users.length === 0
          ? 'Không tìm thấy tài khoản EduTech cho giao dịch'
          : 'RevenueCat aliases đang trỏ tới nhiều tài khoản EduTech',
      );
    }
    return users[0]!;
  }

  private validateWebhookScope(event: any): void {
    const allowedAppIds = [
      process.env.REVENUECAT_IOS_APP_ID,
      process.env.REVENUECAT_ANDROID_APP_ID,
    ].filter(Boolean);
    if (allowedAppIds.length && !allowedAppIds.includes(event.app_id)) {
      throw new BadRequestException('RevenueCat app ID không được phép');
    }

    const allowedEnvironments = (
      process.env.REVENUECAT_ALLOWED_ENVIRONMENTS || 'SANDBOX,PRODUCTION'
    )
      .split(',')
      .map((value) => value.trim().toUpperCase());
    if (event.environment && !allowedEnvironments.includes(String(event.environment).toUpperCase())) {
      throw new BadRequestException('RevenueCat environment không được phép');
    }
  }

  private sanitizePayload(payload: Record<string, unknown>) {
    const copy = { ...payload };
    delete copy.subscriber_attributes;
    return copy;
  }

  private isUuid(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    );
  }
}
