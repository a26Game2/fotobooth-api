-- 1 is the hottest service; 3 is the default/normal tier.
ALTER TABLE "Service" ADD COLUMN "hotLevel" INTEGER NOT NULL DEFAULT 3;

CREATE INDEX "Service_role_isActive_hotLevel_idx" ON "Service"("role", "isActive", "hotLevel");

ALTER TABLE "Service" ADD CONSTRAINT "Service_hotLevel_check" CHECK ("hotLevel" BETWEEN 1 AND 3);
