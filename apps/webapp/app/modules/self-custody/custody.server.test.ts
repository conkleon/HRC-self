// @vitest-environment node
/**
 * Tests for self-service custody: what a scan shows, and taking or returning
 * an item without an account.
 *
 * @see {@link file://./custody.server.ts}
 */
import { AssetStatus, AssetType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/database/db.server";
import { recordEvent } from "~/modules/activity-event/service.server";
import { releaseAssetsToAvailableUnlessCheckedOut } from "~/modules/asset/custody-status.server";
import {
  assertNoKitDerivedCustody,
  assertNotKitMembers,
} from "~/modules/custody/service.server";
import {
  getSelfCustodyState,
  selfReturnCustody,
  selfTakeCustody,
} from "./custody.server";
import { sendSelfCustodyAlert } from "./notify.server";

// why: the transaction client stands in for Postgres; every Prisma call it receives is asserted
const tx = {
  asset: { updateMany: vi.fn(), findFirst: vi.fn() },
  custody: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  teamMember: { findFirst: vi.fn() },
  note: { create: vi.fn() },
};

// why: unit tests run without a database
vi.mock("~/database/db.server", () => ({
  db: {
    qr: { findUnique: vi.fn() },
    $transaction: vi.fn((callback: (client: unknown) => unknown) =>
      callback(tx)
    ),
  },
}));

// why: the kit guards take row locks with raw SQL; they have their own tests
vi.mock("~/modules/custody/service.server", () => ({
  assertNotKitMembers: vi.fn(),
  assertNoKitDerivedCustody: vi.fn(),
}));

// why: status write shared with the staff release path, covered by its own tests
vi.mock("~/modules/asset/custody-status.server", () => ({
  releaseAssetsToAvailableUnlessCheckedOut: vi.fn(),
}));

// why: the event writer resolves actor snapshots against the database; its input is asserted here
vi.mock("~/modules/activity-event/service.server", () => ({
  recordEvent: vi.fn(),
}));

// why: emails managers; covered by notify.server.test.ts
vi.mock("./notify.server", () => ({ sendSelfCustodyAlert: vi.fn() }));

const ORG = "org-1";
const organization = {
  id: ORG,
  name: "Hellenic Red Cross",
  selfCustodyEnabled: true,
  selfCustodyPinHash: "scrypt$aa$bb",
  selfCustodyPinUpdatedAt: new Date("2026-10-01"),
};

/** An asset as `getSelfCustodyState` selects it, with overrides. */
function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-1",
    title: "Radio #12",
    thumbnailImage: null,
    type: AssetType.INDIVIDUAL,
    status: AssetStatus.AVAILABLE,
    archivedAt: null,
    assetLocations: [{ location: { name: "Warehouse A" } }],
    assetKits: [],
    custody: [],
    ...overrides,
  };
}

function qrRow(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    kitId: null,
    organization,
    asset: assetRow(),
    ...overrides,
  };
}

const findQr = vi.mocked(db.qr.findUnique);

