import { describe, expect, it } from "vitest";
import { auditEntity, sanitizeAuditValue } from "./audit.js";

describe("audit sanitization", () => {
  it("redacts sensitive values recursively", () => {
    expect(sanitizeAuditValue({ email: "admin@tred.vn", password: "secret", nested: { accessToken: "jwt" } })).toEqual({
      email: "admin@tred.vn", password: "[REDACTED]", nested: { accessToken: "[REDACTED]" }
    });
  });

  it("extracts entity information from admin paths", () => {
    expect(auditEntity("/api/admin/services/service-1", {})).toEqual({ entityType: "services", entityId: "service-1" });
    expect(auditEntity("/api/admin/service-city-pricing", { serviceId: "service-2" })).toEqual({ entityType: "service-city-pricing", entityId: "service-2" });
  });
});
