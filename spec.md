# SPEC Backend Mobile IAP - RevenueCat

## 1. Thong tin tai lieu

- Du an: `Edtech-BE` (NestJS, TypeORM, PostgreSQL).
- Client lien quan: `../Edu-Tech/SPEC.md`.
- Muc tieu: them kenh IAP cho iOS/Android qua RevenueCat, giu nguyen VNPay cho web va hop nhat quyen truy cap khoa hoc.
- Trang thai tai lieu: dac ta de trien khai, chua phai code.

## 2. Ket luan nghiep vu

1. Moi khoa hoc tra phi duoc ban tren mobile la mot san pham mua mot lan.
2. iOS dung Non-Consumable; Android dung One-time non-consumable.
3. RevenueCat xac minh giao dich store va gui webhook cho backend.
4. Backend moi la nguon su that ve quyen hoc.
5. `course_registrations.payment_status = PAID` tiep tuc la projection tuong thich voi code hien tai de cap `FULL`.
6. VNPay va refund VNPay tiep tuc hoat dong cho web, khong bi thay bang RevenueCat.
7. Mobile khong duoc goi `/api/create-qr`; endpoint nay chi phuc vu web.

## 3. Hien trang he thong

### 3.1 Quyen truy cap hien tai

- `StudentCourseController` tra `accessLevel = FULL` khi co registration `PAID`.
- `CourseService.getPurchasedCourses` chi lay registration `PAID`.
- `CourseService.getStudentSyllabus` chan user neu khong co registration `PAID`.
- `SectionService`/`ContentService` chi tra noi dung day du va Storage SAS URL khi access level la `FULL`.
- `MasteryService.initializeCourseMastery(userId, courseId)` co tinh idempotent bang insert `orIgnore()`.

Day la contract can giu. Moi nguon cap quyen (FREE, VNPay, App Store, Play Store, ADMIN) phai quy ve cung mot ham access service, khong tu viet lai o tung controller.

### 3.2 Thanh toan hien tai

- VNPay tao `payments` PENDING, callback thanh cong chuyen SUCCESS va tao/cap nhat `course_registrations` PAID.
- `PaymentMethod` hien chi co `VNPAY`, `MOMO`, `ZALOPAY`.
- Refund hien tai la nghiep vu rieng cua VNPay.
- `IS_PAYMENT` duoc doc luc login va client dang dung no de bypass khoa hoc. Contract nay khong an toan va phai deprecated.

## 4. Nguyen tac thiet ke

### 4.1 Tach checkout khoi entitlement

- Checkout source: VNPay, App Store, Google Play, FREE, ADMIN.
- Entitlement/access: mot ket qua chung `FULL` hoac `FREE` cho `userId + courseId`.
- Moi controller can quyen phai goi mot service chung, vi du `CourseAccessService.resolveAccess(userId, course)`.
- Khong controller nao tu suy dien quyen chi tu payment payload.

### 4.2 Tin cay server-side

- Khong cap quyen tu body client gui len.
- Khong cap quyen chi vi RevenueCat SDK tren client bao success.
- Cap quyen khi mot trong hai duong server-side xac minh thanh cong:
  - RevenueCat webhook hop le; hoac
  - endpoint sync cua backend truy van RevenueCat bang secret API key va xac nhan purchase/entitlement.
- Webhook va sync phai goi chung mot service idempotent.

### 4.3 So huu tai khoan

- Tao `revenuecat_app_user_id` ngau nhien, khong doan duoc, duy nhat cho moi user.
- Khong dung email/username/numeric database ID lam RevenueCat App User ID.
- App bat buoc dang nhap truoc khi mua.
- RevenueCat Project Restore Behavior: `Keep with original App User ID` vi he thong bat buoc tai khoan va quyen khoa hoc gan chat voi tai khoan EduTech.
- He qua chap nhan: user restore bang tai khoan EduTech khac se bi tu choi va can dang nhap tai khoan cu/ho tro tai khoan; backend khong tu chuyen quyen.

## 5. Mo hinh mien phi/tra phi va cong tac

### 5.1 Field khoa hoc

