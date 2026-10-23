// @vitest-environment node
/**
 * Tests for the self-service browse list: resolving a browse link, the kits
 * and items offered for self-service (by tag, by location, or both), the
 * filter choices, and what a volunteer holds.
 *
 * @see {@link file://./browse.server.ts}
 */
import { AssetStatus, AssetType, KitStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/database/db.server";
import {
  BROWSE_PAGE_SIZE,
  getBrowseWorkspace,
  listBrowseFilterOptions,
  listOfferedItems,
  listVolunteerItems,
  offeredKitWhere,
} from "./browse.server";
import type { BrowseFilters } from "./browse.server";
import type { SelfCustodyOffer } from "./offer.server";

// why: unit tests run without a database; every query's where clause is asserted
vi.mock("~/database/db.server", () => ({
  db: {
    organization: { findUnique: vi.fn() },
    asset: { count: vi.fn(), findMany: vi.fn() },
    kit: { count: vi.fn(), findMany: vi.fn() },
    location: { findMany: vi.fn() },
    category: { findMany: vi.fn() },
  },
}));

const ORG = "org-1";
const TAG = "tag-ss";

/** The workspace offers the items with its tag, and no location. */
const BY_TAG: SelfCustodyOffer = { tagId: TAG, locationIds: [] };

/** The workspace offers the items stored at two locations, and no tag. */
const BY_LOCATION: SelfCustodyOffer = {
  tagId: null,
  locationIds: ["loc-depot", "loc-shelf-a"],
};

/** No search and no filter. */
const ALL: BrowseFilters = {
  query: "",
  kind: "all",
  locationId: null,
  categoryId: null,
};

/** An asset row as the browse queries select it. */
const row = (id: string, title: string, location: string | null = null) => ({
  id,
  title,
  category: null,
  assetLocations: location ? [{ location: { name: location } }] : [],
});

/** A kit row as the browse queries select it. */
const kitRow = (id: string, name: string, items = 3) => ({
  id,
  name,
  category: { name: "First aid" },
  location: { name: "Depot" },
  _count: { assetKits: items },
});

/** Sets how many kits and items match; the row queries return nothing. */
function counts(kits: number, assets: number) {
  vi.mocked(db.kit.count).mockResolvedValue(kits);
  vi.mocked(db.asset.count).mockResolvedValue(assets);
  vi.mocked(db.kit.findMany).mockResolvedValue([]);
  vi.mocked(db.asset.findMany).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getBrowseWorkspace", () => {
  it("resolves the workspace by its browse token", async () => {
    const organization = {
      id: ORG,
      name: "Hellenic Red Cross",
      selfCustodyEnabled: true,
      selfCustodyPinHash: "scrypt$aa$bb",
      selfCustodyPinUpdatedAt: new Date("2026-10-01"),
      selfCustodyTagId: TAG,
      selfCustodyLocations: [{ id: "loc-depot" }],
    };
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      organization as never
    );

    await expect(getBrowseWorkspace("tok")).resolves.toEqual(organization);
    expect(db.organization.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { selfCustodyBrowseToken: "tok" },
        select: expect.objectContaining({
          selfCustodyTagId: true,
          selfCustodyLocations: { select: { id: true } },
        }),
      })
    );
  });

  it("answers 404 for a token no workspace has, such as a replaced one", async () => {
    vi.mocked(db.organization.findUnique).mockResolvedValue(null);
    await expect(getBrowseWorkspace("old")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("listOfferedItems", () => {
  it("offers only tagged, available, active, individual items outside kits", async () => {
    counts(0, 1);
    vi.mocked(db.asset.findMany).mockResolvedValue([
      row("a1", "Radio #12", "Warehouse A"),
    ] as never);

    const page = await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: ALL,
      page: 1,
    });

    const where = {
      organizationId: ORG,
      archivedAt: null,
      status: AssetStatus.AVAILABLE,
      type: AssetType.INDIVIDUAL,
      assetKits: { none: {} },
      AND: [{ OR: [{ tags: { some: { id: TAG } } }] }],
    };
    expect(db.asset.count).toHaveBeenCalledWith({ where });
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { title: "asc" },
        skip: 0,
        take: 1,
      })
    );
    expect(page).toEqual({
      items: [
        {
          kind: "item",
          id: "a1",
          title: "Radio #12",
          locationName: "Warehouse A",
          categoryName: null,
          itemCount: null,
        },
      ],
      page: 1,
      totalPages: 1,
      totalCount: 1,
    });
  });

  it("lists kits first, then items, and counts both", async () => {
    counts(1, 1);
    vi.mocked(db.kit.findMany).mockResolvedValue([
      kitRow("k1", "Trauma kit", 4),
    ] as never);
    vi.mocked(db.asset.findMany).mockResolvedValue([
      row("a1", "Radio #12"),
    ] as never);

    const page = await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: ALL,
      page: 1,
    });

    expect(page.totalCount).toBe(2);
    expect(page.items.map((entry) => [entry.kind, entry.id])).toEqual([
      ["kit", "k1"],
      ["item", "a1"],
    ]);
    expect(page.items[0]).toEqual({
      kind: "kit",
      id: "k1",
      title: "Trauma kit",
      locationName: "Depot",
      categoryName: "First aid",
      itemCount: 4,
    });
    expect(db.kit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: offeredKitWhere({
          organizationId: ORG,
          offer: BY_TAG,
          filters: ALL,
        }),
        orderBy: { name: "asc" },
        skip: 0,
        take: 1,
      })
    );
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 1 })
    );
  });

  it("pages across the end of the kits into the items", async () => {
    // 25 kits and 30 items: page 2 holds kits 21 to 25, then items 1 to 15.
    counts(25, 30);

    await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: ALL,
      page: 2,
    });

    expect(db.kit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 5 })
    );
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 15 })
    );
  });

  it("skips the kit query once the page is past every kit", async () => {
    // 5 kits and 30 items: page 2 holds items 16 to 30.
    counts(5, 30);

    await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: ALL,
      page: 2,
    });

    expect(db.kit.findMany).not.toHaveBeenCalled();
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 15, take: 15 })
    );
  });

  it("shows only items when asked", async () => {
    counts(3, 3);
    await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: { ...ALL, kind: "item" },
      page: 1,
    });
    expect(db.kit.count).not.toHaveBeenCalled();
    expect(db.kit.findMany).not.toHaveBeenCalled();
    expect(db.asset.findMany).toHaveBeenCalled();
  });

  it("shows only kits when asked", async () => {
    counts(3, 3);
    await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: { ...ALL, kind: "kit" },
      page: 1,
    });
    expect(db.asset.count).not.toHaveBeenCalled();
    expect(db.asset.findMany).not.toHaveBeenCalled();
    expect(db.kit.findMany).toHaveBeenCalled();
  });

  it("filters both kits and items by name, location and category", async () => {
    counts(0, 0);

    await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: {
        query: "  radio ",
        kind: "all",
        locationId: "loc-1",
        categoryId: "cat-1",
      },
      page: 1,
    });

    expect(db.asset.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        title: { contains: "radio", mode: "insensitive" },
        assetLocations: { some: { locationId: "loc-1", assetKitId: null } },
        categoryId: "cat-1",
      }),
    });
    expect(db.kit.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        name: { contains: "radio", mode: "insensitive" },
        locationId: "loc-1",
        categoryId: "cat-1",
      }),
    });
  });

  it("offers the items stored at the chosen locations, tagged or not", async () => {
    counts(0, 0);

    await listOfferedItems({
      organizationId: ORG,
      offer: BY_LOCATION,
      filters: ALL,
      page: 1,
    });

    expect(db.asset.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: [
          {
            OR: [
              {
                assetLocations: {
                  some: {
                    locationId: { in: ["loc-depot", "loc-shelf-a"] },
                    assetKitId: null,
                  },
                },
              },
            ],
          },
        ],
      }),
    });
    expect(db.asset.count).toHaveBeenCalledWith({
      where: expect.not.objectContaining({ tags: expect.anything() }),
    });
  });

  it("keeps the volunteer's location filter apart from the offered locations", async () => {
    counts(0, 0);

    await listOfferedItems({
      organizationId: ORG,
      offer: { tagId: TAG, locationIds: ["loc-depot"] },
      filters: { ...ALL, locationId: "loc-shelf-a" },
      page: 1,
    });

    expect(db.asset.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        // the volunteer's narrowing
        assetLocations: {
          some: { locationId: "loc-shelf-a", assetKitId: null },
        },
        // the workspace's offer: tag OR location
        AND: [
          {
            OR: [
              { tags: { some: { id: TAG } } },
              {
                assetLocations: {
                  some: { locationId: { in: ["loc-depot"] }, assetKitId: null },
                },
              },
            ],
          },
        ],
      }),
    });
    expect(db.kit.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        locationId: "loc-shelf-a",
        AND: expect.arrayContaining([
          {
            OR: [
              expect.objectContaining({ assetKits: expect.anything() }),
              { locationId: { in: ["loc-depot"] } },
            ],
          },
        ]),
      }),
    });
  });

  it("clamps a page past the end to the last page", async () => {
    counts(0, BROWSE_PAGE_SIZE + 1);

    const page = await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: ALL,
      page: 99,
    });

    expect(page).toMatchObject({ page: 2, totalPages: 2 });
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: BROWSE_PAGE_SIZE })
    );
  });

  it("treats a page that is not a number as the first", async () => {
    counts(0, 3);

    const page = await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: ALL,
      page: Number("abc"),
    });

    expect(page.page).toBe(1);
  });
});

