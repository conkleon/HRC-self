// @vitest-environment node
/**
 * Public self-service browse page (`/self-service/:token`): the HTTP wiring
 * between a volunteer's phone and the self-custody services. The PIN,
 * lockout and unlock cookie run for real; the database-backed services are
 * stubbed and have their own tests.
 *
 * @see {@link file://./../../../app/routes/self-service+/$token.tsx}
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetWorkspace,
  mockOffered,
  mockMine,
  mockFilterOptions,
  mockTake,
  mockReturn,
  mockTakeKit,
  mockReturnKit,
  mockTakeUnits,
  mockReturnUnits,
  mockSearch,
  mockFindOrCreate,
  mockGetVolunteer,
  mockFindLocations,
  mockScanned,
} = vi.hoisted(() => ({
  mockGetWorkspace: vi.fn(),
  mockOffered: vi.fn(),
  mockMine: vi.fn(),
  mockFilterOptions: vi.fn(),
  mockTake: vi.fn(),
  mockReturn: vi.fn(),
  mockTakeKit: vi.fn(),
  mockReturnKit: vi.fn(),
  mockTakeUnits: vi.fn(),
  mockReturnUnits: vi.fn(),
  mockSearch: vi.fn(),
  mockFindOrCreate: vi.fn(),
  mockGetVolunteer: vi.fn(),
  mockFindLocations: vi.fn(),
  mockScanned: vi.fn(),
}));

// why: the browse reads query the database; covered by browse.server.test.ts
vi.mock("~/modules/self-custody/browse.server", () => ({
  getBrowseWorkspace: mockGetWorkspace,
  listOfferedItems: mockOffered,
  listVolunteerItems: mockMine,
  listBrowseFilterOptions: mockFilterOptions,
}));

// why: take and return write the database; covered by custody.server.test.ts
vi.mock("~/modules/self-custody/custody.server", () => ({
  getScannedCodeState: mockScanned,
  selfTakeCustody: mockTake,
  selfReturnCustody: mockReturn,
}));

// why: kit take and return write the database; covered by kit-custody.server.test.ts
vi.mock("~/modules/self-custody/kit-custody.server", () => ({
  selfTakeKitCustody: mockTakeKit,
  selfReturnKitCustody: mockReturnKit,
}));

// why: unit take and return write the database; covered by quantity.server.test.ts
vi.mock("~/modules/self-custody/quantity.server", () => ({
  selfTakeQuantity: mockTakeUnits,
  selfReturnQuantity: mockReturnUnits,
}));

// why: lookups read the database; the name schema stays real
vi.mock("~/modules/self-custody/volunteers.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/modules/self-custody/volunteers.server")
  >()),
  searchVolunteers: mockSearch,
  findOrCreateVolunteer: mockFindOrCreate,
  getVolunteer: mockGetVolunteer,
}));

// why: importing the route pulls in `db.server`, whose initialization would
// otherwise open a real PostgreSQL connection. The location tree is the one
// read the real offer module makes, to widen chosen locations.
vi.mock("~/database/db.server", () => ({
  db: { $connect: vi.fn(), location: { findMany: mockFindLocations } },
}));

import { resetLockoutsForTests } from "~/modules/self-custody/lockout.server";
import { hashPin } from "~/modules/self-custody/pin.server";
import { action, loader } from "~/routes/self-service+/$token";

const PIN = "4821";
let pinHash = "";

const organization = (overrides: Record<string, unknown> = {}) => ({
  id: "org-1",
  name: "Hellenic Red Cross",
  selfCustodyEnabled: true,
  selfCustodyPinHash: pinHash,
  selfCustodyPinUpdatedAt: new Date("2026-10-01"),
  selfCustodyTagId: "tag-ss",
  selfCustodyLocations: [],
  ...overrides,
});

/** What the default workspace offers: its tag and no location. */
const TAG_OFFER = { tagId: "tag-ss", locationIds: [] };

const maria = { id: "tm-1", name: "Maria P." };
const radio = {
  kind: "item",
  id: "asset-1",
  title: "Radio #12",
  locationName: "Warehouse A",
  categoryName: null,
  itemCount: null,
};
const filterOptions = {
  locations: [{ id: "loc-1", name: "Warehouse A" }],
  categories: [],
};
const offeredPage = { items: [radio], page: 1, totalPages: 1, totalCount: 1 };

