# Cau hinh khoa hoc hien thi va thanh toan IAP trong database

Tai lieu nay chi mo ta cach cap nhat du lieu cho mot khoa hoc da ton tai trong
database.

## 1. Cac truong quyet dinh khoa hoc duoc hien thi

Bang `courses`:

| Truong | Gia tri | Y nghia |
| --- | --- | --- |
| `visibility` | `PUBLIC` | Cho phep truy cap cong khai |
| `status` | `APPROVED` | Khoa hoc da duoc duyet |
| `is_preview` | `N` | Khong dung co preview de bo qua quy trinh duyet |

Khoa hoc hien thi khi:

```text
visibility = 'PUBLIC' AND status = 'APPROVED'
```

hoac khi `is_preview = 'Y'`.

SQL hien thi mot khoa hoc:

```sql
UPDATE courses
SET visibility = 'PUBLIC',
    status = 'APPROVED',
    is_preview = 'N',
    updated_at = NOW()
WHERE course_id = 28; -- Thay 28 bang ID khoa hoc
```

SQL an mot khoa hoc:

```sql
UPDATE courses
SET visibility = 'PRIVATE',
    is_preview = 'N',
    updated_at = NOW()
WHERE course_id = 28;
```

Neu chi doi `visibility = 'PRIVATE'` nhung van de `is_preview = 'Y'`, khoa hoc
van co the xuat hien.

## 2. Cac truong quyet dinh khoa hoc duoc thanh toan IAP

Bang `courses`:

| Truong | Gia tri | Y nghia |
| --- | --- | --- |
| `is_paid` | `true` | Day la khoa hoc tra phi |
| `price` | Gia catalog | Gia tham khao tren catalog/VNPay |
| `currency` | `VND` | Don vi gia catalog |
| `mobile_iap_enabled` | `true` | Cho phep ban khoa hoc tren mobile |

Bang `system_parameters`:

| `param_key` | `param_value` | Y nghia |
| --- | --- | --- |
| `MOBILE_IAP_ENABLED` | `Y` | Bat IAP cho toan bo mobile |
| `WEB_VNPAY_ENABLED` | `Y` | Giu VNPay hoat dong tren web |

Bang `course_store_products` phai co mot mapping `is_active = true` cho tung
platform muon ban.

Android:

```text
platform = ANDROID
store = PLAY_STORE
product_type = NON_CONSUMABLE
```

iOS:

```text
platform = IOS
store = APP_STORE
product_type = NON_CONSUMABLE
```

`product_id` phai trung tuyet doi voi Product ID tren Google Play/App Store va
RevenueCat. `entitlement_id` phai trung voi entitlement da gan product trong
RevenueCat.

Gia IAP thuc te hien tren man thanh toan do Google Play/App Store tra ve. Truong
`courses.price` khong quyet dinh so tien Store thu.

## 3. SQL cau hinh day du cho mot khoa hoc Android

Vi du course `28`, gia catalog `10000 VND`, product
`edtech.course.28.lifetime`, entitlement `course_28_access`:

```sql
BEGIN;

UPDATE courses
SET visibility = 'PUBLIC',
    status = 'APPROVED',
    is_preview = 'N',
    is_paid = true,
    price = 10000,
    currency = 'VND',
    updated_at = NOW()
WHERE course_id = 28;

-- Tat mapping Android cu cua course truoc khi chuyen sang product moi.
UPDATE course_store_products
SET is_active = false,
    updated_at = NOW()
WHERE course_id = 28
  AND platform = 'ANDROID';

-- Chay INSERT nay khi product chua co trong database.
INSERT INTO course_store_products (
    course_id,
    platform,
    store,
    product_id,
    entitlement_id,
    product_type,
    is_active
)
VALUES (
    28,
    'ANDROID',
    'PLAY_STORE',
    'edtech.course.28.lifetime',
    'course_28_access',
    'NON_CONSUMABLE',
    true
);

UPDATE courses
SET mobile_iap_enabled = true,
    updated_at = NOW()
WHERE course_id = 28;

UPDATE system_parameters
SET param_value = 'Y',
    updated_at = NOW()
WHERE param_key = 'MOBILE_IAP_ENABLED';

UPDATE system_parameters
SET param_value = 'Y',
    updated_at = NOW()
WHERE param_key = 'WEB_VNPAY_ENABLED';

COMMIT;
```

Neu product da co trong `course_store_products`, khong chay `INSERT` lan nua.
Chi cap nhat mapping hien co:

```sql
UPDATE course_store_products
SET entitlement_id = 'course_28_access',
    is_active = true,
    updated_at = NOW()
WHERE course_id = 28
  AND platform = 'ANDROID'
  AND product_id = 'edtech.course.28.lifetime';
```

## 4. Them mapping iOS cho cung khoa hoc

```sql
BEGIN;

-- Moi course chi co mot mapping iOS active.
UPDATE course_store_products
SET is_active = false,
    updated_at = NOW()
WHERE course_id = 28
  AND platform = 'IOS';

INSERT INTO course_store_products (
    course_id,
    platform,
    store,
    product_id,
    entitlement_id,
    product_type,
    is_active
)
VALUES (
    28,
    'IOS',
    'APP_STORE',
    'edtech.course.28.lifetime',
    'course_28_access',
    'NON_CONSUMABLE',
    true
)
ON CONFLICT (platform, product_id)
DO UPDATE SET
    course_id = EXCLUDED.course_id,
    store = EXCLUDED.store,
    entitlement_id = EXCLUDED.entitlement_id,
    product_type = EXCLUDED.product_type,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

COMMIT;
```

Moi `(course_id, platform)` chi duoc co mot mapping active. Product da co giao
dich khong duoc doi `product_id`; khi can doi, tao mapping moi va de lai mapping
cu de doi soat.

## 5. Kiem tra cau hinh mot khoa hoc

```sql
SELECT
    c.course_id,
    c.title,
    c.visibility,
    c.status,
    c.is_preview,
    c.is_paid,
    c.price,
    c.currency,
    c.mobile_iap_enabled,
    p.platform,
    p.store,
    p.product_id,
    p.entitlement_id,
    p.product_type,
    p.is_active,
    (
        SELECT param_value
        FROM system_parameters
        WHERE param_key = 'MOBILE_IAP_ENABLED'
    ) AS global_mobile_iap_enabled
FROM courses c
LEFT JOIN course_store_products p ON p.course_id = c.course_id
WHERE c.course_id = 28
ORDER BY p.platform;
```

Khoa hoc san sang mua tren mot platform khi ket qua co:

```text
visibility = PUBLIC
status = APPROVED
is_paid = true
mobile_iap_enabled = true
global_mobile_iap_enabled = Y
mapping dung platform co is_active = true
```

## 6. Tat thanh toan

Tat IAP rieng mot khoa hoc:

```sql
UPDATE courses
SET mobile_iap_enabled = false,
    updated_at = NOW()
WHERE course_id = 28;
```

Tat IAP toan bo mobile:

```sql
UPDATE system_parameters
SET param_value = 'N',
    updated_at = NOW()
WHERE param_key = 'MOBILE_IAP_ENABLED';
```

Tat mot product mapping:

```sql
UPDATE course_store_products
SET is_active = false,
    updated_at = NOW()
WHERE course_id = 28
  AND platform = 'ANDROID'
  AND product_id = 'edtech.course.28.lifetime';
```

Khong xoa hoac sua tay `iap_purchases` va khong tu dat
`course_registrations.payment_status = 'PAID'`. Giao dich va quyen hoc IAP phai
duoc tao/cap nhat boi backend sau khi xac minh RevenueCat.
