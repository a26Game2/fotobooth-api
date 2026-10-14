-- CreateEnum
CREATE TYPE "ServiceRole" AS ENUM ('MAIN', 'ADDON');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "Service"
  ALTER COLUMN "startingPrice" SET DEFAULT 0,
  ADD COLUMN "role" "ServiceRole" NOT NULL DEFAULT 'MAIN',
  ADD COLUMN "mediaType" "MediaType",
  ADD COLUMN "packageName" TEXT,
  ADD COLUMN "extraHourPrice" INTEGER,
  ADD COLUMN "note" TEXT;

-- CreateTable
CREATE TABLE "MainServicePackage" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "durationHours" INTEGER,
  "isFullDay" BOOLEAN NOT NULL DEFAULT false,
  "price" INTEGER,
  "includedMediaCount" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MainServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddonPricing" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "defaultPrice" INTEGER,
  "includedQuantity" INTEGER NOT NULL DEFAULT 100,
  "incrementQuantity" INTEGER NOT NULL DEFAULT 50,
  "incrementPrice" INTEGER,
  "unitLabel" TEXT NOT NULL DEFAULT 'sản phẩm',
  CONSTRAINT "AddonPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAddon" (
  "mainServiceId" TEXT NOT NULL,
  "addonServiceId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ServiceAddon_pkey" PRIMARY KEY ("mainServiceId", "addonServiceId")
);

-- AlterTable
ALTER TABLE "BookingRequest" ADD COLUMN "servicePackageId" TEXT;

-- CreateTable
CREATE TABLE "BookingRequestAddon" (
  "id" TEXT NOT NULL,
  "bookingRequestId" TEXT NOT NULL,
  "addonServiceId" TEXT,
  "itemName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "defaultPrice" INTEGER,
  "extraBlocks" INTEGER NOT NULL DEFAULT 0,
  "incrementPrice" INTEGER,
  "totalPrice" INTEGER,
  CONSTRAINT "BookingRequestAddon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MainServicePackage_serviceId_code_key" ON "MainServicePackage"("serviceId", "code");
CREATE INDEX "MainServicePackage_serviceId_sortOrder_idx" ON "MainServicePackage"("serviceId", "sortOrder");
CREATE UNIQUE INDEX "AddonPricing_serviceId_key" ON "AddonPricing"("serviceId");
CREATE INDEX "ServiceAddon_addonServiceId_idx" ON "ServiceAddon"("addonServiceId");
CREATE INDEX "BookingRequestAddon_bookingRequestId_idx" ON "BookingRequestAddon"("bookingRequestId");
CREATE INDEX "BookingRequestAddon_addonServiceId_idx" ON "BookingRequestAddon"("addonServiceId");
CREATE INDEX "BookingRequest_servicePackageId_idx" ON "BookingRequest"("servicePackageId");

-- AddForeignKey
ALTER TABLE "MainServicePackage" ADD CONSTRAINT "MainServicePackage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AddonPricing" ADD CONSTRAINT "AddonPricing_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceAddon" ADD CONSTRAINT "ServiceAddon_mainServiceId_fkey" FOREIGN KEY ("mainServiceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceAddon" ADD CONSTRAINT "ServiceAddon_addonServiceId_fkey" FOREIGN KEY ("addonServiceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_servicePackageId_fkey" FOREIGN KEY ("servicePackageId") REFERENCES "MainServicePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingRequestAddon" ADD CONSTRAINT "BookingRequestAddon_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingRequestAddon" ADD CONSTRAINT "BookingRequestAddon_addonServiceId_fkey" FOREIGN KEY ("addonServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
