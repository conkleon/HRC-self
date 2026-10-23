/**
 * Self-Service Offer
 *
 * What the browse list offers, as one rule shared by the list, its filter
 * choices and both claims (`selfTakeCustody`, `selfTakeKitCustody`), so they
 * cannot disagree about what a volunteer may take.
 *
 * An admin offers items two ways, and either is enough:
 * - **by tag:** items carrying the workspace's self-service tag;
 * - **by location:** items stored in one of the chosen locations, or in any
 *   location below one of them.
 *
 * A kit cannot carry tags, so it is offered by tag when every active item in
 * it carries the tag, and by location when the kit itself is stored in one of
 * those locations. The availability conditions (free, active, not in a kit)
 * live in the browse where clauses; this module answers only "is it offered".
 *
 * @see {@link file://./browse.server.ts}
 * @see {@link file://./location-tree.ts}
 */
import type { Prisma } from "@prisma/client";

import { db } from "~/database/db.server";
import { expandLocationIds } from "./location-tree";

/**
 * The workspace's offer, with the chosen locations already widened to their
 * sub-locations by {@link resolveSelfCustodyOffer}.
 */
export type SelfCustodyOffer = {
  /** The self-service tag, or null when none is chosen. */
  tagId: string | null;
  /** The chosen locations and every location below them. */
  locationIds: string[];
};

/**
 * Builds the workspace's offer from its settings, widening each chosen
 * location to the locations below it. Reads the location tree only when a
 * location is chosen.
 *
 * @param args.organizationId - The workspace (server-resolved)
 * @param args.tagId - `Organization.selfCustodyTagId`
 * @param args.locationIds - The ids of `Organization.selfCustodyLocations`
 * @returns The offer to pass to the browse reads and the claims
 */
export async function resolveSelfCustodyOffer({
  organizationId,
  tagId,
  locationIds,
}: {
  organizationId: string;
  tagId: string | null;
  locationIds: string[];
}): Promise<SelfCustodyOffer> {
  if (locationIds.length === 0) return { tagId, locationIds: [] };

  const locations = await db.location.findMany({
    where: { organizationId },
    select: { id: true, parentId: true },
  });
  return { tagId, locationIds: expandLocationIds(locationIds, locations) };
}

/**
 * Whether the workspace offers anything at all: a tag or at least one
 * location is chosen. Without either, the list offers nothing.
 *
 * @param offer - The resolved offer
 * @returns True when a tag or a location is chosen
 */
export function hasSelfCustodyOffer(offer: SelfCustodyOffer): boolean {
  return Boolean(offer.tagId) || offer.locationIds.length > 0;
}

/**
 * Matches an item offered by tag or by location. Combine it with the
 * availability conditions under `AND`, so its `OR` never meets another one.
 *
 * With neither a tag nor a location the `OR` is empty, which Prisma reads as
 * "matches nothing": an empty offer offers nothing.
 *
 * @param offer - The resolved offer
 * @returns An asset where clause
 */
export function offeredAssetMatch(
  offer: SelfCustodyOffer
): Prisma.AssetWhereInput {
  return {
    OR: [
      ...(offer.tagId ? [{ tags: { some: { id: offer.tagId } } }] : []),
      ...(offer.locationIds.length > 0
        ? [
            {
              assetLocations: {
                some: {
                  locationId: { in: offer.locationIds },
                  assetKitId: null,
                },
              },
            },
          ]
        : []),
    ],
  };
}

/**
 * Matches a kit offered by tag (every active item in it tagged) or by
 * location (the kit stored in an offered location). Combine it with the
 * availability conditions under `AND`. An empty offer matches no kit.
 *
 * @param offer - The resolved offer
 * @returns A kit where clause
 */
export function offeredKitMatch(offer: SelfCustodyOffer): Prisma.KitWhereInput {
  return {
    OR: [
      ...(offer.tagId
        ? [
            {
              assetKits: {
                none: {
                  asset: {
                    archivedAt: null,
                    tags: { none: { id: offer.tagId } },
                  },
                },
              },
            },
          ]
        : []),
      ...(offer.locationIds.length > 0
        ? [{ locationId: { in: offer.locationIds } }]
        : []),
    ],
  };
}
