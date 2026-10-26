// @vitest-environment node
/**
 * Tests for self-service kit custody: taking an offered kit from the browse
 * list or any eligible kit by scanning its code, and returning a kit.
 *
 * @see {@link file://./kit-custody.server.ts}
 */
import Markdoc from "@markdoc/markdoc";
import { AssetStatus, AssetType, KitStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordEvents } from "~/modules/activity-event/service.server";
import { lockAssetsForArchiveGuard } from "~/modules/asset/archive-lock.server";
import { releaseAssetsToAvailableUnlessCheckedOut } from "~/modules/asset/custody-status.server";
import { assertKitsCustodyAssignable } from "~/modules/booking/kit-holds.server";
import { buildKitCustodyInheritData } from "~/modules/kit/service.server";
import { offeredKitWhere } from "./browse.server";
import { selfReturnKitCustody, selfTakeKitCustody } from "./kit-custody.server";
import { sendSelfCustodyAlert } from "./notify.server";

// why: the transaction client stands in for Postgres; every Prisma call it receives is asserted
const tx = {
  teamMember: { findFirst: vi.fn() },
  assetKit: { findMany: vi.fn() },
  kit: { findFirst: vi.fn(), update: vi.fn() },
  kitCustody: { create: vi.fn(), deleteMany: vi.fn() },
  custody: { createMany: vi.fn(), findMany: vi.fn() },
  asset: { updateMany: vi.fn() },
  note: { createMany: vi.fn() },
};

// why: unit tests run without a database
vi.mock("~/database/db.server", () => ({
  db: {
    $transaction: vi.fn((callback: (client: unknown) => unknown) =>
      callback(tx)
    ),
  },
}));

// why: takes kit row locks with raw SQL and reads live bookings; has its own tests
vi.mock("~/modules/booking/kit-holds.server", () => ({
  assertKitsCustodyAssignable: vi.fn(),
}));

// why: takes asset row locks with raw SQL; has its own tests
vi.mock("~/modules/asset/archive-lock.server", () => ({
  lockAssetsForArchiveGuard: vi.fn(),
}));

// why: the remaining-pool rule for stock items is shared with the staff path and tested there
vi.mock("~/modules/kit/service.server", () => ({
  buildKitCustodyInheritData: vi.fn(),
}));

// why: status write shared with the staff release path, covered by its own tests
vi.mock("~/modules/asset/custody-status.server", () => ({
  releaseAssetsToAvailableUnlessCheckedOut: vi.fn(),
}));

// why: the event writer resolves actor snapshots against the database; its input is asserted here
vi.mock("~/modules/activity-event/service.server", () => ({
  recordEvents: vi.fn(),
}));

// why: emails managers; covered by notify.server.test.ts
vi.mock("./notify.server", () => ({ sendSelfCustodyAlert: vi.fn() }));

const ORG = "org-1";
/** The workspace offers by tag and by one location. */
const OFFER = { tagId: "tag-ss", locationIds: ["loc-depot"] };
const workspace = { organizationId: ORG, workspaceName: "Hellenic Red Cross" };

const radio = { id: "a1", type: AssetType.INDIVIDUAL, unitOfMeasure: null };
const gauze = {
  id: "a2",
  type: AssetType.QUANTITY_TRACKED,
  unitOfMeasure: "packs",
};

/** Makes the volunteer a team member of the workspace. */
function volunteerExists() {
  tx.teamMember.findFirst.mockResolvedValue({
    id: "tm-1",
    name: "Maria P.",
    user: null,
  });
}

