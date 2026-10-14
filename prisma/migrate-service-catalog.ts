import { PrismaClient, type Prisma } from "@prisma/client";
import { addonCatalog, mainCatalog } from "./catalog-data.js";

const prisma = new PrismaClient();

export async function migrateServiceCatalog(client: PrismaClient = prisma) {
  await client.$transaction(async (tx) => {
    const existing = await tx.service.findMany();
    const bySlug = new Map(existing.map((service) => [service.slug, service]));

    // Move records to temporary slugs first, so renaming never collides with a target slug.
    for (const entry of mainCatalog) {
      const source = bySlug.get(entry.sourceSlug);
      if (source && entry.sourceSlug !== entry.slug && !bySlug.has(entry.slug)) {
        await tx.service.update({ where: { id: source.id }, data: { slug: `catalog-migration-${source.id}` } });
        bySlug.delete(entry.sourceSlug);
        bySlug.set(entry.slug, { ...source, slug: entry.slug });
      }
    }

    const migratedMainServices = [];
    for (const entry of mainCatalog) {
      const preserved = bySlug.get(entry.slug) ?? bySlug.get(entry.sourceSlug);
      const pricedPackages = entry.packages.filter((item) => item.price !== null);
      const startingPrice = Math.min(...pricedPackages.map((item) => item.price as number));
      const data = {
        name: entry.name,
        slug: entry.slug,
        description: entry.packageName,
        startingPrice,
        role: "MAIN" as const,
        mediaType: entry.mediaType,
        packageName: entry.packageName,
        extraHourPrice: entry.extraHourPrice,
        note: entry.note,
        isActive: true
      };
      const service = preserved
        ? await tx.service.update({ where: { id: preserved.id }, data })
        : await tx.service.create({ data });

      await tx.serviceOptionGroup.deleteMany({ where: { serviceId: service.id } });
      for (const [sortOrder, packageInput] of entry.packages.entries()) {
        await tx.mainServicePackage.upsert({
          where: { serviceId_code: { serviceId: service.id, code: packageInput.code } },
          update: { ...packageInput, isFullDay: packageInput.isFullDay ?? false, sortOrder, isActive: true },
          create: { serviceId: service.id, ...packageInput, isFullDay: packageInput.isFullDay ?? false, sortOrder }
        });
      }
      await tx.mainServicePackage.deleteMany({
        where: { serviceId: service.id, code: { notIn: entry.packages.map((item) => item.code) } }
      });
      migratedMainServices.push(service);
    }

    const addonServices = [];
    for (const addon of addonCatalog) {
      const service = await tx.service.upsert({
        where: { slug: addon.slug },
        update: { name: addon.name, description: null, startingPrice: 0, role: "ADDON", mediaType: null, packageName: null, extraHourPrice: null, note: null, isActive: true },
        create: { name: addon.name, slug: addon.slug, startingPrice: 0, role: "ADDON", isActive: true }
      });
      await tx.addonPricing.upsert({
        where: { serviceId: service.id },
        update: {},
        create: { serviceId: service.id, defaultPrice: null, includedQuantity: 100, incrementQuantity: 50, incrementPrice: null, unitLabel: "sản phẩm" }
      });
      addonServices.push(service);
    }

    await tx.serviceAddon.deleteMany({ where: { mainServiceId: { in: migratedMainServices.map((service) => service.id) } } });
    const imageServices = migratedMainServices.filter((service) => service.mediaType === "IMAGE");
    if (imageServices.length && addonServices.length) {
      await tx.serviceAddon.createMany({
        data: imageServices.flatMap((mainService) => addonServices.map((addonService, sortOrder) => ({
          mainServiceId: mainService.id,
          addonServiceId: addonService.id,
          sortOrder
        })))
      });
    }

    const cities = await tx.city.findMany({ select: { id: true } });
    await tx.serviceCityPricing.createMany({
      data: migratedMainServices.flatMap((service) => cities.map((city) => ({ serviceId: service.id, cityId: city.id, isAvailable: true }))),
      skipDuplicates: true
    });

    const currentConfiguration = await tx.appConfiguration.findUnique({ where: { id: 1 } });
    const currentValue = (currentConfiguration?.value ?? {}) as Prisma.JsonObject;
    await tx.appConfiguration.upsert({
      where: { id: 1 },
      create: { id: 1, value: { currency: "VND", vatRate: 8 } },
      update: { value: { ...currentValue, currency: "VND", vatRate: 8 } }
    });
  }, { maxWait: 10_000, timeout: 180_000 });
}

if (process.argv[1]?.includes("migrate-service-catalog")) {
  migrateServiceCatalog()
    .then(() => console.log("Service catalog v2 migrated successfully."))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
