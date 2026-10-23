/**
 * Scanned Barcode Resolution
 *
 * Turns one camera detection into either a barcode the asset or kit form can
 * use, or a reason it cannot, and places an accepted barcode into the form's
 * list of barcode rows. Kept free of React so the decisions are unit-testable;
 * `ScanBarcodeDialog` and `BarcodesInput` are the only consumers.
 *
 * @see {@link file://./scan-barcode-dialog.tsx}
 * @see {@link file://./barcodes-input.tsx}
 */
import type { BarcodeType } from "@prisma/client";
import type { OnCodeDetectionSuccessProps } from "~/components/scanner/code-scanner";
import { normalizeBarcodeValue } from "~/modules/barcode/validation";
import { isQrId } from "~/utils/id";

/** The two fields a barcode row on the form carries. */
export type BarcodeRow = {
  type: BarcodeType;
  value: string;
};

/** Outcome of one scan: a barcode to add, or why it cannot be added. */
export type ScannedBarcodeResult =
  | { status: "accepted"; barcode: BarcodeRow }
  | { status: "rejected"; title: string; message: string };

/**
 * Decides whether a camera detection can be added to the form's barcodes.
 *
 * A Shelf QR code is refused because it already identifies an item and is
 * linked through the QR code, never as a barcode. Duplicates are compared the
 * way `BarcodesInput` validates them: normalized per row type, across types.
 *
 * @param detection - What the scanner reported for the code it saw
 * @param existingBarcodes - Rows already on the form, filled or not
 * @returns The barcode to add, or a title and message explaining the refusal
 */
export function resolveScannedBarcode(
  detection: OnCodeDetectionSuccessProps,
  existingBarcodes: BarcodeRow[]
): ScannedBarcodeResult {
  if (detection.error) {
    return {
      status: "rejected",
      title: "Unsupported code",
      message: detection.error,
    };
  }

  if (detection.type === "qr" && isQrId(detection.value)) {
    return {
      status: "rejected",
      title: "This is a Shelf QR code",
      message:
        "Shelf QR codes are linked to items through the QR code, not as barcodes. Scan the item's own barcode instead.",
    };
  }

  if (detection.type !== "barcode" || !detection.barcodeType) {
    return {
      status: "rejected",
      title: "Not a barcode",
      message:
        "We could not read a supported barcode from this code. Try again, or type the value in by hand.",
    };
  }

  const barcode: BarcodeRow = {
    type: detection.barcodeType,
    value: normalizeBarcodeValue(detection.barcodeType, detection.value),
  };

  const isDuplicate = existingBarcodes.some(
    (row) =>
      row.value.trim() !== "" &&
      normalizeBarcodeValue(row.type, row.value) === barcode.value
  );
  if (isDuplicate) {
    return {
      status: "rejected",
      title: "Already added",
      message: `The barcode ${barcode.value} is already in this list.`,
    };
  }

  return { status: "accepted", barcode };
}

/**
 * Places an accepted barcode into the form's rows.
 *
 * Fills the last row when its value is still empty, which is the row a user
 * gets from "Add barcode" before reaching for the scanner; otherwise appends a
 * new row. Never mutates `rows`.
 *
 * @param rows - The form's current barcode rows
 * @param barcode - The accepted barcode
 * @param createRow - Builds a new row (e.g. with a fresh client key)
 * @returns The updated rows and the index the barcode landed at
 */
export function placeScannedBarcode<T extends BarcodeRow>(
  rows: T[],
  barcode: BarcodeRow,
  createRow: (barcode: BarcodeRow) => T
): { rows: T[]; index: number } {
  const lastIndex = rows.length - 1;
  const last = rows[lastIndex];

  if (last && last.value.trim() === "") {
    const filled = { ...last, type: barcode.type, value: barcode.value };
    return {
      rows: [...rows.slice(0, lastIndex), filled],
      index: lastIndex,
    };
  }

  return { rows: [...rows, createRow(barcode)], index: rows.length };
}