describe("selfTakeKitCustody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    volunteerExists();
    tx.assetKit.findMany.mockResolvedValue([
      { asset: radio },
      { asset: gauze },
    ]);
    tx.kit.findFirst.mockResolvedValue({ name: "Trauma kit" });
    tx.kitCustody.create.mockResolvedValue({ id: "kc-1" });
    vi.mocked(buildKitCustodyInheritData).mockResolvedValue([
      {
        teamMemberId: "tm-1",
        assetId: "a1",
        kitCustodyId: "kc-1",
        quantity: 1,
      },
      {
        teamMemberId: "tm-1",
        assetId: "a2",
        kitCustodyId: "kc-1",
        quantity: 5,
      },
    ]);
  });

  const take = () =>
    selfTakeKitCustody({
      ...workspace,
      kitId: "kit-1",
      teamMemberId: "tm-1",
      requiredOffer: OFFER,
    });

  it("puts the kit and each of its items in the volunteer's custody", async () => {
    await expect(take()).resolves.toEqual({
      assetTitle: "Trauma kit",
      volunteerName: "Maria P.",
    });

    expect(assertKitsCustodyAssignable).toHaveBeenCalledWith(tx, {
      kitIds: ["kit-1"],
      organizationId: ORG,
    });
    expect(lockAssetsForArchiveGuard).toHaveBeenCalledWith(
      tx,
      ["a1", "a2"],
      ORG
    );
    // Eligibility is the list's own rule, read after the locks.
    expect(tx.kit.findFirst).toHaveBeenCalledWith({
      where: {
        id: "kit-1",
        ...offeredKitWhere({ organizationId: ORG, offer: OFFER }),
      },
      select: { name: true },
    });
    expect(tx.kitCustody.create).toHaveBeenCalledWith({
      data: { kitId: "kit-1", custodianId: "tm-1" },
      select: { id: true },
    });
    expect(tx.kit.update).toHaveBeenCalledWith({
      where: { id: "kit-1", organizationId: ORG },
      data: { status: KitStatus.IN_CUSTODY },
    });
    expect(tx.custody.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ assetId: "a1", kitCustodyId: "kc-1" }),
      ]),
    });
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["a1", "a2"] },
        organizationId: ORG,
        status: { not: AssetStatus.CHECKED_OUT },
      },
      data: { status: AssetStatus.IN_CUSTODY },
    });
  });

  it("records one self-service event and note per item, naming stock counts", async () => {
    await take();

    const events = vi.mocked(recordEvents).mock.calls[0][0];
    expect(events).toEqual([
      expect.objectContaining({
        action: "CUSTODY_ASSIGNED",
        actorUserId: null,
        assetId: "a1",
        kitId: "kit-1",
        teamMemberId: "tm-1",
        meta: { viaKit: true, via: "self-service", source: "list" },
      }),
      expect.objectContaining({
        assetId: "a2",
        meta: {
          viaKit: true,
          via: "self-service",
          source: "list",
          quantity: 5,
        },
      }),
    ]);

    const notes = tx.note.createMany.mock.calls[0][0].data;
    expect(notes.map((n: { content: string }) => n.content)).toEqual([
      "**Maria P.** took custody via kit **Trauma kit** from the self-service list.",
      "**Maria P.** took custody of 5 packs via kit **Trauma kit** from the self-service list.",
    ]);
  });

  it("keeps a kit name out of the notes as a Markdoc tag", async () => {
    tx.kit.findFirst.mockResolvedValue({
      name: '{% link to="javascript:alert(1)" /%}',
    });

    await take();

    for (const { content } of tx.note.createMany.mock.calls[0][0].data) {
      const tags = [...Markdoc.parse(content).walk()].filter(
        (node) => node.type === "tag"
      );
      expect(tags).toEqual([]);
    }
  });

  it("emails managers a link to the kit after the take", async () => {
    await take();
    expect(sendSelfCustodyAlert).toHaveBeenCalledWith({
      ...workspace,
      kitId: "kit-1",
      kind: "taken",
      source: "list",
      assetTitle: "Trauma kit",
      volunteerName: "Maria P.",
      volunteerTeamMemberId: "tm-1",
    });
  });

  it("answers 409 when someone else took the kit first", async () => {
    tx.kit.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ custody: { id: "kc-other" } });

    await expect(take()).rejects.toMatchObject({ status: 409 });
    expect(tx.kitCustody.create).not.toHaveBeenCalled();
    expect(sendSelfCustodyAlert).not.toHaveBeenCalled();
  });

  it("refers a kit that is not offered (an untagged or missing item) to staff", async () => {
    tx.kit.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ custody: null });

    await expect(take()).rejects.toMatchObject({
      status: 400,
      message: "This item can't be handled here. Please ask a staff member.",
    });
    expect(tx.kitCustody.create).not.toHaveBeenCalled();
  });

  it("answers 404 for a kit outside the workspace", async () => {
    tx.kit.findFirst.mockResolvedValue(null);
    await expect(take()).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a team member of another workspace before touching the kit", async () => {
    tx.teamMember.findFirst.mockResolvedValue(null);
    await expect(take()).rejects.toMatchObject({ status: 400 });
    expect(assertKitsCustodyAssignable).not.toHaveBeenCalled();
  });

  it("takes a scanned kit on eligibility alone, and says it was scanned", async () => {
    await selfTakeKitCustody({
      ...workspace,
      kitId: "kit-1",
      teamMemberId: "tm-1",
      source: "scan",
    });

    const eligible = offeredKitWhere({ organizationId: ORG });
    expect(tx.kit.findFirst).toHaveBeenCalledWith({
      where: { id: "kit-1", ...eligible },
      select: { name: true },
    });
    // Eligible still means available, unheld and with every item free
    expect(eligible).toMatchObject({
      status: KitStatus.AVAILABLE,
      custody: { is: null },
    });
    expect(vi.mocked(recordEvents).mock.calls[0][0][0]).toMatchObject({
      meta: { viaKit: true, via: "self-service" },
    });
    expect(tx.note.createMany.mock.calls[0][0].data[0].content).toBe(
      "**Maria P.** took custody via kit **Trauma kit** via self-service scan."
    );
    expect(sendSelfCustodyAlert).toHaveBeenCalledWith(
      expect.objectContaining({ source: "scan" })
    );
  });
});

