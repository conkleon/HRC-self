/**
 * Self-Service Custody Schemas
 *
 * Form validation shared by the server and the browser. Kept out of the
 * `*.server` modules so route components can validate with them without
 * pulling server-only code (`node:crypto`, Prisma) into the client bundle.
 *
 * @see {@link file://./pin.server.ts}
 * @see {@link file://./volunteers.server.ts}
 * @see {@link file://./../team-member/schemas.ts}
 */
import { z } from "zod";
import { OptionalEmailSchema } from "~/modules/team-member/schemas";

/** A workspace PIN: 4 to 8 digits. */
export const PinSchema = z.string().regex(/^\d{4,8}$/, "Use 4 to 8 digits");

/**
 * Trims a typed name and collapses runs of whitespace, so " Maria  P. " and
 * "Maria P." are the same person.
 *
 * @param raw - The name as typed
 * @returns The normalized name
 */
export function normalizeVolunteerName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** A volunteer's own name, normalized, 2 to 60 characters. */
export const VolunteerNameSchema = z
  .string()
  .transform(normalizeVolunteerName)
  .pipe(
    z
      .string()
      .min(2, "Enter your name (2 to 60 characters)")
      .max(60, "Enter your name (2 to 60 characters)")
  );

/**
 * The "add me" form of the self-service screens: the volunteer's name, plus an
 * optional email where their booking notifications go. The email is saved only
 * on a newly created volunteer, never on an existing one (see
 * `findOrCreateVolunteer`).
 */
export const NewVolunteerSchema = z.object({
  name: VolunteerNameSchema,
  email: OptionalEmailSchema,
});
