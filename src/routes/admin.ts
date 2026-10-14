import { Router } from "express";
import { AdminRole, BookingStatus, MediaType, Prisma, ServiceRole } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { cacheGetOrSet, cacheKeys, invalidateCatalogCache, invalidateConfigurationCache } from "../cache.js";
import { deleteServiceCover, uploadServiceCover } from "../storage.js";
import { auditAdminMutations } from "../audit.js";

export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(auditAdminMutations);

adminRouter.get("/audit-logs", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const input = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      method: z.enum(["POST", "PUT", "PATCH", "DELETE"]).optional(),
      statusCode: z.coerce.number().int().min(100).max(599).optional(),
      actorUserId: z.string().optional(),
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      search: z.string().max(200).optional()
    }).parse(request.query);
    const where: Prisma.AuditLogWhereInput = {
      method: input.method,
      statusCode: input.statusCode,
      actorUserId: input.actorUserId,
      entityType: input.entityType,
      entityId: input.entityId,
      occurredAt: input.from || input.to ? { gte: input.from, lte: input.to } : undefined,
      OR: input.search ? [
        { action: { contains: input.search, mode: "insensitive" } },
        { path: { contains: input.search, mode: "insensitive" } },
        { actorEmail: { contains: input.search, mode: "insensitive" } },
        { actorName: { contains: input.search, mode: "insensitive" } }
      ] : undefined
    };
    const [total, data] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (input.page - 1) * input.limit, take: input.limit })
    ]);
    return response.json({ data, meta: { total, page: input.page, limit: input.limit } });
  } catch (error) { next(error); }
});

const bookingInclude = { service: true, servicePackage: true, city: true, items: true, addons: true, notes: { orderBy: { createdAt: "desc" as const } }, files: true };
const statusTransitions: Record<BookingStatus, BookingStatus[]> = {
  NEW: ["CONTACTED", "CANCELLED"],
  CONTACTED: ["QUOTED", "CANCELLED"],
  QUOTED: ["DEPOSIT_PENDING", "CANCELLED"],
  DEPOSIT_PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: []
};

adminRouter.get("/booking-requests", async (request, response) => {
  const status = request.query.status;
  const page = Math.max(1, Number(request.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(request.query.limit ?? 20)));
  const where = typeof status === "string" && Object.values(BookingStatus).includes(status as BookingStatus) ? { status: status as BookingStatus } : {};
  const [total, data] = await prisma.$transaction([
    prisma.bookingRequest.count({ where }),
    prisma.bookingRequest.findMany({ where, include: { service: true, servicePackage: true, city: true, addons: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit })
  ]);
  response.json({ data, meta: { total, page, limit } });
});

adminRouter.get("/booking-requests/:id", async (request, response) => {
  const booking = await prisma.bookingRequest.findUnique({ where: { id: request.params.id }, include: bookingInclude });
  if (!booking) return response.status(404).json({ error: "Không tìm thấy booking" });
  return response.json(booking);
});

adminRouter.patch("/booking-requests/:id", async (request, response, next) => {
  try {
    const input = z.object({ customerName: z.string().min(2).max(100).optional(), phone: z.string().min(8).max(30).optional(), companyName: z.string().max(150).nullable().optional(), customerNote: z.string().max(2000).nullable().optional(), location: z.string().min(3).max(500).optional(), eventType: z.string().min(2).max(100).optional(), guestCount: z.number().int().positive().optional(), startTime: z.string().optional() }).parse(request.body);
    const booking = await prisma.bookingRequest.update({ where: { id: request.params.id }, data: input, include: bookingInclude });
    response.json(booking);
  } catch (error) { next(error); }
});

adminRouter.patch("/booking-requests/:id/status", async (request, response, next) => {
  try {
    const input = z.object({ status: z.nativeEnum(BookingStatus) }).parse(request.body);
    const booking = await prisma.bookingRequest.findUnique({ where: { id: request.params.id } });
    if (!booking) return response.status(404).json({ error: "Không tìm thấy booking" });
    if (!statusTransitions[booking.status].includes(input.status)) return response.status(422).json({ error: `Không thể chuyển từ ${booking.status} sang ${input.status}` });
    const updated = await prisma.bookingRequest.update({ where: { id: booking.id }, data: { status: input.status }, include: bookingInclude });
    return response.json(updated);
  } catch (error) { next(error); }
});

adminRouter.post("/booking-requests/:id/notes", async (request, response, next) => {
  try {
    const input = z.object({ note: z.string().min(1).max(5000), createdBy: z.string().min(1).max(100).default("admin") }).parse(request.body);
    const booking = await prisma.bookingRequest.findUnique({ where: { id: request.params.id } });
    if (!booking) return response.status(404).json({ error: "Không tìm thấy booking" });
    const note = await prisma.bookingRequestNote.create({ data: { bookingRequestId: booking.id, ...input } });
    return response.status(201).json(note);
  } catch (error) { next(error); }
});

const serviceFields = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().nullable().optional(),
  coverImagePath: z.string().nullable().optional(),
  role: z.nativeEnum(ServiceRole),
  mediaType: z.nativeEnum(MediaType).nullable().optional(),
  packageName: z.string().nullable().optional(),
  extraHourPrice: z.number().int().min(0).nullable().optional(),
  note: z.string().nullable().optional(),
  hotLevel: z.number().int().min(1).max(3).optional(),
  isActive: z.boolean().optional()
});
const serviceInput = serviceFields.superRefine((input, context) => {
  if (input.role === ServiceRole.MAIN && !input.mediaType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaType"], message: "MAIN service phải có mediaType IMAGE hoặc VIDEO" });
  }
  if (input.role === ServiceRole.ADDON && input.mediaType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaType"], message: "ADDON service phải có mediaType=null" });
  }
});
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
});

