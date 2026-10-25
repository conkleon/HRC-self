/**
 * Custody Notice Email
 *
 * Sent to a custodian when a staff member gives them custody of items, or
 * releases custody they held: from an asset or kit page, a bulk action, the
 * scanner or the mobile app. It lists the specific items, so the custodian
 * knows exactly what they now hold, or no longer hold.
 *
 * A registered custodian gets each item as a link into the app. A
 * non-registered member (reached at their own optional email) has no account,
 * so their email lists the items as plain text.
 *
 * Self-service takes and returns send `self-custody-receipt.tsx` instead.
 *
 * @see {@link file://./../modules/custody/notify.server.ts}
 * @see {@link file://./self-custody-receipt.tsx}
 */
import {
  Container,
  Head,
  Html,
  Link,
  render,
  Text,
} from "@react-email/components";

import { config } from "~/config/shelf.config";
import { getAppName } from "~/modules/branding/instance-branding";
import { LogoForEmail } from "./logo";
import { styles } from "./styles";

/** Most items an email lists by name; the rest are counted. */
export const CUSTODY_NOTICE_ITEMS_LIMIT = 25;

/** One item the notice lists. */
export type CustodyNoticeItem = {
  /** The asset or kit name, or a unit count such as "3 × Bandages" */
  title: string;
  /** Absolute link to the item, or `null` for a custodian with no account */
  url: string | null;
  /** For a kit: the items inside it, by name */
  contents?: string[];
};

/** What one notice tells one custodian. */
export type CustodyNoticeProps = {
  /** The custodian's greeting name, empty when unknown */
  greetingName: string;
  /** Whether custody was given to them or released from them */
  kind: "assigned" | "released";
  /** The staff member who made the change */
  actorName: string;
  workspaceName: string;
  items: CustodyNoticeItem[];
};

/** "Radio #12", or "3 items" when there are several. */
function itemsLabel(items: CustodyNoticeItem[]) {
  return items.length === 1 ? items[0].title : `${items.length} items`;
}

/**
 * Subject line, e.g. "You now have custody of Radio #12" or
 * "Custody of 3 items released".
 *
 * @param props - The notice
 * @returns The subject
 */
export function custodyNoticeSubject({
  kind,
  items,
}: CustodyNoticeProps): string {
  return kind === "assigned"
    ? `You now have custody of ${itemsLabel(items)}`
    : `Custody of ${itemsLabel(items)} released`;
}

/** "Hey Maria," or "Hey," as one string. */
function greeting(greetingName: string) {
  return `Hey${greetingName ? ` ${greetingName}` : ""},`;
}

/** The sentence that introduces the item list. */
function summary({
  kind,
  actorName,
  workspaceName,
  items,
}: CustodyNoticeProps) {
  const what = items.length === 1 ? "this item" : "these items";
  return kind === "assigned"
    ? `${actorName} gave you custody of ${what} in ${workspaceName}:`
    : `${actorName} released your custody of ${what} in ${workspaceName}:`;
}

/** The closing line under the list. */
function closing({ kind }: CustodyNoticeProps) {
  return kind === "assigned"
    ? "You are responsible for them until custody is released."
    : "They are no longer in your custody.";
}

/** The items shown by name, and how many more there are. */
function listedItems(items: CustodyNoticeItem[]) {
  return {
    shown: items.slice(0, CUSTODY_NOTICE_ITEMS_LIMIT),
    more: Math.max(0, items.length - CUSTODY_NOTICE_ITEMS_LIMIT),
  };
}

/** Shown under the list on every notice. */
const NOT_EXPECTED =
  "If you weren't expecting this, please contact a staff member of the workspace.";

/**
 * Plain-text version of the notice.
 *
 * @param props - The notice
 * @returns The text body
 */
export function custodyNoticeText(props: CustodyNoticeProps): string {
  const { shown, more } = listedItems(props.items);
  const lines = shown
    .map((item) => {
      const head = `- ${item.title}${item.url ? ` (${item.url})` : ""}`;
      const inside = (item.contents ?? []).map((name) => `\n    - ${name}`);
      return head + inside.join("");
    })
    .join("\n");
  const moreLine = more > 0 ? `\n- and ${more} more` : "";

  return `${greeting(props.greetingName)}

${summary(props)}

${lines}${moreLine}

${closing(props)}

${NOT_EXPECTED}

The ${getAppName()} Team
`;
}

/** React Email template for the notice. */
function CustodyNoticeTemplate(props: CustodyNoticeProps) {
  const { shown, more } = listedItems(props.items);

  return (
    <Html>
      <Head>
        <title>{custodyNoticeSubject(props)}</title>
      </Head>

      <Container style={{ padding: "32px 16px", maxWidth: "100%" }}>
        <LogoForEmail />

        <div style={{ paddingTop: "8px" }}>
          <Text style={{ ...styles.p }}>{greeting(props.greetingName)}</Text>

          <Text style={{ ...styles.p }}>{summary(props)}</Text>

          <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
            {shown.map((item, index) => (
              // Titles can repeat (two units of one model), so the index keys.
              // eslint-disable-next-line react/no-array-index-key
              <li key={index} style={{ ...styles.li, marginBottom: "4px" }}>
                {item.url ? (
                  <Link
                    href={item.url}
                    style={{ color: config.emailPrimaryColor }}
                  >
                    {item.title}
                  </Link>
                ) : (
                  item.title
                )}
                {item.contents && item.contents.length > 0 ? (
                  <ul style={{ paddingLeft: "20px", marginTop: "4px" }}>
                    {item.contents.map((name, contentIndex) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <li key={contentIndex} style={{ ...styles.li }}>
                        {name}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
            {more > 0 ? (
              <li style={{ ...styles.li }}>{`and ${more} more`}</li>
            ) : null}
          </ul>

          <Text style={{ ...styles.p }}>{closing(props)}</Text>

          <div
            style={{
              backgroundColor: "#FFF8E1",
              border: "1px solid #FFE082",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "16px",
            }}
          >
            <Text style={{ ...styles.p, margin: 0 }}>{NOT_EXPECTED}</Text>
          </div>

          <Text style={{ ...styles.p, marginBottom: "32px" }}>
            {`The ${getAppName()} Team`}
          </Text>
        </div>
      </Container>
    </Html>
  );
}

/**
 * HTML version of the notice.
 *
 * @param props - The notice
 * @returns The rendered HTML
 */
export function custodyNoticeHtml(props: CustodyNoticeProps): Promise<string> {
  return render(<CustodyNoticeTemplate {...props} />);
}
