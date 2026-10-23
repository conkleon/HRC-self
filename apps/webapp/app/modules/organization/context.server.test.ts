/**
 * Resolving the selected workspace for an SSO user with no workspace at all.
 *
 * SSO users never see their personal workspace, so one with no team workspace
 * has nowhere to land and is sent to the pending-assignment page. That decision
 * needs to know the user is SSO even when they hold no membership to read the
 * flag from.
 *
 * Also pins that the resolved workspaces carry the EFFECTIVE barcode
 * entitlement, so every loader and the client agree with `canUseBarcodes`.
 *
 * @see {@link file://./context.server.ts}
 * @see {@link file://./service.server.ts} isSsoUser
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ShelfConfig from "~/config/shelf.config";

import { db } from "~/database/db.server";

import { getSelectedOrganization } from "./context.server";
import type * as OrganizationService from "./service.server";
import { getUserOrganizations } from "./service.server";

// @vitest-environment node

// why: the user row is read only when there are no memberships; no database in
// a unit test.
vi.mock("~/database/db.server", () => ({
  db: { user: { findUnique: vi.fn() } },
}));

// why: the membership read is the input these cases vary. `isSsoUser` stays
// real — it is the decision under test.
vi.mock("./service.server", async (importOriginal) => {
  const actual = await importOriginal<typeof OrganizationService>();
  return { ...actual, getUserOrganizations: vi.fn() };
});

const request = () => new Request("http://localhost/assets");

describe("getSelectedOrganization — no memberships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserOrganizations).mockResolvedValue([]);
  });

  it("flags an SSO user with no workspace for the pending-assignment page", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ sso: true } as never);

    const result = await getSelectedOrganization({
      userId: "user-1",
      request: request(),
    });

    expect(result.noVisibleOrganizations).toBe(true);
  });

  it("does not flag a password user with no workspace", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ sso: false } as never);

    const result = await getSelectedOrganization({
      userId: "user-1",
      request: request(),
    }).catch((cause: unknown) => ({
      noVisibleOrganizations: undefined,
      cause,
    }));

    expect(result.noVisibleOrganizations).not.toBe(true);
  });
});

describe("getSelectedOrganization: barcode entitlement", () => {
  /** A password user with one team workspace that has not bought the add-on. */
  const membership = {
    organizationId: "org-1",
    roles: [],
    organization: { id: "org-1", type: "TEAM", barcodesEnabled: false },
    user: { sso: false, lastSelectedOrganizationId: "org-1" },
  };

  /**
   * Loads a fresh `context.server` with premium features on or off.
   * `premiumIsEnabled` is read once at import, so each case needs its own load.
   *
   * @param enablePremium - The `ENABLE_PREMIUM_FEATURES` value for this load
   */
  async function loadGetSelectedOrganization(enablePremium: boolean) {
    vi.resetModules();
    // why: premium features are read once at import; each case picks its value
    vi.doMock("~/config/shelf.config", async (importOriginal) => {
      const actual = await importOriginal<typeof ShelfConfig>();
      return {
        ...actual,
        config: { ...actual.config, enablePremiumFeatures: enablePremium },
      };
    });
    const service = await import("./service.server");
    vi.mocked(service.getUserOrganizations).mockResolvedValue([
      membership,
    ] as never);
    const context = await import("./context.server");
    return context.getSelectedOrganization;
  }

  it("grants barcodes to every workspace when premium features are off", async () => {
    const getSelected = await loadGetSelectedOrganization(false);

    const { currentOrganization, organizations } = await getSelected({
      userId: "user-1",
      request: request(),
    });

    expect(currentOrganization.barcodesEnabled).toBe(true);
    expect(organizations.every((org) => org.barcodesEnabled)).toBe(true);
  });

  it("keeps the add-on flag when premium features are on", async () => {
    const getSelected = await loadGetSelectedOrganization(true);

    const { currentOrganization } = await getSelected({
      userId: "user-1",
      request: request(),
    });

    expect(currentOrganization.barcodesEnabled).toBe(false);
  });
});
