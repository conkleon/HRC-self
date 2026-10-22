import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "./logger";
import {
  DEFAULT_RATE_LIMIT_MULTIPLIER,
  parseRateLimitMultiplier,
  scaleRateLimit,
} from "./rate-limit-multiplier.server";

describe("parseRateLimitMultiplier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the stock limits when unset or blank", () => {
    expect(parseRateLimitMultiplier(undefined)).toBe(
      DEFAULT_RATE_LIMIT_MULTIPLIER
    );
    expect(parseRateLimitMultiplier("")).toBe(DEFAULT_RATE_LIMIT_MULTIPLIER);
    expect(parseRateLimitMultiplier("   ")).toBe(
      DEFAULT_RATE_LIMIT_MULTIPLIER
    );
  });

  it("accepts whole and fractional positive numbers", () => {
    expect(parseRateLimitMultiplier("10")).toBe(10);
    expect(parseRateLimitMultiplier(" 2.5 ")).toBe(2.5);
    expect(parseRateLimitMultiplier("0.5")).toBe(0.5);
  });

  it.each(["0", "-3", "abc", "Infinity"])(
    "warns and falls back to the stock limits for %j",
    (raw) => {
      // why: assert the operator is told about the ignored value, and keep
      // the warning out of the test output
      const warn = vi.spyOn(Logger, "warn").mockImplementation(() => {});

      expect(parseRateLimitMultiplier(raw)).toBe(
        DEFAULT_RATE_LIMIT_MULTIPLIER
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("RATE_LIMIT_MULTIPLIER")
      );
    }
  );
});

describe("scaleRateLimit", () => {
  it("multiplies the stock limit", () => {
    expect(scaleRateLimit(30, 10)).toBe(300);
    expect(scaleRateLimit(60, 1)).toBe(60);
  });

  it("rounds to a whole number of requests", () => {
    expect(scaleRateLimit(30, 1.5)).toBe(45);
    expect(scaleRateLimit(10, 0.25)).toBe(3);
  });

  it("never drops below one request per window", () => {
    expect(scaleRateLimit(10, 0.01)).toBe(1);
  });
});