const PAGE = "http://localhost/self-service/tok-1";
const args = (request: Request) =>
  ({ request, params: { token: "tok-1" }, context: {} }) as never;

/** A GET from a phone, optionally carrying a cookie. */
function get(search = "", cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  return new Request(`${PAGE}${search}`, { headers });
}

/** A POST from the given client, optionally carrying a cookie. */
function post(
  fields: Record<string, string>,
  { cookie, ip = "203.0.113.7" }: { cookie?: string; ip?: string } = {}
) {
  const headers = new Headers({ "X-Forwarded-For": ip });
  if (cookie) headers.set("Cookie", cookie);
  return new Request(PAGE, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });
}

/** The status and body of a `data(...)` result, or of a Response. */
function read(result: unknown) {
  if (result instanceof Response) return { status: result.status, body: null };
  const r = result as { data: Record<string, any>; init?: { status?: number } };
  return { status: r.init?.status ?? 200, body: r.data };
}

/** The Set-Cookie header of a `data(...)` result or a Response, if any. */
function setCookieOf(result: unknown): string | null {
  if (result instanceof Response) return result.headers.get("Set-Cookie");
  const init = (result as { init?: { headers?: HeadersInit } }).init;
  return init?.headers ? new Headers(init.headers).get("Set-Cookie") : null;
}

/** Joins the name=value parts of several Set-Cookie headers into one Cookie header. */
const cookies = (...setCookies: (string | null)[]) =>
  setCookies
    .filter((c): c is string => Boolean(c))
    .map((c) => c.split(";")[0])
    .join("; ");

/** Unlocks with the right PIN and returns the cookie a browser would send back. */
async function unlock() {
  const response = (await action(
    args(post({ intent: "unlock", pin: PIN }))
  )) as Response;
  const setCookie = response.headers.get("Set-Cookie") ?? "";
  return setCookie.split(";")[0];
}

beforeEach(async () => {
  vi.clearAllMocks();
  resetLockoutsForTests();
  pinHash ||= await hashPin(PIN);
  mockGetWorkspace.mockResolvedValue(organization());
  mockGetVolunteer.mockResolvedValue(maria);
  mockOffered.mockResolvedValue(offeredPage);
  mockMine.mockResolvedValue([]);
  mockFilterOptions.mockResolvedValue(filterOptions);
  mockTakeKit.mockResolvedValue({
    assetTitle: "Trauma kit",
    volunteerName: "Maria P.",
  });
  mockReturnKit.mockResolvedValue({
    assetTitle: "Trauma kit",
    volunteerName: "Maria P.",
  });
  mockTake.mockResolvedValue({
    assetTitle: "Radio #12",
    volunteerName: "Maria P.",
  });
  mockReturn.mockResolvedValue({
    assetTitle: "Radio #12",
    volunteerName: "Maria P.",
  });
  mockTakeUnits.mockResolvedValue({
    assetTitle: "3 × Bandages",
    volunteerName: "Maria P.",
  });
  mockReturnUnits.mockResolvedValue({
    assetTitle: "Bandages (2 back, 1 used)",
    volunteerName: "Maria P.",
  });
});

