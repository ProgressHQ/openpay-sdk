import { describe, it, expect } from "vitest";
import { toMinorUnits, fromMinorUnits, formatMoney } from "./money";

describe("toMinorUnits", () => {
  it("converts EUR decimals to cents", () => {
    expect(toMinorUnits(0.10, "EUR")).toBe(10);
    expect(toMinorUnits(0.05, "EUR")).toBe(5);
    expect(toMinorUnits(1.00, "EUR")).toBe(100);
    expect(toMinorUnits(9.99, "EUR")).toBe(999);
  });

  it("handles JPY (zero decimal places)", () => {
    expect(toMinorUnits(100, "JPY")).toBe(100);
    expect(toMinorUnits(1, "JPY")).toBe(1);
  });

  it("handles KWD (three decimal places)", () => {
    expect(toMinorUnits(1.000, "KWD")).toBe(1000);
    expect(toMinorUnits(0.100, "KWD")).toBe(100);
  });
});

describe("fromMinorUnits", () => {
  it("converts EUR cents to decimal", () => {
    expect(fromMinorUnits(10, "EUR")).toBeCloseTo(0.10);
    expect(fromMinorUnits(100, "EUR")).toBeCloseTo(1.00);
    expect(fromMinorUnits(999, "EUR")).toBeCloseTo(9.99);
  });
});

describe("round-trip", () => {
  it("toMinorUnits → fromMinorUnits preserves value", () => {
    for (const a of [0.01, 0.05, 0.10, 0.25, 0.50, 1.00, 9.99, 100.00]) {
      expect(fromMinorUnits(toMinorUnits(a, "EUR"), "EUR")).toBeCloseTo(a);
    }
  });
});

describe("formatMoney", () => {
  it("formats EUR values", () => {
    const result = formatMoney({ amount: 10, currency: "EUR" });
    expect(result).toContain("0.10");
  });
});