- `courses.is_paid = false`: khoa hoc mien phi.
- `courses.is_paid = true`: khoa hoc tra phi.
- `courses.mobile_iap_enabled = true`: cho phep ban qua mobile neu nen tang co product active.
- `courses.mobile_iap_enabled = false`: khoa hoc van bi khoa voi user chua so huu, nhung mobile khong duoc bat dau mua.

Admin/teacher DTO phai cho phep cap nhat ro rang `isPaid` va `mobileIapEnabled`. Khong dung dieu kien `if (body.price)` vi gia `0` la hop le; phai kiem tra `!== undefined`.

### 5.2 Cong tac he thong

Them system parameter:

- `MOBILE_IAP_ENABLED`: `Y|N`, default `N` khi deploy migration de rollout an toan.
- `WEB_VNPAY_ENABLED`: `Y|N`, default `Y` neu can kill switch rieng cho web.

`MOBILE_IAP_ENABLED = N` chi chan checkout. No khong cap full access.

`IS_PAYMENT` hien tai:

- Khong con la nguon quyen hoc.
- Khong tra ve login response cho code moi, hoac tam thoi giu de backward compatibility nhung FE moi bo qua.
- Chi xoa han sau khi app version cu da het support.

### 5.3 Ham quyet dinh access

```text
resolveAccess(userId?, course):
  neu userId null                     -> FREE
  neu course.is_paid = false          -> FULL
  neu co registration PAID            -> FULL
  nguoc lai                            -> FREE
```

Tat ca endpoint course detail, section, content, syllabus, learning va SAS URL phai dung cung quy tac nay.

Khoa hoc mien phi:

- User da dang nhap duoc `FULL` ngay.
- Khi user bam bat dau hoc, `POST /student/courses/:courseId/enroll-free` idempotently tao registration amount `0`, source `FREE` de luu progress va hien trong danh sach dang hoc.
- Anonymous chi xem preview, khong tao registration.

## 6. Database design

Migration phai duoc tao trong `src/schema/migrations`; `synchronize` van la `false`.

### 6.1 `users`

Them:

| Column | Type | Constraint | Mo ta |
|---|---|---|---|
| `revenuecat_app_user_id` | `uuid` | unique, not null | ID ngau nhien dung cho RevenueCat |

Migration backfill UUID cho user cu truoc khi set NOT NULL. Khong thay doi gia tri sau khi da co purchase.

### 6.2 `courses`

Giu `is_paid`, them:

| Column | Type | Default | Mo ta |
|---|---|---|---|
| `mobile_iap_enabled` | boolean | false | Cho phep ban course tren mobile |

Quy tac validate:

- `is_paid = false` thi `mobile_iap_enabled` phai la false.
- `mobile_iap_enabled = true` chi duoc publish khi co it nhat mot store product active; release mobile yeu cau ca iOS va Android active.
- Tat `mobile_iap_enabled` khong thu hoi quyen user da mua.
- Doi course thanh free khong thu hoi giao dich/quyen cu.
- Doi course tu free sang paid ap dung grandfathering: registration FREE da tao truoc luc chuyen doi van `PAID`; chi user chua enroll moi phai mua.

### 6.3 Bang `course_store_products`

| Column | Type | Constraint |
|---|---|---|
| `id` | bigint | PK |
| `course_id` | bigint | FK courses, not null |
| `platform` | varchar(20) | `IOS`, `ANDROID`, `TEST_STORE` |
| `store` | varchar(30) | `APP_STORE`, `PLAY_STORE`, `TEST_STORE` |
| `product_id` | varchar(255) | not null |
| `entitlement_id` | varchar(255) | not null |
| `product_type` | varchar(30) | `NON_CONSUMABLE` |
| `is_active` | boolean | default false |
| `created_at` | timestamptz | default now |
| `updated_at` | timestamptz | auto update |

Constraints/index:

- Unique `(platform, product_id)`.
- Unique `(course_id, platform)` cho product active; neu can version hoa product, dung partial unique index `WHERE is_active = true` va cho phep giu row cu inactive.
- Index `course_id`, `product_id`, `entitlement_id`.
- Entitlement naming mac dinh: `course_<courseId>`.
- Product naming de xuat: `edtech.course.<courseId>.v1` va khong doi sau khi product da co purchase.

