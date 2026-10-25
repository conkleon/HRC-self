/**
 * Self-Service Custody Receipt Email
 *
 * Sent to the volunteer themselves after they take or return an item on a
 * public self-service page, when their non-registered member record has an
 * email. It is their confirmation of what they now hold (or no longer hold).
 * A volunteer has no account, so the email carries no links into the app.
 *
 * The manager-facing counterpart is `self-custody-alert.tsx`.
 *
 * @see {@link file://./../modules/self-custody/notify.server.ts}
 * @see {@link file://./self-custody-alert.tsx}
 */
import { Container, Head, Html, render, Text } from "@react-email/components";

import { getAppName } from "~/modules/branding/instance-branding";
import { LogoForEmail } from "./logo";
import { styles } from "./styles";

/** What one receipt email confirms, to the volunteer. */
export type SelfCustodyReceiptProps = {
  /** The volunteer's NRM name, used in the greeting */
  volunteerName: string;
  /** Whether the volunteer took the item or returned it */
  kind: "taken" | "returned";
  /** The item, kit or unit count, as the self-service page named it */
  assetTitle: string;
  workspaceName: string;
};

/**
 * Subject line, e.g. "You took Radio #12".
 *
 * @param props - The receipt
 * @returns The subject
 */
export function selfCustodyReceiptSubject({
  kind,
  assetTitle,
}: SelfCustodyReceiptProps): string {
  return `You ${kind === "taken" ? "took" : "returned"} ${assetTitle}`;
}

/** The one sentence that confirms what happened. */
function summary({ kind, assetTitle, workspaceName }: SelfCustodyReceiptProps) {
  return kind === "taken"
    ? `You took ${assetTitle} into your custody from ${workspaceName}. Please return it when you are done.`
    : `You returned ${assetTitle} to ${workspaceName}. It is no longer in your custody.`;
}

/** Shown under the summary on every receipt. */
const NOT_YOU =
  "If this wasn't you, please tell a staff member of the workspace.";

/**
 * Plain-text version of the receipt.
 *
 * @param props - The receipt
 * @returns The text body
 */
export function selfCustodyReceiptText(props: SelfCustodyReceiptProps): string {
  return `Hey ${props.volunteerName},

${summary(props)}

${NOT_YOU}

You receive this because this email address is saved for you in ${
    props.workspaceName
  }.

The ${getAppName()} Team
`;
}

/** React Email template for the receipt. */
function SelfCustodyReceiptTemplate(props: SelfCustodyReceiptProps) {
  return (
    <Html>
      <Head>
        <title>{selfCustodyReceiptSubject(props)}</title>
      </Head>

      <Container style={{ padding: "32px 16px", maxWidth: "100%" }}>
        <LogoForEmail />

        <div style={{ paddingTop: "8px" }}>
          <Text style={{ ...styles.p }}>{`Hey ${props.volunteerName},`}</Text>

          <Text style={{ ...styles.p }}>{summary(props)}</Text>

          <div
            style={{
              backgroundColor: "#FFF8E1",
              border: "1px solid #FFE082",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "16px",
            }}
          >
            <Text style={{ ...styles.p, margin: 0 }}>{NOT_YOU}</Text>
          </div>

          <Text style={{ ...styles.p }}>
            {`You receive this because this email address is saved for you in ${props.workspaceName}.`}
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
 * HTML version of the receipt.
 *
 * @param props - The receipt
 * @returns The rendered HTML
 */
export function selfCustodyReceiptHtml(
  props: SelfCustodyReceiptProps
): Promise<string> {
  return render(<SelfCustodyReceiptTemplate {...props} />);
}
