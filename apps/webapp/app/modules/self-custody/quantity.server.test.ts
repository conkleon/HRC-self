// @vitest-environment node
/**
 * Tests for self-service quantity custody: the free units the browse list
 * shows, taking units of an offered item, and returning them (some or all of
 * a returnable item, or the whole hold of a consumable with the rest used).
 *
 * @see {@link file://./quantity.server.ts}
 */
import { AssetType, ConsumptionType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/database/db.server";
import { loadCustodySources } from "~/modules/asset/custody-source.server";
import {
  checkOutQuantity,
  releaseQuantity,
} from "~/modules/asset/service.server";
import {
  getFreeUnitsByAsset,
  selfReturnQuantity,
  selfTakeQuantity,
} from "./quantity.server";

// why: unit tests run without a database; each read and write is asserted
vi.mock("~/database/db.server", () => ({
  db: {
    asset: { findFirst: vi.fn() },
    teamMember: { findFirst: vi.fn() },
    note: { create: vi.fn() },
    custody: { groupBy: vi.fn() },
    assetKit: { groupBy: vi.fn() },
    bookingAsset: { groupBy: vi.fn() },
  },
}));

// why: both run locked interactive transactions; their own suites cover the
// stock rules, and here only what self-service hands them matters
vi.mock("~/modules/asset/service.server", () => ({
  checkOutQuantity: vi.fn(),
  releaseQuantity: vi.fn(),
}));

// why: reads a pool's placements, custody and bookings from the database
vi.mock("~/modules/asset/custody-source.server", () => ({
  loadCustodySources: vi.fn(),
}));

// why: queries the database and sends email
vi.mock("~/modules/consumption-log/low-stock.server", () => ({
  checkAndNotifyLowStock: vi.fn(),
}));

// why: emails the workspace's managers
vi.mock("./notify.server", () => ({ sendSelfCustodyAlert: vi.fn() }));

// why: reads the team member from the database
vi.mock("~/utils/org-validation.server", () => ({
  assertTeamMemberBelongsToOrg: vi.fn(),
}));

const ORG = "org-1";
const WORKSPACE = { organizationId: ORG, workspaceName: "Hellenic Red Cross" };
const BY_TAG = { tagId: "tag-ss", locationIds: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.teamMember.findFirst).mockResolvedValue({
    name: "Maria P",
    user: null,
  } as never);
});

describe("getFreeUnitsByAsset", () => {
  it("subtracts units in custody, in kits and out on bookings, never below zero", async () => {
    vi.mocked(db.custody.groupBy).mockResolvedValue([
      { assetId: "q1", _sum: { quantity: 2 } },
      { assetId: "q2", _sum: { quantity: 4 } },
    ] as never);
    vi.mocked(db.assetKit.groupBy).mockResolvedValue([
      { assetId: "q1", _sum: { quantity: 3 } },
    ] as never);
    vi.mocked(db.bookingAsset.groupBy).mockResolvedValue([
      { assetId: "q1", _sum: { quantity: 1 } },
      { assetId: "q2", _sum: { quantity: 9 } },
    ] as never);

    const free = await getFreeUnitsByAsset({
      organizationId: ORG,
      assets: [
        { id: "q1", quantity: 10 },
        { id: "q2", quantity: 5 },
        { id: "q3", quantity: null },
      ],
    });

    expect(Object.fromEntries(free)).toEqual({ q1: 4, q2: 0, q3: 0 });
    expect(db.bookingAsset.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assetKitId: null,
          booking: {
            organizationId: ORG,
            status: { in: ["ONGOING", "OVERDUE"] },
          },
        }),
      })
    );
  });

  it("reads nothing for no assets", async () => {
    await expect(
      getFreeUnitsByAsset({ organizationId: ORG, assets: [] })
    ).resolves.toEqual(new Map());
    expect(db.custody.groupBy).not.toHaveBeenCalled();
  });
});