Database mapping la canonical mapping course-product. Khong tin course ID tach tu chuoi product ID.

### 6.4 Bang `iap_purchases`

Bang audit va idempotency rieng, khong ep payload IAP vao cac cot VNPay trong `payments`.

| Column | Type | Constraint/Mo ta |
|---|---|---|
| `id` | bigint | PK |
| `user_id` | bigint | FK users, index |
| `course_id` | bigint | FK courses, index |
| `store_product_id` | bigint | FK course_store_products |
| `revenuecat_app_user_id` | uuid | not null, index |
| `store` | varchar(30) | APP_STORE/PLAY_STORE/TEST_STORE |
| `environment` | varchar(20) | SANDBOX/PRODUCTION |
| `product_id` | varchar(255) | snapshot |
| `entitlement_id` | varchar(255) | snapshot |
| `transaction_id` | varchar(255) | store transaction ID |
| `original_transaction_id` | varchar(255) | nullable |
| `status` | varchar(20) | `ACTIVE`, `REFUNDED`, `REVOKED` |
| `price` | numeric(12,2) | nullable |
| `currency` | varchar(10) | nullable |
| `country_code` | varchar(2) | nullable |
| `purchased_at` | timestamptz | not null |
| `revoked_at` | timestamptz | nullable |
| `raw_last_event` | jsonb | payload da loc/optional, han che PII |
| `created_at` | timestamptz | default now |
| `updated_at` | timestamptz | auto update |

Constraints:

- Unique `(store, environment, transaction_id)`.
- Index `(user_id, course_id, status)`.
- Khong luu receipt/token bi mat neu khong can thiet.

### 6.5 Bang `revenuecat_webhook_events`

| Column | Type | Constraint/Mo ta |
|---|---|---|
| `id` | bigint | PK |
| `event_id` | varchar(255) | unique |
| `event_type` | varchar(50) | not null |
| `environment` | varchar(20) | nullable |
| `app_id` | varchar(255) | nullable |
| `processing_status` | varchar(20) | `RECEIVED`, `PROCESSED`, `IGNORED`, `FAILED` |
| `failure_reason` | text | nullable, khong chua secret |
| `payload` | jsonb | payload da loc/ma hoa theo policy |
| `received_at` | timestamptz | default now |
| `processed_at` | timestamptz | nullable |

RevenueCat giao webhook theo at-least-once; unique `event_id` bat buoc de idempotent.

### 6.6 `course_registrations`

Giu unique `(user_id, course_id)` va cac field hien tai. Them:

| Column | Type | Default/Mo ta |
|---|---|---|
| `access_source` | varchar(20) | `FREE`, `VNPAY`, `APP_STORE`, `PLAY_STORE`, `ADMIN` |
| `iap_purchase_id` | bigint nullable | FK iap_purchases |
| `revoked_at` | timestamptz nullable | thoi diem mat quyen |

Quy uoc:

- Active access: `payment_status = PAID`.
- IAP refund/revoke: `payment_status = REFD`, set `revoked_at` neu registration dang dua tren IAP do va khong co nguon active khac.
- Free enrollment: `payment_status = PAID`, `amount_paid = 0`, `payment_method = FREE`, `access_source = FREE`.
- VNPay tiep tuc `payment_method = VNPAY`, `access_source = VNPAY`.
- IAP: `payment_method = APP_STORE|PLAY_STORE`, `transaction_id = iap transaction_id`.

## 7. RevenueCat project/store configuration

### 7.1 Apps

- RevenueCat iOS app gan voi bundle `com.nguyenduc.edtech`.
- RevenueCat Android app gan voi package `com.nguyenduc.edtech.ed_tech`.
- Ket noi App Store Connect In-App Purchase key va Google Play service account theo tai lieu RevenueCat.
- Cau hinh server-to-server notifications cua Apple/Google den RevenueCat de refund/revoke duoc cap nhat kip thoi.

### 7.2 Product va entitlement

