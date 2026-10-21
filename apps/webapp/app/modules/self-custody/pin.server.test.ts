// @vitest-environment node
/**
 * Tests for the self-service workspace PIN: validation, hashing, verification.
 *
 * @see {@link file://./pin.server.ts}
 */
import { describe, expect, it } from "vitest";

import { PinSchema, hashPin, verifyPin } from "./pin.server";

describe("PinSchema", () => {
  it("accepts 4 to 8 digits", () => {
    expect(PinSchema.safeParse("1234").success).toBe(true);
    expect(PinSchema.safeParse("12345678").success).toBe(true);
  });

  it('rejects "123", "123456789" and "12a4"', () => {
    for (const pin of ["123", "123456789", "12a4"]) {
      const result = PinSchema.safeParse(pin);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Use 4 to 8 digits");
    }
  });
});

describe("hashPin / verifyPin", () => {
  it("verifies the right PIN and rejects a wrong one", async () => {
    const stored = await hashPin("4821");
    await expect(verifyPin("4821", stored)).resolves.toBe(true);
    await expect(verifyPin("4822", stored)).resolves.toBe(false);
  });

  it("never stores the PIN itself", async () => {
    const stored = await hashPin("4821");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("4821");
  });

  it("produces a different hash for the same PIN twice (salted)", async () => {
    const [a, b] = await Promise.all([hashPin("4821"), hashPin("4821")]);
    expect(a).not.toBe(b);
    await expect(verifyPin("4821", a)).resolves.toBe(true);
    await expect(verifyPin("4821", b)).resolves.toBe(true);
  });

  it("rejects a null or malformed stored hash", async () => {
    await expect(verifyPin("4821", null)).resolves.toBe(false);
    await expect(verifyPin("4821", "")).resolves.toBe(false);
    await expect(verifyPin("4821", "scrypt$nothex$zz")).resolves.toBe(false);
    await expect(verifyPin("4821", "bcrypt$aa$bb")).resolves.toBe(false);
  });
});
