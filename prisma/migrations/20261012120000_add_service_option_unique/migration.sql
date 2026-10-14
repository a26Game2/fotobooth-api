-- Remove duplicate seeded options before enforcing idempotent seed data.
WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (PARTITION BY "groupId", "name" ORDER BY "id") AS keep_id,
    ROW_NUMBER() OVER (PARTITION BY "groupId", "name" ORDER BY "id") AS row_number
  FROM "ServiceOption"
)
UPDATE "BookingRequestItem" AS item
SET "optionId" = ranked.keep_id
FROM ranked
WHERE item."optionId" = ranked."id" AND ranked.row_number > 1;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "groupId", "name" ORDER BY "id") AS row_number
  FROM "ServiceOption"
)
DELETE FROM "ServiceOption" AS option
USING ranked
WHERE option."id" = ranked."id" AND ranked.row_number > 1;

CREATE UNIQUE INDEX "ServiceOption_groupId_name_key" ON "ServiceOption"("groupId", "name");