Cho moi course duoc ban:

1. Tao iOS Non-Consumable product.
2. Tao Android one-time product va cau hinh non-consumable.
3. Import ca hai product vao cung RevenueCat project.
4. Tao entitlement `course_<courseId>`.
5. Attach ca iOS va Android product vao entitlement do.
6. Ghi mapping trung khop vao `course_store_products`.
7. Test sandbox truoc khi `is_active = true` va `mobile_iap_enabled = true`.

Offering/Paywall cua RevenueCat khong bat buoc cho v1. Client tai truc tiep product ID do backend tra ve voi category non-subscription. Neu sau nay dung Offering, mapping course-product va backend verification van giu nguyen.

### 7.3 Restore behavior

- Chon `Keep with original App User ID`.
- App chi configure/purchase khi co custom App User ID.
- Support phai co quy trinh tim user bang RevenueCat App User ID/transaction ID khi restore conflict.

## 8. Environment variables va secret

Backend can:

```text
REVENUECAT_SECRET_API_KEY=
REVENUECAT_WEBHOOK_AUTH_TOKEN=
REVENUECAT_WEBHOOK_HMAC_SECRET=
REVENUECAT_IOS_APP_ID=
REVENUECAT_ANDROID_APP_ID=
REVENUECAT_ALLOWED_ENVIRONMENTS=SANDBOX,PRODUCTION
```

Quy tac:

- Secret khong commit vao git, khong tra ve client, khong log.
- Production co the chi nhan `PRODUCTION`; staging nhan `SANDBOX`/`TEST_STORE`.
- `app_id` cua webhook phai nam trong allowlist theo environment.
- Rotate webhook auth/HMAC secret theo quy trinh van hanh.

## 9. API contract

API dung envelope chung cua du an. Vi du ben duoi la phan payload `data`.

### 9.1 Mobile IAP config

`GET /api/mobile-iap/config?platform=IOS|ANDROID`

- Guard: JWT + STUDENT.
- Validate platform.
- Khong tra secret/public SDK key.

```json
{
  "enabled": true,
  "platform": "IOS",
  "revenuecatAppUserId": "6a26b5e0-3fe2-4bad-9315-2d5162219faa"
}
```

`enabled` la system-level availability, khong phai entitlement.

### 9.2 Course response

`GET /student/courses/:courseId?platform=IOS|ANDROID`

Them:

```json
{
  "isPaid": true,
  "accessLevel": "FREE",
  "purchase": {
    "owned": false,
    "state": "AVAILABLE",
    "mobileIap": {
      "enabled": true,
      "productId": "edtech.course.123.v1",
      "entitlementId": "course_123"
    }
  }
}
```

`state`:

- `FREE_COURSE`: `is_paid=false`.
- `OWNED`: access `FULL`.
- `AVAILABLE`: global on + course on + active platform product.
- `IAP_DISABLED`: global/course switch off.
- `PRODUCT_NOT_CONFIGURED`: khong co mapping active.
- `UNAVAILABLE`: course khong public/approved hoac policy khac.

Khong tra product ID cua platform khac neu khong can.

### 9.3 Sync purchase/restore

`POST /api/mobile-iap/sync`

- Guard: JWT + STUDENT.
- Rate limit theo user/IP.
- Body purchase:

```json
{
  "reason": "PURCHASE",
  "courseId": "123",
  "productId": "edtech.course.123.v1"
}
```

- Body restore: `{ "reason": "RESTORE" }`.

Xu ly:

1. Lay `revenuecat_app_user_id` theo JWT user, khong tu body.
2. Goi RevenueCat server API de lay CustomerInfo/purchases moi nhat.
3. Loc dung store app/environment cho phep.
4. Map moi active non-subscription product qua `course_store_products`.
5. Upsert `iap_purchases` va registration trong transaction database.
6. Goi `MasteryService.initializeCourseMastery(userId, courseId)` sau khi commit/grant.
7. Return access thuc te tu `CourseAccessService`.

Response mot course:

```json
{
  "status": "ACTIVE",
  "courseId": "123",
  "accessLevel": "FULL",
  "paymentMethod": "APP_STORE"
}
```

