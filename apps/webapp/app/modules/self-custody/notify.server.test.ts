// @vitest-environment node
/**
 * Tests for the emails sent after a self-service take or return: the manager
 * alert, and the volunteer's own receipt.
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

// why: the volunteer's email is read from the database
const { mockFindVolunteer } = vi.hoisted(() => ({
  mockFindVolunteer: vi.fn(),
}));
vi.mock("~/database/db.server", () => ({
  db: { teamMember: { findFirst: mockFindVolunteer } },
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
  volunteerTeamMemberId: "tm-1",
  source: "scan" as const,
};

describe("sendSelfCustodyAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A volunteer with no email: only the managers are emailed
    mockFindVolunteer.mockResolvedValue({ email: null });
  });

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

  it("links a kit's alert to the kit page", async () => {
    mockAudience.mockResolvedValue([
      {
        id: "u1",
        email: "eleni@example.org",
        firstName: "Eleni",
        lastName: "K",
        displayName: null,
      },
    ]);

    await sendSelfCustodyAlert({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      kind: "taken",
      kitId: "kit-1",
      assetTitle: "Trauma kit",
      volunteerName: "Maria P.",
      volunteerTeamMemberId: "tm-1",
      source: "list",
    });

    const { text } = mockSendEmail.mock.calls[0][0];
    expect(text).toContain("https://assets.example.org/kits/kit-1");
    expect(text).toContain("Maria P. took Trauma kit into their custody");
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

  describe("volunteer receipt", () => {
    beforeEach(() => mockAudience.mockResolvedValue([]));

    it("emails the volunteer a receipt with no links when they have an email", async () => {
      mockFindVolunteer.mockResolvedValue({ email: "maria@example.org" });

      await sendSelfCustodyAlert(alert);

      expect(mockFindVolunteer).toHaveBeenCalledWith({
        where: {
          id: "tm-1",
          organizationId: "org-1",
          userId: null,
          deletedAt: null,
        },
        select: { email: true },
      });
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const receipt = mockSendEmail.mock.calls[0][0];
      expect(receipt.to).toBe("maria@example.org");
      expect(receipt.subject).toBe("You took Radio #12");
      expect(receipt.text).toContain("Hey Maria P.,");
      expect(receipt.text).toContain(
        "You took Radio #12 into your custody from Hellenic Red Cross."
      );
      expect(receipt.text).not.toContain("https://");
      // No links at all: the logo image is the only thing loaded from the server
      expect(receipt.html).not.toMatch(/<a\s/);
    });

    it("confirms a return", async () => {
      mockFindVolunteer.mockResolvedValue({ email: "maria@example.org" });

      await sendSelfCustodyAlert({ ...alert, kind: "returned" });

      const receipt = mockSendEmail.mock.calls[0][0];
      expect(receipt.subject).toBe("You returned Radio #12");
      expect(receipt.text).toContain("It is no longer in your custody.");
    });

    it("sends no receipt to a volunteer without an email, or one not found", async () => {
      mockFindVolunteer.mockResolvedValueOnce({ email: null });
      await sendSelfCustodyAlert(alert);
      mockFindVolunteer.mockResolvedValueOnce(null);
      await sendSelfCustodyAlert(alert);

      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("still alerts the managers when the receipt lookup fails", async () => {
      mockAudience.mockResolvedValue([
        {
          id: "u1",
          email: "eleni@example.org",
          firstName: "Eleni",
          lastName: "K",
          displayName: null,
        },
      ]);
      mockFindVolunteer.mockRejectedValue(new Error("db down"));

      await expect(sendSelfCustodyAlert(alert)).resolves.toBeUndefined();

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail.mock.calls[0][0].to).toBe("eleni@example.org");
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
    });
  });
});
