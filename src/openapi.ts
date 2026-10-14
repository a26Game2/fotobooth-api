const idParameter = { name: "id", in: "path", required: true, schema: { type: "string" } };

const document = {
  openapi: "3.0.3",
  info: {
    title: "T-RED Booking API",
    version: "2.0.0",
    description: "API service MAIN/ADDON. Giá booking được tính lại tại backend và VAT 8% tính trên tổng bill."
  },
  servers: [{ url: "http://localhost:3000", description: "Local" }],
  tags: [{ name: "Public" }, { name: "Auth" }, { name: "Admin" }],
  components: {
    securitySchemes: {
      AdminApiKey: { type: "apiKey", in: "header", name: "x-api-key" },
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
    },
    schemas: {
      AddonSelection: {
        type: "object", required: ["serviceId", "quantity"],
        properties: {
          serviceId: { type: "string" },
          quantity: { type: "integer", minimum: 50, multipleOf: 50, example: 150 }
        }
      },
      QuoteInput: {
        type: "object", required: ["serviceSlug", "mainPackageId", "citySlug"],
        properties: {
          serviceSlug: { type: "string", example: "minion-photobooth" },
          mainPackageId: { type: "string", description: "ID lấy từ mainPackages của service" },
          citySlug: { type: "string", example: "da-nang" },
          extraHours: { type: "integer", minimum: 0, maximum: 24, default: 0 },
          addons: { type: "array", default: [], items: { $ref: "#/components/schemas/AddonSelection" } }
        }
      },
      BookingInput: {
        allOf: [
          { $ref: "#/components/schemas/QuoteInput" },
          {
            type: "object",
            required: ["eventDate", "startTime", "location", "eventType", "guestCount", "customerName", "phone"],
            properties: {
              eventDate: { type: "string", format: "date", example: "2026-11-10" },
              startTime: { type: "string", example: "18:30" },
              location: { type: "string", example: "Hải Châu, Đà Nẵng" },
              eventType: { type: "string", example: "Khai trương" },
              guestCount: { type: "integer", example: 100 },
              customerName: { type: "string" }, phone: { type: "string" },
              companyName: { type: "string" }, customerNote: { type: "string" }
            }
          }
        ]
      },
      ServiceInput: {
        type: "object", required: ["name", "slug", "role"],
        properties: {
          name: { type: "string" }, slug: { type: "string" }, description: { type: "string", nullable: true },
          role: { type: "string", enum: ["MAIN", "ADDON"] },
          mediaType: { type: "string", enum: ["IMAGE", "VIDEO"], nullable: true, description: "Bắt buộc theo nghiệp vụ với MAIN; null với ADDON" },
          packageName: { type: "string", nullable: true }, extraHourPrice: { type: "integer", nullable: true },
          note: { type: "string", nullable: true },
          hotLevel: { type: "integer", minimum: 1, maximum: 3, default: 3, description: "1 = hot nhất, 3 = bình thường" },
          isActive: { type: "boolean" }
        }
      },
      MainPackageInput: {
        type: "object", required: ["serviceId", "code", "name"],
        properties: {
          serviceId: { type: "string" }, code: { type: "string", example: "TWO_HOURS" }, name: { type: "string", example: "2 giờ" },
          durationHours: { type: "integer", nullable: true }, isFullDay: { type: "boolean" },
          price: { type: "integer", nullable: true, description: "null = chưa nhập giá" },
          includedMediaCount: { type: "integer", nullable: true, description: "Số ảnh/video đi kèm, cho phép nhập tay" },
          sortOrder: { type: "integer" }, isActive: { type: "boolean" }
        }
      },
      AddonPricingInput: {
        type: "object", required: ["defaultPrice", "includedQuantity", "incrementQuantity", "incrementPrice", "unitLabel"],
        properties: {
          defaultPrice: { type: "integer", nullable: true, description: "Giá mặc định; null = chưa nhập" },
          includedQuantity: { type: "integer", multipleOf: 50, example: 100 },
          incrementQuantity: { type: "integer", multipleOf: 50, example: 50 },
          incrementPrice: { type: "integer", nullable: true, description: "Giá phát sinh mỗi block; null = chưa nhập" },
          unitLabel: { type: "string", example: "sản phẩm" }
        }
      },
      MainPackage: {
        allOf: [
          { $ref: "#/components/schemas/MainPackageInput" },
          { type: "object", required: ["id", "createdAt", "updatedAt"], properties: {
            id: { type: "string" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }
          } }
        ]
      },
      AddonPricing: {
        allOf: [
          { $ref: "#/components/schemas/AddonPricingInput" },
          { type: "object", required: ["id", "serviceId"], properties: { id: { type: "string" }, serviceId: { type: "string" } } }
        ]
      },
      Service: {
        type: "object",
        required: ["id", "name", "slug", "startingPrice", "role", "isActive"],
        properties: {
          id: { type: "string" }, name: { type: "string" }, slug: { type: "string" },
          description: { type: "string", nullable: true }, coverImagePath: { type: "string", nullable: true },
          startingPrice: { type: "integer" }, role: { type: "string", enum: ["MAIN", "ADDON"] },
          mediaType: { type: "string", enum: ["IMAGE", "VIDEO"], nullable: true },
          packageName: { type: "string", nullable: true }, extraHourPrice: { type: "integer", nullable: true },
          note: { type: "string", nullable: true }, hotLevel: { type: "integer", minimum: 1, maximum: 3 }, isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }
        }
      },
      AddonService: {
        allOf: [
          { $ref: "#/components/schemas/Service" },
          { type: "object", properties: { sortOrder: { type: "integer" }, addonPricing: { $ref: "#/components/schemas/AddonPricing" } } }
        ]
      },
      PublicMainService: {
        allOf: [
          { $ref: "#/components/schemas/Service" },
          { type: "object", properties: { mainPackages: { type: "array", items: { $ref: "#/components/schemas/MainPackage" } } } }
        ]
      },
      PublicMainServiceDetail: {
        allOf: [
          { $ref: "#/components/schemas/PublicMainService" },
          { type: "object", properties: { addons: { type: "array", items: { $ref: "#/components/schemas/AddonService" } } } }
        ]
      },
      QuoteResponse: {
        type: "object",
        properties: {
          service: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" } } },
          mainPackage: { $ref: "#/components/schemas/MainPackage" },
          city: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, note: { type: "string", nullable: true } } },
          addons: { type: "array", items: { type: "object", properties: {
            serviceId: { type: "string" }, name: { type: "string" }, quantity: { type: "integer" }, unitLabel: { type: "string" },
            defaultPrice: { type: "integer", nullable: true }, includedQuantity: { type: "integer" }, incrementQuantity: { type: "integer" },
            incrementPrice: { type: "integer", nullable: true }, extraBlocks: { type: "integer" }, totalPrice: { type: "integer", nullable: true }
          } } },
          extraHours: { type: "integer" }, basePrice: { type: "integer", nullable: true }, extraHourPrice: { type: "integer", nullable: true },
          extraHourAmount: { type: "integer", nullable: true }, travelFee: { type: "integer", nullable: true }, subtotal: { type: "integer", nullable: true },
          vatRate: { type: "number" }, vatAmount: { type: "integer", nullable: true }, estimatedTotal: { type: "integer", nullable: true },
          pricingPending: { type: "boolean" }, missingPrices: { type: "array", items: { type: "string" } }, currency: { type: "string" }
        },
        example: {
          service: { id: "service_id", name: "Minion Photobooth", slug: "minion-photobooth" },
          mainPackage: { id: "package_id", serviceId: "service_id", code: "TWO_HOURS", name: "2 giờ", durationHours: 2, isFullDay: false, price: 6500000, includedMediaCount: 250, sortOrder: 1, isActive: true },
          city: { id: "city_id", name: "Đà Nẵng", slug: "da-nang", note: "Miễn phí vận chuyển trong nội thành." },
          addons: [], extraHours: 1, basePrice: 6500000, extraHourPrice: 1200000, extraHourAmount: 1200000,
          travelFee: 0, subtotal: 7700000, vatRate: 8, vatAmount: 616000, estimatedTotal: 8316000,
          pricingPending: false, missingPrices: [], currency: "VND"
        }
      },
      BookingCreatedResponse: {
        type: "object",
        properties: {
          bookingCode: { type: "string", example: "BR-000001" }, status: { type: "string", example: "NEW" },
          estimatedTotal: { type: "integer", nullable: true }, pricingPending: { type: "boolean" }, message: { type: "string" }
        }
      },
      AuditLog: {
        type: "object",
        properties: {
          id: { type: "string" }, eventId: { type: "string", format: "uuid" }, actorUserId: { type: "string", nullable: true },
          actorEmail: { type: "string", nullable: true }, actorName: { type: "string" }, actorRole: { type: "string", enum: ["ADMIN", "SALES"] },
          authType: { type: "string", enum: ["jwt", "api-key"] }, action: { type: "string", example: "PATCH /api/admin/services/service_id" },
          method: { type: "string", enum: ["POST", "PUT", "PATCH", "DELETE"] }, path: { type: "string" }, statusCode: { type: "integer" },
          entityType: { type: "string", nullable: true }, entityId: { type: "string", nullable: true }, ipAddress: { type: "string", nullable: true },
          userAgent: { type: "string", nullable: true }, requestBody: { type: "object", nullable: true, additionalProperties: true },
          occurredAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" }
        }
      },
      Error: { type: "object", properties: { error: { type: "string" } } }
    }
  },
  paths: {
    "/health": { get: { summary: "Kiểm tra API và Redis", responses: { "200": { description: "Healthy" } } } },
    "/api/auth/login": { post: { tags: ["Auth"], summary: "Đăng nhập email/password", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password" } } } } } }, responses: { "200": { description: "JWT access token" }, "401": { description: "Sai thông tin" } } } },
    "/api/auth/me": { get: { tags: ["Auth"], summary: "Thông tin phiên đăng nhập", security: [{ BearerAuth: [] }, { AdminApiKey: [] }], responses: { "200": { description: "Identity" } } } },
    "/api/public/configuration": { get: { tags: ["Public"], summary: "Cấu hình chung", responses: { "200": { description: "Configuration" } } } },
    "/api/public/cities": { get: { tags: ["Public"], summary: "Thành phố đang hoạt động", responses: { "200": { description: "Cities" } } } },
    "/api/public/services": { get: { tags: ["Public"], summary: "Danh sách MAIN service, tự sort hotLevel 1 → 2 → 3 rồi theo tên", parameters: [{ name: "type", in: "query", required: false, description: "Không phân biệt chữ hoa/thường", schema: { type: "string", enum: ["IMAGE", "VIDEO"] } }], responses: { "200": { description: "Main services", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/PublicMainService" } } } } } } }, "400": { description: "type không hợp lệ", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } } } },
    "/api/public/services/{slug}": { get: { tags: ["Public"], summary: "Chi tiết MAIN service, mainPackages và addons tương thích", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Service detail", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicMainServiceDetail" } } } }, "404": { description: "Không tìm thấy", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } } } },
    "/api/public/booking-requests/preview": { post: { tags: ["Public"], summary: "Preview tổng tiền gồm package, addon, phí thành phố và VAT", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/QuoteInput" } } } }, responses: { "200": { description: "Quote; estimatedTotal=null khi thiếu giá", content: { "application/json": { schema: { $ref: "#/components/schemas/QuoteResponse" } } } }, "422": { description: "Package/addon/city không hợp lệ", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } } } },
    "/api/public/booking-requests": { post: { tags: ["Public"], summary: "Tạo booking và lưu snapshot giá", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/BookingInput" } }, "multipart/form-data": { schema: { allOf: [{ $ref: "#/components/schemas/BookingInput" }, { type: "object", properties: { addons: { type: "string", description: "JSON string khi multipart" }, files: { type: "array", items: { type: "string", format: "binary" } } } }] } } } }, responses: { "201": { description: "Booking created", content: { "application/json": { schema: { $ref: "#/components/schemas/BookingCreatedResponse" } } } } } } },
    "/api/admin/booking-requests": { get: { tags: ["Admin"], summary: "Danh sách booking", responses: { "200": { description: "Bookings" } } } },
    "/api/admin/audit-logs": { get: { tags: ["Admin"], summary: "Audit log đã flush vào Supabase; chỉ ADMIN", parameters: [
      { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
      { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
      { name: "method", in: "query", schema: { type: "string", enum: ["POST", "PUT", "PATCH", "DELETE"] } },
      { name: "statusCode", in: "query", schema: { type: "integer" } },
      { name: "actorUserId", in: "query", schema: { type: "string" } },
      { name: "entityType", in: "query", schema: { type: "string" } },
      { name: "entityId", in: "query", schema: { type: "string" } },
      { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
      { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
      { name: "search", in: "query", schema: { type: "string" } }
    ], responses: { "200": { description: "Audit logs", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/AuditLog" } }, meta: { type: "object", properties: { total: { type: "integer" }, page: { type: "integer" }, limit: { type: "integer" } } } } } } } }, "403": { description: "Chỉ ADMIN" } } } },
    "/api/admin/booking-requests/{id}": { get: { tags: ["Admin"], summary: "Booking gồm package, addons và snapshot", parameters: [idParameter], responses: { "200": { description: "Booking" } } }, patch: { tags: ["Admin"], summary: "Sửa thông tin booking", parameters: [idParameter], responses: { "200": { description: "Booking" } } } },
    "/api/admin/booking-requests/{id}/status": { patch: { tags: ["Admin"], summary: "Chuyển trạng thái booking", parameters: [idParameter], responses: { "200": { description: "Booking" } } } },
    "/api/admin/booking-requests/{id}/notes": { post: { tags: ["Admin"], summary: "Thêm ghi chú booking", parameters: [idParameter], responses: { "201": { description: "Note" } } } },
    "/api/admin/services": {
      get: { tags: ["Admin"], summary: "Tất cả MAIN/ADDON, package, addon pricing và liên kết", parameters: [{ name: "role", in: "query", required: false, schema: { type: "string", enum: ["MAIN", "ADDON"] } }, { name: "type", in: "query", required: false, description: "mediaType; ADDON luôn có mediaType=null", schema: { type: "string", enum: ["IMAGE", "VIDEO"] } }], responses: { "200": { description: "Services", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Service" } } } } } } }, "400": { description: "Filter không hợp lệ", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } } },
      post: { tags: ["Admin"], summary: "Tạo MAIN hoặc ADDON service", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ServiceInput" } } } }, responses: { "201": { description: "Service", content: { "application/json": { schema: { $ref: "#/components/schemas/Service" } } } } } }
    },
    "/api/admin/services/{id}": { patch: { tags: ["Admin"], summary: "Sửa service", parameters: [idParameter], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ServiceInput" } } } }, responses: { "200": { description: "Service", content: { "application/json": { schema: { $ref: "#/components/schemas/Service" } } } } } } },
    "/api/admin/services/{id}/cover": { post: { tags: ["Admin"], summary: "Upload cover lên Supabase Storage", parameters: [idParameter], requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["cover"], properties: { cover: { type: "string", format: "binary" } } } } } }, responses: { "200": { description: "Uploaded" } } }, delete: { tags: ["Admin"], summary: "Xóa cover", parameters: [idParameter], responses: { "200": { description: "Removed" } } } },
    "/api/admin/service-packages": { post: { tags: ["Admin"], summary: "Tạo gói giá cho MAIN service", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/MainPackageInput" } } } }, responses: { "201": { description: "Package", content: { "application/json": { schema: { $ref: "#/components/schemas/MainPackage" } } } } } } },
    "/api/admin/service-packages/{id}": { patch: { tags: ["Admin"], summary: "Sửa gói giá", parameters: [idParameter], responses: { "200": { description: "Package", content: { "application/json": { schema: { $ref: "#/components/schemas/MainPackage" } } } } } }, delete: { tags: ["Admin"], summary: "Xóa gói giá", parameters: [idParameter], responses: { "204": { description: "Không có response body" } } } },
    "/api/admin/services/{id}/addon-pricing": { put: { tags: ["Admin"], summary: "Cập nhật giá mặc định + giá phát sinh của ADDON", parameters: [idParameter], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AddonPricingInput" } } } }, responses: { "200": { description: "Addon pricing", content: { "application/json": { schema: { $ref: "#/components/schemas/AddonPricing" } } } } } } },
    "/api/admin/services/{id}/addons": { put: { tags: ["Admin"], summary: "Thay toàn bộ addon được phép của MAIN service", parameters: [idParameter], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["addonServiceIds"], properties: { addonServiceIds: { type: "array", items: { type: "string" } } } } } } }, responses: { "200": { description: "Links", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { type: "object", properties: { mainServiceId: { type: "string" }, addonServiceId: { type: "string" }, sortOrder: { type: "integer" }, isActive: { type: "boolean" }, addonService: { $ref: "#/components/schemas/AddonService" } } } } } } } } } } } },
    "/api/admin/cities": { get: { tags: ["Admin"], summary: "Danh sách thành phố", responses: { "200": { description: "Cities" } } }, post: { tags: ["Admin"], summary: "Tạo thành phố", responses: { "201": { description: "City" } } } },
    "/api/admin/cities/{id}": { patch: { tags: ["Admin"], summary: "Sửa thành phố", parameters: [idParameter], responses: { "200": { description: "City" } } } },
    "/api/admin/service-city-pricing": { get: { tags: ["Admin"], summary: "Giá/phí theo thành phố", responses: { "200": { description: "City pricing" } } }, put: { tags: ["Admin"], summary: "Upsert giá/phí theo thành phố", responses: { "200": { description: "City pricing" } } } },
    "/api/admin/configuration": { get: { tags: ["Admin"], summary: "Cấu hình", responses: { "200": { description: "Configuration" } } }, put: { tags: ["Admin"], summary: "Cập nhật cấu hình; vatRate dùng cho tổng bill", responses: { "200": { description: "Configuration" } } } },
    "/api/admin/users": { get: { tags: ["Admin"], summary: "Danh sách admin", responses: { "200": { description: "Users" } } }, post: { tags: ["Admin"], summary: "Tạo admin", responses: { "201": { description: "User" } } } },
    "/api/admin/users/{id}": { patch: { tags: ["Admin"], summary: "Sửa admin", parameters: [idParameter], responses: { "200": { description: "User" } } } }
  }
};

const adminSecurity = [{ BearerAuth: [] }, { AdminApiKey: [] }];
for (const [path, pathItem] of Object.entries(document.paths)) {
  if (!path.startsWith("/api/admin/")) continue;
  for (const operation of Object.values(pathItem)) {
    (operation as { security?: typeof adminSecurity }).security = adminSecurity;
  }
}

export const openApiDocument = document;
