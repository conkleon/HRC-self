// @vitest-environment node
/**
 * Tests for the manager alert sent after a self-service take or return.
 *
 * @see {@link file://./notify.server.ts}
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// why: sendEmail makes external network calls
const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));
vi.mock("~/emails/mail.server", () => ({ sendEmail: mockSendEmail }));

// why: the audience is a database query; its role filter is pinned by the permissions tests
const { mockAudience } = vi.hoisted(() => ({ mockAudience: vi.fn() }));
vi.mock("~/modules/organization/service.server", () => ({
  getOrganizationNotificationAudience: mockAudience,
}));

// why: Logger makes external calls
const { mockLoggerError } = vi.hoisted(() => ({ mockLoggerError: vi.fn() }));
vi.mock("~/utils/logger", () => ({ Logger: { error: mockLoggerError } }));

// why: env vars are read at import time
vi.mock("~/utils/env", () => ({
  APP_NAME: "",
  INSTANCE_NAME: "",
  BRANDING_DIR: "",
  BRAND_PRIMARY_COLOR: "",
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

import { sendSelfCustodyAlert } from "./notify.server";

const alert = {
  organizationId: "org-1",
  workspaceName: "Hellenic Red Cross",
  kind: "taken" as const,
  assetId: "asset-1",
  assetTitle: "Radio #12",
  volunteerName: "Maria P.",
  source: "scan" as const,
};

describe("sendSelfCustodyAlert", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emails every member of the self-service audience", async () => {
    mockAudience.mockResolvedValue([
      {
        id: "u1",
        email: "eleni@example.org",
        firstName: "Eleni",
        lastName: "K",
        displayName: null,
      },
      {
        id: "u2",
        email: "kostas@example.org",
        firstName: "Kostas",
        lastName: "M",
        displayName: "Kostas M.",
      },
    ]);

    await sendSelfCustodyAlert(alert);

    expect(mockAudience).toHaveBeenCalledWith({
      organizationId: "org-1",
      audience: "selfCustodyAlerts",
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const first = mockSendEmail.mock.calls[0][0];
    expect(first.to).toBe("eleni@example.org");
    expect(first.subject).toBe("Maria P. took Radio #12");
    expect(first.text).toContain("Hey Eleni,");
    expect(first.text).toContain("https://assets.example.org/assets/asset-1");
    expect(mockSendEmail.mock.calls[1][0].text).toContain("Hey Kostas M.,");
  });

  it("says the item was picked from the list when it was", async () => {
    mockAudience.mockResolvedValue([
      {
        id: "u1",
        email: "eleni@example.org",
        firstName: "Eleni",
        lastName: "K",
        displayName: null,
      },
    ]);

    await sendSelfCustodyAlert({ ...alert, source: "list" });

    const { text } = mockSendEmail.mock.calls[0][0];
    expect(text).toContain(
      "Maria P. took Radio #12 into their custody from the self-service list."
    );
    expect(text).not.toContain("scanning");
  });

  it("sends nothing when the audience is empty", async () => {
    mockAudience.mockResolvedValue([]);
    await sendSelfCustodyAlert(alert);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("logs and does not throw when the audience lookup fails", async () => {
    mockAudience.mockRejectedValue(new Error("db down"));
    await expect(sendSelfCustodyAlert(alert)).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
