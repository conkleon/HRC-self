/**
 * Self-Service Browse List
 *
 * Reads for the workspace's public browse page (`/self-service/:token`), where
 * a volunteer picks equipment from a list instead of scanning its QR code:
 * the workspace behind a browse link, the items and kits offered for
 * self-service, the filter choices for that list, and what the volunteer
 * already holds.
 *
 * Offered items are the ones an admin offered, by the workspace's
 * self-service tag or by location (see `offer.server.ts`), that are free to
 * take right now: active individual assets that are available and outside any
 * kit, and active quantity-tracked assets with at least one free unit (see
 * `getFreeUnitsByAsset`), never one marked unavailable for bookings
 * (`availableToBook`, e.g. awaiting repair). A kit
 * is offered when it is offered itself (every active item tagged, or the kit
 * stored in an offered location), it is available and nobody holds it, none
 * of its individual items is out, and none of its items is marked
 * unavailable. Taking re-checks all of this inside the
 * claim (`selfTakeCustody` with `requiredOffer`, `selfTakeQuantity`,
 * `selfTakeKitCustody`), so the list is a view, not the gate.
 *
 * Rows carry a thumbnail: the item's own picture or its model's cover, the
 * kit's picture, and those of a kit's items. They are signed storage URLs, so
 * every list re-signs the expired ones before the page is sent
 * (`withFreshImages`); the phone never repairs one itself.
 *
 * @see {@link file://./offer.server.ts}
 * @see {@link file://./custody.server.ts}
 * @see {@link file://./kit-custody.server.ts}
 * @see {@link file://./quantity.server.ts}
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 */
import type { Prisma } from "@prisma/client";
import {
  AssetStatus,
  AssetType,
  ConsumptionType,
  KitStatus,
} from "@prisma/client";

import { db } from "~/database/db.server";
import { resolveAssetImage } from "~/modules/asset/image-resolution";
import type { AssetWithResolvableImage } from "~/modules/asset/image-resolution";
import { ASSET_MODEL_IMAGE_SELECT } from "~/modules/asset/image-select";
import {
  ASSET_IMAGE_RESIGN_LIMITS,
  refreshExpiredAssetImages,
} from "~/modules/asset/service.server";
import { refreshExpiredKitImages } from "~/modules/kit/service.server";
import { ShelfError } from "~/utils/error";
import type { SelfCustodyOrganization } from "./custody.server";
import { offeredAssetMatch, offeredKitMatch } from "./offer.server";
import type { SelfCustodyOffer } from "./offer.server";
import { getFreeUnitsByAsset } from "./quantity.server";

/** Entries per page of the browse list. */
export const BROWSE_PAGE_SIZE = 20;

/**
 * The workspace behind a browse link, with the tag and the locations that
 * offer items. Turn them into a `SelfCustodyOffer` with
 * `resolveSelfCustodyOffer` before listing or claiming.
 */
export type SelfCustodyBrowseOrganization = SelfCustodyOrganization & {
  selfCustodyTagId: string | null;
  selfCustodyLocations: { id: string }[];
};

/** Which entries the list shows: both, single items only, or kits only. */
type BrowseKind = "all" | "item" | "kit";

/** The volunteer's narrowing of the offered list. */
export type BrowseFilters = {
  /** Name search, empty for all. */
  query: string;
  kind: BrowseKind;
  /** Only entries stored at this location, or null for any. */
  locationId: string | null;
  /** Only entries in this category, or null for any. */
  categoryId: string | null;
};

/** One row of either list: a single item or a kit. */
type BrowseEntry = {
  kind: "item" | "kit";
  id: string;
  title: string;
  locationName: string | null;
  categoryName: string | null;
  /** Active items in the kit; null for a single item. */
  itemCount: number | null;
  /**
   * For a quantity-tracked item: the free units on the offered list, the
   * units the volunteer holds on their own list, and whether the item is
   * consumable (one-way). Null for an individual item and for a kit.
   */
  units: BrowseUnits | null;
  /** What a kit holds, its active items by name; null for a single item. */
  contents: KitContent[] | null;
  /** Thumbnail to show, or null for none (the page shows an icon). */
  imageUrl: string | null;
};

