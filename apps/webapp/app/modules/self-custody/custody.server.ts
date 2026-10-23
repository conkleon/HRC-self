/**
 * Self-Service Custody
 *
 * What a volunteer's scan shows, and taking or returning an item without an
 * account, from a QR scan or from the workspace's browse list. The volunteer
 * is a team member of the workspace (normally an NRM), so custody, notes, activity events and reports look exactly like custody a
 * staff member assigned. Records carry no actor user; the activity event is
 * marked `meta.via = "self-service"` and names the volunteer through
 * `teamMemberId`.
 *
 * This module covers INDIVIDUAL assets. Kit members, kit-held custody,
 * quantity-tracked, archived and checked-out assets are referred to staff.
 * The same kit guards as the staff custody routes run inside the transaction,
 * so the two paths cannot disagree about what may be taken. Whole kits are
 * taken and returned from the browse list through `kit-custody.server.ts`.
 *
 * @see {@link file://./../../routes/_layout+/assets.$assetId.overview.assign-custody.tsx}
 * @see {@link file://./../../routes/qr+/_public+/$qrId_.self-custody.tsx}
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 * @see {@link file://./kit-custody.server.ts}
 */
import { AssetStatus, AssetType } from "@prisma/client";

import { db } from "~/database/db.server";
import { recordEvent } from "~/modules/activity-event/service.server";
import { releaseAssetsToAvailableUnlessCheckedOut } from "~/modules/asset/custody-status.server";
import {
  assertNoKitDerivedCustody,
  assertNotKitMembers,
} from "~/modules/custody/service.server";
import { ShelfError } from "~/utils/error";
import { stripMarkdocDelimiters } from "~/utils/markdoc-sanitize";
import { assertTeamMemberBelongsToOrg } from "~/utils/org-validation.server";
import { resolveTeamMemberName } from "~/utils/user";
import { sendSelfCustodyAlert } from "./notify.server";
import { offeredAssetMatch } from "./offer.server";
import type { SelfCustodyOffer } from "./offer.server";

/** The item card on the self-service page. */
export type SelfCustodyAsset = {
  id: string;
  title: string;
  thumbnailImage: string | null;
  locationName: string | null;
};

/** Why an item cannot be taken or returned on the self-service page. */
export type SelfCustodyUnsupportedReason =
  | "kit-qr"
  | "not-linked"
  | "archived"
  | "quantity-tracked"
  | "kit-member"
  | "kit-custody"
  | "checked-out";

/** What the self-service page offers for a scanned QR. */
export type SelfCustodyState =
  | { kind: "available"; asset: SelfCustodyAsset }
  | { kind: "in-custody"; asset: SelfCustodyAsset; holderName: string }
  | {
      kind: "unsupported";
      asset: SelfCustodyAsset | null;
      reason: SelfCustodyUnsupportedReason;
    };

/** The workspace fields the self-service page and its guards need. */
export type SelfCustodyOrganization = {
  id: string;
  name: string;
  selfCustodyEnabled: boolean;
  selfCustodyPinHash: string | null;
  selfCustodyPinUpdatedAt: Date | null;
};

const NAME_FIELDS = { firstName: true, lastName: true, displayName: true };

/** The team member fields `resolveTeamMemberName` reads. */
export const CUSTODIAN_SELECT = {
  name: true,
  user: { select: NAME_FIELDS },
} as const;

/** The refusal for anything self-service cannot handle. */
export const STAFF_MESSAGE =
  "This item can't be handled here. Please ask a staff member.";

/**
 * Resolves a scanned QR to its workspace and what the page may offer.
 *
 * @param args.qrId - The scanned QR code id
 * @returns The workspace (including the self-service settings) and the state
 * @throws {ShelfError} 404 when the QR does not exist or no workspace owns it
 */
