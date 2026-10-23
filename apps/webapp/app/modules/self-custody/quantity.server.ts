/**
 * Self-Service Quantity Custody
 *
 * Taking and returning units of a QUANTITY_TRACKED item from the workspace's
 * browse list, for a volunteer without an account. The units move through the
 * same services as a staff hand-over (`checkOutQuantity`, `releaseQuantity`),
 * so the availability checks, the custody rows, the stock ledger and the
 * activity events are the ones staff produce. Only the actor differs: the
 * ledger and the events record no user, the events carry
 * `meta.via = "self-service"`, and the volunteer is named as the custodian.
 *
 * A volunteer returns units in one of two ways, by the item's consumption
 * type. A returnable (two-way) item gives back some or all of the units held.
 * A consumable (one-way) item ends the whole hold: the volunteer says how many
 * came back, and the rest are recorded as used up, which lowers the stock.
 *
 * @see {@link file://./../asset/service.server.ts} checkOutQuantity, releaseQuantity
 * @see {@link file://./custody.server.ts}
 * @see {@link file://./browse.server.ts}
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 */
import { AssetType, BookingStatus, ConsumptionType } from "@prisma/client";

import { db } from "~/database/db.server";
import { custodyAvailabilityFrom } from "~/modules/asset/availability-primitives.server";
import { unitsLeftAtSource } from "~/modules/asset/custody-source";
import { loadCustodySources } from "~/modules/asset/custody-source.server";
import {
  checkOutQuantity,
  releaseQuantity,
} from "~/modules/asset/service.server";
import { checkAndNotifyLowStock } from "~/modules/consumption-log/low-stock.server";
import { ShelfError } from "~/utils/error";
import type { AdditionalData } from "~/utils/error";
import { Logger } from "~/utils/logger";
import { stripMarkdocDelimiters } from "~/utils/markdoc-sanitize";
import { assertTeamMemberBelongsToOrg } from "~/utils/org-validation.server";
import { resolveTeamMemberName } from "~/utils/user";
import { CUSTODIAN_SELECT, NOTE_CHANNEL, eventMeta } from "./custody.server";
import type { SelfCustodyResult } from "./custody.server";
import { sendSelfCustodyAlert } from "./notify.server";
import { offeredAssetMatch } from "./offer.server";
import type { SelfCustodyOffer } from "./offer.server";

/**
 * Units of each quantity-tracked asset that can be handed out right now:
 * stock minus units in custody, allocated to kits or out on an active
 * booking. The same arithmetic as the custody write's own check
 * (`custodyAvailabilityFrom`), read for many assets in three queries.
 *
 * @param args.organizationId - The workspace (server-resolved)
 * @param args.assets - The assets with their stock (`Asset.quantity`)
 * @returns Free units per asset id, never below zero
 */
export async function getFreeUnitsByAsset({
  organizationId,
  assets,
}: {
  organizationId: string;
  assets: { id: string; quantity: number | null }[];
}): Promise<Map<string, number>> {
  const free = new Map<string, number>();
  if (assets.length === 0) return free;
  const assetIds = assets.map(({ id }) => id);

  const [custody, kits, bookings] = await Promise.all([
    db.custody.groupBy({
      by: ["assetId"],
      where: {
        assetId: { in: assetIds },
        kitCustodyId: null,
        asset: { organizationId },
      },
      _sum: { quantity: true },
    }),
    db.assetKit.groupBy({
      by: ["assetId"],
      where: { assetId: { in: assetIds }, organizationId },
      _sum: { quantity: true },
    }),
    db.bookingAsset.groupBy({
      by: ["assetId"],
      where: {
        assetId: { in: assetIds },
        assetKitId: null,
        booking: {
          organizationId,
          status: { in: [BookingStatus.ONGOING, BookingStatus.OVERDUE] },
        },
      },
      _sum: { quantity: true },
    }),
  ]);

  const sums = (
    rows: { assetId: string; _sum: { quantity: number | null } }[]
  ) => new Map(rows.map((row) => [row.assetId, row._sum.quantity ?? 0]));
  const inCustody = sums(custody);
  const inKits = sums(kits);
  const checkedOut = sums(bookings);

  for (const { id, quantity } of assets) {
    const { available } = custodyAvailabilityFrom({
      totalQuantity: quantity ?? 0,
      inCustody: inCustody.get(id) ?? 0,
      inKits: inKits.get(id) ?? 0,
      checkedOut: checkedOut.get(id) ?? 0,
    });
    free.set(id, Math.max(0, available));
  }
  return free;
}

/** How a take or return names the units, e.g. "3 × First aid kit". */
function unitsTitle(count: number, title: string) {
  return `${count} × ${title}`;
}

