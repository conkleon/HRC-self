/**
 * Self-Service Custody Settings
 *
 * Reads and writes the workspace's self-service switch and PIN
 * (`Organization.selfCustodyEnabled`, `selfCustodyPinHash`,
 * `selfCustodyPinUpdatedAt`), and the browse page's offer and link token
 * (`selfCustodyTagId`, `selfCustodyLocations`, `selfCustodyBrowseToken`).
 * The plain PIN never reaches
 * the database or leaves this module's callers: only its hash is stored.
 *
 * @see {@link file://./../../routes/_layout+/settings.self-service.tsx}
 * @see {@link file://./../../routes/qr+/_public+/$qrId.tsx}
 */
import { randomBytes } from "node:crypto";
import QRCode from "qrcode-generator";

import { db } from "~/database/db.server";
import { SERVER_URL } from "~/utils/env";
import { ShelfError } from "~/utils/error";
import { gifToPng } from "~/utils/gif-to-png";
import { Logger } from "~/utils/logger";
import {
  assertLocationsBelongToOrg,
  assertTagsBelongToOrg,
} from "~/utils/org-validation.server";
import { orderLocationTree } from "./location-tree";
import type { OrderedLocation } from "./location-tree";
import { hashPin } from "./pin.server";

/** What the settings page shows; the PIN hash never leaves the server. */
export type SelfCustodySettings = {
  enabled: boolean;
  hasPin: boolean;
  pinUpdatedAt: Date | null;
  /** The tag that marks items for the browse list, null when none is chosen. */
  tagId: string | null;
  /** Locations whose items (sub-locations included) the browse list offers. */
  locationIds: string[];
  /** The browse link's secret path segment, null until one is created. */
  browseToken: string | null;
};

/**
 * Reads a workspace's self-service settings for the settings page.
 *
 * @param organizationId - The current workspace
 * @returns The switch, whether a PIN is set, and when it last changed
 */
export async function getSelfCustodySettings(
  organizationId: string
): Promise<SelfCustodySettings> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      selfCustodyEnabled: true,
      selfCustodyPinHash: true,
      selfCustodyPinUpdatedAt: true,
      selfCustodyTagId: true,
      selfCustodyLocations: { select: { id: true } },
      selfCustodyBrowseToken: true,
    },
  });
  return {
    enabled: organization?.selfCustodyEnabled ?? false,
    hasPin: Boolean(organization?.selfCustodyPinHash),
    pinUpdatedAt: organization?.selfCustodyPinUpdatedAt ?? null,
    tagId: organization?.selfCustodyTagId ?? null,
    locationIds: organization?.selfCustodyLocations.map(({ id }) => id) ?? [],
    browseToken: organization?.selfCustodyBrowseToken ?? null,
  };
}

/**
 * Turns self-service on or off. Turning it on needs a PIN, so the public
 * page can never be open without one.
 *
 * @param args.organizationId - The current workspace
 * @param args.enabled - The new switch value
 * @throws {ShelfError} 400 when enabling a workspace that has no PIN yet
 */
export async function setSelfCustodyEnabled({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}): Promise<void> {
  if (enabled) {
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { selfCustodyPinHash: true },
    });
    if (!organization?.selfCustodyPinHash) {
      throw new ShelfError({
        cause: null,
        title: "PIN required",
        message: "Set a PIN first.",
        additionalData: { organizationId },
        label: "Custody",
        status: 400,
        shouldBeCaptured: false,
      });
    }
  }

  await db.organization.update({
    where: { id: organizationId },
    data: { selfCustodyEnabled: enabled },
  });
}

/**
 * Sets or replaces the workspace PIN. Bumping `selfCustodyPinUpdatedAt`
 * signs every volunteer phone out: their unlock cookies name the old version.
 *
 * @param args.organizationId - The current workspace
 * @param args.pin - The new PIN, already validated with `PinSchema`
 */