describe("selfReturnKitCustody", () => {
  /** A kit as the return reads it, held by `custodianId`. */
  const heldKit = (custodianId: string | null) => ({
    name: "Trauma kit",
    custody: custodianId
      ? {
          id: "kc-1",
          custodianId,
          custodian: { name: "Maria P.", user: null },
        }
      : null,
    assetKits: [{ asset: radio }, { asset: gauze }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    tx.kit.findFirst.mockResolvedValue(heldKit("tm-1"));
    tx.custody.findMany
      // the custody the kit gave, read before the release
      .mockResolvedValueOnce([
        { assetId: "a1", quantity: 1 },
        { assetId: "a2", quantity: 5 },
      ])
      // custody left on the items afterwards: the gauze has staff custody too
      .mockResolvedValueOnce([{ assetId: "a2" }]);
    tx.kitCustody.deleteMany.mockResolvedValue({ count: 1 });
  });

  const giveBack = (holder = "tm-1") =>
    selfReturnKitCustody({
      ...workspace,
      kitId: "kit-1",
      holderTeamMemberId: holder,
    });

  it("releases the volunteer's kit and frees the items nobody else holds", async () => {
    await expect(giveBack()).resolves.toEqual({
      assetTitle: "Trauma kit",
      volunteerName: "Maria P.",
    });

    expect(tx.kitCustody.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "kc-1",
        custodianId: "tm-1",
        kit: { organizationId: ORG },
      },
    });
    expect(tx.kit.update).toHaveBeenCalledWith({
      where: { id: "kit-1", organizationId: ORG },
      data: { status: KitStatus.AVAILABLE },
    });
    expect(releaseAssetsToAvailableUnlessCheckedOut).toHaveBeenCalledWith(
      tx,
      ["a1"],
      ORG
    );
  });

  it("records one self-service release event and note per item", async () => {
    await giveBack();

    expect(vi.mocked(recordEvents).mock.calls[0][0]).toEqual([
      expect.objectContaining({
        action: "CUSTODY_RELEASED",
        actorUserId: null,
        assetId: "a1",
        kitId: "kit-1",
        teamMemberId: "tm-1",
        meta: { viaKit: true, via: "self-service", source: "list" },
      }),
      expect.objectContaining({
        assetId: "a2",
        meta: expect.objectContaining({ quantity: 5 }),
      }),
    ]);
    const notes = tx.note.createMany.mock.calls[0][0].data;
    expect(notes[1].content).toBe(
      "**Maria P.** returned their custody of 5 packs via kit **Trauma kit** from the self-service list."
    );
    expect(sendSelfCustodyAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        kitId: "kit-1",
        kind: "returned",
        volunteerTeamMemberId: "tm-1",
      })
    );
  });

  it("refuses with 403 a kit someone else holds, and releases nothing", async () => {
    tx.kit.findFirst.mockResolvedValue(heldKit("tm-other"));

    await expect(giveBack()).rejects.toMatchObject({ status: 403 });
    expect(tx.kitCustody.deleteMany).not.toHaveBeenCalled();
    expect(sendSelfCustodyAlert).not.toHaveBeenCalled();
  });

  it("answers 409 for a kit nobody holds any more", async () => {
    tx.kit.findFirst.mockResolvedValue(heldKit(null));
    await expect(giveBack()).rejects.toMatchObject({ status: 409 });
  });

  it("answers 409 when the custody moved between the read and the release", async () => {
    tx.kitCustody.deleteMany.mockResolvedValue({ count: 0 });

    await expect(giveBack()).rejects.toMatchObject({ status: 409 });
    expect(tx.kit.update).not.toHaveBeenCalled();
  });

  it("answers 404 for a kit outside the workspace", async () => {
    tx.kit.findFirst.mockResolvedValue(null);
    await expect(giveBack()).rejects.toMatchObject({ status: 404 });
  });

  it("lets a QR scan return the kit for whoever holds it", async () => {
    tx.kit.findFirst.mockResolvedValue(heldKit("tm-other"));

    await expect(
      selfReturnKitCustody({ ...workspace, kitId: "kit-1", source: "scan" })
    ).resolves.toEqual({ assetTitle: "Trauma kit", volunteerName: "Maria P." });

    expect(tx.kitCustody.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "kc-1",
        custodianId: "tm-other",
        kit: { organizationId: ORG },
      },
    });
    expect(vi.mocked(recordEvents).mock.calls[0][0][0]).toMatchObject({
      teamMemberId: "tm-other",
      meta: { viaKit: true, via: "self-service" },
    });
    expect(sendSelfCustodyAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "scan",
        volunteerTeamMemberId: "tm-other",
      })
    );
  });
});
