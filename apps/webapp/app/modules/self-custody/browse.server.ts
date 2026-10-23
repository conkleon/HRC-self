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
 * take right now: available, active, individual assets outside any kit. A kit
 * is offered when it is offered itself (every active item tagged, or the kit
 * stored in an offered location), it is available and nobody holds it, and
 * none of its individual items is out. Taking re-checks all of this inside the
 * claim (`selfTakeCustody` with `requiredOffer`, `selfTakeKitCustody`), so the
 * list is a view, not the gate.
 *
 * @see {@link file://./offer.server.ts}
 * @see {@link file://./custody.server.ts}
 * @see {@link file://./kit-custody.server.ts}
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 */
import type { Prisma } from "@prisma/client";
import { AssetStatus, AssetType, KitStatus } from "@prisma/client";

import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";
import type { SelfCustodyOrganization } from "./custody.server";
import { offeredAssetMatch, offeredKitMatch } from "./offer.server";
import type { SelfCustodyOffer } from "./offer.server";

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
};

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
  name: true,
  category: { select: { name: true } },
  location: { select: { name: true } },
  _count: {
    select: { assetKits: { where: { asset: { archivedAt: null } } } },
  },
} satisfies Prisma.KitSelect;

/** Maps a selected asset to the row the page renders. */
function assetEntry(asset: {
  id: string;
  title: string;
  category: { name: string } | null;
  assetLocations: { location: { name: string } }[];
}): BrowseEntry {
  return {
    kind: "item",
    id: asset.id,
    title: asset.title,
    locationName: asset.assetLocations[0]?.location.name ?? null,
    categoryName: asset.category?.name ?? null,
    itemCount: null,
  };
}

/** Maps a selected kit to the row the page renders. */
function kitEntry(kit: {
  id: string;
  name: string;
  category: { name: string } | null;
  location: { name: string } | null;
  _count: { assetKits: number };
}): BrowseEntry {
  return {
    kind: "kit",
    id: kit.id,
    title: kit.name,
    locationName: kit.location?.name ?? null,
    categoryName: kit.category?.name ?? null,
    itemCount: kit._count.assetKits,
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
 * Where clause for items a volunteer may take from the list: offered (by tag
 * or location), available, active, individual and not in a kit.
 */
function offeredAssetWhere({
  organizationId,
  offer,
  filters,
}: {
  organizationId: string;
  offer: SelfCustodyOffer;
  filters?: Partial<BrowseFilters>;
}): Prisma.AssetWhereInput {
  const term = filters?.query?.trim() ?? "";
  return {
    organizationId,
    archivedAt: null,
    status: AssetStatus.AVAILABLE,
    type: AssetType.INDIVIDUAL,
    assetKits: { none: {} },
    // Under AND so the offer's location rule never meets the volunteer's
    // own location filter below.
    AND: [offeredAssetMatch(offer)],
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
 * or the kit stored in an offered location), and no active individual item
 * out of the depot. Archived items are left out of kit custody, so they
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
  const kitWhere = offeredKitWhere({ organizationId, offer, filters });
  const assetWhere = offeredAssetWhere({ organizationId, offer, filters });

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

  return {
    items: [...kits.map(kitEntry), ...assets.map(assetEntry)],
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
  const asset = offeredAssetWhere({ organizationId, offer });
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
 * custody, then their own (not kit-held) custody of active, individual items,
 * offered or not.
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
        type: AssetType.INDIVIDUAL,
        custody: { some: { teamMemberId, kitCustodyId: null } },
      },
      select: ASSET_ENTRY_SELECT,
      orderBy: { title: "asc" },
    }),
  ]);
  return [...kits.map(kitEntry), ...assets.map(assetEntry)];
}
