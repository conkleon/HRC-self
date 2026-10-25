/**
 * Custody Notices
 *
 * Emails custodians when a staff member gives them custody of items or
 * releases custody they held, listing the specific items. Every staff path
 * calls {@link notifyCustodians} after its transaction commits: single asset
 * and kit assign/release, bulk asset and kit actions (the scanner and the
 * mobile app go through these), and quantity-tracked unit custody.
 *
 * Who is emailed:
 * - a registered custodian, at their account email, with links to the items;
 * - a non-registered member, at their own optional `TeamMember.email`, with no
 *   links (they have no account);
 * - never the staff member who made the change, so assigning to yourself
 *   sends nothing.
 *
 * Self-service takes and returns have their own receipt
 * (`self-custody/notify.server.ts`) and do not come through here.
 *
 * Notifying never fails the custody change: it runs after the commit, without
 * being awaited, logs its own errors, and `sendEmail` retries when SMTP is down.
 *
 * @see {@link file://./../../emails/custody-notice.tsx}
 */
import { db } from "~/database/db.server";
import {
  custodyNoticeHtml,
  custodyNoticeSubject,
  custodyNoticeText,
} from "~/emails/custody-notice";
import type { CustodyNoticeItem } from "~/emails/custody-notice";
import { sendEmail } from "~/emails/mail.server";
import { USER_NAME_SELECT } from "~/modules/user/fields";
import { SERVER_URL } from "~/utils/env";
import { ShelfError } from "~/utils/error";
import { Logger } from "~/utils/logger";
import { resolveUserDisplayName, resolveUserGreetingName } from "~/utils/user";

/**
 * One item whose custody changed, and the team member it changed for. A kit
 * is one item (`kitId`); an asset is `assetId`, its title possibly a unit
 * count such as "3 × Bandages".
 */
export type CustodyChange = {
  /** The custodian who received or lost custody */
  teamMemberId: string;
  title: string;
  /** For a kit: the items inside it, listed under the kit */
  contents?: string[];
} & ({ assetId: string; kitId?: never } | { kitId: string; assetId?: never });

/** Arguments for {@link notifyCustodians}. */
type NotifyCustodiansArgs = {
  organizationId: string;
  /** The staff member who made the change; never emailed */
  actorUserId: string;
  kind: "assigned" | "released";
  changes: CustodyChange[];
};

/**
 * Emails each custodian one notice listing the items whose custody changed
 * for them. Call it after the transaction commits; it is not awaited and
 * never throws.
 *
 * @param args - The workspace, the acting staff member, and what changed
 */
export function notifyCustodians(args: NotifyCustodiansArgs): void {
  if (args.changes.length === 0) return;
  void sendCustodyNotices(args);
}

/**
 * The work behind {@link notifyCustodians}, exported for tests.
 *
 * @param args - The workspace, the acting staff member, and what changed
 * @returns Resolves once every email is handed to the mailer; never rejects
 */
export async function sendCustodyNotices({
  organizationId,
  actorUserId,
  kind,
  changes,
}: NotifyCustodiansArgs): Promise<void> {
  try {
    const byCustodian = new Map<string, CustodyChange[]>();
    for (const change of changes) {
      const list = byCustodian.get(change.teamMemberId) ?? [];
      list.push(change);
      byCustodian.set(change.teamMemberId, list);
    }

    const [custodians, actor, organization] = await Promise.all([
      db.teamMember.findMany({
        // Scoped to the workspace: an id from another one is never emailed.
        where: {
          id: { in: [...byCustodian.keys()] },
          organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          user: { select: { id: true, email: true, ...USER_NAME_SELECT } },
        },
      }),
      db.user.findUnique({
        where: { id: actorUserId },
        select: { email: true, ...USER_NAME_SELECT },
      }),
      db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
    ]);

    const actorName =
      (actor && (resolveUserDisplayName(actor) || actor.email)) ||
      "A staff member";
    const workspaceName = organization?.name ?? "your workspace";

    for (const custodian of custodians) {
      // Assigning to or releasing from yourself is not news to you.
      if (custodian.user?.id === actorUserId) continue;

      // A registered member is reached at their account; a non-registered
      // one at their own optional email, without links.
      const to = custodian.user ? custodian.user.email : custodian.email;
      if (!to) continue;
      const canOpenItems = Boolean(custodian.user);

      const items: CustodyNoticeItem[] = (
        byCustodian.get(custodian.id) ?? []
      ).map((change) => ({
        title: change.title,
        url: canOpenItems ? itemUrl(change) : null,
        contents: change.contents,
      }));

      const props = {
        greetingName: custodian.user
          ? resolveUserGreetingName(custodian.user)
          : custodian.name,
        kind,
        actorName,
        workspaceName,
        items,
      };

      sendEmail({
        to,
        subject: custodyNoticeSubject(props),
        html: await custodyNoticeHtml(props),
        text: custodyNoticeText(props),
      });
    }
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Something went wrong while emailing custodians",
        additionalData: { organizationId, kind, count: changes.length },
        label: "Custody",
      })
    );
  }
}

/** Absolute link to the changed asset or kit. */
function itemUrl(change: CustodyChange): string {
  return change.kitId
    ? `${SERVER_URL}/kits/${change.kitId}`
    : `${SERVER_URL}/assets/${change.assetId}`;
}