describe("getSelfCustodyState", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws 404 for an unknown QR or one no workspace has claimed", async () => {
    findQr.mockResolvedValueOnce(null);
    await expect(getSelfCustodyState({ qrId: "nope" })).rejects.toMatchObject({
      status: 404,
    });

    findQr.mockResolvedValueOnce(
      qrRow({ organizationId: null, organization: null }) as never
    );
    await expect(getSelfCustodyState({ qrId: "x" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("shows an available item with its location", async () => {
    findQr.mockResolvedValue(qrRow() as never);
    const { organization: org, state } = await getSelfCustodyState({
      qrId: "qr-1",
    });
    expect(org.id).toBe(ORG);
    expect(state).toEqual({
      kind: "available",
      asset: {
        id: "asset-1",
        title: "Radio #12",
        thumbnailImage: null,
        locationName: "Warehouse A",
      },
    });
  });

  it("names the holder of an item in custody, for an NRM and for a registered user", async () => {
    findQr.mockResolvedValueOnce(
      qrRow({
        asset: assetRow({
          status: AssetStatus.IN_CUSTODY,
          custody: [
            { kitCustodyId: null, custodian: { name: "Maria P.", user: null } },
          ],
        }),
      }) as never
    );
    const nrm = await getSelfCustodyState({ qrId: "qr-1" });
    expect(nrm.state).toMatchObject({
      kind: "in-custody",
      holderName: "Maria P.",
    });

    findQr.mockResolvedValueOnce(
      qrRow({
        asset: assetRow({
          status: AssetStatus.IN_CUSTODY,
          custody: [
            {
              kitCustodyId: null,
              custodian: {
                name: "eleni k",
                user: {
                  firstName: "Eleni",
                  lastName: "Kara",
                  displayName: "Eleni K.",
                },
              },
            },
          ],
        }),
      }) as never
    );
    const user = await getSelfCustodyState({ qrId: "qr-1" });
    expect(user.state).toMatchObject({
      kind: "in-custody",
      holderName: "Eleni K.",
    });
  });

  it.each([
    ["kit-qr", { kitId: "kit-1", asset: null }],
    ["not-linked", { asset: null }],
    ["archived", { asset: assetRow({ archivedAt: new Date() }) }],
    [
      "quantity-tracked",
      { asset: assetRow({ type: AssetType.QUANTITY_TRACKED }) },
    ],
    ["kit-member", { asset: assetRow({ assetKits: [{ id: "ak-1" }] }) }],
    [
      "kit-custody",
      {
        asset: assetRow({
          status: AssetStatus.IN_CUSTODY,
          custody: [
            {
              kitCustodyId: "kc-1",
              custodian: { name: "Maria P.", user: null },
            },
          ],
        }),
      },
    ],
    ["checked-out", { asset: assetRow({ status: AssetStatus.CHECKED_OUT }) }],
  ])("refers %s items to staff", async (reason, overrides) => {
    findQr.mockResolvedValue(qrRow(overrides) as never);
    const { state } = await getSelfCustodyState({ qrId: "qr-1" });
    expect(state).toMatchObject({ kind: "unsupported", reason });
  });
});

describe("selfTakeCustody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.teamMember.findFirst.mockResolvedValue({
      id: "tm-1",
      name: "Maria P.",
      user: null,
    });
    tx.asset.updateMany.mockResolvedValue({ count: 1 });
    tx.asset.findFirst.mockResolvedValue({
      title: "Radio #12",
      status: AssetStatus.IN_CUSTODY,
    });
  });

  const take = () =>
    selfTakeCustody({
      organizationId: ORG,
      workspaceName: "Hellenic Red Cross",
      assetId: "asset-1",
      teamMemberId: "tm-1",
    });

  it("claims the item only while it is an available, active, individual asset of the workspace", async () => {
    await expect(take()).resolves.toEqual({
      assetTitle: "Radio #12",
      volunteerName: "Maria P.",
    });

    expect(assertNotKitMembers).toHaveBeenCalledWith(tx, ["asset-1"], ORG);
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: {
        id: "asset-1",
        organizationId: ORG,
        status: AssetStatus.AVAILABLE,
        archivedAt: null,
        type: AssetType.INDIVIDUAL,
      },
      data: { status: AssetStatus.IN_CUSTODY },
    });
    expect(assertNoKitDerivedCustody).toHaveBeenCalledWith(
      tx,
      ["asset-1"],
      ORG
    );
    expect(tx.custody.create).toHaveBeenCalledWith({
      data: {
        custodian: { connect: { id: "tm-1" } },
        asset: { connect: { id: "asset-1" } },
      },
    });
  });

  it("records a self-service activity event and an unauthored note", async () => {
    await take();

    expect(recordEvent).toHaveBeenCalledWith(
      {
        organizationId: ORG,
        actorUserId: null,
        action: "CUSTODY_ASSIGNED",
        entityType: "ASSET",
        entityId: "asset-1",
        assetId: "asset-1",
        teamMemberId: "tm-1",
        meta: { via: "self-service" },
      },
      tx
    );
    expect(tx.note.create).toHaveBeenCalledWith({
      data: {
        content: "**Maria P.** took custody via self-service scan.",
        type: "UPDATE",
        asset: { connect: { id: "asset-1" } },
      },
    });
  });

  it("emails managers after the custody is taken", async () => {
    await take();
    expect(sendSelfCustodyAlert).toHaveBeenCalledWith({
      organizationId: ORG,
      workspaceName: "Hellenic Red Cross",
      kind: "taken",
      assetId: "asset-1",
      assetTitle: "Radio #12",
      volunteerName: "Maria P.",
      source: "scan",
    });
  });

  it("from the list, claims only an item the offer covers, by tag or location", async () => {
    await selfTakeCustody({
      organizationId: ORG,
      workspaceName: "Hellenic Red Cross",
      assetId: "asset-1",
      teamMemberId: "tm-1",
      requiredOffer: { tagId: "tag-ss", locationIds: ["loc-depot"] },
      source: "list",
    });

    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: {
        id: "asset-1",
        organizationId: ORG,
        status: AssetStatus.AVAILABLE,
        archivedAt: null,
        type: AssetType.INDIVIDUAL,
        AND: [
          {
            OR: [
              { tags: { some: { id: "tag-ss" } } },
              {
                assetLocations: {
                  some: { locationId: { in: ["loc-depot"] }, assetKitId: null },
                },
              },
            ],
          },
        ],
      },
      data: { status: AssetStatus.IN_CUSTODY },
    });
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CUSTODY_ASSIGNED",
        meta: { via: "self-service", source: "list" },
      }),
      tx
    );
    expect(tx.note.create.mock.calls[0][0].data.content).toBe(
      "**Maria P.** took custody from the self-service list."
    );
    expect(sendSelfCustodyAlert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "taken", source: "list" })
    );
  });

  it("refers an available item the offer does not cover to staff", async () => {
    tx.asset.updateMany.mockResolvedValue({ count: 0 });
    tx.asset.findFirst.mockResolvedValue({
      title: "Radio #12",
      status: AssetStatus.AVAILABLE,
    });
    await expect(
      selfTakeCustody({
        organizationId: ORG,
        workspaceName: "Hellenic Red Cross",
        assetId: "asset-1",
        teamMemberId: "tm-1",
        requiredOffer: { tagId: "tag-ss", locationIds: [] },
        source: "list",
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.custody.create).not.toHaveBeenCalled();
  });

  it("refuses when the item was taken a moment earlier", async () => {
    tx.asset.updateMany.mockResolvedValue({ count: 0 });
    await expect(take()).rejects.toMatchObject({
      status: 409,
      message: "Someone has just taken this item.",
    });
    expect(tx.custody.create).not.toHaveBeenCalled();
    expect(sendSelfCustodyAlert).not.toHaveBeenCalled();
  });

  it("refers a checked-out item to staff", async () => {
    tx.asset.updateMany.mockResolvedValue({ count: 0 });
    tx.asset.findFirst.mockResolvedValue({
      title: "Radio #12",
      status: AssetStatus.CHECKED_OUT,
    });
    await expect(take()).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a team member from another workspace", async () => {
    tx.teamMember.findFirst.mockResolvedValue(null);
    await expect(take()).rejects.toMatchObject({ status: 400 });
    expect(tx.asset.updateMany).not.toHaveBeenCalled();
  });

  it("strips Markdoc tags from the name written into the note", async () => {
    tx.teamMember.findFirst.mockResolvedValue({
      id: "tm-1",
      name: 'Maria {% link to="x" %}',
      user: null,
    });
    await take();
    const content = tx.note.create.mock.calls[0][0].data.content as string;
    expect(content).not.toContain("{%");
  });
});

