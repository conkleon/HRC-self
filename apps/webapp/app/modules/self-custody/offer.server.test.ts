// @vitest-environment node
/**
 * The self-service offer: resolving a workspace's tag and locations, and the
 * "offered by tag or by location" match shared by the list and the claims.
 *
 * @see {@link file://./offer.server.ts}
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/database/db.server";
import {
  hasSelfCustodyOffer,
  offeredAssetMatch,
  offeredKitMatch,
  resolveSelfCustodyOffer,
} from "./offer.server";

// why: unit tests run without a database; the location tree is the only read
vi.mock("~/database/db.server", () => ({
  db: { location: { findMany: vi.fn() } },
}));

const findLocations = vi.mocked(db.location.findMany);

beforeEach(() => vi.clearAllMocks());

describe("resolveSelfCustodyOffer", () => {
  it("widens each chosen location to its sub-locations", async () => {
    findLocations.mockResolvedValue([
      { id: "depot", parentId: null },
      { id: "shelf", parentId: "depot" },
      { id: "van", parentId: null },
    ] as never);

    await expect(
      resolveSelfCustodyOffer({
        organizationId: "org-1",
        tagId: "tag-ss",
        locationIds: ["depot"],
      })
    ).resolves.toEqual({ tagId: "tag-ss", locationIds: ["depot", "shelf"] });
    expect(findLocations).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      select: { id: true, parentId: true },
    });
  });

  it("skips the location read when no location is chosen", async () => {
    await expect(
      resolveSelfCustodyOffer({
        organizationId: "org-1",
        tagId: "tag-ss",
        locationIds: [],
      })
    ).resolves.toEqual({ tagId: "tag-ss", locationIds: [] });
    expect(findLocations).not.toHaveBeenCalled();
  });
});

describe("hasSelfCustodyOffer", () => {
  it("is true with a tag, with a location, or with both", () => {
    expect(hasSelfCustodyOffer({ tagId: "t", locationIds: [] })).toBe(true);
    expect(hasSelfCustodyOffer({ tagId: null, locationIds: ["l"] })).toBe(true);
    expect(hasSelfCustodyOffer({ tagId: "t", locationIds: ["l"] })).toBe(true);
  });

  it("is false with neither", () => {
    expect(hasSelfCustodyOffer({ tagId: null, locationIds: [] })).toBe(false);
  });
});

describe("offeredAssetMatch", () => {
  it("matches an item with the tag OR stored (outside a kit) at a location", () => {
    expect(
      offeredAssetMatch({ tagId: "tag-ss", locationIds: ["depot", "shelf"] })
    ).toEqual({
      OR: [
        { tags: { some: { id: "tag-ss" } } },
        {
          assetLocations: {
            some: { locationId: { in: ["depot", "shelf"] }, assetKitId: null },
          },
        },
      ],
    });
  });

  it("uses only the rule that is set", () => {
    expect(offeredAssetMatch({ tagId: "tag-ss", locationIds: [] })).toEqual({
      OR: [{ tags: { some: { id: "tag-ss" } } }],
    });
    expect(offeredAssetMatch({ tagId: null, locationIds: ["depot"] })).toEqual({
      OR: [
        {
          assetLocations: {
            some: { locationId: { in: ["depot"] }, assetKitId: null },
          },
        },
      ],
    });
  });

  it("matches nothing for an empty offer, even nested under AND", () => {
    // An empty OR would match every row once nested under AND.
    expect(offeredAssetMatch({ tagId: null, locationIds: [] })).toEqual({
      id: { in: [] },
    });
  });
});

describe("offeredKitMatch", () => {
  it("matches a kit whose items are all tagged OR that is stored at a location", () => {
    expect(
      offeredKitMatch({ tagId: "tag-ss", locationIds: ["depot"] })
    ).toEqual({
      OR: [
        {
          assetKits: {
            none: {
              asset: { archivedAt: null, tags: { none: { id: "tag-ss" } } },
            },
          },
        },
        { locationId: { in: ["depot"] } },
      ],
    });
  });

  it("matches no kit for an empty offer", () => {
    expect(offeredKitMatch({ tagId: null, locationIds: [] })).toEqual({
      id: { in: [] },
    });
  });
});