Restore co the tra danh sach `activatedCourseIds` va `unchangedCourseIds`.

Khong cap quyen neu product khong map, sai app ID, sai user, environment khong cho phep hoac entitlement khong trung.

### 9.4 IAP status

`GET /api/mobile-iap/status/:courseId`

- Guard: JWT + STUDENT.
- Khong goi RevenueCat moi lan; doc DB access projection.

```json
{
  "courseId": "123",
  "accessLevel": "FULL",
  "owned": true,
  "source": "APP_STORE"
}
```

### 9.5 Free enrollment

`POST /student/courses/:courseId/enroll-free`

- Guard: JWT + STUDENT.
- Course phai public, approved va `is_paid=false`.
- Idempotent upsert registration PAID/FREE, initialize mastery.
- Khong tao `payments` hay `iap_purchases`.

### 9.6 RevenueCat webhook

`POST /api/webhooks/revenuecat`

- Khong dung JWT.
- Verify Authorization token va HMAC signature tren raw body.
- Validate timestamp tolerance 5 phut.
- Validate `api_version`, `event.app_id`, `environment` va required fields.
- Ghi event idempotency truoc khi xu ly.
- Return 200 cho duplicate/ignored event hop le.
- Return non-2xx khi authentication/signature/payload invalid hoac loi tam thoi can RevenueCat retry.

### 9.7 API quan tri product mapping

Toi thieu can co API ADMIN (hoac mot cong cu noi bo co audit tuong duong):

- `GET /admin/courses/:courseId/store-products`
- `POST /admin/courses/:courseId/store-products`
- `PATCH /admin/courses/:courseId/store-products/:id`
- `PATCH /admin/courses/:courseId/mobile-iap`

Quy tac:

- Chi ADMIN duoc sua product ID, entitlement ID va active state; teacher chi duoc de xuat `isPaid`/gia web theo workflow duyet hien tai.
- Khong cho sua `product_id` cua row da co purchase; tao version row moi va deactivate row cu.
- Truoc khi active, backend validate format/unique; co the goi RevenueCat API de xac nhan product va entitlement ton tai.
- Moi thay doi ghi audit: admin ID, before/after, timestamp.
- V1 khong tu dong tao product tren App Store Connect/Play Console; operator tao va approve tren store truoc, sau do map vao he thong.

## 10. Webhook processing

### 10.1 `NON_RENEWING_PURCHASE`

Bat buoc co/toi thieu:

- `id`, `type`, `app_user_id`, `aliases`, `original_app_user_id`
- `product_id`, `entitlement_ids`
- `transaction_id`, `original_transaction_id`
- `store`, `environment`, `purchased_at_ms`
- `price_in_purchased_currency`, `currency` neu co

Xu ly:

1. Tim user bang `app_user_id`; neu can chi tra aliases/original ID da biet. Khong map mot RevenueCat ID sang nhieu user.
2. Tim active product mapping theo `store + product_id`.
3. Validate entitlement co `course_<courseId>`/mapping entitlement.
4. Upsert purchase ACTIVE theo unique transaction.
5. Upsert registration PAID voi source store.
6. Initialize mastery.
7. Mark event PROCESSED.

### 10.2 `CANCELLATION` cho non-renewing purchase

RevenueCat dung event nay khi non-renewing purchase bi cancel/refund.

1. Tim purchase theo store/environment/transaction hoac original transaction.
2. Set `iap_purchases.status = REFUNDED`, `revoked_at`.
3. Neu registration dang dua tren purchase nay va khong co nguon active khac, set `payment_status = REFD`, `revoked_at`.
4. Khong xoa learning progress, mastery hay history; chi chan noi dung can entitlement.
5. Neu user van co quyen tu VNPay/admin/free policy, giu `FULL`.

### 10.3 `REFUND_REVERSED`

- Re-query RevenueCat customer state.
- Neu entitlement/purchase active lai, set purchase ACTIVE va registration PAID.
- Khong chi dao nguoc dua tren mot field payload ma khong reconcile state.

### 10.4 `TRANSFER`