export async function getSelfCustodyState({ qrId }: { qrId: string }): Promise<{
  organization: SelfCustodyOrganization;
  state: SelfCustodyState;
}> {
  const qr = await db.qr.findUnique({
    // eslint-disable-next-line local-rules/require-org-scope-on-id-queries -- idor-safe: public scan; the QR id is what resolves the workspace
    where: { id: qrId },
    select: {
      organizationId: true,
      kitId: true,
      organization: {
        select: {
          id: true,
          name: true,
          selfCustodyEnabled: true,
          selfCustodyPinHash: true,
          selfCustodyPinUpdatedAt: true,
        },
      },
      // A label stays on the item when it is archived, so the scan must still
      // resolve it and explain why it cannot be taken.
      asset: {
        select: {
          id: true,
          title: true,
          thumbnailImage: true,
          type: true,
          status: true,
          archivedAt: true,
          assetLocations: {
            where: { assetKitId: null },
            select: { location: { select: { name: true } } },
            take: 1,
          },
          assetKits: { select: { id: true }, take: 1 },
          custody: {
            select: {
              kitCustodyId: true,
              custodian: { select: CUSTODIAN_SELECT },
            },
          },
        },
      },
    },
  });

  if (!qr?.organizationId || !qr.organization) {
    throw new ShelfError({
      cause: null,
      title: "QR code not found",
      message: "This QR code is not linked to any workspace.",
      additionalData: { qrId },
      label: "QR",
      status: 404,
      shouldBeCaptured: false,
    });
  }

  return { organization: qr.organization, state: stateOf(qr) };
}

/** Maps the selected QR row to what the page may offer. */
function stateOf(qr: {
  kitId: string | null;
  asset: {
    id: string;
    title: string;
    thumbnailImage: string | null;
    type: AssetType;
    status: AssetStatus;
    archivedAt: Date | null;
    assetLocations: { location: { name: string } }[];
    assetKits: { id: string }[];
    custody: {
      kitCustodyId: string | null;
      custodian: Parameters<typeof resolveTeamMemberName>[0];
    }[];
  } | null;
}): SelfCustodyState {
  if (!qr.asset) {
    return {
      kind: "unsupported",
      asset: null,
      reason: qr.kitId ? "kit-qr" : "not-linked",
    };
  }

  const { asset } = qr;
  const card: SelfCustodyAsset = {
    id: asset.id,
    title: asset.title,
    thumbnailImage: asset.thumbnailImage,
    locationName: asset.assetLocations[0]?.location.name ?? null,
  };
  const refer = (reason: SelfCustodyUnsupportedReason): SelfCustodyState => ({
    kind: "unsupported",
    asset: card,
    reason,
  });

  if (asset.archivedAt) return refer("archived");
  if (asset.type !== AssetType.INDIVIDUAL) return refer("quantity-tracked");
  if (asset.assetKits.length > 0) return refer("kit-member");
  if (asset.custody.some((c) => c.kitCustodyId)) return refer("kit-custody");
  if (asset.status === AssetStatus.CHECKED_OUT) return refer("checked-out");

  const holder = asset.custody[0];
  if (holder) {
    return {
      kind: "in-custody",
      asset: card,
      holderName: resolveTeamMemberName(holder.custodian),
    };
  }
  return { kind: "available", asset: card };
}

/**
 * Where the volunteer acted: by scanning the item's QR code, or from the
 * workspace's browse list. Named in the note, the activity event and the
 * manager email.
 */
type SelfCustodySource = "scan" | "list";

/** Arguments shared by take and return. */
type SelfCustodyActionArgs = {
  /** The workspace of the scanned QR or browse link, resolved on the server. */
  organizationId: string;
  /** Workspace name, for the manager email. */
  workspaceName: string;
  assetId: string;
  /** Defaults to "scan". */
  source?: SelfCustodySource;
};

/** Result of a take or return, for the confirmation screen. */
export type SelfCustodyResult = { assetTitle: string; volunteerName: string };

/** How the note phrases the channel, after "took custody" / "returned the item". */
export const NOTE_CHANNEL: Record<SelfCustodySource, string> = {
  scan: "via self-service scan",
  list: "from the self-service list",
};

/**
 * Activity event meta. Every self-service event carries `via`; list actions
 * add `source` so reports can tell them from scans.
 */
export const eventMeta = (source: SelfCustodySource) =>
  source === "list"
    ? { via: "self-service", source: "list" }
    : { via: "self-service" };

