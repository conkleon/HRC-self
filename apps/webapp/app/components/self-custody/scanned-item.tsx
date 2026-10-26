/**
 * Self-Service Scanned Item
 *
 * What a code scanned on the public self-service page resolved to, and the
 * one action it allows: take it, return it, or the reason a staff member is
 * needed. The take or return posts the scanned code, never an item or kit id,
 * so the action resolves it afresh.
 *
 * Kept apart from the camera (`scan-code.tsx`) so the page's scan state can be
 * read and tested without loading the scanner.
 *
 * @see {@link file://./scan-code.tsx}
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 */
import { Form, Link, useLocation } from "react-router";

import { Button } from "~/components/shared/button";
import { useDisabled } from "~/hooks/use-disabled";
import { FormError, ItemCard, StaffOnlyNotice } from "./self-custody-steps";
import type { SelfCustodyItem } from "./self-custody-steps";

/** The URL parameters that carry a scanned code. */
export const SCAN_PARAM = "scan";
export const SCAN_TYPE_PARAM = "scanType";

/** How the scanner classified a code; mirrors `ScannedCodeType` on the server. */
export type ScanCodeType = "qr" | "barcode" | "samId";

/** What the loader resolved a scanned code to. */
export type ScannedResult = {
  code: string;
  codeType: ScanCodeType;
  /** Null when no item or kit of the workspace carries the code. */
  state:
    | { kind: "available"; item: ScannedItem }
    | { kind: "in-custody"; item: ScannedItem; holderName: string }
    | { kind: "unsupported"; item: ScannedItem | null; reason: string }
    | null;
  /** Whether the volunteer on this phone is the one holding it. */
  heldByYou: boolean;
};

/** The scanned item or kit, as the card shows it. */
type ScannedItem = SelfCustodyItem & { kind: "asset" | "kit" };

/**
 * Builds the URL query for a scanned code, keeping the volunteer, tab and
 * filters. The page number is dropped so the list does not jump.
 *
 * @param current - The page's query now
 * @param detection - The scanner's reading
 * @returns The query to navigate to
 */
export function scanSearchParams(
  current: URLSearchParams,
  detection: { value: string; type: ScanCodeType }
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete("page");
  next.set(SCAN_PARAM, detection.value);
  next.set(SCAN_TYPE_PARAM, detection.type);
  return next;
}

/**
 * What the scanned code is, with the one action it allows: take it, return
 * it, or the reason a staff member is needed.
 *
 * @param props.scanned - The loader's reading of the code
 * @param props.memberId - The volunteer acting
 * @param props.error - Message from a failed take or return
 */
export function ScannedItemPanel({
  scanned,
  memberId,
  error,
}: {
  scanned: ScannedResult;
  memberId: string;
  error: string | null;
}) {
  const closed = new URLSearchParams(useLocation().search);
  closed.delete(SCAN_PARAM);
  closed.delete(SCAN_TYPE_PARAM);
  const { state } = scanned;

  return (
    <section
      aria-label="Scanned code"
      className="mb-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-left"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
          Scanned
        </h2>
        <Link
          to={`?${closed.toString()}`}
          className="text-sm text-gray-600 underline hover:text-gray-500"
        >
          Close
        </Link>
      </div>

      {!state ? (
        <p className="text-gray-700">
          This code is not linked to any item or kit in this workspace.
        </p>
      ) : (
        <>
          {state.item ? <ItemCard item={state.item} /> : null}
          <FormError error={error} />
          {state.kind === "available" ? (
            <ScanActionForm
              intent="scan-take"
              scanned={scanned}
              memberId={memberId}
              label={
                state.item.kind === "kit" ? "Take this kit" : "Take this item"
              }
            />
          ) : state.kind === "in-custody" ? (
            scanned.heldByYou ? (
              <ScanActionForm
                intent="scan-return"
                scanned={scanned}
                memberId={memberId}
                label={
                  state.item.kind === "kit"
                    ? "Return this kit"
                    : "Return this item"
                }
              />
            ) : (
              <p className="text-gray-700">
                Held by <strong>{state.holderName}</strong>. Only they can
                return it here.
              </p>
            )
          ) : (
            <StaffOnlyNotice reason={state.reason} />
          )}
        </>
      )}
    </section>
  );
}

/** The take or return form, posting the scanned code rather than an id. */
function ScanActionForm({
  intent,
  scanned,
  memberId,
  label,
}: {
  intent: "scan-take" | "scan-return";
  scanned: ScannedResult;
  memberId: string;
  label: string;
}) {
  const disabled = useDisabled();
  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="code" value={scanned.code} />
      <input type="hidden" name="codeType" value={scanned.codeType} />
      <input type="hidden" name="teamMemberId" value={memberId} />
      <Button type="submit" disabled={disabled} className="w-full max-w-full">
        {disabled ? "Saving..." : label}
      </Button>
    </Form>
  );
}
