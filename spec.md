# SPEC Backend Mobile IAP - RevenueCat

## 1. Pham vi

- Backend NestJS la nguon su that duy nhat cho quyen truy cap khoa hoc.
- Mobile iOS/Android mua khoa hoc so qua RevenueCat va native store.
- Web tiep tuc thanh toan VNPay.
- Moi khoa hoc la mot san pham mua mot lan, khong phai subscription.
- Khong cap quyen tu ket qua do client tu khai bao.

## 2. Quy tac nghiep vu

1. `courses.is_paid = false`: user da dang nhap co quyen `FULL`.
2. `courses.is_paid = true`: chi co quyen `FULL` khi co registration `PAID` hop le.
3. Registration co the den tu `FREE`, `VNPAY`, `APP_STORE`, `PLAY_STORE` hoac `ADMIN`.
4. Quyen da mua tren VNPay phai dung duoc tren mobile va nguoc lai.
5. Tat IAP toan he thong/per-course chi tat checkout, khong mo khoa mien phi va khong thu hoi quyen cu.
6. Khi khoa hoc mien phi chuyen thanh tra phi, free registration cu duoc giu quyen.
7. Refund/revoke IAP chi khoa lai khi registration dang phu thuoc giao dich do va khong con IAP/VNPay hop le khac.
8. Callback VNPay den muon khong duoc ha `SUCCESS` thanh `FAILED`/`CANCELLED`.

## 3. Mo hinh du lieu

### 3.1 `users`

- `revenuecat_app_user_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()`.
- ID nay la opaque public identifier de SDK va backend RevenueCat cung nhan dien user.
- Khong dung email, username hoac bigint user ID lam RevenueCat App User ID.

### 3.2 `courses`

- `is_paid`: quyet dinh khoa hoc mien phi/tra phi.
- `mobile_iap_enabled`: cho phep ban khoa hoc tren mobile.
- Gia `courses.price/currency` chi dung cho web/VNPay.

### 3.3 `course_store_products`

- Mapping versioned giua course va store product.
- Field: `course_id`, `platform`, `store`, `product_id`, `entitlement_id`, `product_type`, `is_active`.
- Platform: `IOS`, `ANDROID`, `TEST_STORE`.
- Store: `APP_STORE`, `PLAY_STORE`, `TEST_STORE`.
- Product type hien tai chi co `NON_CONSUMABLE`.
- Unique `(platform, product_id)`.
- Moi `(course_id, platform)` chi co mot product active.
- Product da co giao dich khong duoc sua product ID; tao mapping version moi.

### 3.4 `iap_purchases`

- Ledger bat bien theo giao dich, tach khoi bang `payments` VNPay.
- Unique `(store, environment, transaction_id)`.
- Field audit chinh: user, course, mapping, RevenueCat user ID, product, entitlement, transaction/original transaction, environment, price/currency do store tra, purchased/revoked time, status.
- Status: `ACTIVE`, `REFUNDED`, `REVOKED`.
- Payload chi luu ban da sanitize, khong luu subscriber attributes/secret/receipt.

### 3.5 `revenuecat_webhook_events`

- `event_id` unique de idempotency.
- Status: `RECEIVED`, `PROCESSED`, `IGNORED`, `FAILED`.
- Event `FAILED` duoc phep claim va xu ly lai; event dang/da xu ly tra duplicate.

### 3.6 `course_registrations`

- Them `access_source`, `iap_purchase_id`, `revoked_at`.
- `payment_status = PAID` van la contract tuong thich voi cac module hoc tap hien tai.
- Moi cap `(user_id, course_id)` chi co mot registration.

## 4. Cau hinh

System parameters:

- `MOBILE_IAP_ENABLED=Y|N`, mac dinh migration la `N`.
- `WEB_VNPAY_ENABLED=Y|N`, mac dinh `Y`.

Environment backend:

```dotenv
REVENUECAT_SECRET_API_KEY=
REVENUECAT_WEBHOOK_AUTH_TOKEN=
REVENUECAT_WEBHOOK_HMAC_SECRET=
REVENUECAT_IOS_APP_ID=
REVENUECAT_ANDROID_APP_ID=
REVENUECAT_ALLOWED_ENVIRONMENTS=SANDBOX,PRODUCTION
REVENUECAT_API_BASE_URL=https://api.revenuecat.com/v1
```

- Secret API key chi nam o backend.
- App ID allowlist phai duoc khai bao tren production.
- Production nen gioi han `REVENUECAT_ALLOWED_ENVIRONMENTS=PRODUCTION` sau khi ket thuc sandbox.

## 5. API mobile

Tat ca API dung response envelope chung cua he thong.

### 5.1 `GET /api/mobile-iap/config?platform=IOS|ANDROID`

- JWT student bat buoc.
- Tra `enabled`, `platform`, `revenuecatAppUserId`.
- Khong tra secret key hoac webhook credential.

### 5.2 Course list/detail

Mobile gui query `platform`.

