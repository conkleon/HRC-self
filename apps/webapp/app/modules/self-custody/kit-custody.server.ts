/**
 * Self-Service Kit Custody
 *
 * Taking or returning a whole kit from the workspace's browse list, without an
 * account. The kit gets a `KitCustody` row and each active item in it inherits
 * custody exactly as when staff assign kit custody
 * (`kits.$kitId.assets.assign-custody`), so kit pages, reports and the staff
 * release button treat it like any other kit custody. Records carry no actor
 * user; events are marked `meta.via = "self-service"`, `source: "list"`.
 *
 * Only kits the list offers can be taken (`offeredKitWhere`, checked inside
 * the transaction with the kit and its items locked), and only the holder can
 * return one here.
 *
 * @see {@link file://./browse.server.ts}
 * @see {@link file://./custody.server.ts}
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 */
import { AssetStatus, KitStatus } from "@prisma/client";

import { db } from "~/database/db.server";
import { recordEvents } from "~/modules/activity-event/service.server";
import { lockAssetsForArchiveGuard } from "~/modules/asset/archive-lock.server";
import { releaseAssetsToAvailableUnlessCheckedOut } from "~/modules/asset/custody-status.server";
import { assertKitsCustodyAssignable } from "~/modules/booking/kit-holds.server";
import { buildKitCustodyInheritData } from "~/modules/kit/service.server";
import { assetQtyMeta, formatUnitCount } from "~/utils/asset-quantity";
import { ShelfError } from "~/utils/error";
import { stripMarkdocDelimiters } from "~/utils/markdoc-sanitize";
import { assertTeamMemberBelongsToOrg } from "~/utils/org-validation.server";
import { resolveTeamMemberName } from "~/utils/user";
import { offeredKitWhere } from "./browse.server";
import {
  CUSTODIAN_SELECT,
  NOTE_CHANNEL,
  STAFF_MESSAGE,
  eventMeta,
} from "./custody.server";
import type { SelfCustodyResult } from "./custody.server";
import { sendSelfCustodyAlert } from "./notify.server";
import type { SelfCustodyOffer } from "./offer.server";

/** Arguments shared by kit take and return. */
type SelfKitCustodyArgs = {
  /** The workspace of the browse link, resolved on the server. */
  organizationId: string;
  /** Workspace name, for the manager email. */
  workspaceName: string;
  kitId: string;
};

/** The member fields the per-item notes and event meta read. */
const MEMBER_ASSET_SELECT = {
  id: true,
  type: true,
  unitOfMeasure: true,
} as const;

/** A note line naming the custody, with the unit count for stock items. */
function notePhrase(
  asset: Parameters<typeof formatUnitCount>[0] | undefined,
  quantity: number | null
) {
  const count = asset ? formatUnitCount(asset, quantity) : null;
  return count ? `custody of ${count}` : "custody";
}

/**
 * Puts an offered kit, and every active item in it, into a volunteer's custody.
 *
 * @param args.organizationId - The workspace of the browse link (server-resolved)
 * @param args.workspaceName - For the manager email
 * @param args.kitId - The kit
 * @param args.teamMemberId - The volunteer, already proven to be an NRM of the workspace
 * @param args.requiredOffer - What the workspace offers: the kit must be
 *   offered by tag (every active item tagged) or by location
 * @returns The kit's name and the volunteer's name
 * @throws {ShelfError} 400 for a kit staff must handle (not offered, an
 *   item out, a booking holding it), 404 for an unknown kit, 409 when someone
 *   took it first
 */
