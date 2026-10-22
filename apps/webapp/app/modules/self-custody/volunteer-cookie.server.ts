/**
 * Self-Service Remembered Volunteer Cookie
 *
 * Once a volunteer says who they are on the browse page, the phone remembers
 * it: opening the browse link again goes straight to their lists, until they
 * press "Not you?". The signed cookie maps each workspace to the team member
 * id chosen on this phone, so one phone can serve several workspaces.
 *
 * The cookie is a convenience, not a proof: the route re-checks the id as a
 * live NRM of the workspace on every request, exactly like `?member=`, and
 * forgets it when that check fails.
 *
 * Browsers cap a cookie's lifetime at 400 days, so the route re-issues it on
 * every visit. A phone that opens the page at least once in that window
 * stays remembered indefinitely.
 *
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 * @see {@link file://./unlock-cookie.server.ts}
 */
import { createCookie } from "react-router";

import { NODE_ENV, SESSION_SECRET } from "~/utils/env";

/** The longest lifetime browsers accept for a cookie (Chrome's cap). */
const REMEMBER_SECONDS = 400 * 24 * 60 * 60;

const volunteerCookie = createCookie("__selfCustodyVolunteer", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secrets: [SESSION_SECRET],
  secure: NODE_ENV === "production",
  maxAge: REMEMBER_SECONDS,
});

/** Workspace id to the team member id chosen on this phone. */
type RememberedVolunteers = Record<string, string>;

/** Reads the cookie, treating a missing, unsigned or malformed one as empty. */
async function readRemembered(request: Request): Promise<RememberedVolunteers> {
  const parsed: unknown = await volunteerCookie.parse(
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
 * The team member this phone chose for a workspace, if any. Not yet checked
 * against the workspace: the caller must still prove it is a live NRM there.
 *
 * @param request - The incoming request
 * @param organizationId - The workspace of the browse link
 * @returns The remembered team member id, or null
 */
export async function getRememberedVolunteerId(
  request: Request,
  organizationId: string
): Promise<string | null> {
  return (await readRemembered(request))[organizationId] ?? null;
}

/**
 * Builds the Set-Cookie header that remembers (or re-remembers, renewing its
 * lifetime) a volunteer for a workspace. Other workspaces are kept.
 *
 * @param args.request - The current request
 * @param args.organizationId - The workspace of the browse link
 * @param args.teamMemberId - The volunteer, already proven to be an NRM of it
 * @returns The Set-Cookie header value
 */
export async function serializeRememberedVolunteer({
  request,
  organizationId,
  teamMemberId,
}: {
  request: Request;
  organizationId: string;
  teamMemberId: string;
}): Promise<string> {
  const remembered = await readRemembered(request);
  return volunteerCookie.serialize({
    ...remembered,
    [organizationId]: teamMemberId,
  });
}

/**
 * Builds the Set-Cookie header that forgets the volunteer for a workspace,
 * keeping any other workspace this phone remembers.
 *
 * @param args.request - The current request
 * @param args.organizationId - The workspace of the browse link
 * @returns The Set-Cookie header value
 */
export async function serializeForgottenVolunteer({
  request,
  organizationId,
}: {
  request: Request;
  organizationId: string;
}): Promise<string> {
  const { [organizationId]: _forgotten, ...rest } =
    await readRemembered(request);
  return volunteerCookie.serialize(rest);
}
