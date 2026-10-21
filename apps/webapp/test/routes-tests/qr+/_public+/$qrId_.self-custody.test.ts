// @vitest-environment node
/**
 * Public self-service custody page (`/qr/:qrId/self-custody`): the HTTP
 * wiring between a volunteer's phone and the self-custody services. The PIN,
 * lockout and unlock cookie run for real; the database-backed services are
 * stubbed and have their own tests.
 *
 * @see {@link file://./../../../../app/routes/qr+/_public+/$qrId_.self-custody.tsx}
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetState, mockTake, mockReturn, mockSearch, mockFindOrCreate } =
  vi.hoisted(() => ({
    mockGetState: vi.fn(),
    mockTake: vi.fn(),
    mockReturn: vi.fn(),
    mockSearch: vi.fn(),
    mockFindOrCreate: vi.fn(),
  }));

// why: state, take and return read and write the database; covered by custody.server.test.ts
vi.mock("~/modules/self-custody/custody.server", () => ({
  getSelfCustodyState: mockGetState,
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
}));

// why: importing the route pulls in `db.server`, whose initialization would
// otherwise open a real PostgreSQL connection.
vi.mock("~/database/db.server", () => ({ db: { $connect: vi.fn() } }));

import { resetLockoutsForTests } from "~/modules/self-custody/lockout.server";
import { hashPin } from "~/modules/self-custody/pin.server";
import { action, loader } from "~/routes/qr+/_public+/$qrId_.self-custody";

const PIN = "4821";
let pinHash = "";

const organization = () => ({
  id: "org-1",
  name: "Hellenic Red Cross",
  selfCustodyEnabled: true,
  selfCustodyPinHash: pinHash,
  selfCustodyPinUpdatedAt: new Date("2026-10-01"),
});

const asset = {
  id: "asset-1",
  title: "Radio #12",
  thumbnailImage: null,
  locationName: "Warehouse A",
};

const URL_ = "http://localhost/qr/qr-1/self-custody";
const args = (request: Request) =>
  ({ request, params: { qrId: "qr-1" }, context: {} }) as never;

/** A POST from the given client, optionally carrying a cookie. */
function post(
  fields: Record<string, string>,
  { cookie, ip = "203.0.113.7" }: { cookie?: string; ip?: string } = {}
) {
  const headers = new Headers({ "X-Forwarded-For": ip });
  if (cookie) headers.set("Cookie", cookie);
  return new Request(URL_, {
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
  mockGetState.mockResolvedValue({
    organization: organization(),
    state: { kind: "available", asset },
  });
});

describe("GET /qr/:qrId/self-custody", () => {
  it("redirects to the not-logged-in page when self-service is off", async () => {
    mockGetState.mockResolvedValue({
      organization: { ...organization(), selfCustodyEnabled: false },
      state: { kind: "available", asset },
    });
    const response = (await loader(args(new Request(URL_)))) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/qr/qr-1/not-logged-in?redirectTo=%2Fqr%2Fqr-1"
    );
  });

  it("hides who holds the item until the phone is unlocked", async () => {
    mockGetState.mockResolvedValue({
      organization: organization(),
      state: { kind: "in-custody", asset, holderName: "Maria P." },
    });

    const locked = read(await loader(args(new Request(URL_))));
    expect(locked.body?.unlocked).toBe(false);
    expect(JSON.stringify(locked.body)).not.toContain("Maria P.");

    const cookie = await unlock();
    const open = read(
      await loader(args(new Request(URL_, { headers: { Cookie: cookie } })))
    );
    expect(open.body?.unlocked).toBe(true);
    expect(open.body?.state).toMatchObject({ holderName: "Maria P." });
  });
});

