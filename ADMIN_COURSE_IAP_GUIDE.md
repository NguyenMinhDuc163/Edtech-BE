# Hướng dẫn quản lý khóa học và Mobile IAP cho Admin

Cập nhật: 2026-08-13

Tài liệu này là điểm bắt đầu cho agent hoặc lập trình viên cần thêm một khóa
học, bật/tắt nội dung khóa học hoặc đưa khóa học lên Google Play/App Store.
Phạm vi chỉ gồm khả năng hiển thị khóa học, nội dung con và Mobile IAP.

Không ghi secret, private key, service-account JSON, webhook secret hoặc token
đăng nhập vào tài liệu hay log chia sẻ.

## 1. Ba lớp trạng thái độc lập

Không gộp ba lớp dưới đây thành một khái niệm:

| Lớp | Nguồn dữ liệu chính | Ý nghĩa |
| --- | --- | --- |
| Xuất bản khóa học | `courses.status`, `courses.visibility` | Khóa học có được API public/mobile trả về hay không |
| Mở nội dung | `courses.content_enabled` và `is_active` của section/content/file | Học viên có được nhìn thấy cấu trúc và tài liệu bên trong hay không |
| Bán IAP | feature flag, `courses.mobile_iap_enabled`, `courses.is_paid`, `course_store_products` | Mobile có được bắt đầu giao dịch Store hay không |

Một khóa học xuất hiện trong catalog mobile khi:

```text
status = APPROVED
visibility = PUBLIC
```

Để học viên nhận được section, bài giảng và tài liệu bên trong, cần thêm:

```text
content_enabled = true
```

`is_preview = N` là bình thường. Cờ preview không cần bật để xuất bản khóa học.

Một khóa học có thể hiển thị nhưng chưa bán IAP. Ngược lại, không được cấu
hình IAP cho khóa học chưa bật nội dung.

## 2. Hai màn hình Admin

### Cấu hình khóa học

```text
Route: /admin/course-configuration
FE: Edtech-FE/src/pages/Admin/CourseConfiguration/
```

Nút lớn là thao tác xuất bản/tắt khóa học của Admin:

- Bật khóa học:
  - chuyển `status` thành `APPROVED`;
  - chuyển `visibility` thành `PUBLIC`;
  - đặt `content_enabled = true`;
  - bật tất cả section, bài giảng và file;
  - nếu khóa học chưa được duyệt, ghi Admin thực hiện vào
    `course_approvals`.
- Tắt khóa học:
  - chuyển `visibility` thành `PRIVATE`;
  - đặt `content_enabled = false`;
  - đặt `mobile_iap_enabled = false`;
  - giữ `status = APPROVED` để lần bật lại không phải tạo một vòng duyệt mới.

Khi khóa học đang bật, Admin có thể mở accordion và dùng checkbox để bật/tắt
từng section, bài giảng và file. Bật nút lớn lần nữa sẽ bật lại toàn bộ nội dung
con theo yêu cầu nghiệp vụ hiện tại.

Đây là quyền xuất bản trực tiếp của role `ADMIN`; nó là một administrative
override so với luồng giáo viên gửi khóa học `PENDING` rồi duyệt ở màn hình duyệt
khóa học.

### Sản phẩm IAP

```text
Route: /admin/iap-products
FE: Edtech-FE/src/pages/Admin/IapProducts/
```

Chỉ khóa học có `content_enabled = true` xuất hiện tại đây. Màn hình cung cấp:

- công tắc IAP toàn hệ thống;
- tìm kiếm theo tên khóa học;
- wizard tạo mapping Android/iOS;
- công tắc active cho từng Store product;
- công tắc bán IAP của từng khóa học.

Không yêu cầu Admin nhập course ID. UI hiển thị tên khóa học và tự gửi ID đã
map ở phía sau.

## 3. Luồng thêm một khóa học mới

### Bước 1: Tạo nội dung khóa học

Dùng luồng tạo khóa học hiện có; không `INSERT` thủ công vào các bảng course.
Khóa học mới có thể bắt đầu ở trạng thái `DRAFT` và `PRIVATE`.

Thêm section, bài giảng và file bằng chức năng quản lý nội dung hiện có. Các
trường khả dụng liên quan là:

```text
course_sections.is_active
course_sections.is_preview
course_contents.is_active
course_contents.is_preview
content_files.is_active
content_files.is_preview
```

### Bước 2: Bật khóa học cho mobile

Vào `Admin -> Cấu hình khóa học`, tìm theo tên và bật công tắc lớn. Request:

```http
PATCH /admin/courses/:courseId/content-enabled
Content-Type: application/json

{ "enabled": true }
```

