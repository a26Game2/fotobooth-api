import { Router } from "express";
import path from "node:path";
import { prisma } from "../db.js";
import { bookingSchema, quoteSchema } from "../lib/validation.js";
import { calculateQuote, PricingError, snapshot } from "../lib/pricing.js";
import { cacheGetOrSet, cacheKeys } from "../cache.js";

export const publicRouter = Router();

const serviceInclude = {
  mainPackages: { where: { isActive: true }, orderBy: { sortOrder: "asc" as const } },
  availableAddons: {
    where: { isActive: true },
    orderBy: { sortOrder: "asc" as const },
    include: { addonService: { include: { addonPricing: true } } }
  }
};

function publicService<T extends { availableAddons: Array<{ sortOrder: number; addonService: unknown }> }>(service: T) {
  const { availableAddons, ...fields } = service;
  return { ...fields, addons: availableAddons.map((link) => ({ ...link.addonService as object, sortOrder: link.sortOrder })) };
}

publicRouter.get("/configuration", async (_request, response) => {
  const result = await cacheGetOrSet(cacheKeys.configuration, async () => {
    const configuration = await prisma.appConfiguration.findUnique({ where: { id: 1 } });
    return configuration?.value ?? {};
  });
  response.set("X-Cache", result.hit ? "HIT" : "MISS").json(result.value);
});

publicRouter.get("/cities", async (_request, response) => {
  const result = await cacheGetOrSet(cacheKeys.cities, () => prisma.city.findMany({ where: { isAvailable: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, slug: true, defaultTravelFee: true, note: true } }));
  response.set("X-Cache", result.hit ? "HIT" : "MISS").json({ data: result.value });
});

publicRouter.get("/services", async (request, response) => {
  const type = typeof request.query.type === "string" ? request.query.type.trim().toUpperCase() || undefined : undefined;
  if (type && type !== "IMAGE" && type !== "VIDEO") {
    return response.status(400).json({ error: "type phải là IMAGE hoặc VIDEO" });
  }
  const result = await cacheGetOrSet(cacheKeys.services, () => prisma.service.findMany({
    where: { isActive: true, role: "MAIN" },
    orderBy: [{ hotLevel: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, slug: true, description: true, coverImagePath: true, startingPrice: true,
      role: true, mediaType: true, packageName: true, extraHourPrice: true, note: true, hotLevel: true,
      mainPackages: { where: { isActive: true }, orderBy: { sortOrder: "asc" } }
    }
  }));
  const data = type ? result.value.filter((service) => service.mediaType === type) : result.value;
  return response.set("X-Cache", result.hit ? "HIT" : "MISS").json({ data });
});

publicRouter.get("/services/:slug", async (request, response) => {
  const result = await cacheGetOrSet(cacheKeys.service(request.params.slug), () => prisma.service.findFirst({ where: { slug: request.params.slug, isActive: true, role: "MAIN" }, include: serviceInclude }));
  const service = result.value;
  if (!service) return response.status(404).json({ error: "Không tìm thấy dịch vụ" });
  return response.set("X-Cache", result.hit ? "HIT" : "MISS").json(publicService(service));
});

publicRouter.post("/booking-requests/preview", async (request, response, next) => {
  try {
    const input = quoteSchema.parse(request.body);
    const quote = await calculateQuote(input);
    response.json({
      service: { id: quote.service.id, name: quote.service.name, slug: quote.service.slug },
      mainPackage: quote.mainPackage,
      city: { id: quote.city.id, name: quote.city.name, slug: quote.city.slug, note: quote.cityNote },
      addons: quote.addons, extraHours: quote.extraHours, basePrice: quote.basePrice,
      extraHourPrice: quote.extraHourPrice, extraHourAmount: quote.extraHourAmount, travelFee: quote.travelFee,
      subtotal: quote.subtotal, vatRate: quote.vatRate, vatAmount: quote.vatAmount,
      estimatedTotal: quote.estimatedTotal, pricingPending: quote.pricingPending,
      missingPrices: quote.missingPrices, currency: quote.currency
    });
  } catch (error) { next(error); }
});

publicRouter.post("/booking-requests", async (request, response, next) => {
  try {
    const raw = request.body as Record<string, unknown>;
    const addons = typeof raw.addons === "string" ? JSON.parse(raw.addons) : raw.addons;
    const input = bookingSchema.parse({ ...raw, addons });
    const quote = await calculateQuote(input);
    const uploadedFiles = ((request.files as Express.Multer.File[] | undefined) ?? []).map((file) => ({
      fileName: file.originalname,
      filePath: `/uploads/booking-requests/${path.basename(file.filename)}`,
      mimeType: file.mimetype,
      sizeBytes: file.size
    }));
    // PostgreSQL sequences are atomic and work with Supabase's transaction-mode pooler.
    // Avoid Prisma interactive transactions here: each callback query may be assigned
    // to a different pooled connection and fail with P2028.
    const [{ value: bookingSequence }] = await prisma.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('"BookingRequest_bookingCode_seq"') AS value
    `;
    const bookingCode = `BR-${String(bookingSequence).padStart(6, "0")}`;
    const booking = await prisma.bookingRequest.create({
      data: {
        bookingCode, serviceId: quote.service.id, servicePackageId: quote.mainPackage.id,
        cityId: quote.city.id, eventDate: input.eventDate,
        startTime: input.startTime, duration: quote.mainPackage.name, location: input.location, eventType: input.eventType,
        guestCount: input.guestCount, customerName: input.customerName, phone: input.phone,
        companyName: input.companyName || null, customerNote: input.customerNote || null,
        estimatedTotal: quote.estimatedTotal, configurationSnapshot: snapshot(quote),
        addons: { create: quote.addons.map((addon) => ({
          addonServiceId: addon.serviceId,
          itemName: addon.name,
          quantity: addon.quantity,
          defaultPrice: addon.defaultPrice,
          extraBlocks: addon.extraBlocks,
          incrementPrice: addon.incrementPrice,
          totalPrice: addon.totalPrice
        })) },
        files: { create: uploadedFiles }
      },
      include: { addons: true, files: true }
    });
    const configuration = await cacheGetOrSet(cacheKeys.configuration, async () => {
      const record = await prisma.appConfiguration.findUnique({ where: { id: 1 } });
      return record?.value ?? {};
    });
    const message = ((configuration.value as { booking?: { successMessage?: string } })?.booking?.successMessage) ?? "T-RED đã nhận yêu cầu. Chuyên viên sẽ xác nhận lịch trống và báo giá cuối cùng trong thời gian sớm nhất.";
    response.status(201).json({ bookingCode: booking.bookingCode, status: booking.status, estimatedTotal: booking.estimatedTotal, pricingPending: quote.pricingPending, message });
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ error: "addons phải là JSON hợp lệ" });
    next(error);
  }
});

