/**
 * Booking Notification Recipient Helpers
 *
 * Pure rules about where a booking email may go and what it may contain, kept
 * apart from the resolver (`notification-recipients.server.ts`) so every send
 * loop uses them without reaching the database, and tests that stub the
 * resolver still get the real rules.
 *
 * A non-registered member (a team member with no user account) is reached at
 * their own optional `TeamMember.email`. They cannot sign in, so their emails
 * carry no links into the app.
 *
 * @see {@link file://./notification-recipients.server.ts}
 */
import type { NotificationRecipient } from "./notification-recipients.server";

/**
 * The email a booking's custodian is reached at when they are a non-registered
 * member: their own optional `TeamMember.email`. A custodian linked to a user
 * account is reached at `user.email` instead, so this returns `null` for them.
 *
 * @param booking - The booking with its custodian relations included
 * @returns The NRM custodian's email, or `null`
 */
export function getNrmCustodianEmail(booking: {
  custodianUser?: unknown;
  custodianTeamMember?: { userId: string | null; email: string | null } | null;
}): string | null {
  const teamMember = booking.custodianTeamMember;
  if (booking.custodianUser || !teamMember || teamMember.userId) return null;
  return teamMember.email || null;
}

/**
 * Whether a recipient can open the booking in the app. A non-registered member
 * has no account, so every email to them leaves out the links to the booking
 * page (the HTML `hideViewButton` and the plain-text `showBookingLink`).
 *
 * @param recipient - A resolved notification recipient
 * @returns `true` for a recipient with a user account
 */
export function recipientCanOpenBooking(
  recipient: Pick<NotificationRecipient, "userId">
): boolean {
  return recipient.userId !== null;
}