/** Arguments shared by the quantity take and return. */
type SelfQuantityArgs = {
  /** The workspace of the browse link (server-resolved). */
  organizationId: string;
  /** Workspace name, for the manager email. */
  workspaceName: string;
  assetId: string;
};

/** A refusal the volunteer can act on, never captured. */
function refuse(
  status: 400 | 404 | 409,
  message: string,
  additionalData: AdditionalData
) {
  return new ShelfError({
    cause: null,
    title: "Can't do that here",
    message,
    additionalData,
    label: "Custody",
    status,
    shouldBeCaptured: false,
  });
}

/**
 * Hands units of an offered quantity-tracked item to a volunteer.
 *
 * The offer is checked before the hand-over; `checkOutQuantity` then locks
 * the asset and refuses more units than are free. When the item is offered
 * through a location, the units are recorded as coming from the offered
 * placement with the most units left, if it can cover them; otherwise the
 * service picks the source as it does for staff.
 *
 * @param args.teamMemberId - The volunteer, already proven to be an NRM of the workspace
 * @param args.quantity - Units to take, a whole number of at least 1
 * @param args.requiredOffer - What the workspace offers; the item must be in it
 * @returns The units and the volunteer's name, for the confirmation
 * @throws {ShelfError} 400 for an item that is not offered or not
 *   quantity-tracked, or more units than are free; 404 for an unknown item
 */
export async function selfTakeQuantity({
  organizationId,
  workspaceName,
  assetId,
  teamMemberId,
  quantity,
  requiredOffer,
}: SelfQuantityArgs & {
  teamMemberId: string;
  quantity: number;
  requiredOffer: SelfCustodyOffer;
}): Promise<SelfCustodyResult> {
  const context = { organizationId, assetId, teamMemberId, quantity };
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw refuse(400, "Choose how many to take.", context);
  }

  await assertTeamMemberBelongsToOrg({ teamMemberId, organizationId });
  const asset = await db.asset.findFirst({
    where: {
      id: assetId,
      organizationId,
      archivedAt: null,
      availableToBook: true,
      type: AssetType.QUANTITY_TRACKED,
      AND: [offeredAssetMatch(requiredOffer)],
    },
    select: { title: true, quantity: true },
  });
  if (!asset) {
    throw refuse(
      400,
      "This item can't be taken here. Please ask a staff member.",
      context
    );
  }

  const locationId = await offeredSource({
    assetId,
    total: asset.quantity ?? 0,
    offeredLocationIds: requiredOffer.locationIds,
    quantity,
  });

  await checkOutQuantity({
    assetId,
    teamMemberId,
    quantity,
    userId: null,
    organizationId,
    // The volunteer is the custodian; nobody chooses one for them.
    custodyAssign: "anyone",
    locationId,
    eventMeta: eventMeta("list"),
  });

  const volunteerName = await volunteerNameOf(teamMemberId, organizationId);
  const result = {
    assetTitle: unitsTitle(quantity, asset.title),
    volunteerName,
  };
  await afterUnitsMoved({
    organizationId,
    assetId,
    note: `**${stripMarkdocDelimiters(
      volunteerName
    )}** took **${quantity}** unit(s) ${NOTE_CHANNEL.list}.`,
  });
  alertManagers({
    organizationId,
    workspaceName,
    assetId,
    kind: "taken",
    ...result,
  });
  return result;
}

/**
 * Ends some or all of a volunteer's hold on a quantity-tracked item.
 *
 * Returnable (two-way) item: `returned` units go back to stock and the rest
 * stay with the volunteer. Consumable (one-way) item: the whole hold ends,
 * `returned` units go back to stock and the rest are recorded as used up.
 *
 * @param args.holderTeamMemberId - The volunteer; only their own units are released
 * @param args.returned - Units brought back
 * @returns The units and the volunteer's name, for the confirmation
 * @throws {ShelfError} 400 for a count out of range or an item staff must
 *   handle, 404 for an unknown item, 409 when the volunteer holds no units
 */
