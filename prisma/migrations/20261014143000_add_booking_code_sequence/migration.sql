CREATE SEQUENCE IF NOT EXISTS "BookingRequest_bookingCode_seq"
  INCREMENT BY 1
  MINVALUE 1
  START WITH 1;

-- Continue after the largest existing BR-xxxxxx code. Passing false makes the
-- next nextval() return this exact value instead of skipping one.
SELECT setval(
  '"BookingRequest_bookingCode_seq"',
  GREATEST(
    COALESCE(
      (
        SELECT MAX(SUBSTRING("bookingCode" FROM '^BR-([0-9]+)$')::BIGINT)
        FROM "BookingRequest"
      ),
      0
    ) + 1,
    1
  ),
  false
);