/**
 * One active item of a kit. `quantity` is the kit's share of a
 * quantity-tracked item (`AssetKit.quantity`), null for an individual item.
 */
type KitContent = {
  id: string;
  title: string;
  quantity: number | null;
  /** Thumbnail to show, or null for none. */
  imageUrl: string | null;
};

/** The asset columns a thumbnail is resolved and re-signed from. */
const ASSET_IMAGE_SELECT = {
  mainImage: true,
  mainImageExpiration: true,
  thumbnailImage: true,
  ...ASSET_MODEL_IMAGE_SELECT,
} satisfies Prisma.AssetSelect;

/** An asset's thumbnail URL, or null when only the placeholder would show. */
function thumbnailOf(asset: AssetWithResolvableImage): string | null {
  const resolved = resolveAssetImage(asset);
  return resolved.source === "placeholder" ? null : resolved.thumbnailUrl;
}

/** The unit count of a quantity-tracked row; see `BrowseEntry.units`. */
type BrowseUnits = { count: number; oneWay: boolean };

/** One page of offered entries: kits first, then single items, each by name. */
type BrowsePage = {
  items: BrowseEntry[];
  page: number;
  totalPages: number;
  totalCount: number;
};

/** A location or category the volunteer can filter by. */
type FilterOption = { id: string; name: string };

/** The asset fields an item row shows, shared by both lists. */
const ASSET_ENTRY_SELECT = {
  id: true,
  title: true,
  type: true,
  consumptionType: true,
  ...ASSET_IMAGE_SELECT,
  category: { select: { name: true } },
  assetLocations: {
    where: { assetKitId: null },
    select: { location: { select: { name: true } } },
    take: 1,
  },
} satisfies Prisma.AssetSelect;

/** The kit fields a kit row shows, shared by both lists. */
const KIT_ENTRY_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  image: true,
  imageExpiration: true,
  category: { select: { name: true } },
  location: { select: { name: true } },
  // Active items only, matching the item count: archived items are left out
  // of kit custody.
  assetKits: {
    where: { asset: { archivedAt: null } },
    select: {
      quantity: true,
      asset: {
        select: { id: true, title: true, type: true, ...ASSET_IMAGE_SELECT },
      },
    },
    orderBy: { asset: { title: "asc" } },
  },
} satisfies Prisma.KitSelect;

/**
 * Maps a selected asset to the row the page renders.
 *
 * @param unitCount - For a quantity-tracked asset, the units the row shows
 *   (free or held, by list); ignored for an individual asset
 */
function assetEntry(
  asset: {
    id: string;
    title: string;
    type: AssetType;
    consumptionType: ConsumptionType | null;
    category: { name: string } | null;
    assetLocations: { location: { name: string } }[];
  } & AssetWithResolvableImage,
  unitCount: number
): BrowseEntry {
  return {
    kind: "item",
    id: asset.id,
    title: asset.title,
    locationName: asset.assetLocations[0]?.location.name ?? null,
    categoryName: asset.category?.name ?? null,
    itemCount: null,
    units:
      asset.type === AssetType.QUANTITY_TRACKED
        ? {
            count: unitCount,
            oneWay: asset.consumptionType === ConsumptionType.ONE_WAY,
          }
        : null,
    contents: null,
    imageUrl: thumbnailOf(asset),
  };
}

/** Maps a selected kit to the row the page renders. */
function kitEntry(kit: {
  id: string;
  name: string;
  image: string | null;
  category: { name: string } | null;
  location: { name: string } | null;
  assetKits: {
    quantity: number;
    asset: {
      id: string;
      title: string;
      type: AssetType;
    } & AssetWithResolvableImage;
  }[];
}): BrowseEntry {
  return {
    kind: "kit",
    id: kit.id,
    title: kit.name,
    locationName: kit.location?.name ?? null,
    categoryName: kit.category?.name ?? null,
    itemCount: kit.assetKits.length,
    units: null,
    contents: kit.assetKits.map(({ quantity, asset }) => ({
      id: asset.id,
      title: asset.title,
      quantity: asset.type === AssetType.QUANTITY_TRACKED ? quantity : null,
      imageUrl: thumbnailOf(asset),
    })),
    imageUrl: kit.image,
  };
}

