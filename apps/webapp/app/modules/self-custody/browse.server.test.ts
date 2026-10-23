// @vitest-environment node
/**
 * Tests for the self-service browse list: resolving a browse link, the kits
 * and items offered for self-service (by tag, by location, or both), the
 * filter choices, and what a volunteer holds.
 *
 * @see {@link file://./browse.server.ts}
 */
import {
  AssetStatus,
  AssetType,
  ConsumptionType,
  KitStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/database/db.server";
import { refreshExpiredAssetImages } from "~/modules/asset/service.server";
import { refreshExpiredKitImages } from "~/modules/kit/service.server";
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
    custody: { groupBy: vi.fn() },
    assetKit: { groupBy: vi.fn() },
    bookingAsset: { groupBy: vi.fn() },
    location: { findMany: vi.fn() },
    category: { findMany: vi.fn() },
  },
}));

// why: re-signing an expired picture calls Supabase storage; by default
// nothing is re-signed, and one test hands back a fresh URL
vi.mock("~/modules/asset/service.server", () => ({
  ASSET_IMAGE_RESIGN_LIMITS: { maxRefreshes: 100, timeBudgetMs: 2_500 },
  refreshExpiredAssetImages: vi.fn(),
  checkOutQuantity: vi.fn(),
  releaseQuantity: vi.fn(),
}));