export async function selfTakeKitCustody({
  organizationId,
  workspaceName,
  kitId,
  teamMemberId,
  requiredOffer,
}: SelfKitCustodyArgs & {
  teamMemberId: string;
  requiredOffer: SelfCustodyOffer;
}): Promise<SelfCustodyResult> {
  const result = await db.$transaction(async (tx) => {
    await assertTeamMemberBelongsToOrg({ teamMemberId, organizationId }, tx);
    const volunteer = await tx.teamMember.findFirst({
      where: { id: teamMemberId, organizationId },
      select: CUSTODIAN_SELECT,
    });
    const volunteerName = resolveTeamMemberName(volunteer);

    // Locks the kit row until commit and refuses a kit out on a booking.
    await assertKitsCustodyAssignable(tx, { kitIds: [kitId], organizationId });

    const members = await tx.assetKit.findMany({
      where: { kitId, organizationId, asset: { archivedAt: null } },
      select: { asset: { select: MEMBER_ASSET_SELECT } },
    });
    const memberIds = members.map((m) => m.asset.id);
    // Holds the items still while the eligibility read below runs, so an
    // archive or a status change cannot slip in before custody is written.
    await lockAssetsForArchiveGuard(tx, memberIds, organizationId);

    const offered = await tx.kit.findFirst({
      where: {
        id: kitId,
        ...offeredKitWhere({ organizationId, offer: requiredOffer }),
      },
      select: { name: true },
    });
    if (!offered) {
      const kit = await tx.kit.findFirst({
        where: { id: kitId, organizationId },
        select: { custody: { select: { id: true } } },
      });
      const taken = Boolean(kit?.custody);
      throw new ShelfError({
        cause: null,
        title: kit ? "Kit not available" : "Kit not found",
        message: !kit
          ? "This kit could not be found."
          : taken
          ? "Someone has just taken this kit."
          : STAFF_MESSAGE,
        additionalData: { organizationId, kitId, teamMemberId },
        label: "Custody",
        status: !kit ? 404 : taken ? 409 : 400,
        shouldBeCaptured: false,
      });
    }

    const kitCustody = await tx.kitCustody.create({
      data: { kitId, custodianId: teamMemberId },
      select: { id: true },
    });
    await tx.kit.update({
      where: { id: kitId, organizationId },
      data: { status: KitStatus.IN_CUSTODY },
    });

    // The shared helper applies the remaining-pool rule to stock items, the
    // same as the staff assign path.
    const inheritData = await buildKitCustodyInheritData({
      tx,
      kitId,
      kitCustodyId: kitCustody.id,
      teamMemberId,
      assetIds: memberIds,
    });

    if (inheritData.length > 0) {
      await tx.custody.createMany({ data: inheritData });
      // A stock item can have units out on a booking while the rest sit in a
      // kit; CHECKED_OUT outranks IN_CUSTODY, as in the staff path.
      await tx.asset.updateMany({
        where: {
          id: { in: inheritData.map((row) => row.assetId) },
          organizationId,
          status: { not: AssetStatus.CHECKED_OUT },
        },
        data: { status: AssetStatus.IN_CUSTODY },
      });

      const assetById = new Map(members.map((m) => [m.asset.id, m.asset]));
      await recordEvents(
        inheritData.map((row) => {
          const asset = assetById.get(row.assetId);
          return {
            organizationId,
            actorUserId: null,
            action: "CUSTODY_ASSIGNED" as const,
            entityType: "ASSET" as const,
            entityId: row.assetId,
            assetId: row.assetId,
            kitId,
            teamMemberId,
            meta: {
              viaKit: true,
              ...eventMeta("list"),
              ...(asset ? assetQtyMeta(asset, row.quantity) : {}),
            },
          };
        }),
        tx
      );

      const who = stripMarkdocDelimiters(volunteerName);
      const kitName = stripMarkdocDelimiters(offered.name);
      await tx.note.createMany({
        data: inheritData.map((row) => ({
          content: `**${who}** took ${notePhrase(
            assetById.get(row.assetId),
            row.quantity ?? null
          )} via kit **${kitName}** ${NOTE_CHANNEL.list}.`,
          type: "UPDATE" as const,
          assetId: row.assetId,
        })),
      });
    }

    return { assetTitle: offered.name, volunteerName };
  });

  void sendSelfCustodyAlert({
    organizationId,
    workspaceName,
    kitId,
    kind: "taken",
    source: "list",
    volunteerTeamMemberId: teamMemberId,
    ...result,
  });
  return result;
}

/**
 * Releases a volunteer's custody of a kit and of the items it gave them.
 *
 * @param args.organizationId - The workspace of the browse link (server-resolved)
 * @param args.workspaceName - For the manager email
 * @param args.kitId - The kit
 * @param args.holderTeamMemberId - The volunteer; custody held by anyone else
 *   is refused, never released
 * @returns The kit's name and the volunteer's name
 * @throws {ShelfError} 403 for a kit held by someone else, 404 for an unknown
 *   kit, 409 when nobody holds it any more
 */