/**
 * Puts an available item into a volunteer's custody.
 *
 * @param args.organizationId - The workspace of the QR or browse link (server-resolved)
 * @param args.workspaceName - For the manager email
 * @param args.assetId - The item
 * @param args.teamMemberId - The volunteer, from search or "add me"
 * @param args.requiredOffer - When set, only an item this offer covers (by
 *   tag or location) can be claimed: the browse list offers those items only,
 *   and the claim enforces it
 * @param args.source - Scan or browse list; defaults to scan
 * @returns The item's title and the volunteer's name
 * @throws {ShelfError} 400 for a team member of another workspace or an item
 *   staff must handle, 404 for an unknown item, 409 when someone took it first
 */
export async function selfTakeCustody({
  organizationId,
  workspaceName,
  assetId,
  teamMemberId,
  requiredOffer,
  source = "scan",
}: SelfCustodyActionArgs & {
  teamMemberId: string;
  requiredOffer?: SelfCustodyOffer;
}): Promise<SelfCustodyResult> {
  const result = await db.$transaction(async (tx) => {
    await assertTeamMemberBelongsToOrg({ teamMemberId, organizationId }, tx);
    const volunteer = await tx.teamMember.findFirst({
      where: { id: teamMemberId, organizationId },
      select: CUSTODIAN_SELECT,
    });
    const volunteerName = resolveTeamMemberName(volunteer);

    await assertNotKitMembers(tx, [assetId], organizationId);

    // The predicate makes the claim atomic: of two volunteers taking the same
    // item at once, exactly one UPDATE matches. Taking never reassigns custody
    // someone else holds.
    const claimed = await tx.asset.updateMany({
      where: {
        id: assetId,
        organizationId,
        status: AssetStatus.AVAILABLE,
        archivedAt: null,
        type: AssetType.INDIVIDUAL,
        ...(requiredOffer ? { AND: [offeredAssetMatch(requiredOffer)] } : {}),
      },
      data: { status: AssetStatus.IN_CUSTODY },
    });

    if (claimed.count === 0) {
      const blocked = await tx.asset.findFirst({
        // eslint-disable-next-line local-rules/require-archived-at-check-on-asset-queries -- why: explains a refused claim, archived items included
        where: { id: assetId, organizationId },
        select: { title: true, status: true },
      });
      throw new ShelfError({
        cause: null,
        title: blocked ? "Item not available" : "Item not found",
        message: !blocked
          ? "This item could not be found."
          : blocked.status === AssetStatus.IN_CUSTODY
          ? "Someone has just taken this item."
          : STAFF_MESSAGE,
        additionalData: { organizationId, assetId, teamMemberId },
        label: "Custody",
        status: !blocked
          ? 404
          : blocked.status === AssetStatus.IN_CUSTODY
          ? 409
          : 400,
        shouldBeCaptured: false,
      });
    }

    await assertNoKitDerivedCustody(tx, [assetId], organizationId);

    await tx.custody.create({
      data: {
        custodian: { connect: { id: teamMemberId } },
        asset: { connect: { id: assetId } },
      },
    });

    await recordEvent(
      {
        organizationId,
        actorUserId: null,
        action: "CUSTODY_ASSIGNED",
        entityType: "ASSET",
        entityId: assetId,
        assetId,
        teamMemberId,
        meta: eventMeta(source),
      },
      tx
    );

    await tx.note.create({
      data: {
        content: `**${stripMarkdocDelimiters(volunteerName)}** took custody ${
          NOTE_CHANNEL[source]
        }.`,
        type: "UPDATE",
        asset: { connect: { id: assetId } },
      },
    });
    const asset = await tx.asset.findFirst({
      // eslint-disable-next-line local-rules/require-archived-at-check-on-asset-queries -- why: the claim above proved the item active
      where: { id: assetId, organizationId },
      select: { title: true },
    });
    return { assetTitle: asset?.title ?? "", volunteerName };
  });

  alertManagers({
    organizationId,
    workspaceName,
    assetId,
    kind: "taken",
    source,
    ...result,
  });
  return result;
}