describe("offeredKitWhere", () => {
  it("offers a kit only when it is free and every active item in it is tagged and in", () => {
    expect(offeredKitWhere({ organizationId: ORG, offer: BY_TAG })).toEqual({
      organizationId: ORG,
      status: KitStatus.AVAILABLE,
      custody: { is: null },
      AND: [
        // at least one active item
        { assetKits: { some: { asset: { archivedAt: null } } } },
        // offered: no active item without the tag
        {
          OR: [
            {
              assetKits: {
                none: {
                  asset: { archivedAt: null, tags: { none: { id: TAG } } },
                },
              },
            },
          ],
        },
        // no active single item out of the depot
        {
          assetKits: {
            none: {
              asset: {
                archivedAt: null,
                type: AssetType.INDIVIDUAL,
                status: { not: AssetStatus.AVAILABLE },
              },
            },
          },
        },
      ],
    });
  });
});

describe("offeredKitWhere by location", () => {
  it("offers a kit stored at a chosen location, whatever its items' tags", () => {
    const where = offeredKitWhere({ organizationId: ORG, offer: BY_LOCATION });

    expect(where.AND).toContainEqual({
      OR: [{ locationId: { in: ["loc-depot", "loc-shelf-a"] } }],
    });
    expect(JSON.stringify(where)).not.toContain("tags");
  });

  it("offers no kit when nothing is offered", () => {
    const where = offeredKitWhere({
      organizationId: ORG,
      offer: { tagId: null, locationIds: [] },
    });

    expect(where.AND).toContainEqual({ OR: [] });
  });
});