/** The image columns of a kit row and its items, as the lists select them. */
type KitImageRow = {
  id: string;
  organizationId: string;
  image: string | null;
  imageExpiration: Date | null;
  assetKits: {
    asset: {
      id: string;
      mainImage: string | null;
      mainImageExpiration: Date | null;
      thumbnailImage: string | null;
    };
  }[];
};

/** The image columns of an item row, as the lists select them. */
type AssetImageRow = {
  id: string;
  mainImage: string | null;
  mainImageExpiration: Date | null;
  thumbnailImage: string | null;
};

/**
 * Re-signs the expired picture URLs of one page of rows: the items, the kits
 * and the kits' items, in one bounded pass per model. A picture that cannot
 * be re-signed keeps its stale URL, and the page falls back to an icon.
 *
 * @returns The same rows, in the same order, with fresh URLs merged in
 */
async function withFreshImages<K extends KitImageRow, A extends AssetImageRow>({
  organizationId,
  kits,
  assets,
}: {
  organizationId: string;
  kits: K[];
  assets: A[];
}): Promise<{ kits: K[]; assets: A[] }> {
  const kitItems = kits.flatMap((kit) => kit.assetKits.map((ak) => ak.asset));
  const [freshKits, freshAssets] = await Promise.all([
    refreshExpiredKitImages(kits),
    refreshExpiredAssetImages([...assets, ...kitItems], {
      organizationId,
      ...ASSET_IMAGE_RESIGN_LIMITS,
    }),
  ]);

  const byId = new Map(freshAssets.map((asset) => [asset.id, asset]));
  /** An asset row with whatever was re-signed for its id. */
  const fresh = <T extends AssetImageRow>(asset: T): T => {
    const signed = byId.get(asset.id);
    return signed
      ? {
          ...asset,
          mainImage: signed.mainImage,
          mainImageExpiration: signed.mainImageExpiration,
          thumbnailImage: signed.thumbnailImage ?? asset.thumbnailImage,
        }
      : asset;
  };

  return {
    kits: freshKits.map((kit) => ({
      ...kit,
      assetKits: kit.assetKits.map((ak) => ({ ...ak, asset: fresh(ak.asset) })),
    })),
    assets: assets.map(fresh),
  };
}

/**
 * Resolves a browse link to its workspace.
 *
 * @param token - The secret path segment of the link
 * @returns The workspace, with its self-service settings, tag and locations
 * @throws {ShelfError} 404 when no workspace has this token
 */
export async function getBrowseWorkspace(
  token: string
): Promise<SelfCustodyBrowseOrganization> {
  const organization = await db.organization.findUnique({
    where: { selfCustodyBrowseToken: token },
    select: {
      id: true,
      name: true,
      selfCustodyEnabled: true,
      selfCustodyPinHash: true,
      selfCustodyPinUpdatedAt: true,
      selfCustodyTagId: true,
      selfCustodyLocations: { select: { id: true } },
    },
  });

  if (!organization) {
    throw new ShelfError({
      cause: null,
      title: "Link not found",
      message:
        "This self-service link is not valid any more. Please ask a staff member for the new one.",
      label: "Custody",
      status: 404,
      shouldBeCaptured: false,
    });
  }
  return organization;
}

/**
 * The offered quantity-tracked items and their free units. Read before the
 * list is paged, so an item with nothing left is left out of the counts and
 * the pages rather than shown greyed out.
 */
async function offeredUnits({
  organizationId,
  offer,
}: {
  organizationId: string;
  offer: SelfCustodyOffer;
}): Promise<Map<string, number>> {
  const assets = await db.asset.findMany({
    where: {
      organizationId,
      archivedAt: null,
      availableToBook: true,
      type: AssetType.QUANTITY_TRACKED,
      AND: [offeredAssetMatch(offer)],
    },
    select: { id: true, quantity: true },
  });
  return getFreeUnitsByAsset({ organizationId, assets });
}

/** The ids of the quantity-tracked items that have a free unit. */
function withFreeUnits(freeUnits: Map<string, number>): string[] {
  return [...freeUnits].filter(([, free]) => free > 0).map(([id]) => id);
}