Voi restore policy da chon, event nay khong phai flow binh thuong. Neu nhan:

- Khong tu y grant/revoke chi tu transfer payload vi payload khong liet ke day du product.
- Reconcile RevenueCat state cho cac App User ID lien quan.
- Ghi audit/canh bao van hanh.

### 10.5 Event khac

- `TEST`: validate va mark PROCESSED, khong cap quyen production.
- Subscription events: mark IGNORED trong v1 vi san pham course khong phai subscription.
- Unknown event: mark IGNORED va return 200 de future-proof, neu payload da authenticate hop le.

## 11. Idempotency va transaction

- Webhook event unique bang `event.id`.
- Purchase unique bang `(store, environment, transaction_id)`.
- Registration unique bang `(user_id, course_id)`.
- Moi grant/revoke chay trong database transaction.
- Hai request webhook/sync dong thoi phai cho cung ket qua.
- `initializeCourseMastery` chay idempotent; loi mastery khong duoc lam mat giao dich da xac minh, nhung phai log/retry job.
- Khong tra thanh cong truoc khi access projection da commit.

## 12. Thay doi service/controller

Du kien them:

```text
src/controllers/mobile-iap.controller.ts
src/controllers/revenuecat-webhook.controller.ts
src/services/revenuecat.service.ts
src/services/iap-purchase.service.ts
src/services/course-access.service.ts
src/schema/entities/course-store-product.entity.ts
src/schema/entities/iap-purchase.entity.ts
src/schema/entities/revenuecat-webhook-event.entity.ts
src/schema/dtos/mobile-iap.dto.ts
src/schema/migrations/<timestamp>-add-mobile-iap.ts
```

Refactor bat buoc:

- `PaymentService.createOrUpdateCourseRegistration` tach thanh service grant access dung chung hoac goi qua `CourseAccessService`.
- `StudentCourseController`, `CourseService.getStudentSyllabus`, section/content endpoints va purchased list dung resolver chung.
- `MasteryService` cho phep khoi tao truc tiep bang `userId + courseId`; khong bat IAP phai gia lap VNPay `txnRef`.
- `PaymentMethod`/response history ho tro `APP_STORE`, `PLAY_STORE`, `FREE` o noi can hien thi, nhung refund controller VNPay chi xu ly payment VNPay.

## 13. VNPay compatibility

- Giu cac endpoint `/api/create-qr`, `/api/check-payment-vnpay`, `/api/vnpay-ipn`, history va refund cho web.
- FE mobile khong con route toi `/api/create-qr` va khong hien bat ky CTA VNPay nao. Backend khong coi header platform la bien phap bao mat vi header co the bi gia mao.
- VNPay thanh cong van cap registration PAID va initialize mastery qua service dung chung.
- Khong attach RevenueCat product/entitlement vao giao dich VNPay.
- Web purchase cung user phai lap tuc tra `FULL` tren mobile.
- Refund VNPay khong duoc revoke access neu user co mot entitlement active hop le tu nguon khac.

Truoc khi release IAP, can sua rieng callback VNPay hien tai de dam bao chi co mot callback canonical vua update `payments/course_registrations` vua initialize mastery; `VNPAY_REDIRECT` khong duoc bo qua `returnUrl` duoc controller truyen. Day la loi ton tai, khong phai ly do thay doi scope IAP.

## 14. Payment/history/admin

- `iap_purchases` la audit ledger cho IAP; `payments` tiep tuc ledger VNPay.
- API lich su co the hop nhat hai nguon o service/query layer, khong union bang cach chen fake VNPay fields.
- Entry IAP hien store, product, gia/currency store, purchasedAt va status.
- Refund button hien tai chi duoc hien cho VNPay. IAP hien huong dan lien he App Store/Google Play, khong goi `/api/refund/create`.
- Admin filter payment source can them `APP_STORE`, `PLAY_STORE`.
- Doanh thu store la gross/estimated tu RevenueCat; khong cong chung voi VND neu chua quy doi va dinh nghia ro report currency.

## 15. Bao mat va van hanh

