/**
 * Tests for the email managers receive when a volunteer takes or returns an
 * item by self-service scan.
 *
 * @see {@link file://./self-custody-alert.tsx}
 */
import { describe, expect, it, vi } from "vitest";

// why: env vars are read at import time; shelf.config.ts also imports from this module
vi.mock("~/utils/env", () => ({
  SERVER_URL: "https://assets.example.org",
  SUPPORT_EMAIL: "it@example.org",
  SEND_ONBOARDING_EMAIL: false,
  ENABLE_PREMIUM_FEATURES: false,
  FREE_TRIAL_DAYS: "7",
  DISABLE_SIGNUP: false,
  DISABLE_SSO: false,
  ENABLE_SCIM: false,
  SHOW_HOW_DID_YOU_FIND_US: false,
  COLLECT_BUSINESS_INTEL: false,
  GEOCODING_USER_AGENT: "",
}));

import {
  selfCustodyAlertHtml,
  selfCustodyAlertSubject,
  selfCustodyAlertText,
} from "./self-custody-alert";
import type { SelfCustodyAlertProps } from "./self-custody-alert";

const base: SelfCustodyAlertProps = {
  firstName: "Eleni",
  kind: "taken",
  assetTitle: "Radio #12",
  assetUrl: "https://assets.example.org/assets/asset-1",
  volunteerName: "Maria P.",
  workspaceName: "Hellenic Red Cross",
};

describe("self-custody alert email", () => {
  it("names the volunteer and the item in the subject", () => {
    expect(selfCustodyAlertSubject(base)).toBe("Maria P. took Radio #12");
    expect(selfCustodyAlertSubject({ ...base, kind: "returned" })).toBe(
      "Maria P. returned Radio #12"
    );
  });

  it("renders the volunteer, the item and a link to it when taken", async () => {
    const html = await selfCustodyAlertHtml(base);
    expect(html).toContain("Hey Eleni,");
    expect(html).toContain("Maria P.");
    expect(html).toContain("Radio #12");
    expect(html).toContain("into their custody by scanning its QR code");
    expect(html).toContain('href="https://assets.example.org/assets/asset-1"');
    expect(html).toContain("View item");
    expect(html).toContain("The Shelf Team");
  });

  it("renders the return wording when returned", async () => {
    const html = await selfCustodyAlertHtml({ ...base, kind: "returned" });
    expect(html).toContain("returned");
    expect(html).not.toContain("into their custody");
  });

  it("escapes a volunteer name that contains HTML", async () => {
    const html = await selfCustodyAlertHtml({
      ...base,
      volunteerName: "<script>x</script>",
    });
    expect(html).not.toContain("<script>x</script>");
  });

  it("text version carries the same facts", () => {
    const text = selfCustodyAlertText(base);
    expect(text).toContain("Hey Eleni,");
    expect(text).toContain(
      "Maria P. took Radio #12 into their custody by scanning its QR code."
    );
    expect(text).toContain("https://assets.example.org/assets/asset-1");
    expect(text).toContain("Hellenic Red Cross");
    expect(text).toContain("The Shelf Team");
  });

  it("greets without a name when there is none", () => {
    expect(selfCustodyAlertText({ ...base, firstName: null })).toMatch(/^Hey,/);
  });
});
