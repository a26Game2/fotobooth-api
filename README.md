# T-RED Booking API

API V2 cho configurator và sales quản lý yêu cầu booking. Catalog tách `MAIN` service và `ADDON`; giá preview luôn được tính lại ở backend và mỗi booking lưu snapshot giá tại thời điểm gửi.

## Chạy local

```bash
docker compose up -d
npm install
npm run db:generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

API chạy tại `http://localhost:3000` và sử dụng PostgreSQL trên Supabase. `DATABASE_URL` dùng transaction pooler cho runtime; `DIRECT_URL` dùng session pooler cho migration. Điền password đã URL encode vào cả hai URL trong `.env`. Hãy thay `ADMIN_API_KEY` trước khi dùng môi trường thật.

Redis chạy qua Docker tại `localhost:16379`. API cache configuration, cities, public/admin services, service detail và dữ liệu pricing trong 5 phút. Khi Admin sửa service, option, thành phố, giá hoặc upload/remove cover, toàn bộ service cache liên quan sẽ tự xóa. Nếu Redis tạm lỗi, API tự fallback sang Supabase.

Admin mutations (`POST`, `PUT`, `PATCH`, `DELETE`) được đưa vào Redis audit queue và cron flush theo batch sang bảng Supabase `AuditLog` mỗi phút. Payload nhạy cảm như password, token, API key và authorization bị che. Nếu Redis không sẵn sàng, audit event fallback ghi thẳng vào Supabase. Cấu hình bằng `AUDIT_LOG_CRON` và `AUDIT_LOG_BATCH_SIZE`.

Swagger UI: `http://localhost:3000/docs` (OpenAPI JSON: `/openapi.json`). Trong Swagger, bấm **Authorize** và nhập `ADMIN_API_KEY` để gọi các endpoint Admin.

## Endpoints

Public:

- `GET /api/public/configuration`
- `GET /api/public/cities`
- `GET /api/public/services`
- `GET /api/public/services?type=image|video`
- `GET /api/public/services/:slug`
- `POST /api/public/booking-requests/preview`
- `POST /api/public/booking-requests` (JSON hoặc `multipart/form-data`, field file là `files`)

Admin chấp nhận một trong hai cách xác thực:

- `Authorization: Bearer <accessToken>` lấy từ `POST /api/auth/login`.
- Header `x-api-key: <ADMIN_API_KEY>`; API key luôn có quyền `ADMIN`.

Role `SALES` được quản lý booking và xem catalog. Role `ADMIN` có thêm quyền quản lý tài khoản, dịch vụ, option, thành phố, giá và configuration.

Auth:

- `POST /api/auth/login`
- `GET /api/auth/me`

Admin:

- `GET /api/admin/audit-logs` (chỉ `ADMIN`, hỗ trợ phân trang và filter)
- `GET /api/admin/booking-requests`
- `GET /api/admin/booking-requests/:id`
- `PATCH /api/admin/booking-requests/:id`
- `PATCH /api/admin/booking-requests/:id/status`
- `POST /api/admin/booking-requests/:id/notes`
- `GET|POST /api/admin/services`, `PATCH /api/admin/services/:id`
- `GET /api/admin/services?role=main|addon&type=image|video`
- `POST|DELETE /api/admin/services/:id/cover` (Supabase Storage)
- `POST /api/admin/service-packages`, `PATCH|DELETE /api/admin/service-packages/:id`
- `PUT /api/admin/services/:id/addon-pricing`
- `PUT /api/admin/services/:id/addons`
- `GET|POST /api/admin/cities`, `PATCH /api/admin/cities/:id`
- `GET|PUT /api/admin/configuration`
- `GET|PUT /api/admin/service-city-pricing`
- `GET|POST /api/admin/users`, `PATCH /api/admin/users/:id`

## Model catalog V2

- `Service.role=MAIN`: có `mediaType=IMAGE|VIDEO`, nhiều `mainPackages`, giá thêm giờ và số media đi kèm theo từng package.
- `Service.role=ADDON`: có `addonPricing`. `defaultPrice` áp dụng đến `includedQuantity`; vượt mức đó tính thêm từng block `incrementQuantity * incrementPrice`.
- `Service.hotLevel`: từ 1 đến 3; danh sách service sort `1 → 2 → 3`, sau đó theo tên. Mặc định là 3.
- Số lượng addon public phải là bội số 50. Giá `null` nghĩa là chưa nhập và quote trả `pricingPending=true`.
- Mỗi MAIN service chỉ hiển thị addon đã gắn qua `PUT /api/admin/services/:id/addons`.
- VAT lấy từ configuration (đang là 8%) và tính sau khi cộng package, thêm giờ, addon và phí thành phố.

### Preview ví dụ

Lấy `mainPackageId` và addon `serviceId` từ `GET /api/public/services/minion-photobooth`, sau đó:

```json
POST /api/public/booking-requests/preview
{
  "serviceSlug": "minion-photobooth",
  "mainPackageId": "PACKAGE_ID",
  "citySlug": "da-nang",
  "extraHours": 1,
  "addons": [
    { "serviceId": "ADDON_SERVICE_ID", "quantity": 150 }
  ]
}
```

### Migrate catalog bảng giá

```bash
npx prisma migrate deploy
npm run db:catalog-v2
```

Script idempotent: đổi 7 service cũ sang catalog mới nhưng giữ nguyên `coverImagePath`, tạo Iconic Photobooth, tạo 4 addon mẫu chưa có giá, xóa option catalog cũ và không xóa snapshot/item booking lịch sử.

Uploads chỉ nhận JPG, PNG, WebP, PDF (tối đa 10 MB/file), lưu vào `storage/uploads/booking-requests`. Khi triển khai Docker production, mount đường dẫn này ra persistent volume theo mô tả nghiệp vụ.

Ảnh cover dịch vụ được upload vào public Supabase Storage bucket `service-covers`. Backend cần `SUPABASE_SERVICE_ROLE_KEY`; tuyệt đối không đưa key này ra frontend. Endpoint nhận `multipart/form-data` với field `cover`, hỗ trợ JPG/PNG/WebP tối đa 10 MB.