Backend phải cập nhật `APPROVED + PUBLIC + content_enabled=true` trong cùng
transaction và bật toàn bộ nội dung con.

Sau thao tác, kiểm tra khóa học trong danh sách/tìm kiếm mobile. Màn Home dùng
API recommendation nên không đảm bảo mọi khóa học mới đều xuất hiện ngay trên
Home.

### Bước 3: Tạo identifier cho Store

Quy ước hiện tại:

```text
Product ID:     edtech.course.<courseId>.lifetime
Entitlement ID: course_<courseId>_access
Product type:   NON_CONSUMABLE
```

Ví dụ course 40:

```text
edtech.course.40.lifetime
course_40_access
```

Product ID và Entitlement ID không phải secret nhưng phải trùng tuyệt đối giữa
Google Play/App Store, RevenueCat và backend. Không đổi Product ID sau khi đã có
giao dịch.

### Bước 4: Tạo sản phẩm bên ngoài hệ thống

Cho từng platform cần bán:

1. Tạo one-time/non-consumable product trên Google Play Console hoặc App Store
   Connect.
2. Cấu hình giá, quốc gia/vùng và trạng thái phát hành/test phù hợp.
3. Import product vào đúng app trong RevenueCat.
4. Gắn product vào đúng Entitlement ID.
5. Hoàn tất Store notification/webhook theo
   `Edu-Tech/docs/product/revenuecat-store-setup.md`.

Admin UI không thể tự tạo product thật trên Google Play/App Store. Wizard chỉ
tạo mapping trong database của Edtech.

### Bước 5: Tạo mapping trong Admin

Vào `Admin -> Sản phẩm IAP`, chọn khóa học theo tên và nhập Product ID,
Entitlement ID cho Android và/hoặc iOS.

Mapping chuẩn:

```text
Android: platform=ANDROID, store=PLAY_STORE
iOS:     platform=IOS,     store=APP_STORE
type:    NON_CONSUMABLE
```

Mỗi `(course_id, platform)` chỉ có một mapping active. Có thể giữ mapping cũ để
đối soát nhưng không bật đồng thời hai mapping trên cùng platform.

### Bước 6: Mở bán

Theo thứ tự:

1. Bật Store product sau khi xác nhận product thật đã sẵn sàng trên Store và
   RevenueCat.
2. Bật `Bán qua mobile IAP` cho khóa học; backend đồng thời đặt
   `is_paid = true` khi bật.
3. Bật `IAP toàn hệ thống` (`MOBILE_IAP_ENABLED = Y`).
4. Test bằng Internal testing trên Android hoặc TestFlight/Sandbox trên iOS.

Giá Store do Google Play/App Store trả về. `courses.price` chỉ là giá catalog
tham khảo và giá dùng cho luồng web, không quyết định số tiền Store thu.

## 4. API Admin liên quan

Tất cả endpoint dưới đây yêu cầu JWT và role `ADMIN`:

```text
GET   /admin/courses
GET   /admin/courses/:courseId/content-access
PATCH /admin/courses/:courseId/content-enabled
PATCH /admin/courses/:courseId/sections/:sectionId/access
PATCH /admin/courses/:courseId/contents/:contentId/access
PATCH /admin/courses/:courseId/files/:fileId/access

GET   /admin/courses/:courseId/store-products
POST  /admin/courses/:courseId/store-products
PATCH /admin/courses/:courseId/store-products/:productId
PATCH /admin/courses/:courseId/mobile-iap

GET   /admin/system-parameters
POST  /admin/system-parameters/update
```

DTO IAP và access nằm tại:

```text
Edtech-BE/src/schema/dtos/mobile-iap.dto.ts
```

## 5. Bản đồ code

### Backend

```text
Edtech-BE/src/controllers/admin/course.controller.ts
Edtech-BE/src/services/course.service.ts
Edtech-BE/src/services/iap-purchase.service.ts
Edtech-BE/src/services/course-access.service.ts
Edtech-BE/src/schema/entities/course.entity.ts
Edtech-BE/src/schema/entities/course-section.entity.ts
Edtech-BE/src/schema/entities/course-content.entity.ts
Edtech-BE/src/schema/entities/content-file.entity.ts
Edtech-BE/src/schema/entities/course-store-product.entity.ts
Edtech-BE/src/schema/entities/course-approval.entity.ts
```

Migration liên quan:

```text
1786445000000-AddMobileIap.ts
1786600000000-SyncPostUpgradeFields.ts
1786700000000-AddCourseContentAvailability.ts
```

Không sửa migration đã chạy. Nếu thêm cột hoặc constraint, tạo migration mới.

### Admin frontend

