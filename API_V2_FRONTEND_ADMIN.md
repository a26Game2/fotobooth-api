# API V2 contract cho Frontend và Admin

Base URL local: `http://localhost:3000`

## Quy ước

- `role`: `MAIN | ADDON`.
- `mediaType`: `IMAGE | VIDEO` với MAIN; ADDON dùng `null`.
- Giá tiền là số nguyên VND.
- Giá `null` nghĩa là chưa nhập. Preview vẫn trả 200 nhưng có `pricingPending: true`, `estimatedTotal: null` và `missingPrices`.
- Số lượng addon phải từ 50 và là bội số của 50.
- VAT hiện là 8%, tính trên toàn bộ subtotal.
- `hotLevel`: `1` hot nhất, `2` trung bình, `3` bình thường. Danh sách service tự sort tăng dần theo field này rồi theo tên.
- Nếu `ServiceCityPricing.basePriceOverride` có giá trị, backend dùng nó thay cho giá package đã chọn; `travelFeeOverride` thay cho phí di chuyển mặc định của city.

## Frontend public

### 1. Danh sách service chính

`GET /api/public/services`

Filter theo loại media:

```text
GET /api/public/services?type=image
GET /api/public/services?type=video
```

```json
{
  "data": [
    {
      "id": "service_id",
      "name": "Minion Photobooth",
      "slug": "minion-photobooth",
      "description": "Gói Mirror Booth trọn gói",
      "coverImagePath": "https://...",
      "startingPrice": 6000000,
      "role": "MAIN",
      "mediaType": "IMAGE",
      "packageName": "Gói Mirror Booth trọn gói",
      "extraHourPrice": 1200000,
      "hotLevel": 1,
      "note": "Màn hình 45 inch. Giá chưa gồm VAT 8%.",
      "mainPackages": [
        {
          "id": "package_id",
          "serviceId": "service_id",
          "code": "ONE_HOUR",
          "name": "1 giờ",
          "durationHours": 1,
          "isFullDay": false,
          "price": 6000000,
          "includedMediaCount": 150,
          "sortOrder": 0,
          "isActive": true
        }
      ]
    }
  ]
}
```

### 2. Chi tiết service và addon được phép

`GET /api/public/services/:slug`

Response gồm toàn bộ field phía trên và thêm:

```json
{
  "addons": [
    {
      "id": "addon_service_id",
      "name": "Ảnh nam châm",
      "slug": "anh-nam-cham",
      "role": "ADDON",
      "mediaType": null,
      "isActive": true,
      "sortOrder": 0,
      "addonPricing": {
        "defaultPrice": null,
        "includedQuantity": 100,
        "incrementQuantity": 50,
        "incrementPrice": null,
        "unitLabel": "sản phẩm"
      }
    }
  ]
}
```

Chỉ show bước chọn addon sau khi khách đã chọn MAIN service. Render đúng mảng `addons` của service detail, không lấy toàn bộ ADDON từ admin API.

### 3. Preview giá

`POST /api/public/booking-requests/preview`

```bash
curl -X POST "http://localhost:3000/api/public/booking-requests/preview" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceSlug": "minion-photobooth",
    "mainPackageId": "PACKAGE_ID_FROM_SERVICE_DETAIL",
    "citySlug": "da-nang",
    "extraHours": 1,
    "addons": [
      { "serviceId": "ADDON_SERVICE_ID", "quantity": 150 }
    ]
  }'
```

Response:

```json
{
  "service": { "id": "service_id", "name": "Minion Photobooth", "slug": "minion-photobooth" },
  "mainPackage": {
    "id": "package_id",
    "code": "TWO_HOURS",
    "name": "2 giờ",
    "durationHours": 2,
    "isFullDay": false,
    "price": 6500000,
    "includedMediaCount": 250
  },
  "city": { "id": "city_id", "name": "Đà Nẵng", "slug": "da-nang", "note": "..." },
  "addons": [
    {
      "serviceId": "addon_service_id",
      "name": "Ảnh nam châm",
      "quantity": 150,
      "unitLabel": "sản phẩm",
      "defaultPrice": 1000000,
      "includedQuantity": 100,
      "incrementQuantity": 50,
      "incrementPrice": 300000,
      "extraBlocks": 1,
      "totalPrice": 1300000
    }
  ],
  "extraHours": 1,
  "basePrice": 6500000,
  "extraHourPrice": 1200000,
  "extraHourAmount": 1200000,
  "travelFee": 0,
  "subtotal": 9000000,
  "vatRate": 8,
  "vatAmount": 720000,
  "estimatedTotal": 9720000,
  "pricingPending": false,
  "missingPrices": [],
  "currency": "VND"
}
```

Giá addon: `defaultPrice + ceil(max(0, quantity - includedQuantity) / incrementQuantity) * incrementPrice`.

### 4. Tạo booking

`POST /api/public/booking-requests`

Body giữ nguyên payload preview và thêm thông tin khách:

```json
{
  "serviceSlug": "minion-photobooth",
  "mainPackageId": "PACKAGE_ID",
  "citySlug": "da-nang",
  "extraHours": 1,
  "addons": [{ "serviceId": "ADDON_SERVICE_ID", "quantity": 150 }],
  "eventDate": "2026-11-10",
  "startTime": "18:30",
  "location": "Hải Châu, Đà Nẵng",
  "eventType": "Khai trương",
  "guestCount": 100,
  "customerName": "Nguyễn Văn A",
  "phone": "0900000000",
  "companyName": "T-RED",
  "customerNote": "Gọi trước khi đến"
}
```

Nếu gửi multipart, field `addons` là JSON string và file dùng field `files`.

## Admin

Đăng nhập qua `POST /api/auth/login`, sau đó gửi:

```http
Authorization: Bearer ACCESS_TOKEN
```

Không gửi JWT vào `x-api-key`. Header `x-api-key` chỉ dùng cho `ADMIN_API_KEY` tĩnh của backend.

### Catalog response

`GET /api/admin/services` trả cả MAIN và ADDON:

```text
GET /api/admin/services?role=main
GET /api/admin/services?role=addon
GET /api/admin/services?role=main&type=image
GET /api/admin/services?role=main&type=video
```

- MAIN: `mainPackages`, `availableAddons`, `cityPricing`.
- ADDON: `addonPricing`, `availableFor`.
- `availableAddons[].addonService` là chi tiết addon đã gắn vào MAIN.
- `availableFor[].mainService` là danh sách MAIN service đang dùng ADDON đó.

### Tạo service

`POST /api/admin/services`

MAIN:

```json
{
  "name": "Tên service",
  "slug": "ten-service",
  "role": "MAIN",
  "mediaType": "IMAGE",
  "packageName": "Tên gói",
  "extraHourPrice": 1000000,
  "hotLevel": 1,
  "note": null,
  "isActive": true
}
```

ADDON:

```json
{
  "name": "Tên addon",
  "slug": "ten-addon",
  "role": "ADDON",
  "mediaType": null,
  "hotLevel": 3,
  "isActive": true
}
```

### Quản lý gói MAIN

- `POST /api/admin/service-packages`
- `PATCH /api/admin/service-packages/:id`
- `DELETE /api/admin/service-packages/:id`

```json
{
  "serviceId": "MAIN_SERVICE_ID",
  "code": "TWO_HOURS",
  "name": "2 giờ",
  "durationHours": 2,
  "isFullDay": false,
  "price": 6500000,
  "includedMediaCount": 250,
  "sortOrder": 1,
  "isActive": true
}
```

`price` và `includedMediaCount` chấp nhận `null`. Backend tự cập nhật `startingPrice` bằng giá thấp nhất của các package đang active.

### Cập nhật giá ADDON

`PUT /api/admin/services/:addonServiceId/addon-pricing`

```bash
curl -X PUT "http://localhost:3000/api/admin/services/ADDON_SERVICE_ID/addon-pricing" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "defaultPrice": 1000000,
    "includedQuantity": 100,
    "incrementQuantity": 50,
    "incrementPrice": 300000,
    "unitLabel": "sản phẩm"
  }'
```

### Chọn addon được show theo MAIN service

`PUT /api/admin/services/:mainServiceId/addons`

Payload thay toàn bộ danh sách và giữ thứ tự mảng:

```json
{
  "addonServiceIds": ["ADDON_ID_1", "ADDON_ID_2", "ADDON_ID_3"]
}
```

### Booking response admin

`GET /api/admin/booking-requests/:id` thêm:

- `servicePackage`: package hiện tại nếu còn tồn tại.
- `addons`: snapshot từng addon gồm `itemName`, `quantity`, `defaultPrice`, `extraBlocks`, `incrementPrice`, `totalPrice`.
- `configurationSnapshot`: snapshot đầy đủ package/addon/thuế tại lúc khách gửi, luôn dùng snapshot này để đọc booking lịch sử.

## Cache

Mọi thao tác sửa service, package, addon pricing, liên kết addon, city pricing hoặc cover đều xóa cache catalog/pricing liên quan. Public response có header `X-Cache: HIT|MISS` ở các endpoint catalog.

## Audit log

Mọi request `POST`, `PUT`, `PATCH`, `DELETE` sau khi xác thực trong `/api/admin` được queue vào Redis. Cron mặc định `* * * * *` flush tối đa 100 event/lần sang bảng Supabase `AuditLog`.

```text
GET /api/admin/audit-logs?page=1&limit=50
GET /api/admin/audit-logs?method=PATCH&entityType=services
GET /api/admin/audit-logs?statusCode=400
GET /api/admin/audit-logs?from=2026-10-14T00:00:00.000Z&to=2026-10-15T00:00:00.000Z
```

Endpoint chỉ cho role `ADMIN`. Password, token, API key, authorization và cookie trong request body được lưu dưới dạng `[REDACTED]`.
