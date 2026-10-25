// @vitest-environment node
/**
 * Tests for the custody notices emailed when staff assign or release custody:
 * who receives one, what it lists, and that it never fails the change.
 *
 * @see {@link file://./notify.server.ts}
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// why: sendEmail makes external network calls
const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));
vi.mock("~/emails/mail.server", () => ({ sendEmail: mockSendEmail }));

// why: custodians, the actor and the workspace are database reads
const { mockTeamMembers, mockUser, mockOrganization } = vi.hoisted(() => ({
  mockTeamMembers: vi.fn(),
  mockUser: vi.fn(),
  mockOrganization: vi.fn(),
}));
vi.mock("~/database/db.server", () => ({
  db: {
    teamMember: { findMany: mockTeamMembers },
    user: { findUnique: mockUser },
    organization: { findUnique: mockOrganization },
  },
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

import { CUSTODY_NOTICE_ITEMS_LIMIT } from "~/emails/custody-notice";
import { sendCustodyNotices } from "./notify.server";

/** The staff member making the change. */
const ADMIN = "user-admin";

/** A registered custodian's team member row. */
const registered = {
  id: "tm-user",
  name: "Kostas M.",
  email: null,
  user: {
    id: "user-kostas",
    email: "kostas@example.org",
    firstName: "Kostas",
    lastName: "M",
    displayName: null,
  },
};

/** A non-registered custodian with an email. */
const nrm = {
  id: "tm-nrm",
  name: "Maria P.",
  email: "maria@example.org",
  user: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({
    email: "eleni@example.org",
    firstName: "Eleni",
    lastName: "K",
    displayName: null,
  });
  mockOrganization.mockResolvedValue({ name: "Hellenic Red Cross" });
});

describe("sendCustodyNotices", () => {
  it("emails a registered custodian the items, each linked", async () => {
    mockTeamMembers.mockResolvedValue([registered]);

    await sendCustodyNotices({
      organizationId: "org-1",
      actorUserId: ADMIN,
      kind: "assigned",
      changes: [
        { teamMemberId: "tm-user", assetId: "a1", title: "Radio #12" },
        { teamMemberId: "tm-user", assetId: "a2", title: "Radio #13" },
      ],
    });

    expect(mockTeamMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["tm-user"] },
          organizationId: "org-1",
          deletedAt: null,
        },
      })
    );
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const email = mockSendEmail.mock.calls[0][0];
    expect(email.to).toBe("kostas@example.org");
    expect(email.subject).toBe("You now have custody of 2 items");
    expect(email.text).toContain("Hey Kostas,");
    expect(email.text).toContain(
      "Eleni K gave you custody of these items in Hellenic Red Cross:"
    );
    expect(email.text).toContain(
      "- Radio #12 (https://assets.example.org/assets/a1)"
    );
    expect(email.text).toContain(
      "- Radio #13 (https://assets.example.org/assets/a2)"
    );
    expect(email.html).toContain('href="https://assets.example.org/assets/a1"');
  });

  it("emails a non-registered custodian at their own email, with no links", async () => {
    mockTeamMembers.mockResolvedValue([nrm]);

    await sendCustodyNotices({
      organizationId: "org-1",
      actorUserId: ADMIN,
      kind: "released",
      changes: [{ teamMemberId: "tm-nrm", assetId: "a1", title: "Radio #12" }],
    });

    const email = mockSendEmail.mock.calls[0][0];
    expect(email.to).toBe("maria@example.org");
    expect(email.subject).toBe("Custody of Radio #12 released");
    expect(email.text).toContain("Hey Maria P.,");
    expect(email.text).toContain("- Radio #12\n");
    expect(email.text).not.toContain("https://");
    expect(email.html).not.toMatch(/<a\s/);
  });

  it("lists a kit's contents under the kit", async () => {
    mockTeamMembers.mockResolvedValue([nrm]);

    await sendCustodyNotices({
      organizationId: "org-1",
      actorUserId: ADMIN,
      kind: "assigned",
      changes: [
        {
          teamMemberId: "tm-nrm",
          kitId: "kit-1",
          title: "Trauma kit",
          contents: ["Tourniquet", "Bandages"],
        },
      ],
    });

    const { text, html } = mockSendEmail.mock.calls[0][0];
    expect(text).toContain("- Trauma kit\n    - Tourniquet\n    - Bandages");
    expect(html).toContain("Tourniquet");
  });

  it("sends each custodian one email with only their own items", async () => {
    mockTeamMembers.mockResolvedValue([registered, nrm]);

    await sendCustodyNotices({
      organizationId: "org-1",
      actorUserId: ADMIN,
      kind: "released",
      changes: [
        { teamMemberId: "tm-user", assetId: "a1", title: "Radio #12" },
        { teamMemberId: "tm-nrm", assetId: "a2", title: "Stretcher" },
      ],
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const [toKostas, toMaria] = mockSendEmail.mock.calls.map(([e]) => e);
    expect(toKostas.text).toContain("Radio #12");
    expect(toKostas.text).not.toContain("Stretcher");
    expect(toMaria.text).toContain("Stretcher");
    expect(toMaria.text).not.toContain("Radio #12");
  });

  it("never emails the staff member who assigned to themselves", async () => {
    mockTeamMembers.mockResolvedValue([
      { ...registered, user: { ...registered.user, id: ADMIN } },
    ]);

    await sendCustodyNotices({
      organizationId: "org-1",
      actorUserId: ADMIN,
      kind: "assigned",
      changes: [{ teamMemberId: "tm-user", assetId: "a1", title: "Radio #12" }],
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips a non-registered custodian without an email", async () => {
    mockTeamMembers.mockResolvedValue([{ ...nrm, email: null }]);

    await sendCustodyNotices({
      organizationId: "org-1",
      actorUserId: ADMIN,
      kind: "assigned",
      changes: [{ teamMemberId: "tm-nrm", assetId: "a1", title: "Radio #12" }],
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("names the first items and counts the rest", async () => {
    mockTeamMembers.mockResolvedValue([nrm]);
    const changes = Array.from(
      { length: CUSTODY_NOTICE_ITEMS_LIMIT + 3 },
      (_, i) => ({
        teamMemberId: "tm-nrm",
        assetId: `a${i}`,
        title: `Radio #${i}`,
      })
    );

    await sendCustodyNotices({
      organizationId: "org-1",
      actorUserId: ADMIN,
      kind: "assigned",
      changes,
    });

    const { text } = mockSendEmail.mock.calls[0][0];
    expect(text).toContain(`Radio #${CUSTODY_NOTICE_ITEMS_LIMIT - 1}`);
    expect(text).not.toContain(`Radio #${CUSTODY_NOTICE_ITEMS_LIMIT}\n`);
    expect(text).toContain("- and 3 more");
  });

  it("logs and does not throw when a lookup fails", async () => {
    mockTeamMembers.mockRejectedValue(new Error("db down"));

    await expect(
      sendCustodyNotices({
        organizationId: "org-1",
        actorUserId: ADMIN,
        kind: "assigned",
        changes: [
          { teamMemberId: "tm-nrm", assetId: "a1", title: "Radio #12" },
        ],
      })
    ).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