adminRouter.get("/services", async (request, response) => {
  const role = typeof request.query.role === "string" ? request.query.role.trim().toUpperCase() || undefined : undefined;
  const type = typeof request.query.type === "string" ? request.query.type.trim().toUpperCase() || undefined : undefined;
  if (role && role !== "MAIN" && role !== "ADDON") return response.status(400).json({ error: "role phải là MAIN hoặc ADDON" });
  if (type && type !== "IMAGE" && type !== "VIDEO") return response.status(400).json({ error: "type phải là IMAGE hoặc VIDEO" });
  const result = await cacheGetOrSet(cacheKeys.adminServices, () => prisma.service.findMany({
    include: {
      mainPackages: { orderBy: { sortOrder: "asc" } },
      addonPricing: true,
      availableAddons: { orderBy: { sortOrder: "asc" }, include: { addonService: { include: { addonPricing: true } } } },
      availableFor: { include: { mainService: true } },
      cityPricing: { include: { city: true } }
    },
    orderBy: [{ role: "asc" }, { hotLevel: "asc" }, { name: "asc" }]
  }));
  const data = result.value.filter((service) => (!role || service.role === role) && (!type || service.mediaType === type));
  return response.set("X-Cache", result.hit ? "HIT" : "MISS").json({ data });
});

adminRouter.post("/services", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const input = serviceInput.parse(request.body);
    const service = await prisma.service.create({ data: { ...input, startingPrice: 0 } });
    await invalidateCatalogCache();
    response.status(201).json(service);
  } catch (error) { next(error); }
});

const packageInput = z.object({
  serviceId: z.string().min(1),
  code: z.string().regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1),
  durationHours: z.number().int().positive().nullable().optional(),
  isFullDay: z.boolean().optional(),
  price: z.number().int().min(0).nullable().optional(),
  includedMediaCount: z.number().int().min(0).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});

async function refreshStartingPrice(serviceId: string) {
  const aggregate = await prisma.mainServicePackage.aggregate({ where: { serviceId, isActive: true, price: { not: null } }, _min: { price: true } });
  await prisma.service.update({ where: { id: serviceId }, data: { startingPrice: aggregate._min.price ?? 0 } });
}