```json
{
  "isPaid": true,
  "mobileIapEnabled": true,
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

State: `FREE_COURSE`, `OWNED`, `AVAILABLE`, `IAP_DISABLED`, `PRODUCT_NOT_CONFIGURED`.

### 5.3 `POST /api/mobile-iap/sync`

Body purchase:

```json
{
  "reason": "PURCHASE",
  "courseId": "123",
  "productId": "edtech.course.123.v1"
}
```

Body restore: `{ "reason": "RESTORE" }`.

Backend phai:

1. Lay user tu JWT.
2. Lay RevenueCat user ID tu database.
3. Goi RevenueCat bang secret server key.
4. Xac minh non-subscription transaction, entitlement active, store va mapping active.
5. Tu mapping suy ra course; khong tin course/product do client gui.
6. Upsert ledger va grant registration trong transaction.
7. Tra `ACTIVE/FULL` chi sau khi database da cap quyen.

### 5.4 `GET /api/mobile-iap/status/:courseId`

- Tra `accessLevel`, `owned`, `source` tu central access resolver.
- Dung de poll khi RevenueCat/backend dang dong bo.

### 5.5 `POST /student/courses/:courseId/enroll-free`

- Chi chap nhan course approved, public va `is_paid=false`.
- Tao free registration idempotent va khoi tao mastery.

## 6. Webhook RevenueCat

Endpoint: `POST /api/webhooks/revenuecat`.

Bao ve request:

- Kiem tra authorization token.
- Kiem tra HMAC SHA-256 tren raw request body voi timestamp toi da 5 phut.
- Kiem tra `api_version`, event ID/type, app ID allowlist va environment allowlist.
- Raw body duoc capture truoc JSON parsing.

Xu ly:

- `NON_RENEWING_PURCHASE`: verify mapping/user/entitlement, upsert purchase, grant access.
  Neu payload retry cu khong co `entitlement_ids`, doi chieu subscriber snapshot
  theo entitlement + product + store va transaction ID. Neu Store va webhook
  dung hai transaction identifier khac nhau, cho phep doi chieu them thoi diem
  mua voi sai so toi da 5 phut. Khong cap quyen neu entitlement thieu, sai
  product, het han hoac subscriber khong co non-subscription purchase.
- `CANCELLATION`: danh dau refunded va revoke co dieu kien.
- `REFUND_REVERSED`: active lai purchase va grant lai access.
- `TRANSFER`: reconcile user dich neu ID hop le; khong tu y chuyen quyen giua hai EduTech account.
- `TEST`/event khong ho tro: luu `IGNORED`, tra HTTP 200.

Idempotency va concurrency:

- Unique event ID ngan double webhook.
- Unique store/environment/transaction ngan double ledger.
- PostgreSQL advisory transaction lock serialize cung transaction va cung user/course.
- Khoi tao mastery va registration phai idempotent.
- Webhook loi tra non-2xx de RevenueCat retry; record `FAILED` duoc xu ly lai.

## 7. Central course access

Moi controller tra syllabus, section, file URL hoac course detail phai goi `CourseAccessService`.

- Guest: `FREE`, chi preview.
- Authenticated + free course: `FULL`.
- Paid course + registration `PAID`: `FULL`.
- Con lai: `FREE`.

Khong controller nao duoc suy dien quyen tu `IS_PAYMENT`, mobile flag, product mapping hoac callback client.

## 8. VNPay web

- `POST /api/create-qr` van ton tai va bi chi phoi boi `WEB_VNPAY_ENABLED`.
- Backend doc gia course tu database; bo qua amount client gui.
- Return URL truyen vao request duoc uu tien dung.
- Ca return va IPN cap nhat cung `PaymentService`.
- Thanh toan `SUCCESS` la terminal truoc callback that bai den muon.
- Thanh cong cap registration source `VNPAY`, sau do khoi tao mastery.

## 9. Admin

- CRUD/version/toggle mapping store product theo course.
- Bat `mobileIapEnabled` chi khi course tra phi va co it nhat mot product active.
- Khong cho bat IAP cho course mien phi.
- Audit request admin qua he thong API log hien co.

## 10. Lich su thanh toan

- `GET /api/my-payments` hop nhat VNPay va IAP, co `source_type`.
- Invoice IAP dung ID prefix `iap_` va kiem tra ownership theo JWT.
- IAP price/currency lay tu event store; khong gan nhan VND neu RevenueCat khong cung cap.

## 11. Migration va rollout

1. Backup database.
2. Deploy schema/code voi `MOBILE_IAP_ENABLED=N`.
3. Tao non-consumable/one-time products tren hai store.
4. Tao entitlement va product mapping trong RevenueCat.
5. Them mapping inactive bang admin API.
6. Cau hinh secret/webhook/app allowlist.
7. Test sandbox, webhook retry, restore va refund.
8. Active mapping theo platform.
9. Bat `mobile_iap_enabled` theo course.
10. Bat `MOBILE_IAP_ENABLED=Y` sau cung.

Rollback khan cap: dat `MOBILE_IAP_ENABLED=N`; khong xoa ledger, registration hay product mapping.

## 12. Tieu chi nghiem thu

- Build TypeScript thanh cong va migration up/down hop le.
- Purchase, sync va webhook trung chi tao mot ledger/registration.
- Product/course mismatch khong cap quyen.
- User/alias conflict khong chuyen quyen.
- Refund chi khoa quyen phu thuoc IAP do.
- Web VNPay van thanh toan va mo khoa binh thuong.
- Mobile IAP off khong bien paid course thanh free.
- Free course va grandfathering dung quy tac.
- History/invoice chi hien giao dich thuoc user dang dang nhap.
