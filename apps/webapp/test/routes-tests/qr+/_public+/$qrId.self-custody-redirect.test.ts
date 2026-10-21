// @vitest-environment node
/**
 * Public QR page (`/qr/:qrId`): where an anonymous scan goes when the
 * workspace has self-service custody turned on.
 *
 * @see {@link file://./../../../../app/routes/qr+/_public+/$qrId.tsx}
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetQr, mockEnabled } = vi.hoisted(() => ({
  mockGetQr: vi.fn(),
  mockEnabled: vi.fn(),
}));

// why: the QR lookup reads the database.
vi.mock("~/modules/qr/service.server", () => ({ getQr: mockGetQr }));

// why: reads the workspace's self-service switch from the database.
vi.mock("~/modules/self-custody/settings.server", () => ({
  isSelfCustodyEnabled: mockEnabled,
}));

// why: recording writes to the database; covered by $qrId.records-scan.test.ts
vi.mock("~/modules/scan/service.server", () => ({
  recordScanNonFatal: vi.fn().mockResolvedValue({ id: "scan-1" }),
  updateScan: vi.fn(),
  updateScanGeolocation: vi.fn(),
}));

// why: the caller's workspaces are read from the database.
vi.mock("~/modules/organization/service.server", () => ({
  getUserOrganizations: vi
    .fn()
    .mockResolvedValue([{ organization: { id: "org-1", type: "TEAM" } }]),
}));

// why: the workspace cookie is signed; its value is not under test.
vi.mock("~/modules/organization/context.server", () => ({
  setSelectedOrganizationIdCookie: vi.fn().mockResolvedValue("org=org-1"),
}));

// why: importing the route pulls in `db.server`, whose initialization would
// otherwise open a real PostgreSQL connection.
vi.mock("~/database/db.server", () => ({ db: { $connect: vi.fn() } }));

import { loader } from "~/routes/qr+/_public+/$qrId";

async function open({ signedIn }: { signedIn: boolean }) {
  return (await loader({
    request: new Request("http://localhost/qr/qr-1"),
    params: { qrId: "qr-1" },
    context: {
      isAuthenticated: signedIn,
      getSession: () => ({ userId: "user-1" }),
    },
  } as unknown as Parameters<typeof loader>[0])) as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetQr.mockResolvedValue({
    id: "qr-1",
    assetId: "asset-1",
    kitId: null,
    organizationId: "org-1",
  });
  mockEnabled.mockResolvedValue(true);
});

describe("anonymous scan with self-service custody", () => {
  it("sends an anonymous scan to self-custody when the workspace enables it", async () => {
    const response = await open({ signedIn: false });
    expect(response.headers.get("Location")).toBe("self-custody?scanId=scan-1");
    expect(mockEnabled).toHaveBeenCalledWith("org-1");
  });

  it("keeps the not-logged-in page when self-service is off", async () => {
    mockEnabled.mockResolvedValue(false);
    const response = await open({ signedIn: false });
    expect(response.headers.get("Location")).toMatch(/^not-logged-in\?/);
  });

  it("keeps the not-logged-in page for an unclaimed QR", async () => {
    mockGetQr.mockResolvedValue({
      id: "qr-1",
      assetId: null,
      kitId: null,
      organizationId: null,
    });
    const response = await open({ signedIn: false });
    expect(response.headers.get("Location")).toMatch(/^not-logged-in\?/);
    expect(mockEnabled).not.toHaveBeenCalled();
  });

  it("does not change the flow for a logged-in user", async () => {
    const response = await open({ signedIn: true });
    expect(response.headers.get("Location")).toMatch(/^\/assets\/asset-1/);
    expect(mockEnabled).not.toHaveBeenCalled();
  });
});