adminRouter.post("/service-packages", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const input = packageInput.parse(request.body);
    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service || service.role !== ServiceRole.MAIN) return response.status(422).json({ error: "Gói giá chỉ áp dụng cho service MAIN" });
    const item = await prisma.mainServicePackage.create({ data: input });
    await refreshStartingPrice(input.serviceId);
    await invalidateCatalogCache();
    return response.status(201).json(item);
  } catch (error) { next(error); }
});

adminRouter.patch("/service-packages/:id", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const current = await prisma.mainServicePackage.findUnique({ where: { id: String(request.params.id) } });
    if (!current) return response.status(404).json({ error: "Không tìm thấy gói giá" });
    const item = await prisma.mainServicePackage.update({
      where: { id: current.id },
      data: packageInput.omit({ serviceId: true }).partial().parse(request.body)
    });
    await refreshStartingPrice(current.serviceId);
    await invalidateCatalogCache();
    return response.json(item);
  } catch (error) { next(error); }
});

adminRouter.delete("/service-packages/:id", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const current = await prisma.mainServicePackage.findUnique({ where: { id: String(request.params.id) } });
    if (!current) return response.status(404).json({ error: "Không tìm thấy gói giá" });
    await prisma.mainServicePackage.delete({ where: { id: current.id } });
    await refreshStartingPrice(current.serviceId);
    await invalidateCatalogCache();
    return response.status(204).send();
  } catch (error) { next(error); }
});

const addonPricingInput = z.object({
  defaultPrice: z.number().int().min(0).nullable(),
  includedQuantity: z.number().int().min(50).refine((value) => value % 50 === 0, "includedQuantity phải là bội số 50"),
  incrementQuantity: z.number().int().positive().refine((value) => value % 50 === 0, "incrementQuantity phải là bội số 50"),
  incrementPrice: z.number().int().min(0).nullable(),
  unitLabel: z.string().min(1).max(50)
});

adminRouter.put("/services/:id/addon-pricing", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const serviceId = String(request.params.id);
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service || service.role !== ServiceRole.ADDON) return response.status(422).json({ error: "Giá addon chỉ áp dụng cho service ADDON" });
    const input = addonPricingInput.parse(request.body);
    const pricing = await prisma.addonPricing.upsert({ where: { serviceId }, create: { serviceId, ...input }, update: input });
    await prisma.service.update({ where: { id: serviceId }, data: { startingPrice: input.defaultPrice ?? 0 } });
    await invalidateCatalogCache();
    return response.json(pricing);
  } catch (error) { next(error); }
});

adminRouter.put("/services/:id/addons", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const mainServiceId = String(request.params.id);
    const input = z.object({ addonServiceIds: z.array(z.string().min(1)).max(100) }).parse(request.body);
    if (new Set(input.addonServiceIds).size !== input.addonServiceIds.length) return response.status(400).json({ error: "addonServiceIds không được trùng" });
    const [mainService, addons] = await Promise.all([
      prisma.service.findUnique({ where: { id: mainServiceId } }),
      prisma.service.findMany({ where: { id: { in: input.addonServiceIds }, role: ServiceRole.ADDON } })
    ]);
    if (!mainService || mainService.role !== ServiceRole.MAIN) return response.status(422).json({ error: "Chỉ service MAIN mới được gắn addon" });
    if (addons.length !== input.addonServiceIds.length) return response.status(422).json({ error: "Có addon không tồn tại hoặc không thuộc role ADDON" });
    await prisma.$transaction([
      prisma.serviceAddon.deleteMany({ where: { mainServiceId } }),
      prisma.serviceAddon.createMany({ data: input.addonServiceIds.map((addonServiceId, sortOrder) => ({ mainServiceId, addonServiceId, sortOrder })) })
    ]);
    await invalidateCatalogCache();
    const links = await prisma.serviceAddon.findMany({ where: { mainServiceId }, orderBy: { sortOrder: "asc" }, include: { addonService: { include: { addonPricing: true } } } });
    return response.json({ data: links });
  } catch (error) { next(error); }
});

