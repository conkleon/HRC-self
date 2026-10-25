/**
 * Team Member Schemas
 *
 * Form validation for non-registered members (NRMs), shared by the server and
 * the browser. Kept out of `service.server.ts` so forms can validate with it
 * without pulling Prisma into the client bundle.
 *
 * An NRM's email is optional everywhere it is collected: in Settings, in the
 * inline "create team member" form of the custodian pickers, and on the public
 * self-service screens. When set, booking notifications reach the NRM there.
 *
 * @see {@link file://./service.server.ts}
 * @see {@link file://./../self-custody/schemas.ts}
 */
import { z } from "zod";
import { validEmail } from "~/utils/misc";

/**
 * An optional email address. A blank field reads as "no email" (`undefined`);
 * anything typed must be a valid address and is stored trimmed and lowercased,
 * so the same person is not saved twice under different casing.
 */
export const OptionalEmailSchema = z
  .string()
  .optional()
  .transform((raw) => raw?.trim().toLowerCase() || undefined)
  .refine((email) => email === undefined || validEmail(email), {
    message: "Please enter a valid email address",
  });

/** Form schema for creating or editing a non-registered team member. */
export const NewOrEditMemberSchema = z.object({
  // Trim BEFORE the length check: `" "` is one character, so it satisfies
  // `min(1)` and is then stored as the empty string.
  name: z.string().trim().min(1, "Name is required"),
  email: OptionalEmailSchema,
});