describe("selfReturnCustody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.asset.findFirst.mockResolvedValue({
      title: "Radio #12",
      type: AssetType.INDIVIDUAL,
      archivedAt: null,
    });
    tx.custody.findMany.mockResolvedValue([
      {
        kitCustodyId: null,
        teamMemberId: "tm-1",
        custodian: { name: "Maria P.", user: null },
      },
    ]);
    tx.custody.deleteMany.mockResolvedValue({ count: 1 });
  });

  const giveBack = () =>
    selfReturnCustody({
      organizationId: ORG,
      workspaceName: "Hellenic Red Cross",
      assetId: "asset-1",
    });

  it("releases operator custody and makes the item available again", async () => {
    await expect(giveBack()).resolves.toEqual({
      assetTitle: "Radio #12",
      volunteerName: "Maria P.",
    });
    expect(tx.custody.deleteMany).toHaveBeenCalledWith({
      where: {
        assetId: "asset-1",
        asset: { organizationId: ORG },
        kitCustodyId: null,
      },
    });
    expect(releaseAssetsToAvailableUnlessCheckedOut).toHaveBeenCalledWith(
      tx,
      ["asset-1"],
      ORG
    );
  });

  it("records a self-service activity event, a note and emails managers", async () => {
    await giveBack();
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CUSTODY_RELEASED",
        actorUserId: null,
        teamMemberId: "tm-1",
        meta: { via: "self-service" },
      }),
      tx
    );
    expect(tx.note.create.mock.calls[0][0].data.content).toBe(
      "**Maria P.** returned the item via self-service scan."
    );
    expect(sendSelfCustodyAlert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "returned", volunteerName: "Maria P." })
    );
  });

  it("returns an item held by a registered user under their display name", async () => {
    tx.custody.findMany.mockResolvedValue([
      {
        kitCustodyId: null,
        teamMemberId: "tm-9",
        custodian: {
          name: "eleni k",
          user: {
            firstName: "Eleni",
            lastName: "Kara",
            displayName: "Eleni K.",
          },
        },
      },
    ]);
    await expect(giveBack()).resolves.toMatchObject({
      volunteerName: "Eleni K.",
    });
  });

  it("refuses custody held through a kit", async () => {
    tx.custody.findMany.mockResolvedValue([
      {
        kitCustodyId: "kc-1",
        teamMemberId: "tm-1",
        custodian: { name: "Maria P.", user: null },
      },
    ]);
    await expect(giveBack()).rejects.toMatchObject({ status: 400 });
    expect(tx.custody.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses when nobody holds the item any more", async () => {
    tx.custody.findMany.mockResolvedValue([]);
    await expect(giveBack()).rejects.toMatchObject({ status: 409 });
  });

  it("refuses when someone returned it a moment earlier", async () => {
    tx.custody.deleteMany.mockResolvedValue({ count: 0 });
    await expect(giveBack()).rejects.toMatchObject({ status: 409 });
    expect(releaseAssetsToAvailableUnlessCheckedOut).not.toHaveBeenCalled();
  });

  it("refuses an item of another workspace", async () => {
    tx.asset.findFirst.mockResolvedValue(null);
    await expect(giveBack()).rejects.toMatchObject({ status: 404 });
  });

  const giveBackFromList = (holderTeamMemberId: string) =>
    selfReturnCustody({
      organizationId: ORG,
      workspaceName: "Hellenic Red Cross",
      assetId: "asset-1",
      holderTeamMemberId,
      source: "list",
    });

  it("from the list, releases only the volunteer's own custody", async () => {
    await expect(giveBackFromList("tm-1")).resolves.toEqual({
      assetTitle: "Radio #12",
      volunteerName: "Maria P.",
    });
    expect(tx.custody.deleteMany).toHaveBeenCalledWith({
      where: {
        assetId: "asset-1",
        asset: { organizationId: ORG },
        kitCustodyId: null,
        teamMemberId: "tm-1",
      },
    });
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CUSTODY_RELEASED",
        meta: { via: "self-service", source: "list" },
      }),
      tx
    );
    expect(tx.note.create.mock.calls[0][0].data.content).toBe(
      "**Maria P.** returned the item from the self-service list."
    );
  });

  it("from the list, refuses an item someone else holds", async () => {
    await expect(giveBackFromList("tm-2")).rejects.toMatchObject({
      status: 403,
      message: "You can only return items in your own custody.",
    });
    expect(tx.custody.deleteMany).not.toHaveBeenCalled();
    expect(sendSelfCustodyAlert).not.toHaveBeenCalled();
  });
});
