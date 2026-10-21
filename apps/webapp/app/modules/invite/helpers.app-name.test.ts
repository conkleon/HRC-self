import { afterEach, describe, expect, it, vi } from "vitest";
import type { InviteWithInviterAndOrg } from "./types";

/** env.ts reads `process.env` at import, so each case imports a fresh copy. */
async function load(appName: string | undefined) {
  vi.stubEnv("APP_NAME", appName ?? "");
  vi.resetModules();
  return import("./helpers");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

const invite = {
  id: "invite-1",
  inviter: { firstName: "Sam", lastName: "Lee", displayName: "Sam Lee" },
  organization: { name: "Patras Branch", customEmailFooter: null },
} as unknown as InviteWithInviterAndOrg;

describe("inviteEmailText", () => {
  it("names the configured app in the invitation and sign-off", async () => {
    const { inviteEmailText } = await load("HRC Assets");
    const text = inviteEmailText({ invite, token: "t" });
    expect(text).toContain("invites you to join HRC Assets as a member");
    expect(text).toContain("The HRC Assets Team");
    expect(text).not.toContain("Shelf");
  });

  it("says Shelf when APP_NAME is unset", async () => {
    const { inviteEmailText } = await load(undefined);
    expect(inviteEmailText({ invite, token: "t" })).toContain("The Shelf Team");
  });
});