describe("selfTakeQuantity", () => {
  it("hands the units to the volunteer with no acting user, marked as self-service", async () => {
    vi.mocked(db.asset.findFirst).mockResolvedValue({
      title: "Bandages",
      quantity: 20,
    } as never);

    const result = await selfTakeQuantity({
      ...WORKSPACE,
      assetId: "q1",
      teamMemberId: "tm-1",
      quantity: 3,
      requiredOffer: BY_TAG,
    });

    expect(db.asset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "q1",
          organizationId: ORG,
          archivedAt: null,
          type: AssetType.QUANTITY_TRACKED,
          AND: [{ OR: [{ tags: { some: { id: "tag-ss" } } }] }],
        },
      })
    );
    expect(checkOutQuantity).toHaveBeenCalledWith({
      assetId: "q1",
      teamMemberId: "tm-1",
      quantity: 3,
      userId: null,
      organizationId: ORG,
      custodyAssign: "anyone",
      locationId: undefined,
      eventMeta: { via: "self-service", source: "list" },
    });
    expect(result).toEqual({
      assetTitle: "3 × Bandages",
      volunteerName: "Maria P",
    });
    expect(db.note.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: "**Maria P** took **3** unit(s) from the self-service list.",
        type: "UPDATE",
      }),
    });
  });

  it("takes the units from the offered location with the most left, when it can cover them", async () => {
    vi.mocked(db.asset.findFirst).mockResolvedValue({
      title: "Bandages",
      quantity: 20,
    } as never);
    vi.mocked(loadCustodySources).mockResolvedValue({
      state: {
        total: 20,
        placements: [
          { locationId: "loc-van", quantity: 10 },
          { locationId: "loc-depot", quantity: 6 },
          { locationId: "loc-shelf", quantity: 4 },
        ],
        operatorCustody: [
          { locationId: "loc-depot", sourceUnknown: false, quantity: 1 },
        ],
        bookedOut: [],
      },
      rows: [],
    });

    await selfTakeQuantity({
      ...WORKSPACE,
      assetId: "q1",
      teamMemberId: "tm-1",
      quantity: 5,
      requiredOffer: { tagId: null, locationIds: ["loc-depot", "loc-shelf"] },
    });

    // The van has more, but it is not offered; the depot has 5 left.
    expect(checkOutQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: "loc-depot" })
    );
  });

  it("refuses an item that is not offered, and moves nothing", async () => {
    vi.mocked(db.asset.findFirst).mockResolvedValue(null);

    await expect(
      selfTakeQuantity({
        ...WORKSPACE,
        assetId: "q1",
        teamMemberId: "tm-1",
        quantity: 1,
        requiredOffer: BY_TAG,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(checkOutQuantity).not.toHaveBeenCalled();
  });

  it("refuses a count below one", async () => {
    await expect(
      selfTakeQuantity({
        ...WORKSPACE,
        assetId: "q1",
        teamMemberId: "tm-1",
        quantity: 0,
        requiredOffer: BY_TAG,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(db.asset.findFirst).not.toHaveBeenCalled();
  });
});

/** The asset `selfReturnQuantity` reads, with the volunteer's custody rows. */
function heldAsset(held: number[], consumptionType: ConsumptionType) {
  vi.mocked(db.asset.findFirst).mockResolvedValue({
    title: "Bandages",
    type: AssetType.QUANTITY_TRACKED,
    archivedAt: null,
    consumptionType,
    custody: held.map((quantity) => ({ quantity })),
  } as never);
}

describe("selfReturnQuantity", () => {
  it("gives back some of a returnable item and leaves the rest with the volunteer", async () => {
    heldAsset([3, 2], ConsumptionType.TWO_WAY);

    const result = await selfReturnQuantity({
      ...WORKSPACE,
      assetId: "q1",
      holderTeamMemberId: "tm-1",
      returned: 2,
    });

    expect(releaseQuantity).toHaveBeenCalledWith({
      assetId: "q1",
      teamMemberId: "tm-1",
      quantity: 2,
      consumed: 0,
      userId: null,
      organizationId: ORG,
      custodyAssign: "anyone",
      eventMeta: { via: "self-service", source: "list" },
    });
    expect(result.assetTitle).toBe("2 × Bandages");
  });

  it("ends the whole hold of a consumable and records the rest as used", async () => {
    heldAsset([5], ConsumptionType.ONE_WAY);

    const result = await selfReturnQuantity({
      ...WORKSPACE,
      assetId: "q1",
      holderTeamMemberId: "tm-1",
      returned: 2,
    });

    expect(releaseQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 5, consumed: 3 })
    );
    expect(result.assetTitle).toBe("Bandages (2 back, 3 used)");
    expect(db.note.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content:
          "**Maria P** returned **2** unit(s) and used **3** from the self-service list.",
      }),
    });
  });

  it("accepts nothing back for a consumable that was all used", async () => {
    heldAsset([4], ConsumptionType.ONE_WAY);

    await selfReturnQuantity({
      ...WORKSPACE,
      assetId: "q1",
      holderTeamMemberId: "tm-1",
      returned: 0,
    });

    expect(releaseQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 4, consumed: 4 })
    );
  });

  it("refuses more than the volunteer holds, or nothing back of a returnable item", async () => {
    heldAsset([2], ConsumptionType.TWO_WAY);
    for (const returned of [3, 0]) {
      await expect(
        selfReturnQuantity({
          ...WORKSPACE,
          assetId: "q1",
          holderTeamMemberId: "tm-1",
          returned,
        })
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(releaseQuantity).not.toHaveBeenCalled();
  });

  it("answers 409 when the volunteer holds none of it", async () => {
    heldAsset([], ConsumptionType.TWO_WAY);

    await expect(
      selfReturnQuantity({
        ...WORKSPACE,
        assetId: "q1",
        holderTeamMemberId: "tm-1",
        returned: 1,
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refers an individual item to staff", async () => {
    vi.mocked(db.asset.findFirst).mockResolvedValue({
      title: "Radio",
      type: AssetType.INDIVIDUAL,
      archivedAt: null,
      consumptionType: null,
      custody: [{ quantity: 1 }],
    } as never);

    await expect(
      selfReturnQuantity({
        ...WORKSPACE,
        assetId: "a1",
        holderTeamMemberId: "tm-1",
        returned: 1,
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
