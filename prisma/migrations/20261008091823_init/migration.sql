-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'DEPOSIT_PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverImagePath" TEXT,
    "startingPrice" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOptionGroup" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "selectionMode" TEXT NOT NULL DEFAULT 'single',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ServiceOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "defaultTravelFee" INTEGER,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCityPricing" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "basePriceOverride" INTEGER,
    "travelFeeOverride" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "ServiceCityPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'NEW',
    "eventDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "duration" TEXT,
    "location" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "companyName" TEXT,
    "customerNote" TEXT,
    "estimatedTotal" INTEGER,
    "configurationSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRequestItem" (
    "id" TEXT NOT NULL,
    "bookingRequestId" TEXT NOT NULL,
    "optionId" TEXT,
    "groupKey" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,

    CONSTRAINT "BookingRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRequestNote" (
    "id" TEXT NOT NULL,
    "bookingRequestId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingRequestNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRequestFile" (
    "id" TEXT NOT NULL,
    "bookingRequestId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,

    CONSTRAINT "BookingRequestFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfiguration" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOptionGroup_serviceId_key_key" ON "ServiceOptionGroup"("serviceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCityPricing_serviceId_cityId_key" ON "ServiceCityPricing"("serviceId", "cityId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRequest_bookingCode_key" ON "BookingRequest"("bookingCode");

-- AddForeignKey
ALTER TABLE "ServiceOptionGroup" ADD CONSTRAINT "ServiceOptionGroup_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOption" ADD CONSTRAINT "ServiceOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ServiceOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCityPricing" ADD CONSTRAINT "ServiceCityPricing_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCityPricing" ADD CONSTRAINT "ServiceCityPricing_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequestItem" ADD CONSTRAINT "BookingRequestItem_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequestItem" ADD CONSTRAINT "BookingRequestItem_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ServiceOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequestNote" ADD CONSTRAINT "BookingRequestNote_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequestFile" ADD CONSTRAINT "BookingRequestFile_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