describe("GET /self-service/:token", () => {
  it("answers 404 for a link that is not valid any more", async () => {
    const { ShelfError } = await import("~/utils/error");
    mockGetWorkspace.mockRejectedValue(
      new ShelfError({
        cause: null,
        message: "This self-service link is not valid any more.",
        label: "Custody",
        status: 404,
      })
    );
    await expect(loader(args(get()))).rejects.toMatchObject({
      init: { status: 404 },
    });
  });

  it("says self-service is off without asking for the PIN", async () => {
    mockGetWorkspace.mockResolvedValue(
      organization({ selfCustodyEnabled: false })
    );
    expect(read(await loader(args(get()))).body).toMatchObject({
      view: "off",
      workspaceName: "Hellenic Red Cross",
    });
  });

  it("shows only the PIN form until the phone is unlocked", async () => {
    const { body } = read(await loader(args(get("?member=tm-1"))));
    expect(body).toMatchObject({ view: "locked" });
    expect(body).not.toHaveProperty("list");
    expect(mockOffered).not.toHaveBeenCalled();
    expect(mockGetVolunteer).not.toHaveBeenCalled();
  });

  it("offers nothing while neither a tag nor a location is chosen", async () => {
    const cookie = await unlock();
    mockGetWorkspace.mockResolvedValue(
      organization({ selfCustodyTagId: null })
    );
    expect(read(await loader(args(get("", cookie)))).body).toMatchObject({
      view: "no-items",
    });
  });

  it("asks who the volunteer is when the URL names nobody, or someone who is not a volunteer here", async () => {
    const cookie = await unlock();
    expect(read(await loader(args(get("", cookie)))).body).toMatchObject({
      view: "identify",
    });

    mockGetVolunteer.mockResolvedValue(null);
    expect(
      read(await loader(args(get("?member=tm-other", cookie)))).body
    ).toMatchObject({ view: "identify" });
    expect(mockGetVolunteer).toHaveBeenLastCalledWith({
      organizationId: "org-1",
      teamMemberId: "tm-other",
    });
    expect(mockOffered).not.toHaveBeenCalled();
  });

  it("lists the volunteer's items and the tagged items they may take", async () => {
    const cookie = await unlock();
    mockMine.mockResolvedValue([{ ...radio, id: "asset-9", title: "Torch" }]);

    const { body } = read(
      await loader(args(get("?member=tm-1&q=%20radio%20&page=2", cookie)))
    );

    expect(body).toMatchObject({
      view: "lists",
      volunteer: maria,
      tab: "take",
      filters: {
        query: "radio",
        kind: "all",
        locationId: null,
        categoryId: null,
      },
      list: offeredPage,
      filterOptions,
      myItems: [{ id: "asset-9", title: "Torch" }],
    });
    expect(mockOffered).toHaveBeenCalledWith({
      organizationId: "org-1",
      offer: TAG_OFFER,
      filters: {
        query: "radio",
        kind: "all",
        locationId: null,
        categoryId: null,
      },
      page: 2,
    });
    expect(mockFilterOptions).toHaveBeenCalledWith({
      organizationId: "org-1",
      offer: TAG_OFFER,
    });
    expect(mockMine).toHaveBeenCalledWith({
      organizationId: "org-1",
      teamMemberId: "tm-1",
    });
  });

  it("offers by location alone, widened to the chosen location's sub-locations", async () => {
    const cookie = await unlock();
    mockGetWorkspace.mockResolvedValue(
      organization({
        selfCustodyTagId: null,
        selfCustodyLocations: [{ id: "loc-depot" }],
      })
    );
    mockFindLocations.mockResolvedValue([
      { id: "loc-depot", parentId: null },
      { id: "loc-shelf", parentId: "loc-depot" },
      { id: "loc-van", parentId: null },
    ]);

    const { body } = read(await loader(args(get("?member=tm-1", cookie))));

    expect(body).toMatchObject({ view: "lists" });
    const offer = { tagId: null, locationIds: ["loc-depot", "loc-shelf"] };
    expect(mockOffered).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", offer })
    );
    expect(mockFindLocations).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } })
    );

    await action(
      args(
        post(
          { intent: "take", assetId: "asset-1", teamMemberId: "tm-1" },
          { cookie }
        )
      )
    );
    expect(mockTake).toHaveBeenCalledWith(
      expect.objectContaining({ requiredOffer: offer })
    );
  });

  it("remembers the volunteer, so the bare link opens their lists next time", async () => {
    const unlockCookie = await unlock();
    const chosen = await loader(args(get("?member=tm-1", unlockCookie)));
    const remembered = setCookieOf(chosen);
    expect(remembered).toMatch(/^__selfCustodyVolunteer=.*Max-Age=34560000/);

    mockGetVolunteer.mockClear();
    const reopened = await loader(
      args(get("", cookies(unlockCookie, remembered)))
    );

    expect(read(reopened).body).toMatchObject({
      view: "lists",
      volunteer: maria,
    });
    // Re-checked as a volunteer of this workspace, and the lifetime renewed.
    expect(mockGetVolunteer).toHaveBeenCalledWith({
      organizationId: "org-1",
      teamMemberId: "tm-1",
    });
    expect(setCookieOf(reopened)).toMatch(/^__selfCustodyVolunteer=/);
  });

  it("forgets a remembered volunteer who is no longer a volunteer here", async () => {
    const unlockCookie = await unlock();
    const remembered = setCookieOf(
      await loader(args(get("?member=tm-1", unlockCookie)))
    );
    mockGetVolunteer.mockResolvedValue(null);

    const reopened = await loader(
      args(get("", cookies(unlockCookie, remembered)))
    );
    expect(read(reopened).body).toMatchObject({ view: "identify" });

    mockGetVolunteer.mockResolvedValue(maria);
    const afterwards = await loader(
      args(get("", cookies(unlockCookie, setCookieOf(reopened))))
    );
    expect(read(afterwards).body).toMatchObject({ view: "identify" });
  });

  it("reads the kind, location and category filters and the tab from the URL", async () => {
    const cookie = await unlock();

    const { body } = read(
      await loader(
        args(
          get(
            "?member=tm-1&tab=mine&kind=kit&location=loc-1&category=cat-1",
            cookie
          )
        )
      )
    );

    expect(body).toMatchObject({ tab: "mine" });
    expect(mockOffered).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          query: "",
          kind: "kit",
          locationId: "loc-1",
          categoryId: "cat-1",
        },
      })
    );
  });

  it("treats an unknown kind or tab as the default", async () => {
    const cookie = await unlock();

    const { body } = read(
      await loader(args(get("?member=tm-1&tab=other&kind=boats", cookie)))
    );

    expect(body).toMatchObject({ tab: "take", filters: { kind: "all" } });
  });
});