// why: same as above, for kit pictures
vi.mock("~/modules/kit/service.server", () => ({
  refreshExpiredKitImages: vi.fn(),
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
  type: AssetType.INDIVIDUAL,
  consumptionType: null,
  mainImage: null,
  mainImageExpiration: null,
  thumbnailImage: null,
  assetModel: null,
  category: null,
  assetLocations: location ? [{ location: { name: location } }] : [],
});

/** A quantity-tracked asset row as the browse queries select it. */
const unitsRow = (id: string, title: string, oneWay = false) => ({
  ...row(id, title),
  type: AssetType.QUANTITY_TRACKED,
  consumptionType: oneWay ? ConsumptionType.ONE_WAY : ConsumptionType.TWO_WAY,
});

/**
 * The kind rule every offered-item query carries: an available individual
 * item outside kits, or one of these quantity-tracked items with a free unit.
 */
const kindRule = (quantityAssetIds: string[] = []) => ({
  OR: [
    {
      type: AssetType.INDIVIDUAL,
      status: AssetStatus.AVAILABLE,
      assetKits: { none: {} },
    },
    { type: AssetType.QUANTITY_TRACKED, id: { in: quantityAssetIds } },
  ],
});

/**
 * The offered quantity-tracked items the list reads first, with their stock,
 * and how many units of each are in custody. No kits or bookings hold any.
 */
function quantityItems(
  items: { id: string; quantity: number; inCustody: number }[]
) {
  vi.mocked(db.asset.findMany).mockResolvedValueOnce(
    items.map(({ id, quantity }) => ({ id, quantity })) as never
  );
  vi.mocked(db.custody.groupBy).mockResolvedValue(
    items.map(({ id, inCustody }) => ({
      assetId: id,
      _sum: { quantity: inCustody },
    })) as never
  );
  vi.mocked(db.assetKit.groupBy).mockResolvedValue([] as never);
  vi.mocked(db.bookingAsset.groupBy).mockResolvedValue([] as never);
}

/** A kit row as the browse queries select it, holding `items` radios. */
const kitRow = (id: string, name: string, items = 3) => ({
  id,
  organizationId: ORG,
  name,
  image: null,
  imageExpiration: null,
  category: { name: "First aid" },
  location: { name: "Depot" },
  assetKits: Array.from({ length: items }, (_, index) => ({
    quantity: 1,
    asset: row(`${id}-a${index + 1}`, `Radio ${index + 1}`),
  })),
});

/**
 * Sets how many kits and items match; the row queries return nothing, and no
 * quantity-tracked item is offered.
 */
function counts(kits: number, assets: number) {
  vi.mocked(db.kit.count).mockResolvedValue(kits);
  vi.mocked(db.asset.count).mockResolvedValue(assets);
  vi.mocked(db.kit.findMany).mockResolvedValue([]);
  vi.mocked(db.asset.findMany).mockResolvedValue([]);
}

beforeEach(() => {
  vi.resetAllMocks();
  // No offered quantity-tracked item unless a test says otherwise.
  vi.mocked(db.asset.findMany).mockResolvedValue([]);
  // Nothing has expired: the rows come back as they went in.
  vi.mocked(refreshExpiredAssetImages).mockImplementation(
    (assets) => Promise.resolve(assets) as never
  );
  vi.mocked(refreshExpiredKitImages).mockImplementation(
    (kits) => Promise.resolve(kits) as never
  );
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
  it("offers tagged, active items: available individual ones outside kits, and quantity-tracked ones with a free unit", async () => {
    counts(0, 1);
    quantityItems([]);
    vi.mocked(db.asset.findMany).mockResolvedValueOnce([
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
      AND: [{ OR: [{ tags: { some: { id: TAG } } }] }, kindRule()],
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
          units: null,
          contents: null,
          imageUrl: null,
        },
      ],
      page: 1,
      totalPages: 1,
      totalCount: 1,
    });
  });

  it("lists kits first, then items, and counts both", async () => {
    counts(1, 1);
    quantityItems([]);
    vi.mocked(db.kit.findMany).mockResolvedValue([
      {
        ...kitRow("k1", "Trauma kit", 1),
        assetKits: [
          { quantity: 20, asset: unitsRow("q1", "Bandages") },
          { quantity: 1, asset: row("a9", "Splint") },
        ],
      },
    ] as never);
    vi.mocked(db.asset.findMany).mockResolvedValueOnce([
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
      itemCount: 2,
      units: null,
      // What is inside, with the kit's share of a quantity-tracked item.
      contents: [
        { id: "q1", title: "Bandages", quantity: 20, imageUrl: null },
        { id: "a9", title: "Splint", quantity: null, imageUrl: null },
      ],
      imageUrl: null,
    });
    expect(db.kit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          assetKits: expect.objectContaining({
            where: { asset: { archivedAt: null } },
          }),
        }),
      })
    );
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

  it("shows each row's picture: the item's thumbnail, its model's cover, or the kit's", async () => {
    counts(1, 2);
    quantityItems([]);
    vi.mocked(db.kit.findMany).mockResolvedValue([
      {
        ...kitRow("k1", "Trauma kit", 0),
        image: "https://storage/kits/k1.jpg",
        assetKits: [
          {
            quantity: 1,
            asset: {
              ...row("a9", "Splint"),
              mainImage: "https://storage/a9.jpg",
              thumbnailImage: "https://storage/a9-thumb.jpg",
            },
          },
        ],
      },
    ] as never);
    vi.mocked(db.asset.findMany).mockResolvedValueOnce([
      {
        ...row("a1", "Radio #12"),
        mainImage: "https://storage/a1.jpg",
        thumbnailImage: "https://storage/a1-thumb.jpg",
      },
      {
        ...row("a2", "Torch"),
        assetModel: {
          image: "https://storage/models/torch.jpg",
          thumbnailImage: "https://storage/models/torch-thumb.jpg",
        },
      },
    ] as never);

    const page = await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: ALL,
      page: 1,
    });

    expect(page.items.map((entry) => entry.imageUrl)).toEqual([
      "https://storage/kits/k1.jpg",
      "https://storage/a1-thumb.jpg",
      "https://storage/models/torch-thumb.jpg",
    ]);
    expect(page.items[0].contents).toEqual([
      expect.objectContaining({ imageUrl: "https://storage/a9-thumb.jpg" }),
    ]);
  });

  it("re-signs expired pictures of the items and the kits' items in one pass", async () => {
    counts(1, 1);
    quantityItems([]);
    const expired = new Date("2026-01-01");
    vi.mocked(db.kit.findMany).mockResolvedValue([
      {
        ...kitRow("k1", "Trauma kit", 0),
        assetKits: [
          {
            quantity: 1,
            asset: {
              ...row("a9", "Splint"),
              mainImage: "https://storage/old-a9.jpg",
              mainImageExpiration: expired,
            },
          },
        ],
      },
    ] as never);
    vi.mocked(db.asset.findMany).mockResolvedValueOnce([
      {
        ...row("a1", "Radio #12"),
        mainImage: "https://storage/old-a1.jpg",
        mainImageExpiration: expired,
      },
    ] as never);
    vi.mocked(refreshExpiredAssetImages).mockImplementation(
      (assets) =>
        Promise.resolve(
          assets.map((asset) => ({
            ...asset,
            mainImage: `https://storage/new-${asset.id}.jpg`,
            mainImageExpiration: new Date("2026-12-01"),
          }))
        ) as never
    );

    const page = await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: ALL,
      page: 1,
    });

    expect(refreshExpiredAssetImages).toHaveBeenCalledTimes(1);
    expect(refreshExpiredAssetImages).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: "a1" }),
        expect.objectContaining({ id: "a9" }),
      ],
      expect.objectContaining({ organizationId: ORG, maxRefreshes: 100 })
    );
    expect(page.items[1].imageUrl).toBe("https://storage/new-a1.jpg");
    expect(page.items[0].contents?.[0].imageUrl).toBe(
      "https://storage/new-a9.jpg"
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

  it("offers a quantity-tracked item while it has free units, and shows how many", async () => {
    quantityItems([
      { id: "q1", quantity: 10, inCustody: 3 },
      { id: "q2", quantity: 5, inCustody: 5 },
    ]);
    vi.mocked(db.kit.count).mockResolvedValue(0);
    vi.mocked(db.asset.count).mockResolvedValue(1);
    vi.mocked(db.asset.findMany).mockResolvedValueOnce([
      unitsRow("q1", "Bandages", true),
    ] as never);

    const page = await listOfferedItems({
      organizationId: ORG,
      offer: BY_TAG,
      filters: { ...ALL, kind: "item" },
      page: 1,
    });

    // q2 has every unit in custody, so it is left out of the list.
    expect(db.asset.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: [expect.anything(), kindRule(["q1"])],
      }),
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        id: "q1",
        units: { count: 7, oneWay: true },
      }),
    ]);
    expect(db.custody.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assetId: { in: ["q1", "q2"] },
          kitCustodyId: null,
          asset: { organizationId: ORG },
        },
      })
    );
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
          kindRule(),
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
          kindRule(),
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

    expect(where.AND).toContainEqual({ id: { in: [] } });
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
      AND: [{ OR: [{ tags: { some: { id: TAG } } }] }, kindRule()],
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
  it("lists the volunteer's kits, then their own, not kit-held, custody of active items with the units they hold", async () => {
    vi.mocked(db.kit.findMany).mockResolvedValue([
      kitRow("k1", "Trauma kit"),
    ] as never);
    vi.mocked(db.asset.findMany).mockResolvedValue([
      {
        ...unitsRow("q1", "Bandages"),
        custody: [{ quantity: 2 }, { quantity: 3 }],
      },
      { ...row("a2", "Torch"), custody: [{ quantity: 1 }] },
    ] as never);

    const items = await listVolunteerItems({
      organizationId: ORG,
      teamMemberId: "tm-1",
    });

    expect(items.map((entry) => [entry.kind, entry.id, entry.units])).toEqual([
      ["kit", "k1", null],
      ["item", "q1", { count: 5, oneWay: false }],
      ["item", "a2", null],
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
          custody: { some: { teamMemberId: "tm-1", kitCustodyId: null } },
        },
        select: expect.objectContaining({
          custody: {
            where: { teamMemberId: "tm-1", kitCustodyId: null },
            select: { quantity: true },
          },
        }),
      })
    );
  });
});
