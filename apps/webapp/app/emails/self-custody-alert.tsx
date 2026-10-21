/**
 * Self-Service Custody Alert Email
 *
 * Sent to every member whose role has `notifications.selfCustodyAlerts`
 * (Owner, Administrator, Manager) when a volunteer takes or returns an item on
 * a public self-service page: by scanning its QR code, or from the workspace's
 * browse list.
 *
 * @see {@link file://./../modules/self-custody/notify.server.ts}
 */
import {
  Button,
  Container,
  Head,
  Html,
  render,
  Text,
} from "@react-email/components";

import { getAppName } from "~/modules/branding/instance-branding";
import { LogoForEmail } from "./logo";
import { styles } from "./styles";

/** What one alert email reports, for one recipient. */
export type SelfCustodyAlertProps = {
  /** The recipient's greeting name, empty or null when unknown. */
  firstName: string | null;
  /** Whether the volunteer took the item or returned it. */
  kind: "taken" | "returned";
  assetTitle: string;
  /** Absolute link to the asset in Shelf. */
  assetUrl: string;
  /** The volunteer's NRM name. */
  volunteerName: string;
  workspaceName: string;
  /** How the volunteer reached the item. Defaults to "scan". */
  source?: "scan" | "list";
};

/**
 * Subject line, e.g. "Maria P. took Radio #12".
 *
 * @param props - The alert
 * @returns The subject
 */
export function selfCustodyAlertSubject({
  kind,
  assetTitle,
  volunteerName,
}: SelfCustodyAlertProps): string {
  return `${volunteerName} ${
    kind === "taken" ? "took" : "returned"
  } ${assetTitle}`;
}

/**
 * "Hey Eleni," or "Hey," as one string, so the HTML carries a single text
 * node rather than React's per-expression fragments.
 */
function greeting(firstName: string | null) {
  return `Hey${firstName ? ` ${firstName}` : ""},`;
}

/** The one sentence that says what happened. */
function summary({
  kind,
  assetTitle,
  volunteerName,
  source = "scan",
}: SelfCustodyAlertProps) {
  const how =
    source === "list"
      ? "from the self-service list"
      : "by scanning its QR code";
  return kind === "taken"
    ? `${volunteerName} took ${assetTitle} into their custody ${how}.`
    : `${volunteerName} returned ${assetTitle} ${how}.`;
}

/**
 * Plain-text version of the alert.
 *
 * @param props - The alert
 * @returns The text body
 */
export function selfCustodyAlertText(props: SelfCustodyAlertProps): string {
  return `${greeting(props.firstName)}

${summary(props)}

Workspace: ${props.workspaceName}
View item: ${props.assetUrl}

You receive this because self-service custody is turned on for this workspace.

The ${getAppName()} Team
`;
}

/** React Email template for the alert. */
function SelfCustodyAlertTemplate(props: SelfCustodyAlertProps) {
  return (
    <Html>
      <Head>
        <title>{selfCustodyAlertSubject(props)}</title>
      </Head>

      <Container style={{ padding: "32px 16px", maxWidth: "100%" }}>
        <LogoForEmail />

        <div style={{ paddingTop: "8px" }}>
          <Text style={{ ...styles.p }}>{greeting(props.firstName)}</Text>

          <Text style={{ ...styles.p }}>{summary(props)}</Text>

          <Text style={{ ...styles.p }}>
            Workspace: <strong>{props.workspaceName}</strong>
          </Text>

          <Button
            href={props.assetUrl}
            style={{
              ...styles.button,
              textAlign: "center" as const,
              maxWidth: "200px",
              marginBottom: "24px",
            }}
          >
            View item
          </Button>

          <Text style={{ ...styles.p }}>
            You receive this because self-service custody is turned on for this
            workspace.
          </Text>

          <Text style={{ ...styles.p, marginBottom: "32px" }}>
            {`The ${getAppName()} Team`}
          </Text>
        </div>
      </Container>
    </Html>
  );
}

/**
 * HTML version of the alert.
 *
 * @param props - The alert
 * @returns The rendered HTML
 */
export function selfCustodyAlertHtml(
  props: SelfCustodyAlertProps
): Promise<string> {
  return render(<SelfCustodyAlertTemplate {...props} />);
}