/** A scanned kit as `getScannedCodeState` resolves it. */
const scannedKit = {
  kind: "kit",
  id: "kit-1",
  title: "Trauma kit",
  thumbnailImage: null,
  locationName: "Depot",
  itemCount: 4,
};

describe("scanning on /self-service/:token", () => {
  it("resolves the scanned code in the URL within the link's workspace", async () => {
    const cookie = await unlock();
    mockScanned.mockResolvedValue({ kind: "available", item: scannedKit });

    const { body } = read(
      await loader(
        args(get("?member=tm-1&scan=%20qr-kit%20&scanType=qr", cookie))
      )
    );

    expect(mockScanned).toHaveBeenCalledWith({
      organizationId: "org-1",
      code: "qr-kit",
      codeType: "qr",
    });
    expect(body?.scanned).toEqual({
      code: "qr-kit",
      codeType: "qr",
      state: { kind: "available", item: scannedKit },
      heldByYou: false,
    });
  });

  it("tells the volunteer when they hold the scanned kit themselves", async () => {
    const cookie = await unlock();
    mockMine.mockResolvedValue([
      { ...radio, kind: "kit", id: "kit-1", title: "Trauma kit" },
    ]);
    mockScanned.mockResolvedValue({
      kind: "in-custody",
      item: scannedKit,
      holderName: "Maria P.",
    });

    const { body } = read(
      await loader(args(get("?member=tm-1&scan=qr-kit&scanType=qr", cookie)))
    );
    expect(body?.scanned).toMatchObject({ heldByYou: true });
  });

  it("ignores a scan whose type is unknown, and shows no scan without one", async () => {
    const cookie = await unlock();

    const odd = read(
      await loader(args(get("?member=tm-1&scan=x&scanType=nfc", cookie)))
    );
    const none = read(await loader(args(get("?member=tm-1", cookie))));

    expect(odd.body?.scanned).toBeNull();
    expect(none.body?.scanned).toBeNull();
    expect(mockScanned).not.toHaveBeenCalled();
  });

  it("takes a scanned kit by its code, without the list's offer", async () => {
    const cookie = await unlock();
    mockScanned.mockResolvedValue({ kind: "available", item: scannedKit });

    const { body } = read(
      await action(
        args(
          post(
            {
              intent: "scan-take",
              code: "qr-kit",
              codeType: "qr",
              teamMemberId: "tm-1",
              kitId: "some-other-kit",
            },
            { cookie }
          )
        )
      )
    );

    expect(mockScanned).toHaveBeenCalledWith({
      organizationId: "org-1",
      code: "qr-kit",
      codeType: "qr",
    });
    expect(mockTakeKit).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      source: "scan",
      kitId: "kit-1",
      teamMemberId: "tm-1",
    });
    expect(body?.done).toMatchObject({
      kind: "taken",
      assetTitle: "Trauma kit",
    });
  });

  it("takes a scanned single item by its barcode", async () => {
    const cookie = await unlock();
    mockScanned.mockResolvedValue({
      kind: "available",
      item: { ...scannedKit, kind: "asset", id: "asset-1", itemCount: null },
    });

    await action(
      args(
        post(
          {
            intent: "scan-take",
            code: "12345678",
            codeType: "barcode",
            teamMemberId: "tm-1",
          },
          { cookie }
        )
      )
    );

    expect(mockTake).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      source: "scan",
      assetId: "asset-1",
      teamMemberId: "tm-1",
    });
    expect(mockTakeKit).not.toHaveBeenCalled();
  });

  it("returns a scanned kit only as the volunteer's own", async () => {
    const cookie = await unlock();
    mockScanned.mockResolvedValue({
      kind: "in-custody",
      item: scannedKit,
      holderName: "Maria P.",
    });

    await action(
      args(
        post(
          {
            intent: "scan-return",
            code: "qr-kit",
            codeType: "qr",
            teamMemberId: "tm-1",
          },
          { cookie }
        )
      )
    );

    expect(mockReturnKit).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      source: "scan",
      kitId: "kit-1",
      holderTeamMemberId: "tm-1",
    });
  });

  it("refuses a code that labels nothing in the workspace, or something staff must handle", async () => {
    const cookie = await unlock();
    const scanTake = () =>
      action(
        args(
          post(
            {
              intent: "scan-take",
              code: "qr-x",
              codeType: "qr",
              teamMemberId: "tm-1",
            },
            { cookie }
          )
        )
      );

    mockScanned.mockResolvedValueOnce(null);
    expect(read(await scanTake()).status).toBe(400);

    mockScanned.mockResolvedValueOnce({
      kind: "unsupported",
      item: scannedKit,
      reason: "kit-checked-out",
    });
    expect(read(await scanTake()).status).toBe(400);

    expect(mockTakeKit).not.toHaveBeenCalled();
    expect(mockTake).not.toHaveBeenCalled();
  });

  it("refuses a scan take without the PIN or for someone who is not a volunteer here", async () => {
    const fields = {
      intent: "scan-take",
      code: "qr-kit",
      codeType: "qr",
      teamMemberId: "tm-1",
    };
    expect(read(await action(args(post(fields)))).status).toBe(401);

    const cookie = await unlock();
    mockGetVolunteer.mockResolvedValue(null);
    expect(read(await action(args(post(fields, { cookie })))).status).toBe(400);
    expect(mockScanned).not.toHaveBeenCalled();
  });
});

