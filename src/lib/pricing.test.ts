import { describe, expect, it } from "vitest";
import { calculateAddonPrice } from "./pricing.js";

describe("calculateAddonPrice", () => {
  it("uses the default price through the included quantity", () => {
    expect(calculateAddonPrice(50, 1_000_000, 100, 50, 300_000)).toEqual({ extraBlocks: 0, totalPrice: 1_000_000 });
    expect(calculateAddonPrice(100, 1_000_000, 100, 50, 300_000)).toEqual({ extraBlocks: 0, totalPrice: 1_000_000 });
  });

  it("adds one increment price for every extra block", () => {
    expect(calculateAddonPrice(150, 1_000_000, 100, 50, 300_000)).toEqual({ extraBlocks: 1, totalPrice: 1_300_000 });
    expect(calculateAddonPrice(200, 1_000_000, 100, 50, 300_000)).toEqual({ extraBlocks: 2, totalPrice: 1_600_000 });
  });

  it("returns null when a required price has not been entered", () => {
    expect(calculateAddonPrice(100, null, 100, 50, 300_000).totalPrice).toBeNull();
    expect(calculateAddonPrice(150, 1_000_000, 100, 50, null).totalPrice).toBeNull();
  });
});
