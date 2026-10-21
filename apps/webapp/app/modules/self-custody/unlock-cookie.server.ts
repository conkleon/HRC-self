/**
 * Self-Service Custody Unlock Cookie
 *
 * After a volunteer enters the right workspace PIN, their phone stays unlocked
 * for 12 hours, so taking several items asks for the PIN once. The signed
 * cookie maps each unlocked workspace to the PIN version it was unlocked
 * with (`Organization.selfCustodyPinUpdatedAt`). Changing the PIN changes the
 * version, so every phone is asked for the new PIN on its next action.
 *
 * @see {@link file://./../../routes/qr+/_public+/$qrId_.self-custody.tsx}
 */
import { createCookie } from "react-router";

import { NODE_ENV, SESSION_SECRET } from "~/utils/env";

/** How long one PIN entry keeps a phone unlocked. */
const UNLOCK_SECONDS = 12 * 60 * 60;

const unlockCookie = createCookie("__selfCustodyUnlock", {
  httpOnly: true,
  path: "/qr",
  sameSite: "lax",
  secrets: [SESSION_SECRET],
  secure: NODE_ENV === "production",
  maxAge: UNLOCK_SECONDS,
});

/** Workspace id to the PIN version it was unlocked with. */
type UnlockedWorkspaces = Record<string, string>;

/** The workspace fields that decide whether a phone is unlocked. */
type UnlockableOrganization = {
  id: string;
  selfCustodyPinUpdatedAt: Date | null;
};

/** The PIN version string stored in the cookie; changes on every PIN change. */
const pinVersion = (org: UnlockableOrganization) =>
  org.selfCustodyPinUpdatedAt?.toISOString() ?? "unset";

/** Reads the cookie, treating a missing, unsigned or malformed one as empty. */
async function readUnlocked(
  request: Request | undefined
): Promise<UnlockedWorkspaces> {
  if (!request) return {};
  const parsed: unknown = await unlockCookie.parse(
    request.headers.get("Cookie")
  );
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

/**
 * Builds the Set-Cookie header that unlocks a workspace on this phone.
 *
 * @param org - The workspace the volunteer just entered the right PIN for
 * @param request - The current request; workspaces it already unlocks are kept
 * @returns The Set-Cookie header value
 */
export async function serializeUnlockCookie(
  org: UnlockableOrganization,
  request?: Request
): Promise<string> {
  const unlocked = await readUnlocked(request);
  return unlockCookie.serialize({ ...unlocked, [org.id]: pinVersion(org) });
}

/**
 * Whether this phone may act on the workspace without entering the PIN again.
 *
 * @param request - The incoming request
 * @param org - The workspace the scanned QR belongs to
 * @returns True when the cookie unlocks this workspace at its current PIN
 */
export async function isUnlocked(
  request: Request,
  org: UnlockableOrganization
): Promise<boolean> {
  if (!org.selfCustodyPinUpdatedAt) return false;
  const unlocked = await readUnlocked(request);
  return unlocked[org.id] === pinVersion(org);
}
