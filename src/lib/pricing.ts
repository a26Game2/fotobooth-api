import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type { z } from "zod";
import type { quoteSchema } from "./validation.js";
import { cacheGetOrSet, cacheKeys } from "../cache.js";

type QuoteInput = z.infer<typeof quoteSchema>;

export class PricingError extends Error {}

export function calculateAddonPrice(
  quantity: number,
  defaultPrice: number | null,
  includedQuantity: number,
  incrementQuantity: number,
  incrementPrice: number | null
) {
  const extraBlocks = Math.max(0, Math.ceil((quantity - includedQuantity) / incrementQuantity));
  const totalPrice = defaultPrice === null || (extraBlocks > 0 && incrementPrice === null)
    ? null
    : defaultPrice + extraBlocks * (incrementPrice ?? 0);
  return { extraBlocks, totalPrice };
}

const servicePricingInclude = {
  mainPackages: { where: { isActive: true }, orderBy: { sortOrder: "asc" as const } },
  availableAddons: {
    where: { isActive: true },
    orderBy: { sortOrder: "asc" as const },
    include: { addonService: { include: { addonPricing: true } } }
  }
};

export async function calculateQuote(input: QuoteInput) {
  const { value: context } = await cacheGetOrSet(cacheKeys.pricing(input.serviceSlug, input.citySlug), async () => {
    const [service, city, appConfig] = await Promise.all([
      prisma.service.findUnique({ where: { slug: input.serviceSlug }, include: servicePricingInclude }),
      prisma.city.findUnique({ where: { slug: input.citySlug } }),
      prisma.appConfiguration.findUnique({ where: { id: 1 } })
    ]);
    if (!service || !service.isActive || service.role !== "MAIN") throw new PricingError("Dịch vụ chính không khả dụng");
    if (!city || !city.isAvailable) throw new PricingError("Thành phố chưa nhận booking");
    const cityPrice = await prisma.serviceCityPricing.findUnique({ where: { serviceId_cityId: { serviceId: service.id, cityId: city.id } } });
    if (cityPrice && !cityPrice.isAvailable) throw new PricingError("Dịch vụ chưa khả dụng tại thành phố này");
    return { service, city, cityPrice, appConfig };
  });
  const { service, city, cityPrice, appConfig } = context;

  const mainPackage = service.mainPackages.find((item) => item.id === input.mainPackageId);
  if (!mainPackage) throw new PricingError("Gói dịch vụ không hợp lệ hoặc chưa khả dụng");

  const addonById = new Map(service.availableAddons.map((link) => [link.addonService.id, link.addonService]));
  const addons = input.addons.map((selection) => {
    const addon = addonById.get(selection.serviceId);
    if (!addon || !addon.isActive || addon.role !== "ADDON" || !addon.addonPricing) {
      throw new PricingError("Addon không khả dụng cho dịch vụ chính này");
    }
    const pricing = addon.addonPricing;
    const { extraBlocks, totalPrice } = calculateAddonPrice(
      selection.quantity,
      pricing.defaultPrice,
      pricing.includedQuantity,
      pricing.incrementQuantity,
      pricing.incrementPrice
    );
    return {
      serviceId: addon.id,
      name: addon.name,
      quantity: selection.quantity,
      unitLabel: pricing.unitLabel,
      defaultPrice: pricing.defaultPrice,
      includedQuantity: pricing.includedQuantity,
      incrementQuantity: pricing.incrementQuantity,
      incrementPrice: pricing.incrementPrice,
      extraBlocks,
      totalPrice
    };
  });

  const basePrice = cityPrice?.basePriceOverride ?? mainPackage.price;
  const extraHourAmount = input.extraHours === 0
    ? 0
    : service.extraHourPrice === null ? null : service.extraHourPrice * input.extraHours;
  const travelFee = cityPrice?.travelFeeOverride ?? city.defaultTravelFee;
  const missingPrices: string[] = [];
  if (basePrice === null) missingPrices.push("MAIN_PACKAGE");
  if (extraHourAmount === null) missingPrices.push("EXTRA_HOUR");
  if (travelFee === null) missingPrices.push("TRAVEL_FEE");
  for (const addon of addons) if (addon.totalPrice === null) missingPrices.push(`ADDON:${addon.serviceId}`);

  const pricingPending = missingPrices.length > 0;
  const subtotal = pricingPending ? null : (basePrice as number)
    + (extraHourAmount as number)
    + (travelFee as number)
    + addons.reduce((total, addon) => total + (addon.totalPrice as number), 0);
  const settings = (appConfig?.value ?? { currency: "VND", vatRate: 8 }) as { currency?: string; vatRate?: number };
  const vatRate = Number(settings.vatRate ?? 8);
  const vatAmount = subtotal === null ? null : Math.round(subtotal * vatRate / 100);

  return {
    service,
    city,
    mainPackage,
    addons,
    extraHours: input.extraHours,
    basePrice,
    extraHourPrice: service.extraHourPrice,
    extraHourAmount,
    travelFee,
    subtotal,
    vatRate,
    vatAmount,
    estimatedTotal: subtotal === null || vatAmount === null ? null : subtotal + vatAmount,
    pricingPending,
    missingPrices,
    currency: settings.currency ?? "VND",
    cityNote: cityPrice?.note ?? city.note
  };
}

export function snapshot(quote: Awaited<ReturnType<typeof calculateQuote>>) {
  return {
    service: { id: quote.service.id, name: quote.service.name, slug: quote.service.slug, mediaType: quote.service.mediaType },
    mainPackage: {
      id: quote.mainPackage.id,
      code: quote.mainPackage.code,
      name: quote.mainPackage.name,
      durationHours: quote.mainPackage.durationHours,
      includedMediaCount: quote.mainPackage.includedMediaCount
    },
    city: { id: quote.city.id, name: quote.city.name, slug: quote.city.slug, note: quote.cityNote },
    addons: quote.addons,
    extraHours: quote.extraHours,
    basePrice: quote.basePrice,
    extraHourPrice: quote.extraHourPrice,
    extraHourAmount: quote.extraHourAmount,
    travelFee: quote.travelFee,
    subtotal: quote.subtotal,
    vatRate: quote.vatRate,
    vatAmount: quote.vatAmount,
    estimatedTotal: quote.estimatedTotal,
    pricingPending: quote.pricingPending,
    missingPrices: quote.missingPrices,
    currency: quote.currency
  } as Prisma.InputJsonValue;
}
