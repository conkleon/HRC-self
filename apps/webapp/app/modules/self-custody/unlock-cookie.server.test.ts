// @vitest-environment node
/**
 * Tests for the self-service unlock cookie: a phone that entered the right
 * PIN stays unlocked for that workspace until the PIN changes.
 *
 * @see {@link file://./unlock-cookie.server.ts}
 */
import { describe, expect, it } from "vitest";

import { isUnlocked, serializeUnlockCookie } from "./unlock-cookie.server";

const orgA = { id: "org-a", selfCustodyPinUpdatedAt: new Date("2026-10-01") };
const orgB = { id: "org-b", selfCustodyPinUpdatedAt: new Date("2026-10-01") };

/** Turns a Set-Cookie header into the request a browser would send next. */
function requestWith(setCookie: string | null): Request {
  const headers = new Headers();
  if (setCookie) headers.set("Cookie", setCookie.split(";")[0]);
  return new Request("http://localhost/qr/abc/self-custody", { headers });
}

describe("self-service unlock cookie", () => {
  it("is unlocked with a cookie for the current PIN version", async () => {
    const cookie = await serializeUnlockCookie(orgA);
    await expect(isUnlocked(requestWith(cookie), orgA)).resolves.toBe(true);
  });

  it("is locked with no cookie at all", async () => {
    await expect(isUnlocked(requestWith(null), orgA)).resolves.toBe(false);
  });

  it("is locked when the PIN has changed since the cookie was issued", async () => {
    const cookie = await serializeUnlockCookie(orgA);
    const pinChanged = {
      ...orgA,
      selfCustodyPinUpdatedAt: new Date("2026-10-21"),
    };
    await expect(isUnlocked(requestWith(cookie), pinChanged)).resolves.toBe(
      false
    );
  });

  it("is locked for a different workspace", async () => {
    const cookie = await serializeUnlockCookie(orgA);
    await expect(isUnlocked(requestWith(cookie), orgB)).resolves.toBe(false);
  });

  it("keeps earlier workspaces unlocked when a second one is unlocked", async () => {
    const first = await serializeUnlockCookie(orgA);
    const second = await serializeUnlockCookie(orgB, requestWith(first));
    await expect(isUnlocked(requestWith(second), orgA)).resolves.toBe(true);
    await expect(isUnlocked(requestWith(second), orgB)).resolves.toBe(true);
  });

  it("is locked with a tampered cookie", async () => {
    const cookie = await serializeUnlockCookie(orgA);
    const [name, value] = cookie.split(";")[0].split("=");
    const tampered = `${name}=${value.slice(0, -2)}xx`;
    await expect(isUnlocked(requestWith(tampered), orgA)).resolves.toBe(false);
  });

  it("lasts 12 hours and reaches both the scan page and the browse page", async () => {
    const cookie = await serializeUnlockCookie(orgA);
    expect(cookie).toContain("Max-Age=43200");
    expect(cookie).toMatch(/Path=\/(;|$)/);
    expect(cookie).toContain("HttpOnly");
  });
});