adminRouter.patch("/services/:id", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const id = String(request.params.id);
    const current = await prisma.service.findUnique({ where: { id } });
    if (!current) return response.status(404).json({ error: "Không tìm thấy dịch vụ" });
    const changes = serviceFields.partial().parse(request.body);
    serviceInput.parse({ ...current, ...changes });
    const service = await prisma.service.update({ where: { id }, data: changes });
    await invalidateCatalogCache();
    response.json(service);
  } catch (error) { next(error); }
});

adminRouter.post("/services/:id/cover", requireRole(AdminRole.ADMIN), coverUpload.single("cover"), async (request, response, next) => {
  let uploaded: Awaited<ReturnType<typeof uploadServiceCover>> | null = null;
  try {
    if (!request.file) return response.status(400).json({ error: "Thiếu file ảnh trong field cover" });
    const service = await prisma.service.findUnique({ where: { id: String(request.params.id) } });
    if (!service) return response.status(404).json({ error: "Không tìm thấy dịch vụ" });
    uploaded = await uploadServiceCover(service.slug, request.file);
    const updated = await prisma.service.update({
      where: { id: service.id },
      data: { coverImagePath: uploaded.publicUrl }
    });
    await invalidateCatalogCache();
    try { await deleteServiceCover(service.coverImagePath); } catch (error) { console.warn("Could not remove previous service cover", error); }
    return response.json({ service: updated, cover: uploaded });
  } catch (error) {
    if (uploaded) {
      try { await deleteServiceCover(uploaded.publicUrl); } catch { /* best-effort rollback */ }
    }
    next(error);
  }
});

adminRouter.delete("/services/:id/cover", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: String(request.params.id) } });
    if (!service) return response.status(404).json({ error: "Không tìm thấy dịch vụ" });
    const updated = await prisma.service.update({ where: { id: service.id }, data: { coverImagePath: null } });
    await invalidateCatalogCache();
    try { await deleteServiceCover(service.coverImagePath); } catch (error) { console.warn("Could not remove service cover", error); }
    return response.json(updated);
  } catch (error) { next(error); }
});

adminRouter.get("/configuration", async (_request, response) => {
  const configuration = await prisma.appConfiguration.findUnique({ where: { id: 1 } });
  response.json(configuration?.value ?? {});
});

adminRouter.put("/configuration", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const value = z.object({ currency: z.string().length(3), vatRate: z.number().min(0).max(100), booking: z.object({ minNoticeHours: z.number().int().min(0), successMessage: z.string().min(1), defaultNote: z.string().min(1) }) }).parse(request.body);
    const configuration = await prisma.appConfiguration.upsert({ where: { id: 1 }, create: { id: 1, value }, update: { value } });
    await invalidateConfigurationCache();
    response.json(configuration.value);
  } catch (error) { next(error); }
});

const priceInput = z.object({ serviceId: z.string(), cityId: z.string(), basePriceOverride: z.number().int().min(0).nullable().optional(), travelFeeOverride: z.number().int().min(0).nullable().optional(), isAvailable: z.boolean().optional(), note: z.string().nullable().optional() });

const cityInput = z.object({ name: z.string().min(2), slug: z.string().regex(/^[a-z0-9-]+$/), isAvailable: z.boolean().optional(), defaultTravelFee: z.number().int().min(0).nullable().optional(), note: z.string().nullable().optional(), sortOrder: z.number().int().min(0).optional() });

adminRouter.get("/cities", async (_request, response) => {
  response.json({ data: await prisma.city.findMany({ orderBy: { sortOrder: "asc" } }) });
});

adminRouter.post("/cities", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const city = await prisma.city.create({ data: cityInput.parse(request.body) });
    await invalidateCatalogCache();
    response.status(201).json(city);
  } catch (error) { next(error); }
});

