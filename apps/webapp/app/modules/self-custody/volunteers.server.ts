/**
 * Self-Service Custody Volunteers
 *
 * Volunteers are the workspace's Non-Registered Members (team members with
 * no user account). The public self-service page lets a volunteer find their
 * own name, or add it, without exposing the whole roster: nothing is listed
 * until 3 characters are typed, and at most 10 names come back. Registered
 * users are never listed here.
 *
 * @see {@link file://./../team-member/service.server.ts}
 * @see {@link file://./../../routes/qr+/_public+/$qrId_.self-custody.tsx}
 */
import { db } from "~/database/db.server";
import { createTeamMember } from "~/modules/team-member/service.server";
import { normalizeVolunteerName } from "./schemas";

export { VolunteerNameSchema, normalizeVolunteerName } from "./schemas";

/** Characters a search needs before any name is returned. */
const MIN_SEARCH_LENGTH = 3;

/** Most names one search returns. */
const MAX_RESULTS = 10;

/** A volunteer as the self-service page shows them. */
export type Volunteer = { id: string; name: string };

/** Where clause shared by every volunteer lookup: live NRMs of one workspace. */
const nrmsOf = (organizationId: string) => ({
  organizationId,
  userId: null,
  deletedAt: null,
});

/**
 * Finds NRMs of a workspace whose name contains the query.
 *
 * @param args.organizationId - The workspace of the scanned QR (server-resolved)
 * @param args.query - What the volunteer typed
 * @returns Up to 10 matches in name order, or none under 3 characters
 */
export async function searchVolunteers({
  organizationId,
  query,
}: {
  organizationId: string;
  query: string;
}): Promise<Volunteer[]> {
  const term = normalizeVolunteerName(query);
  if (term.length < MIN_SEARCH_LENGTH) return [];

  return db.teamMember.findMany({
    where: {
      ...nrmsOf(organizationId),
      name: { contains: term, mode: "insensitive" },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: MAX_RESULTS,
  });
}

/**
 * Reads one volunteer of a workspace, by id.
 *
 * The browse page carries the chosen volunteer in its URL, so the id is
 * untrusted input: anything that is not a live NRM of this workspace (another
 * workspace's member, a registered user, a deleted member) reads as nobody.
 *
 * @param args.organizationId - The workspace of the browse link (server-resolved)
 * @param args.teamMemberId - The id from the URL
 * @returns The volunteer, or null
 */
export async function getVolunteer({
  organizationId,
  teamMemberId,
}: {
  organizationId: string;
  teamMemberId: string;
}): Promise<Volunteer | null> {
  return db.teamMember.findFirst({
    where: { ...nrmsOf(organizationId), id: teamMemberId },
    select: { id: true, name: true },
  });
}

/**
 * Returns the NRM with this name, ignoring case and spacing, or adds one.
 *
 * @param args.organizationId - The workspace of the scanned QR (server-resolved)
 * @param args.name - The volunteer's name, already validated with {@link VolunteerNameSchema}
 * @returns The volunteer, and whether it was just created
 * @throws {ShelfError} When creating the team member fails
 */
export async function findOrCreateVolunteer({
  organizationId,
  name,
}: {
  organizationId: string;
  name: string;
}): Promise<Volunteer & { created: boolean }> {
  const normalized = normalizeVolunteerName(name);

  const existing = await db.teamMember.findFirst({
    where: {
      ...nrmsOf(organizationId),
      name: { equals: normalized, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });
  if (existing) return { ...existing, created: false };

  const created = await createTeamMember({ name: normalized, organizationId });
  return { id: created.id, name: created.name, created: true };
}