/**
 * Where clause for items a volunteer may take from the list: offered (by tag
 * or location), active, and either an available individual item outside any
 * kit or a quantity-tracked item in `quantityAssetIds` (those with a free
 * unit). A quantity-tracked item can have units in kits, in custody or out on
 * a booking and still have free units, so its status and kits do not count.
 */
function offeredAssetWhere({
  organizationId,
  offer,
  quantityAssetIds,
  filters,
}: {
  organizationId: string;
  offer: SelfCustodyOffer;
  quantityAssetIds: string[];
  filters?: Partial<BrowseFilters>;
}): Prisma.AssetWhereInput {
  const term = filters?.query?.trim() ?? "";
  return {
    organizationId,
    archivedAt: null,
    availableToBook: true,
    // Under AND so the offer's location rule never meets the volunteer's
    // own location filter below.
    AND: [
      offeredAssetMatch(offer),
      {
        OR: [
          {
            type: AssetType.INDIVIDUAL,
            status: AssetStatus.AVAILABLE,
            assetKits: { none: {} },
          },
          {
            type: AssetType.QUANTITY_TRACKED,
            id: { in: quantityAssetIds },
          },
        ],
      },
    ],
    ...(term ? { title: { contains: term, mode: "insensitive" } } : {}),
    ...(filters?.locationId
      ? {
          assetLocations: {
            some: { locationId: filters.locationId, assetKitId: null },
          },
        }
      : {}),
    ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
  };
}

/**
 * Where clause for kits a volunteer may take from the list: available, held
 * by nobody, with at least one active item, offered (every active item tagged,
 * or the kit stored in an offered location), no active individual item out
 * of the depot, and no active item marked unavailable (awaiting repair, say). Archived items are left out of kit custody, so they
 * neither block nor qualify a kit.
 *
 * Also the eligibility check of `selfTakeKitCustody`, so the list and the
 * claim cannot disagree about which kits may be taken.
 */
export function offeredKitWhere({
  organizationId,
  offer,
  filters,
}: {
  organizationId: string;
  offer: SelfCustodyOffer;
  filters?: Partial<BrowseFilters>;
}): Prisma.KitWhereInput {
  const term = filters?.query?.trim() ?? "";
  return {
    organizationId,
    status: KitStatus.AVAILABLE,
    custody: { is: null },
    AND: [
      { assetKits: { some: { asset: { archivedAt: null } } } },
      offeredKitMatch(offer),
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
      {
        assetKits: {
          none: { asset: { archivedAt: null, availableToBook: false } },
        },
      },
    ],
    ...(term ? { name: { contains: term, mode: "insensitive" } } : {}),
    ...(filters?.locationId ? { locationId: filters.locationId } : {}),
    ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
  };
}

/**
 * The slice of one model that falls on a page of a list made of `before`
 * rows of another model followed by this one.
 */
function sliceAfter({
  before,
  count,
  start,
  size,
}: {
  before: number;
  count: number;
  start: number;
  size: number;
}): { skip: number; take: number } {
  const from = Math.max(0, start - before);
  const to = Math.min(count, start + size - before);
  return { skip: from, take: Math.max(0, to - from) };
}

/**
 * One page of the kits and items offered for self-service. Kits come first,
 * then single items, each in name order, so a page can hold the end of the
 * kits and the start of the items.
 *
 * @param args.organizationId - The workspace of the browse link (server-resolved)
 * @param args.offer - What the workspace offers, from `resolveSelfCustodyOffer`
 * @param args.filters - Search, kind, location and category
 * @param args.page - 1-based page; out-of-range pages are clamped
 * @returns The entries and the page position
 */
