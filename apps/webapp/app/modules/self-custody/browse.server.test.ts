// @vitest-environment node
/**
 * Tests for the self-service browse list: resolving a browse link, the items
 * offered for self-service, and the items a volunteer holds.
 *
 * @see {@link file://./browse.server.ts}
 */
import { AssetStatus, AssetType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/database/db.server";
import {
  BROWSE_PAGE_SIZE,
  getBrowseWorkspace,
  listOfferedItems,
  listVolunteerItems,
} from "./browse.server";

// why: unit tests run without a database; every query's where clause is asserted
vi.mock("~/database/db.server", () => ({
  db: {
    organization: { findUnique: vi.fn() },
    asset: { count: vi.fn(), findMany: vi.fn() },
  },
}));

const ORG = "org-1";

/** An asset row as the browse queries select it. */
const row = (id: string, title: string, location: string | null = null) => ({
  id,
  title,
  thumbnailImage: null,
  assetLocations: location ? [{ location: { name: location } }] : [],
});

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
      selfCustodyTagId: "tag-ss",
    };
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      organization as never
    );

    await expect(getBrowseWorkspace("tok")).resolves.toEqual(organization);
    expect(db.organization.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { selfCustodyBrowseToken: "tok" } })
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
    vi.mocked(db.asset.count).mockResolvedValue(1);
    vi.mocked(db.asset.findMany).mockResolvedValue([
      row("a1", "Radio #12", "Warehouse A"),
    ] as never);

    const page = await listOfferedItems({
      organizationId: ORG,
      tagId: "tag-ss",
      query: "",
      page: 1,
    });

    const where = {
      organizationId: ORG,
      archivedAt: null,
      status: AssetStatus.AVAILABLE,
      type: AssetType.INDIVIDUAL,
      tags: { some: { id: "tag-ss" } },
      assetKits: { none: {} },
    };
    expect(db.asset.count).toHaveBeenCalledWith({ where });
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { title: "asc" },
        skip: 0,
        take: BROWSE_PAGE_SIZE,
      })
    );
    expect(page).toEqual({
      items: [
        {
          id: "a1",
          title: "Radio #12",
          thumbnailImage: null,
          locationName: "Warehouse A",
        },
      ],
      page: 1,
      totalPages: 1,
      totalCount: 1,
    });
  });

  it("filters by name, ignoring case and surrounding spaces", async () => {
    vi.mocked(db.asset.count).mockResolvedValue(0);
    vi.mocked(db.asset.findMany).mockResolvedValue([]);

    await listOfferedItems({
      organizationId: ORG,
      tagId: "tag-ss",
      query: "  radio ",
      page: 1,
    });

    expect(db.asset.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        title: { contains: "radio", mode: "insensitive" },
      }),
    });
  });

  it("clamps a page past the end to the last page", async () => {
    vi.mocked(db.asset.count).mockResolvedValue(BROWSE_PAGE_SIZE + 1);
    vi.mocked(db.asset.findMany).mockResolvedValue([]);

    const page = await listOfferedItems({
      organizationId: ORG,
      tagId: "tag-ss",
      query: "",
      page: 99,
    });

    expect(page).toMatchObject({ page: 2, totalPages: 2 });
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: BROWSE_PAGE_SIZE })
    );
  });

  it("treats a page that is not a number as the first", async () => {
    vi.mocked(db.asset.count).mockResolvedValue(3);
    vi.mocked(db.asset.findMany).mockResolvedValue([]);

    const page = await listOfferedItems({
      organizationId: ORG,
      tagId: "tag-ss",
      query: "",
      page: Number("abc"),
    });

    expect(page.page).toBe(1);
  });
});

describe("listVolunteerItems", () => {
  it("lists the volunteer's own, not kit-held, custody of active individual items", async () => {
    vi.mocked(db.asset.findMany).mockResolvedValue([
      row("a2", "Torch"),
    ] as never);

    await expect(
      listVolunteerItems({ organizationId: ORG, teamMemberId: "tm-1" })
    ).resolves.toEqual([
      { id: "a2", title: "Torch", thumbnailImage: null, locationName: null },
    ]);
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