export async function selfReturnQuantity({
  organizationId,
  workspaceName,
  assetId,
  holderTeamMemberId,
  returned,
}: SelfQuantityArgs & {
  holderTeamMemberId: string;
  returned: number;
}): Promise<SelfCustodyResult> {
  const context = { organizationId, assetId, holderTeamMemberId, returned };
  const asset = await db.asset.findFirst({
    // eslint-disable-next-line local-rules/require-archived-at-check-on-asset-queries -- why: refuses archived items with a reason instead of a 404
    where: { id: assetId, organizationId },
    select: {
      title: true,
      type: true,
      archivedAt: true,
      consumptionType: true,
      custody: {
        where: { teamMemberId: holderTeamMemberId, kitCustodyId: null },
        select: { quantity: true },
      },
    },
  });
  if (!asset) throw refuse(404, "This item could not be found.", context);
  if (asset.archivedAt || asset.type !== AssetType.QUANTITY_TRACKED) {
    throw refuse(
      400,
      "This item can't be returned here. Please ask a staff member.",
      context
    );
  }

  const held = asset.custody.reduce((sum, row) => sum + row.quantity, 0);
  if (held === 0) {
    throw refuse(409, "You don't hold any of this item any more.", context);
  }

  const oneWay = asset.consumptionType === ConsumptionType.ONE_WAY;
  const min = oneWay ? 0 : 1;
  if (!Number.isInteger(returned) || returned < min || returned > held) {
    throw refuse(400, `Enter a number from ${min} to ${held}.`, {
      ...context,
      held,
    });
  }

  const quantity = oneWay ? held : returned;
  const used = quantity - returned;
  await releaseQuantity({
    assetId,
    teamMemberId: holderTeamMemberId,
    quantity,
    consumed: used,
    userId: null,
    organizationId,
    // `teamMemberId` is the volunteer, so only their own units are released.
    custodyAssign: "anyone",
    eventMeta: eventMeta("list"),
  });

  const volunteerName = await volunteerNameOf(
    holderTeamMemberId,
    organizationId
  );
  const result = {
    assetTitle:
      used > 0
        ? `${asset.title} (${returned} back, ${used} used)`
        : unitsTitle(returned, asset.title),
    volunteerName,
  };
  const name = `**${stripMarkdocDelimiters(volunteerName)}**`;
  await afterUnitsMoved({
    organizationId,
    assetId,
    note:
      used > 0
        ? `${name} returned **${returned}** unit(s) and used **${used}** ${NOTE_CHANNEL.list}.`
        : `${name} returned **${returned}** unit(s) ${NOTE_CHANNEL.list}.`,
  });
  alertManagers({
    organizationId,
    workspaceName,
    assetId,
    kind: "returned",
    ...result,
  });
  return result;
}

/**
 * The offered placement to take the units from: of the item's manual
 * placements at an offered location, the one with the most units left, when
 * it can cover `quantity`. Undefined (let the service decide) otherwise, and
 * when the workspace offers no location.
 */
async function offeredSource({
  assetId,
  total,
  offeredLocationIds,
  quantity,
}: {
  assetId: string;
  total: number;
  offeredLocationIds: string[];
  quantity: number;
}): Promise<string | undefined> {
  if (offeredLocationIds.length === 0) return undefined;
  const offered = new Set(offeredLocationIds);
  const { state } = await loadCustodySources(db, { assetId, total });

  let best: { locationId: string; left: number } | null = null;
  for (const { locationId } of state.placements) {
    if (!offered.has(locationId)) continue;
    const left = unitsLeftAtSource(state, locationId);
    if (!best || left > best.left) best = { locationId, left };
  }
  return best && best.left >= quantity ? best.locationId : undefined;
}

/** The volunteer's name as notes and the confirmation show it. */
async function volunteerNameOf(teamMemberId: string, organizationId: string) {
  const volunteer = await db.teamMember.findFirst({
    where: { id: teamMemberId, organizationId },
    select: CUSTODIAN_SELECT,
  });
  return resolveTeamMemberName(volunteer);
}

/**
 * The audit note and the low-stock check after a unit change. Best-effort:
 * the change has already committed, so a failure is logged and must not turn
 * a finished take or return into an error the volunteer would retry.
 */
async function afterUnitsMoved({
  organizationId,
  assetId,
  note,
}: {
  organizationId: string;
  assetId: string;
  note: string;
}) {
  try {
    await db.note.create({
      data: {
        content: note,
        type: "UPDATE",
        asset: { connect: { id: assetId } },
      },
    });
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Failed to write the note for a self-service unit change",
        additionalData: { organizationId, assetId },
        label: "Custody",
      })
    );
  }
  try {
    await checkAndNotifyLowStock({ assetId, userId: null, organizationId });
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message:
          "Failed to run the low-stock check after a self-service change",
        additionalData: { organizationId, assetId },
        label: "Custody",
      })
    );
  }
}

/**
 * Emails managers without waiting, so the volunteer's confirmation never
 * depends on SMTP. `sendSelfCustodyAlert` never rejects.
 */
function alertManagers(alert: {
  organizationId: string;
  workspaceName: string;
  assetId: string;
  kind: "taken" | "returned";
  assetTitle: string;
  volunteerName: string;
}) {
  void sendSelfCustodyAlert({ ...alert, source: "list" });
}