describe("listBrowseFilterOptions", () => {
  it("offers only locations and categories that hold something to take", async () => {
    vi.mocked(db.location.findMany).mockResolvedValue([
      { id: "loc-1", name: "Depot" },
    ] as never);
    vi.mocked(db.category.findMany).mockResolvedValue([
      { id: "cat-1", name: "Radios" },
    ] as never);

    await expect(
      listBrowseFilterOptions({ organizationId: ORG, offer: BY_TAG })
    ).resolves.toEqual({
      locations: [{ id: "loc-1", name: "Depot" }],
      categories: [{ id: "cat-1", name: "Radios" }],
    });

    const kit = offeredKitWhere({ organizationId: ORG, offer: BY_TAG });
    const taggedAsset = expect.objectContaining({
      archivedAt: null,
      AND: [{ OR: [{ tags: { some: { id: TAG } } }] }],
    });
    expect(db.location.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          OR: [
            {
              assetLocations: {
                some: { assetKitId: null, asset: taggedAsset },
              },
            },
            { kits: { some: kit } },
          ],
        },
      })
    );
    expect(db.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          OR: [{ assets: { some: taggedAsset } }, { kits: { some: kit } }],
        },
      })
    );
  });
});

describe("listVolunteerItems", () => {
  it("lists the volunteer's kits, then their own, not kit-held, custody of active individual items", async () => {
    vi.mocked(db.kit.findMany).mockResolvedValue([
      kitRow("k1", "Trauma kit"),
    ] as never);
    vi.mocked(db.asset.findMany).mockResolvedValue([
      row("a2", "Torch"),
    ] as never);

    const items = await listVolunteerItems({
      organizationId: ORG,
      teamMemberId: "tm-1",
    });

    expect(items.map((entry) => [entry.kind, entry.id])).toEqual([
      ["kit", "k1"],
      ["item", "a2"],
    ]);
    expect(db.kit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          custody: { is: { custodianId: "tm-1" } },
        },
      })
    );
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          archivedAt: null,
          type: AssetType.INDIVIDUAL,
          custody: { some: { teamMemberId: "tm-1", kitCustodyId: null } },
        },
      })
    );
  });
});