describe("POST /self-service/:token", () => {
  it("sets an unlock cookie the scan page also accepts", async () => {
    const response = (await action(
      args(post({ intent: "unlock", pin: PIN }))
    )) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/self-service/tok-1");
    expect(response.headers.get("Set-Cookie")).toMatch(/Path=\/(;|$)/);
  });

  it("answers 400 on a wrong PIN and 429 once locked out", async () => {
    for (let i = 0; i < 5; i++) {
      const { status } = read(
        await action(args(post({ intent: "unlock", pin: "0000" })))
      );
      expect(status).toBe(400);
    }
    const { status } = read(
      await action(args(post({ intent: "unlock", pin: PIN })))
    );
    expect(status).toBe(429);
  });

  it("refuses take without a valid unlock cookie", async () => {
    const { status } = read(
      await action(
        args(post({ intent: "take", assetId: "asset-1", teamMemberId: "tm-1" }))
      )
    );
    expect(status).toBe(401);
    expect(mockTake).not.toHaveBeenCalled();
  });

  it("refuses everything once self-service is turned off", async () => {
    const cookie = await unlock();
    mockGetWorkspace.mockResolvedValue(
      organization({ selfCustodyEnabled: false })
    );
    const { status } = read(
      await action(
        args(
          post(
            { intent: "take", assetId: "asset-1", teamMemberId: "tm-1" },
            { cookie }
          )
        )
      )
    );
    expect(status).toBe(403);
    expect(mockTake).not.toHaveBeenCalled();
  });

  it("takes a tagged item for the volunteer, from the list", async () => {
    const cookie = await unlock();
    const { status, body } = read(
      await action(
        args(
          post(
            { intent: "take", assetId: "asset-1", teamMemberId: "tm-1" },
            { cookie }
          )
        )
      )
    );

    expect(status).toBe(200);
    expect(body?.done).toEqual({
      kind: "taken",
      assetTitle: "Radio #12",
      volunteerName: "Maria P.",
    });
    expect(mockTake).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      assetId: "asset-1",
      teamMemberId: "tm-1",
      requiredOffer: TAG_OFFER,
      source: "list",
    });
  });

  it("takes units of a quantity-tracked item when the row sends a count", async () => {
    const cookie = await unlock();
    const { status, body } = read(
      await action(
        args(
          post(
            {
              intent: "take",
              assetId: "asset-q",
              teamMemberId: "tm-1",
              units: "3",
            },
            { cookie }
          )
        )
      )
    );

    expect(status).toBe(200);
    expect(body?.done).toMatchObject({ assetTitle: "3 × Bandages" });
    expect(mockTakeUnits).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      assetId: "asset-q",
      teamMemberId: "tm-1",
      quantity: 3,
      requiredOffer: TAG_OFFER,
    });
    expect(mockTake).not.toHaveBeenCalled();
  });

  it("returns units of a quantity-tracked item as the volunteer's own", async () => {
    const cookie = await unlock();
    const { body } = read(
      await action(
        args(
          post(
            {
              intent: "return",
              assetId: "asset-q",
              teamMemberId: "tm-1",
              units: "2",
            },
            { cookie }
          )
        )
      )
    );

    expect(body?.done).toMatchObject({ kind: "returned" });
    expect(mockReturnUnits).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      assetId: "asset-q",
      holderTeamMemberId: "tm-1",
      returned: 2,
    });
    expect(mockReturn).not.toHaveBeenCalled();
  });

  it("refuses a unit count that is blank or not a whole number", async () => {
    const cookie = await unlock();
    for (const units of ["", "1.5", "abc"]) {
      const { status } = read(
        await action(
          args(
            post(
              {
                intent: "take",
                assetId: "asset-q",
                teamMemberId: "tm-1",
                units,
              },
              { cookie }
            )
          )
        )
      );
      expect(status).toBe(400);
    }
    expect(mockTakeUnits).not.toHaveBeenCalled();
  });

  it("takes an offered kit for the volunteer when the form names a kit", async () => {
    const cookie = await unlock();
    const { status, body } = read(
      await action(
        args(
          post(
            { intent: "take", kitId: "kit-1", teamMemberId: "tm-1" },
            { cookie }
          )
        )
      )
    );

    expect(status).toBe(200);
    expect(body?.done).toEqual({
      kind: "taken",
      assetTitle: "Trauma kit",
      volunteerName: "Maria P.",
    });
    expect(mockTakeKit).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      kitId: "kit-1",
      teamMemberId: "tm-1",
      requiredOffer: TAG_OFFER,
    });
    expect(mockTake).not.toHaveBeenCalled();
  });

  it("returns a kit only as the volunteer's own", async () => {
    const cookie = await unlock();
    const { body } = read(
      await action(
        args(
          post(
            { intent: "return", kitId: "kit-1", teamMemberId: "tm-1" },
            { cookie }
          )
        )
      )
    );

    expect(body?.done).toMatchObject({ kind: "returned" });
    expect(mockReturnKit).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      kitId: "kit-1",
      holderTeamMemberId: "tm-1",
    });
    expect(mockReturn).not.toHaveBeenCalled();
  });

  it("refuses a take that names neither an item nor a kit", async () => {
    const cookie = await unlock();
    const { status } = read(
      await action(
        args(post({ intent: "take", teamMemberId: "tm-1" }, { cookie }))
      )
    );
    expect(status).toBe(400);
    expect(mockTake).not.toHaveBeenCalled();
    expect(mockTakeKit).not.toHaveBeenCalled();
  });

  it("refuses take for a team member who is not a volunteer of this workspace", async () => {
    const cookie = await unlock();
    mockGetVolunteer.mockResolvedValue(null);
    const { status } = read(
      await action(
        args(
          post(
            { intent: "take", assetId: "asset-1", teamMemberId: "tm-other" },
            { cookie }
          )
        )
      )
    );
    expect(status).toBe(400);
    expect(mockTake).not.toHaveBeenCalled();
  });

  it("refuses take while neither a tag nor a location is chosen", async () => {
    const cookie = await unlock();
    mockGetWorkspace.mockResolvedValue(
      organization({ selfCustodyTagId: null })
    );
    const { status } = read(
      await action(
        args(
          post(
            { intent: "take", assetId: "asset-1", teamMemberId: "tm-1" },
            { cookie }
          )
        )
      )
    );
    expect(status).toBe(400);
    expect(mockTake).not.toHaveBeenCalled();
  });

  it("returns only as the volunteer's own item", async () => {
    const cookie = await unlock();
    const { body } = read(
      await action(
        args(
          post(
            { intent: "return", assetId: "asset-1", teamMemberId: "tm-1" },
            { cookie }
          )
        )
      )
    );

    expect(body?.done).toMatchObject({ kind: "returned" });
    expect(mockReturn).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      assetId: "asset-1",
      holderTeamMemberId: "tm-1",
      source: "list",
    });
  });

  it("passes the service's refusal through when someone else holds the item", async () => {
    const cookie = await unlock();
    const { ShelfError } = await import("~/utils/error");
    mockReturn.mockRejectedValue(
      new ShelfError({
        cause: null,
        message: "You can only return items in your own custody.",
        label: "Custody",
        status: 403,
        shouldBeCaptured: false,
      })
    );
    const { status, body } = read(
      await action(
        args(
          post(
            { intent: "return", assetId: "asset-1", teamMemberId: "tm-1" },
            { cookie }
          )
        )
      )
    );
    expect(status).toBe(403);
    expect(body?.error.message).toBe(
      "You can only return items in your own custody."
    );
  });

  it("forgets the remembered volunteer on Not you?, without the PIN", async () => {
    const unlockCookie = await unlock();
    const remembered = setCookieOf(
      await loader(args(get("?member=tm-1", unlockCookie)))
    );

    const response = (await action(
      args(
        post(
          { intent: "forget" },
          { cookie: cookies(unlockCookie, remembered) }
        )
      )
    )) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/self-service/tok-1");
    const forgotten = response.headers.get("Set-Cookie");
    expect(
      read(await loader(args(get("", cookies(unlockCookie, forgotten))))).body
    ).toMatchObject({ view: "identify" });
  });

  it("add-me finds or creates the volunteer and continues as them", async () => {
    const cookie = await unlock();
    mockFindOrCreate.mockResolvedValue({ ...maria, created: true });

    const response = (await action(
      args(post({ intent: "add-me", name: "  Maria   P. " }, { cookie }))
    )) as Response;

    expect(mockFindOrCreate).toHaveBeenCalledWith({
      organizationId: "org-1",
      name: "Maria P.",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/self-service/tok-1?member=tm-1"
    );
    expect(response.headers.get("Set-Cookie")).toMatch(
      /^__selfCustodyVolunteer=/
    );
  });

  it("add-me passes a new volunteer's optional email through", async () => {
    const cookie = await unlock();
    mockFindOrCreate.mockResolvedValue({ ...maria, created: true });

    await action(
      args(
        post(
          { intent: "add-me", name: "Maria P.", email: " Maria@Example.com " },
          { cookie }
        )
      )
    );

    expect(mockFindOrCreate).toHaveBeenCalledWith({
      organizationId: "org-1",
      name: "Maria P.",
      email: "maria@example.com",
    });
  });

  it("add-me refuses an invalid email with 400 and creates no one", async () => {
    const cookie = await unlock();

    const result = read(
      await action(
        args(
          post(
            { intent: "add-me", name: "Maria P.", email: "maria@" },
            { cookie }
          )
        )
      )
    );

    expect(result.status).toBe(400);
    expect(mockFindOrCreate).not.toHaveBeenCalled();
  });

  it("searches volunteers of the link's workspace once unlocked", async () => {
    const cookie = await unlock();
    mockSearch.mockResolvedValue([maria]);
    const { body } = read(
      await action(args(post({ intent: "search", q: "mar" }, { cookie })))
    );
    expect(body?.volunteers).toEqual([maria]);
    expect(mockSearch).toHaveBeenCalledWith({
      organizationId: "org-1",
      query: "mar",
    });
  });
});
