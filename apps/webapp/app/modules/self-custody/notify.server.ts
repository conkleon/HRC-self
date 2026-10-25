/**
 * Self-Service Custody Emails
 *
 * After a volunteer takes or returns an item through self-service, by scan or
 * from the browse list, this emails:
 * - everyone whose role has `notifications.selfCustodyAlerts` (Owner,
 *   Administrator, Manager): an alert with a link to the item;
 * - the volunteer, when their non-registered member record has an email: a
 *   receipt with no links, since they have no account.
 *
 * Emailing never fails the volunteer's action: errors are logged and
 * swallowed, each audience separately, and `sendEmail` queues a retry when
 * SMTP is down.
 *
 * @see {@link file://./../../emails/self-custody-alert.tsx}
 * @see {@link file://./../../emails/self-custody-receipt.tsx}
 * @see {@link file://./custody.server.ts}
 */
import { db } from "~/database/db.server";
import { sendEmail } from "~/emails/mail.server";
import {
  selfCustodyAlertHtml,
  selfCustodyAlertSubject,
  selfCustodyAlertText,
} from "~/emails/self-custody-alert";
import type { SelfCustodyAlertProps } from "~/emails/self-custody-alert";
import {
  selfCustodyReceiptHtml,
  selfCustodyReceiptSubject,
  selfCustodyReceiptText,
} from "~/emails/self-custody-receipt";
import { getOrganizationNotificationAudience } from "~/modules/organization/service.server";
import { SERVER_URL } from "~/utils/env";
import { ShelfError } from "~/utils/error";
import { Logger } from "~/utils/logger";
import { resolveUserGreetingName } from "~/utils/user";

/**
 * One self-service take or return to report, of a single item (`assetId`) or
 * a kit (`kitId`). `assetTitle` names whichever it was.
 */
type SelfCustodyAlert = {
  organizationId: string;
  workspaceName: string;
  kind: SelfCustodyAlertProps["kind"];
  assetTitle: string;
  volunteerName: string;
  /** The volunteer who took or returned it: the team member whose custody changed */
  volunteerTeamMemberId: string;
  source: NonNullable<SelfCustodyAlertProps["source"]>;
} & ({ assetId: string; kitId?: never } | { kitId: string; assetId?: never });

/**
 * Emails the workspace's self-service audience about a take or return, and
 * the volunteer their receipt.
 *
 * @param alert - What happened, in which workspace, to which item, by whom
 * @returns Resolves once every email is handed to the mailer; never rejects
 */
export async function sendSelfCustodyAlert(
  alert: SelfCustodyAlert
): Promise<void> {
  await Promise.all([alertManagers(alert), sendVolunteerReceipt(alert)]);
}

/** Emails the managers' alert. Never rejects. */
async function alertManagers(alert: SelfCustodyAlert): Promise<void> {
  try {
    const recipients = await getOrganizationNotificationAudience({
      organizationId: alert.organizationId,
      audience: "selfCustodyAlerts",
    });

    const assetUrl = alert.kitId
      ? `${SERVER_URL}/kits/${alert.kitId}`
      : `${SERVER_URL}/assets/${alert.assetId}`;

    for (const recipient of recipients) {
      const props: SelfCustodyAlertProps = {
        firstName: resolveUserGreetingName(recipient) || null,
        kind: alert.kind,
        assetTitle: alert.assetTitle,
        assetUrl,
        volunteerName: alert.volunteerName,
        workspaceName: alert.workspaceName,
        source: alert.source,
      };

      sendEmail({
        to: recipient.email,
        subject: selfCustodyAlertSubject(props),
        html: await selfCustodyAlertHtml(props),
        text: selfCustodyAlertText(props),
      });
    }
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Something went wrong while sending the self-service alert",
        additionalData: {
          organizationId: alert.organizationId,
          assetId: alert.assetId,
          kitId: alert.kitId,
          kind: alert.kind,
        },
        label: "Custody",
      })
    );
  }
}

/**
 * Emails the volunteer a receipt of their take or return.
 *
 * Only a non-registered member of the workspace with an email gets one. The
 * id is re-read scoped to the workspace, so a team member of another
 * workspace, a registered user or a deleted member is never emailed here.
 * Never rejects.
 */
async function sendVolunteerReceipt(alert: SelfCustodyAlert): Promise<void> {
  try {
    const volunteer = await db.teamMember.findFirst({
      where: {
        id: alert.volunteerTeamMemberId,
        organizationId: alert.organizationId,
        userId: null,
        deletedAt: null,
      },
      select: { email: true },
    });
    if (!volunteer?.email) return;

    const props = {
      volunteerName: alert.volunteerName,
      kind: alert.kind,
      assetTitle: alert.assetTitle,
      workspaceName: alert.workspaceName,
    };

    sendEmail({
      to: volunteer.email,
      subject: selfCustodyReceiptSubject(props),
      html: await selfCustodyReceiptHtml(props),
      text: selfCustodyReceiptText(props),
    });
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Something went wrong while sending the self-service receipt",
        additionalData: {
          organizationId: alert.organizationId,
          assetId: alert.assetId,
          kitId: alert.kitId,
          kind: alert.kind,
        },
        label: "Custody",
      })
    );
  }
}
