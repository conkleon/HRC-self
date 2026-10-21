/**
 * Self-Service Custody Settings
 *
 * Reads and writes the workspace's self-service switch and PIN
 * (`Organization.selfCustodyEnabled`, `selfCustodyPinHash`,
 * `selfCustodyPinUpdatedAt`). The plain PIN never reaches the database or
 * leaves this module's callers: only its hash is stored.
 *
 * @see {@link file://./../../routes/_layout+/settings.self-service.tsx}
 * @see {@link file://./../../routes/qr+/_public+/$qrId.tsx}
 */
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";
import { Logger } from "~/utils/logger";
import { hashPin } from "./pin.server";

/** What the settings page shows; the PIN hash never leaves the server. */
export type SelfCustodySettings = {
  enabled: boolean;
  hasPin: boolean;
  pinUpdatedAt: Date | null;
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
    },
  });
  return {
    enabled: organization?.selfCustodyEnabled ?? false,
    hasPin: Boolean(organization?.selfCustodyPinHash),
    pinUpdatedAt: organization?.selfCustodyPinUpdatedAt ?? null,
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
