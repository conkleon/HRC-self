/**
 * Self-Service Browse List
 *
 * Reads for the workspace's public browse page (`/self-service/:token`), where
 * a volunteer picks equipment from a list instead of scanning its QR code:
 * the workspace behind a browse link, the items offered for self-service, and
 * the items the volunteer already holds.
 *
 * Offered items are the ones an admin marked with the workspace's
 * self-service tag that are free to take right now: available, active,
 * individual assets outside any kit. Taking re-checks all of this inside the
 * claim (`selfTakeCustody` with `requiredTagId`), so the list is a view, not
 * the gate.
 *
 * @see {@link file://./custody.server.ts}
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 */
import type { Prisma } from "@prisma/client";
import { AssetStatus, AssetType } from "@prisma/client";

import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";
import type {
  SelfCustodyAsset,
  SelfCustodyOrganization,
} from "./custody.server";

/** Items per page of the browse list. */
export const BROWSE_PAGE_SIZE = 20;

/** The workspace behind a browse link, with the tag that marks offered items. */
export type SelfCustodyBrowseOrganization = SelfCustodyOrganization & {
  selfCustodyTagId: string | null;
};

/** One page of offered items. */
type BrowsePage = {
  items: SelfCustodyAsset[];
  page: number;
  totalPages: number;
  totalCount: number;
};

/** The asset fields an item row shows, shared by both lists. */
const ITEM_SELECT = {
  id: true,
  title: true,
  thumbnailImage: true,
  assetLocations: {
    where: { assetKitId: null },
    select: { location: { select: { name: true } } },
    take: 1,
  },
} satisfies Prisma.AssetSelect;

/** Maps a selected asset to the row the page renders. */
function toItem(asset: {
  id: string;
  title: string;
  thumbnailImage: string | null;
  assetLocations: { location: { name: string } }[];
}): SelfCustodyAsset {
  return {
    id: asset.id,
    title: asset.title,
    thumbnailImage: asset.thumbnailImage,
    locationName: asset.assetLocations[0]?.location.name ?? null,
  };
}

/**
 * Resolves a browse link to its workspace.
 *
 * @param token - The secret path segment of the link
 * @returns The workspace, with its self-service settings and tag
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
 * Where clause for items a volunteer may take from the list: tagged for
 * self-service, available, active, individual and not in a kit.
 */
function offeredWhere({
  organizationId,
  tagId,
  query,
}: {
  organizationId: string;
  tagId: string;
  query: string;
}): Prisma.AssetWhereInput {
  const term = query.trim();
  return {
    organizationId,
    archivedAt: null,
    status: AssetStatus.AVAILABLE,
    type: AssetType.INDIVIDUAL,
    tags: { some: { id: tagId } },
    assetKits: { none: {} },
    ...(term ? { title: { contains: term, mode: "insensitive" } } : {}),
  };
}

/**
 * One page of the items offered for self-service, in name order.
 *
 * @param args.organizationId - The workspace of the browse link (server-resolved)
 * @param args.tagId - The workspace's self-service tag
 * @param args.query - Name filter, empty for all
 * @param args.page - 1-based page; out-of-range pages are clamped
 * @returns The items and the page position
 */
export async function listOfferedItems({
  organizationId,
  tagId,
  query,
  page,
}: {
  organizationId: string;
  tagId: string;
  query: string;
  page: number;
}): Promise<BrowsePage> {
  const where = offeredWhere({ organizationId, tagId, query });
  const totalCount = await db.asset.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / BROWSE_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);

  const assets = await db.asset.findMany({
    where,
    select: ITEM_SELECT,
    orderBy: { title: "asc" },
    skip: (current - 1) * BROWSE_PAGE_SIZE,
    take: BROWSE_PAGE_SIZE,
  });

  return {
    items: assets.map(toItem),
    page: current,
    totalPages,
    totalCount,
  };
}

/**
 * The items a volunteer holds that they can return themselves: their own
 * (not kit-held) custody of active, individual items, tagged or not.
 *
 * @param args.organizationId - The workspace of the browse link (server-resolved)
 * @param args.teamMemberId - The volunteer, already proven to be an NRM of the workspace
 * @returns The items, in name order
 */
export async function listVolunteerItems({
  organizationId,
  teamMemberId,
}: {
  organizationId: string;
  teamMemberId: string;
}): Promise<SelfCustodyAsset[]> {
  const assets = await db.asset.findMany({
    where: {
      organizationId,
      archivedAt: null,
      type: AssetType.INDIVIDUAL,
      custody: { some: { teamMemberId, kitCustodyId: null } },
    },
    select: ITEM_SELECT,
    orderBy: { title: "asc" },
  });
  return assets.map(toItem);
}