describe("POST /qr/:qrId/self-custody", () => {
  it("sets the unlock cookie on the right PIN", async () => {
    const response = (await action(
      args(post({ intent: "unlock", pin: PIN }))
    )) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Set-Cookie")).toContain(
      "__selfCustodyUnlock="
    );
  });

  it("answers 400 on a wrong PIN and 429 once locked out", async () => {
    for (let i = 0; i < 4; i++) {
      const wrong = read(
        await action(args(post({ intent: "unlock", pin: "0000" })))
      );
      expect(wrong.status).toBe(400);
      expect(wrong.body?.error?.message).toBe("Wrong PIN. Please try again.");
    }
    await action(args(post({ intent: "unlock", pin: "0000" })));

    const locked = read(
      await action(args(post({ intent: "unlock", pin: PIN })))
    );
    expect(locked.status).toBe(429);
    expect(locked.body?.error?.message).toMatch(/Too many wrong PINs/);
  });

  it("refuses take without a valid unlock cookie", async () => {
    const result = read(
      await action(args(post({ intent: "take", teamMemberId: "tm-1" })))
    );
    expect(result.status).toBe(401);
    expect(mockTake).not.toHaveBeenCalled();
  });

  it("refuses take when self-service was turned off mid-session", async () => {
    const cookie = await unlock();
    mockGetState.mockResolvedValue({
      organization: { ...organization(), selfCustodyEnabled: false },
      state: { kind: "available", asset },
    });
    const result = read(
      await action(
        args(post({ intent: "take", teamMemberId: "tm-1" }, { cookie }))
      )
    );
    expect(result.status).toBe(403);
    expect(result.body?.error?.message).toBe(
      "Self-service is turned off for this workspace."
    );
    expect(mockTake).not.toHaveBeenCalled();
  });

  it("searches volunteers of the scanned QR's workspace once unlocked", async () => {
    const cookie = await unlock();
    mockSearch.mockResolvedValue([{ id: "tm-1", name: "Maria P." }]);
    const result = read(
      await action(args(post({ intent: "search", q: "mar" }, { cookie })))
    );
    expect(mockSearch).toHaveBeenCalledWith({
      organizationId: "org-1",
      query: "mar",
    });
    expect(result.body?.volunteers).toEqual([{ id: "tm-1", name: "Maria P." }]);
  });

  it("takes the scanned item for the chosen volunteer", async () => {
    const cookie = await unlock();
    mockTake.mockResolvedValue({
      assetTitle: "Radio #12",
      volunteerName: "Maria P.",
    });
    const result = read(
      await action(
        args(
          post(
            { intent: "take", teamMemberId: "tm-1", assetId: "other" },
            { cookie }
          )
        )
      )
    );
    expect(mockTake).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      assetId: "asset-1",
      teamMemberId: "tm-1",
    });
    expect(result.body?.done).toEqual({
      kind: "taken",
      assetTitle: "Radio #12",
      volunteerName: "Maria P.",
    });
  });

  it("take-new creates the volunteer then takes custody", async () => {
    const cookie = await unlock();
    mockFindOrCreate.mockResolvedValue({
      id: "tm-9",
      name: "Giorgos K.",
      created: true,
    });
    mockTake.mockResolvedValue({
      assetTitle: "Radio #12",
      volunteerName: "Giorgos K.",
    });
    await action(
      args(post({ intent: "take-new", name: "  Giorgos   K. " }, { cookie }))
    );
    expect(mockFindOrCreate).toHaveBeenCalledWith({
      organizationId: "org-1",
      name: "Giorgos K.",
    });
    expect(mockTake).toHaveBeenCalledWith(
      expect.objectContaining({ teamMemberId: "tm-9" })
    );
  });

  it("shows a name error for a 1-character name", async () => {
    const cookie = await unlock();
    const result = read(
      await action(args(post({ intent: "take-new", name: "G" }, { cookie })))
    );
    expect(result.status).toBe(400);
    expect(mockFindOrCreate).not.toHaveBeenCalled();
  });

  it("returns an item that is in custody", async () => {
    const cookie = await unlock();
    mockGetState.mockResolvedValue({
      organization: organization(),
      state: { kind: "in-custody", asset, holderName: "Maria P." },
    });
    mockReturn.mockResolvedValue({
      assetTitle: "Radio #12",
      volunteerName: "Maria P.",
    });
    const result = read(
      await action(args(post({ intent: "return" }, { cookie })))
    );
    expect(mockReturn).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceName: "Hellenic Red Cross",
      assetId: "asset-1",
    });
    expect(result.body?.done).toMatchObject({ kind: "returned" });
  });

  it("refuses to take an item that is referred to staff", async () => {
    const cookie = await unlock();
    mockGetState.mockResolvedValue({
      organization: organization(),
      state: { kind: "unsupported", asset, reason: "checked-out" },
    });
    const result = read(
      await action(
        args(post({ intent: "take", teamMemberId: "tm-1" }, { cookie }))
      )
    );
    expect(result.status).toBe(400);
    expect(mockTake).not.toHaveBeenCalled();
  });
});