export async function selfReturnKitCustody({
  organizationId,
  workspaceName,
  kitId,
  holderTeamMemberId,
}: SelfKitCustodyArgs & {
  holderTeamMemberId: string;
}): Promise<SelfCustodyResult> {
  const result = await db.$transaction(async (tx) => {
    const kit = await tx.kit.findFirst({
      where: { id: kitId, organizationId },
      select: {
        name: true,
        custody: {
          select: {
            id: true,
            custodianId: true,
            custodian: { select: CUSTODIAN_SELECT },
          },
        },
        assetKits: {
          where: { asset: { archivedAt: null } },
          select: { asset: { select: MEMBER_ASSET_SELECT } },
        },
      },
    });

    const refuse = (status: 403 | 404 | 409, message: string) =>
      new ShelfError({
        cause: null,
        title: "Kit can't be returned here",
        message,
        additionalData: { organizationId, kitId },
        label: "Custody",
        status,
        shouldBeCaptured: false,
      });

    if (!kit) throw refuse(404, "This kit could not be found.");
    if (!kit.custody) throw refuse(409, "This kit is not in anyone's custody.");
    if (kit.custody.custodianId !== holderTeamMemberId) {
      throw refuse(403, "You can only return kits in your own custody.");
    }

    // Read before the delete: removing the KitCustody row cascades to the
    // custody it gave each item, which the events and notes must name.
    const inherited = await tx.custody.findMany({
      where: { kitCustodyId: kit.custody.id },
      select: { assetId: true, quantity: true },
    });

    // The holder in the predicate keeps the check atomic: custody that moved
    // to someone else since the read above is not released.
    const released = await tx.kitCustody.deleteMany({
      where: {
        id: kit.custody.id,
        custodianId: holderTeamMemberId,
        kit: { organizationId },
      },
    });
    if (released.count === 0) {
      throw refuse(409, "Someone has just returned this kit.");
    }

    await tx.kit.update({
      where: { id: kitId, organizationId },
      data: { status: KitStatus.AVAILABLE },
    });

    // An item that still has custody of its own (staff-assigned) stays
    // IN_CUSTODY; the rest go back to AVAILABLE unless checked out.
    const memberIds = kit.assetKits.map((ak) => ak.asset.id);
    const stillHeld = new Set(
      (
        await tx.custody.findMany({
          where: { assetId: { in: memberIds } },
          select: { assetId: true },
        })
      ).map((c) => c.assetId)
    );
    await releaseAssetsToAvailableUnlessCheckedOut(
      tx,
      memberIds.filter((id) => !stillHeld.has(id)),
      organizationId
    );

    const volunteerName = resolveTeamMemberName(kit.custody.custodian);
    if (inherited.length > 0) {
      const assetById = new Map(
        kit.assetKits.map((ak) => [ak.asset.id, ak.asset])
      );
      await recordEvents(
        inherited.map((row) => {
          const asset = assetById.get(row.assetId);
          return {
            organizationId,
            actorUserId: null,
            action: "CUSTODY_RELEASED" as const,
            entityType: "ASSET" as const,
            entityId: row.assetId,
            assetId: row.assetId,
            kitId,
            teamMemberId: holderTeamMemberId,
            meta: {
              viaKit: true,
              ...eventMeta("list"),
              ...(asset ? assetQtyMeta(asset, row.quantity) : {}),
            },
          };
        }),
        tx
      );

      const who = stripMarkdocDelimiters(volunteerName);
      const kitName = stripMarkdocDelimiters(kit.name);
      await tx.note.createMany({
        data: inherited.map((row) => ({
          content: `**${who}** returned their ${notePhrase(
            assetById.get(row.assetId),
            row.quantity ?? null
          )} via kit **${kitName}** ${NOTE_CHANNEL.list}.`,
          type: "UPDATE" as const,
          assetId: row.assetId,
        })),
      });
    }

    return { assetTitle: kit.name, volunteerName };
  });

  void sendSelfCustodyAlert({
    organizationId,
    workspaceName,
    kitId,
    kind: "returned",
    source: "list",
    volunteerTeamMemberId: holderTeamMemberId,
    ...result,
  });
  return result;
}