adminRouter.patch("/cities/:id", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const city = await prisma.city.update({ where: { id: String(request.params.id) }, data: cityInput.partial().parse(request.body) });
    await invalidateCatalogCache();
    response.json(city);
  } catch (error) { next(error); }
});

const optionGroupInput = z.object({ serviceId: z.string(), key: z.enum(["duration", "print", "merchandise"]), title: z.string().min(1), selectionMode: z.enum(["single", "multiple"]).default("single"), sortOrder: z.number().int().min(0).default(0), isRequired: z.boolean().default(false) });
const optionInput = z.object({ groupId: z.string(), name: z.string().min(1), price: z.number().int(), isActive: z.boolean().optional(), sortOrder: z.number().int().min(0).optional() });

adminRouter.post("/service-option-groups", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const group = await prisma.serviceOptionGroup.create({ data: optionGroupInput.parse(request.body) });
    await invalidateCatalogCache();
    response.status(201).json(group);
  } catch (error) { next(error); }
});

adminRouter.patch("/service-option-groups/:id", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const group = await prisma.serviceOptionGroup.update({ where: { id: String(request.params.id) }, data: optionGroupInput.omit({ serviceId: true }).partial().parse(request.body) });
    await invalidateCatalogCache();
    response.json(group);
  } catch (error) { next(error); }
});

adminRouter.post("/service-options", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const option = await prisma.serviceOption.create({ data: optionInput.parse(request.body) });
    await invalidateCatalogCache();
    response.status(201).json(option);
  } catch (error) { next(error); }
});

adminRouter.patch("/service-options/:id", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const option = await prisma.serviceOption.update({ where: { id: String(request.params.id) }, data: optionInput.omit({ groupId: true }).partial().parse(request.body) });
    await invalidateCatalogCache();
    response.json(option);
  } catch (error) { next(error); }
});

adminRouter.get("/service-city-pricing", async (_request, response) => {
  response.json({ data: await prisma.serviceCityPricing.findMany({ include: { service: true, city: true }, orderBy: [{ service: { name: "asc" } }, { city: { sortOrder: "asc" } }] }) });
});

adminRouter.put("/service-city-pricing", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const input = priceInput.parse(request.body);
    const result = await prisma.serviceCityPricing.upsert({ where: { serviceId_cityId: { serviceId: input.serviceId, cityId: input.cityId } }, create: input, update: input, include: { service: true, city: true } });
    await invalidateCatalogCache();
    response.json(result);
  } catch (error) { next(error); }
});

const userSelect = { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true } as const;

adminRouter.get("/users", requireRole(AdminRole.ADMIN), async (_request, response) => {
  response.json({ data: await prisma.adminUser.findMany({ select: userSelect, orderBy: { createdAt: "asc" } }) });
});

adminRouter.post("/users", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string().min(8).max(200), name: z.string().min(2).max(100), role: z.nativeEnum(AdminRole).default(AdminRole.SALES) }).parse(request.body);
    const user = await prisma.adminUser.create({
      data: { email: input.email.trim().toLowerCase(), passwordHash: await bcrypt.hash(input.password, 12), name: input.name, role: input.role },
      select: userSelect
    });
    response.status(201).json(user);
  } catch (error) { next(error); }
});

adminRouter.patch("/users/:id", requireRole(AdminRole.ADMIN), async (request, response, next) => {
  try {
    const input = z.object({ email: z.string().email().optional(), password: z.string().min(8).max(200).optional(), name: z.string().min(2).max(100).optional(), role: z.nativeEnum(AdminRole).optional(), isActive: z.boolean().optional() }).parse(request.body);
    const { password, email, ...fields } = input;
    const user = await prisma.adminUser.update({
      where: { id: String(request.params.id) },
      data: { ...fields, ...(email ? { email: email.trim().toLowerCase() } : {}), ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
      select: userSelect
    });
    response.json(user);
  } catch (error) { next(error); }
});
