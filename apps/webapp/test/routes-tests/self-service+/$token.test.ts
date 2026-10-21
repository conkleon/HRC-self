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
  mockTake,
  mockReturn,
  mockSearch,
  mockFindOrCreate,
  mockGetVolunteer,
} = vi.hoisted(() => ({
  mockGetWorkspace: vi.fn(),
  mockOffered: vi.fn(),
  mockMine: vi.fn(),
  mockTake: vi.fn(),
  mockReturn: vi.fn(),
  mockSearch: vi.fn(),
  mockFindOrCreate: vi.fn(),
  mockGetVolunteer: vi.fn(),
}));

// why: the browse reads query the database; covered by browse.server.test.ts
vi.mock("~/modules/self-custody/browse.server", () => ({
  getBrowseWorkspace: mockGetWorkspace,
  listOfferedItems: mockOffered,
  listVolunteerItems: mockMine,
}));

// why: take and return write the database; covered by custody.server.test.ts
vi.mock("~/modules/self-custody/custody.server", () => ({
  selfTakeCustody: mockTake,
  selfReturnCustody: mockReturn,
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
// otherwise open a real PostgreSQL connection.
vi.mock("~/database/db.server", () => ({ db: { $connect: vi.fn() } }));

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
  ...overrides,
});

const maria = { id: "tm-1", name: "Maria P." };
const radio = {
  id: "asset-1",
  title: "Radio #12",
  thumbnailImage: null,
  locationName: "Warehouse A",
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
  mockTake.mockResolvedValue({
    assetTitle: "Radio #12",
    volunteerName: "Maria P.",
  });
  mockReturn.mockResolvedValue({
    assetTitle: "Radio #12",
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

  it("offers nothing while no self-service tag is chosen", async () => {
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
      query: "radio",
      list: offeredPage,
      myItems: [{ id: "asset-9", title: "Torch" }],
    });
    expect(mockOffered).toHaveBeenCalledWith({
      organizationId: "org-1",
      tagId: "tag-ss",
      query: "radio",
      page: 2,
    });
    expect(mockMine).toHaveBeenCalledWith({
      organizationId: "org-1",
      teamMemberId: "tm-1",
    });
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
      requiredTagId: "tag-ss",
      source: "list",
    });
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

  it("refuses take while no self-service tag is chosen", async () => {
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