```text
Edtech-FE/src/pages/Admin/CourseConfiguration/
Edtech-FE/src/pages/Admin/IapProducts/
Edtech-FE/src/services/Iap/iapAdminService.ts
Edtech-FE/src/types/Iap/iapAdmin.type.ts
Edtech-FE/src/routes/AdminRoutes.tsx
Edtech-FE/src/components/layout/Admin/AdminLayout.tsx
```

CSS của hai trang được namespace bằng `course-config-*` và `iap-admin-*`. Khi
thêm UI, tiếp tục dùng namespace riêng; không dùng selector chung như `.card`,
`.switch`, `.button` để tránh làm hỏng trang khác.

### Flutter

```text
Edu-Tech/lib/modules/course/repository/course_repo.dart
Edu-Tech/lib/modules/iap/
Edu-Tech/lib/core/constants/api_path.dart
Edu-Tech/lib/core/constants/api_path.g.dart
```

Mobile Home hiện lấy recommendation từ:

```text
GET /recommendations/hybrid/:userId
```

Chi tiết khóa học lấy từ:

```text
GET /student/courses/:courseId?platform=ANDROID|IOS
```

## 6. Truy vấn chẩn đoán

Thay `40` bằng course ID cần kiểm tra:

```sql
SELECT
    course_id,
    title,
    status,
    visibility,
    is_preview,
    content_enabled,
    is_paid,
    mobile_iap_enabled
FROM courses
WHERE course_id = 40;

SELECT
    platform,
    store,
    product_id,
    entitlement_id,
    product_type,
    is_active
FROM course_store_products
WHERE course_id = 40
ORDER BY platform;

SELECT param_key, param_value
FROM system_parameters
WHERE param_key IN ('MOBILE_IAP_ENABLED', 'WEB_VNPAY_ENABLED');
```

Không sửa trực tiếp `iap_purchases` và không tự đặt registration thành `PAID`.
Quyền học phải do backend cấp sau khi xác minh RevenueCat.

## 7. Chẩn đoán khóa học không xuất hiện trên mobile

Kiểm tra theo thứ tự:

1. Database có `APPROVED + PUBLIC + content_enabled=true` hay chưa.
2. Log khi bật có câu `UPDATE courses` chứa đủ `status`, `visibility` và
   `content_enabled` hay chỉ có `content_enabled`.
3. BE đang chạy có phải phiên bản code mới hay chưa; thay đổi service cần
   restart/deploy BE.
4. Admin và mobile có trỏ cùng BE/database hay không.
5. Bản Flutter đã generate `ApiPath.baseUrl` từ đúng environment hay chưa.
   Trên điện thoại thật, `localhost` là điện thoại, không phải máy chạy BE.
6. Kiểm tra danh sách/tìm kiếm trước; Home recommendation không phải danh sách
   đầy đủ.
7. Nếu khóa học hiển thị nhưng không mua được, kiểm tra feature flag, course
   IAP flag và mapping active đúng platform.

Các log Vite connected, React DevTools và Browserslist cũ không liên quan đến
việc database có cập nhật hay không.

## 8. Khi mở rộng chức năng

Nếu thêm một loại nội dung con mới, agent phải cập nhật đồng bộ:

1. entity và migration;
2. transaction bật toàn bộ trong
   `updateCourseContentEnabledAsAdmin`;
3. response `getContentAccessAsAdmin`;
4. endpoint/DTO cập nhật riêng;
5. type và service FE;
6. accordion/checkbox của trang Cấu hình khóa học;
7. query public/student để lọc trạng thái active;
8. tài liệu và truy vấn chẩn đoán.

Nếu thêm platform hoặc loại sản phẩm IAP, cập nhật enum/validation ở BE, type
và wizard FE, mapping RevenueCat/Store và Flutter platform handling. Backend
vẫn là nguồn sự thật duy nhất về quyền học; Flutter không tự cấp quyền chỉ dựa
trên callback mua thành công.

## 9. Deploy và validation

- Thay đổi dữ liệu qua Admin có hiệu lực ngay nếu Admin và mobile dùng cùng
  BE/database.
- Thay đổi controller/service/entity cần deploy hoặc restart BE.
- Thay đổi Admin UI cần deploy FE nếu dùng bản Admin trên server.
- Chỉ đổi dữ liệu khóa học không yêu cầu build lại mobile.
- Đổi `BASE_URL`, RevenueCat public SDK key hoặc code Flutter mới yêu cầu
  generate/build lại mobile.
- Migration chỉ chạy khi schema đích chưa có thay đổi tương ứng.

Agent phải đọc diff và trạng thái migration hiện tại trước khi sửa. Không tự ý
build, chạy server, chạy migration, cập nhật database, deploy, commit hoặc push
nếu user chưa cấp quyền rõ ràng.
