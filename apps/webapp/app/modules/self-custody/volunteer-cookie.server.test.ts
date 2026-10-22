// @vitest-environment node
/**
 * Tests for the remembered-volunteer cookie: a phone keeps the volunteer it
 * chose per workspace, for the longest lifetime browsers allow, until it is
 * told to forget.
 *
 * @see {@link file://./volunteer-cookie.server.ts}
 */
import { describe, expect, it } from "vitest";

import {
  getRememberedVolunteerId,
  serializeForgottenVolunteer,
  serializeRememberedVolunteer,
} from "./volunteer-cookie.server";

/** Turns a Set-Cookie header into the request a browser would send next. */
function requestWith(setCookie: string | null): Request {
  const headers = new Headers();
  if (setCookie) headers.set("Cookie", setCookie.split(";")[0]);
  return new Request("http://localhost/self-service/tok", { headers });
}

const remember = (request: Request, organizationId: string, id: string) =>
  serializeRememberedVolunteer({
    request,
    organizationId,
    teamMemberId: id,
  });

describe("remembered volunteer cookie", () => {
  it("remembers nobody without a cookie", async () => {
    await expect(
      getRememberedVolunteerId(requestWith(null), "org-a")
    ).resolves.toBeNull();
  });

  it("remembers the chosen volunteer for 400 days, site-wide and http-only", async () => {
    const cookie = await remember(requestWith(null), "org-a", "tm-1");

    expect(cookie).toMatch(/Max-Age=34560000/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/HttpOnly/);
    await expect(
      getRememberedVolunteerId(requestWith(cookie), "org-a")
    ).resolves.toBe("tm-1");
  });

  it("keeps one volunteer per workspace", async () => {
    const first = await remember(requestWith(null), "org-a", "tm-1");
    const both = await remember(requestWith(first), "org-b", "tm-9");

    await expect(
      getRememberedVolunteerId(requestWith(both), "org-a")
    ).resolves.toBe("tm-1");
    await expect(
      getRememberedVolunteerId(requestWith(both), "org-b")
    ).resolves.toBe("tm-9");
  });

  it("forgets one workspace's volunteer and keeps the others", async () => {
    const first = await remember(requestWith(null), "org-a", "tm-1");
    const both = await remember(requestWith(first), "org-b", "tm-9");
    const forgotten = await serializeForgottenVolunteer({
      request: requestWith(both),
      organizationId: "org-a",
    });

    await expect(
      getRememberedVolunteerId(requestWith(forgotten), "org-a")
    ).resolves.toBeNull();
    await expect(
      getRememberedVolunteerId(requestWith(forgotten), "org-b")
    ).resolves.toBe("tm-9");
  });

  it("ignores a cookie that was not signed by this server", async () => {
    const forged = `__selfCustodyVolunteer=${Buffer.from(
      JSON.stringify({ "org-a": "tm-attacker" })
    ).toString("base64")}`;
    await expect(
      getRememberedVolunteerId(requestWith(forged), "org-a")
    ).resolves.toBeNull();
  });
});