export async function listOfferedItems({
  organizationId,
  offer,
  filters,
  page,
}: {
  organizationId: string;
  offer: SelfCustodyOffer;
  filters: BrowseFilters;
  page: number;
}): Promise<BrowsePage> {
  // A kits-only list has no single items, so no units to read.
  const freeUnits =
    filters.kind === "kit"
      ? new Map<string, number>()
      : await offeredUnits({ organizationId, offer });
  const kitWhere = offeredKitWhere({ organizationId, offer, filters });
  const assetWhere = offeredAssetWhere({
    organizationId,
    offer,
    quantityAssetIds: withFreeUnits(freeUnits),
    filters,
  });

  const [kitCount, assetCount] = await Promise.all([
    filters.kind === "item" ? 0 : db.kit.count({ where: kitWhere }),
    filters.kind === "kit" ? 0 : db.asset.count({ where: assetWhere }),
  ]);
  const totalCount = kitCount + assetCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / BROWSE_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (current - 1) * BROWSE_PAGE_SIZE;

  const kitSlice = sliceAfter({
    before: 0,
    count: kitCount,
    start,
    size: BROWSE_PAGE_SIZE,
  });
  const assetSlice = sliceAfter({
    before: kitCount,
    count: assetCount,
    start,
    size: BROWSE_PAGE_SIZE,
  });

  const [kits, assets] = await Promise.all([
    kitSlice.take > 0
      ? db.kit.findMany({
          where: kitWhere,
          select: KIT_ENTRY_SELECT,
          orderBy: { name: "asc" },
          ...kitSlice,
        })
      : [],
    assetSlice.take > 0
      ? db.asset.findMany({
          where: assetWhere,
          select: ASSET_ENTRY_SELECT,
          orderBy: { title: "asc" },
          ...assetSlice,
        })
      : [],
  ]);

  const fresh = await withFreshImages({ organizationId, kits, assets });
  return {
    items: [
      ...fresh.kits.map(kitEntry),
      ...fresh.assets.map((asset) =>
        assetEntry(asset, freeUnits.get(asset.id) ?? 0)
      ),
    ],
    page: current,
    totalPages,
    totalCount,
  };
}

/**
 * The locations and categories that hold at least one offered kit or item,
 * for the list's filters. Only places and categories with something to take
 * are listed, so no choice leads to an empty list on its own.
 *
 * @param args.organizationId - The workspace of the browse link (server-resolved)
 * @param args.offer - What the workspace offers, from `resolveSelfCustodyOffer`
 * @returns Both lists, in name order
 */
export async function listBrowseFilterOptions({
  organizationId,
  offer,
}: {
  organizationId: string;
  offer: SelfCustodyOffer;
}): Promise<{ locations: FilterOption[]; categories: FilterOption[] }> {
  const freeUnits = await offeredUnits({ organizationId, offer });
  const asset = offeredAssetWhere({
    organizationId,
    offer,
    quantityAssetIds: withFreeUnits(freeUnits),
  });
  const kit = offeredKitWhere({ organizationId, offer });

  const [locations, categories] = await Promise.all([
    db.location.findMany({
      where: {
        organizationId,
        OR: [
          { assetLocations: { some: { assetKitId: null, asset } } },
          { kits: { some: kit } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.category.findMany({
      where: {
        organizationId,
        OR: [{ assets: { some: asset } }, { kits: { some: kit } }],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { locations, categories };
}

/**
 * What a volunteer holds and can return themselves: the kits in their
 * custody, then their own (not kit-held) custody of active items, offered or
 * not. A quantity-tracked item shows the units they hold.
 *
 * @param args.organizationId - The workspace of the browse link (server-resolved)
 * @param args.teamMemberId - The volunteer, already proven to be an NRM of the workspace
 * @returns Kits then items, each in name order
 */
export async function listVolunteerItems({
  organizationId,
  teamMemberId,
}: {
  organizationId: string;
  teamMemberId: string;
}): Promise<BrowseEntry[]> {
  const [kits, assets] = await Promise.all([
    db.kit.findMany({
      where: { organizationId, custody: { is: { custodianId: teamMemberId } } },
      select: KIT_ENTRY_SELECT,
      orderBy: { name: "asc" },
    }),
    db.asset.findMany({
      where: {
        organizationId,
        archivedAt: null,
        custody: { some: { teamMemberId, kitCustodyId: null } },
      },
      select: {
        ...ASSET_ENTRY_SELECT,
        // Units held by this volunteer, from their own custody rows only.
        custody: {
          where: { teamMemberId, kitCustodyId: null },
          select: { quantity: true },
        },
      },
      orderBy: { title: "asc" },
    }),
  ]);
  const fresh = await withFreshImages({ organizationId, kits, assets });
  return [
    ...fresh.kits.map(kitEntry),
    ...fresh.assets.map((asset) =>
      assetEntry(
        asset,
        asset.custody.reduce((sum, row) => sum + row.quantity, 0)
      )
    ),
  ];
}