export async function setSelfCustodyPin({
  organizationId,
  pin,
}: {
  organizationId: string;
  pin: string;
}): Promise<void> {
  await db.organization.update({
    where: { id: organizationId },
    data: {
      selfCustodyPinHash: await hashPin(pin),
      selfCustodyPinUpdatedAt: new Date(),
    },
  });
}

/**
 * Whether anonymous scans of this workspace's QR codes open the self-service page.
 *
 * Non-fatal: every anonymous scan runs it, so a failed read logs and answers
 * false, and the scanner still reaches the regular not-logged-in page.
 *
 * @param organizationId - The workspace that owns the scanned QR
 * @returns The switch; false for an unknown workspace or a failed read
 */
export async function isSelfCustodyEnabled(
  organizationId: string
): Promise<boolean> {
  try {
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { selfCustodyEnabled: true },
    });
    return organization?.selfCustodyEnabled ?? false;
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Could not read the self-service custody setting",
        additionalData: { organizationId },
        label: "Custody",
      })
    );
    return false;
  }
}

/**
 * Chooses what the browse list offers: items with the tag, or stored in one
 * of the locations (sub-locations included). Either can be empty; with both
 * empty the list offers nothing. Replaces the previous choice entirely.
 *
 * @param args.organizationId - The current workspace
 * @param args.tagId - A tag of this workspace, or null for none
 * @param args.locationIds - Locations of this workspace, empty for none
 * @throws {ShelfError} 400 when the tag or a location belongs to another workspace
 */
export async function setSelfCustodyOffer({
  organizationId,
  tagId,
  locationIds,
}: {
  organizationId: string;
  tagId: string | null;
  locationIds: string[];
}): Promise<void> {
  const uniqueLocationIds = [...new Set(locationIds)];
  if (tagId) {
    await assertTagsBelongToOrg({ tagIds: [tagId], organizationId });
  }
  await assertLocationsBelongToOrg({
    locationIds: uniqueLocationIds,
    organizationId,
  });
  await db.organization.update({
    where: { id: organizationId },
    data: {
      selfCustodyTagId: tagId,
      selfCustodyLocations: { set: uniqueLocationIds.map((id) => ({ id })) },
    },
  });
}

/**
 * The workspace's locations for the browse list's location checklist, in
 * tree order so each is followed by its sub-locations.
 *
 * @param organizationId - The current workspace
 * @returns Every location, with its depth in the hierarchy
 */
export async function listSelfCustodyLocationChoices(
  organizationId: string
): Promise<OrderedLocation[]> {
  const locations = await db.location.findMany({
    where: { organizationId },
    select: { id: true, name: true, parentId: true },
  });
  return orderLocationTree(locations);
}

/**
 * Creates the browse link's token, or replaces it. A replaced token stops
 * working at once, which retires every printed poster and saved bookmark.
 *
 * 18 random bytes (144 bits) make the link unguessable; it is a locator, and
 * the workspace PIN still guards everything behind it.
 *
 * @param organizationId - The current workspace
 * @returns The new token
 */
export async function rotateSelfCustodyBrowseToken(
  organizationId: string
): Promise<string> {
  const token = randomBytes(18).toString("base64url");
  await db.organization.update({
    where: { id: organizationId },
    data: { selfCustodyBrowseToken: token },
  });
  return token;
}

/**
 * The browse page's absolute address for a token.
 *
 * @param token - The workspace's browse token
 * @returns The link volunteers open
 */
export function browseLinkUrl(token: string): string {
  return `${SERVER_URL}/self-service/${token}`;
}

/**
 * Renders the browse link as a QR code, for a poster at the depot.
 *
 * @param url - The browse link
 * @returns A PNG data URL, 8 pixels per module with a 4-module quiet zone
 */
export async function renderBrowseLinkQr(url: string): Promise<string> {
  const code = QRCode(0, "M");
  code.addData(url);
  code.make();
  return gifToPng(code.createDataURL(8, 32));
}
