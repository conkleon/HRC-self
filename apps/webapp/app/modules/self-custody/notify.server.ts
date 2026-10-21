/**
 * Self-Service Custody Manager Alerts
 *
 * Emails everyone whose role has `notifications.selfCustodyAlerts` (Owner,
 * Administrator, Manager) after a volunteer takes or returns an item through
 * self-service, by scan or from the browse list. Alerting never fails the volunteer's action: errors are
 * logged and swallowed, and `sendEmail` queues a retry when SMTP is down.
 *
 * @see {@link file://./../../emails/self-custody-alert.tsx}
 * @see {@link file://./custody.server.ts}
 */
import { sendEmail } from "~/emails/mail.server";
import {
  selfCustodyAlertHtml,
  selfCustodyAlertSubject,
  selfCustodyAlertText,
} from "~/emails/self-custody-alert";
import type { SelfCustodyAlertProps } from "~/emails/self-custody-alert";
import { getOrganizationNotificationAudience } from "~/modules/organization/service.server";
import { SERVER_URL } from "~/utils/env";
import { ShelfError } from "~/utils/error";
import { Logger } from "~/utils/logger";
import { resolveUserGreetingName } from "~/utils/user";

/** One self-service take or return to report. */
type SelfCustodyAlert = {
  organizationId: string;
  workspaceName: string;
  kind: SelfCustodyAlertProps["kind"];
  assetId: string;
  assetTitle: string;
  volunteerName: string;
  source: NonNullable<SelfCustodyAlertProps["source"]>;
};

/**
 * Emails the workspace's self-service audience about a take or return.
 *
 * @param alert - What happened, in which workspace, to which item
 * @returns Resolves once every email is handed to the mailer; never rejects
 */
export async function sendSelfCustodyAlert(
  alert: SelfCustodyAlert
): Promise<void> {
  try {
    const recipients = await getOrganizationNotificationAudience({
      organizationId: alert.organizationId,
      audience: "selfCustodyAlerts",
    });

    const assetUrl = `${SERVER_URL}/assets/${alert.assetId}`;

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
          kind: alert.kind,
        },
        label: "Custody",
      })
    );
  }
}