/**
 * Releases a volunteer's custody of an item and makes it available again.
 *
 * @param args.organizationId - The workspace of the QR or browse link (server-resolved)
 * @param args.workspaceName - For the manager email
 * @param args.assetId - The item
 * @param args.holderTeamMemberId - When set, only custody held by this team
 *   member is released: the browse list returns the volunteer's own items only
 * @param args.source - Scan or browse list; defaults to scan
 * @returns The item's title and the name of whoever held it
 * @throws {ShelfError} 400 for an item staff must handle, 403 for an item held
 *   by someone other than `holderTeamMemberId`, 404 for an unknown item, 409
 *   when nobody holds it any more
 */
export async function selfReturnCustody({
  organizationId,
  workspaceName,
  assetId,
  holderTeamMemberId,
  source = "scan",
}: SelfCustodyActionArgs & {
  holderTeamMemberId?: string;
}): Promise<SelfCustodyResult> {
  const result = await db.$transaction(async (tx) => {
    const asset = await tx.asset.findFirst({
      // eslint-disable-next-line local-rules/require-archived-at-check-on-asset-queries -- why: refuses archived items with a reason instead of a 404
      where: { id: assetId, organizationId },
      select: { title: true, type: true, archivedAt: true },
    });
    if (!asset) {
      throw new ShelfError({
        cause: null,
        title: "Item not found",
        message: "This item could not be found.",
        additionalData: { organizationId, assetId },
        label: "Custody",
        status: 404,
        shouldBeCaptured: false,
      });
    }

    const holds = await tx.custody.findMany({
      where: { assetId, asset: { organizationId } },
      select: {
        kitCustodyId: true,
        teamMemberId: true,
        custodian: { select: CUSTODIAN_SELECT },
      },
    });

    const refuse = (status: 400 | 403 | 409, message: string) =>
      new ShelfError({
        cause: null,
        title: "Item can't be returned here",
        message,
        additionalData: { organizationId, assetId },
        label: "Custody",
        status,
        shouldBeCaptured: false,
      });

    if (
      asset.archivedAt ||
      asset.type !== AssetType.INDIVIDUAL ||
      holds.some((h) => h.kitCustodyId)
    ) {
      throw refuse(400, STAFF_MESSAGE);
    }

    const hold = holds[0];
    if (!hold) throw refuse(409, "This item is not in anyone's custody.");
    if (holderTeamMemberId && hold.teamMemberId !== holderTeamMemberId) {
      throw refuse(403, "You can only return items in your own custody.");
    }

    // The holder in the predicate keeps the check atomic: custody that moved
    // to someone else since the read above is not released.
    const released = await tx.custody.deleteMany({
      where: {
        assetId,
        asset: { organizationId },
        kitCustodyId: null,
        ...(holderTeamMemberId ? { teamMemberId: holderTeamMemberId } : {}),
      },
    });
    if (released.count === 0) {
      throw refuse(409, "Someone has just returned this item.");
    }

    await releaseAssetsToAvailableUnlessCheckedOut(
      tx,
      [assetId],
      organizationId
    );

    await recordEvent(
      {
        organizationId,
        actorUserId: null,
        action: "CUSTODY_RELEASED",
        entityType: "ASSET",
        entityId: assetId,
        assetId,
        teamMemberId: hold.teamMemberId,
        meta: eventMeta(source),
      },
      tx
    );

    const volunteerName = resolveTeamMemberName(hold.custodian);
    await tx.note.create({
      data: {
        content: `**${stripMarkdocDelimiters(
          volunteerName
        )}** returned the item ${NOTE_CHANNEL[source]}.`,
        type: "UPDATE",
        asset: { connect: { id: assetId } },
      },
    });

    return { assetTitle: asset.title, volunteerName };
  });

  alertManagers({
    organizationId,
    workspaceName,
    assetId,
    kind: "returned",
    source,
    ...result,
  });
  return result;
}

/**
 * Emails managers after the transaction committed, without waiting, so the
 * volunteer's confirmation never depends on SMTP. `sendSelfCustodyAlert`
 * logs its own failures and never rejects.
 */
function alertManagers(alert: Parameters<typeof sendSelfCustodyAlert>[0]) {
  void sendSelfCustodyAlert(alert);
}