- Verify Authorization va HMAC cua moi webhook; compare constant-time.
- HMAC tinh tren raw request body truoc JSON parse.
- Khong whitelist webhook chi bang IP.
- Rate limit endpoint sync va cache RevenueCat API hop ly.
- Khong log secret/receipt/full webhook PII.
- Co correlation ID noi client sync, RevenueCat event va DB transaction.
- Metric/canh bao toi thieu:
  - webhook invalid signature
  - webhook failed/processing latency
  - product mapping missing
  - App User ID unknown/conflict
  - purchase verified nhung grant failed
  - RevenueCat API error/rate limit
  - sandbox event vao production

## 16. Kiem thu bat buoc

### 16.1 Unit test

- `resolveAccess` cho anonymous/free/paid/owned/refunded.
- Product mapping theo platform.
- Webhook auth/HMAC/timestamp.
- Duplicate event/transaction.
- Unknown product/entitlement/user/app/environment.
- Purchase grant va refund revoke.
- Refund khong revoke khi con nguon quyen khac.
- Global/per-course switch khong cap quyen.
- Free enrollment idempotent.

### 16.2 Integration test

- Migration/backfill user UUID.
- `NON_RENEWING_PURCHASE` tao IAP purchase + registration + mastery.
- Sync va webhook den dong thoi.
- Webhook retry sau loi tam thoi.
- Restore nhieu course.
- App Store sandbox va Play internal test.
- Refund/revoke va refund reversed.
- VNPay regression: create, success, purchased list, learning, refund.
- User mua VNPay tren web roi mobile khong duoc moi mua IAP lai.
- Course free tra full access nhung anonymous van chi preview.

## 17. Rollout

1. Deploy migration voi `mobile_iap_enabled=false`, `MOBILE_IAP_ENABLED=N`.
2. Deploy backend service/API/webhook va test TEST/SANDBOX.
3. Tao product/entitlement cho mot course pilot tren hai store.
4. Verify mapping, webhook, restore va refund sandbox.
5. Release app mobile co IAP nhung server switch van off neu can review staged rollout.
6. Bat course pilot, sau do bat global IAP.
7. Theo doi metric va doi chieu RevenueCat-dashboard-DB.
8. Mo rong product mapping theo batch course.
9. Sau khi app version cu het support, deprecated/xoa logic `IS_PAYMENT` va VNPay mobile WebView.

Rollback:

- Set `MOBILE_IAP_ENABLED=N` de dung giao dich moi.
- Khong xoa/revoke registration da mua.
- Webhook van tiep tuc xu ly de khong mat refund/revoke event.
- VNPay web khong bi anh huong.

## 18. Tieu chi nghiem thu BE

- Backend cap `FULL` cho course mien phi (user dang nhap) hoac co entitlement active.
- Giao dich IAP chi cap quyen sau verify server-side.
- Duplicate webhook/sync khong tao duplicate data.
- Refund/revoke cap nhat quyen dung va giu learning history.
- Product, user, app ID va environment deu duoc validate.
- Web purchase VNPay duoc nhan dien tren mobile.
- Tat checkout khong mo khoa course.
- Moi endpoint noi dung dung chung access resolver.
- Secret khong lo ra response/log/source control.
- VNPay web va refund VNPay pass regression test.

## 19. Ngoai pham vi

- Subscription.
- RevenueCat Billing/Stripe cho web.
- Consumable credit/coin.
- Family Sharing giua cac tai khoan EduTech.
- Tu dong chuyen purchase giua hai tai khoan EduTech.
- Tu dong quy doi doanh thu nhieu currency.

## 20. Tai lieu tham chieu

- RevenueCat webhooks/security/idempotency: https://www.revenuecat.com/docs/integrations/webhooks
- RevenueCat event fields: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
- RevenueCat identifying customers: https://www.revenuecat.com/docs/customers/identifying-customers
- RevenueCat restore behavior: https://www.revenuecat.com/docs/projects/restore-behavior
- RevenueCat non-subscription purchases: https://www.revenuecat.com/docs/platform-resources/non-subscriptions
- RevenueCat refunds: https://www.revenuecat.com/docs/subscription-guidance/refunds
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738
