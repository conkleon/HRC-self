/**
 * Which camera scans the asset and kit forms accept as a barcode, and where an
 * accepted one lands in the form's rows.
 *
 * @see {@link file://./scanned-barcode.ts}
 */
import { BarcodeType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { placeScannedBarcode, resolveScannedBarcode } from "./scanned-barcode";
import type { BarcodeRow } from "./scanned-barcode";

/** A valid EAN-13 (correct check digit). */
const EAN13 = "4006381333931";

/** A Shelf QR id: a 25-character cuid. */
const SHELF_QR_ID = "clx1abcdefghijklmnopqrstu";

describe("resolveScannedBarcode", () => {
  it("accepts a supported barcode with the type the camera detected", () => {
    expect(
      resolveScannedBarcode(
        { value: EAN13, type: "barcode", barcodeType: BarcodeType.EAN13 },
        []
      )
    ).toEqual({
      status: "accepted",
      barcode: { type: BarcodeType.EAN13, value: EAN13 },
    });
  });

  it("normalizes the value the way the form stores it", () => {
    const result = resolveScannedBarcode(
      { value: "abc-123", type: "barcode", barcodeType: BarcodeType.Code128 },
      []
    );

    expect(result).toEqual({
      status: "accepted",
      barcode: { type: BarcodeType.Code128, value: "ABC-123" },
    });
  });

  it("refuses a Shelf QR code", () => {
    const result = resolveScannedBarcode(
      { value: SHELF_QR_ID, type: "qr" },
      []
    );

    expect(result).toMatchObject({
      status: "rejected",
      title: "This is a Shelf QR code",
    });
  });

  it("refuses a code the scanner could not read as a barcode", () => {
    const result = resolveScannedBarcode({ value: "!!", type: "qr" }, []);

    expect(result).toMatchObject({
      status: "rejected",
      title: "Not a barcode",
    });
  });

  it("passes the scanner's own error through", () => {
    const result = resolveScannedBarcode(
      {
        value: "x",
        type: "barcode",
        error: "We detected a PDF417 barcode, but Shelf does not support it.",
      },
      []
    );

    expect(result).toEqual({
      status: "rejected",
      title: "Unsupported code",
      message: "We detected a PDF417 barcode, but Shelf does not support it.",
    });
  });

  it("refuses a barcode already on the form, whatever case it was typed in", () => {
    const existing: BarcodeRow[] = [
      { type: BarcodeType.Code128, value: "abc-123" },
    ];

    const result = resolveScannedBarcode(
      { value: "ABC-123", type: "barcode", barcodeType: BarcodeType.Code128 },
      existing
    );

    expect(result).toMatchObject({
      status: "rejected",
      title: "Already added",
    });
  });

  it("ignores empty rows when checking for duplicates", () => {
    const result = resolveScannedBarcode(
      { value: EAN13, type: "barcode", barcodeType: BarcodeType.EAN13 },
      [{ type: BarcodeType.Code128, value: "  " }]
    );

    expect(result.status).toBe("accepted");
  });
});

describe("placeScannedBarcode", () => {
  type Row = BarcodeRow & { key: string };
  const scanned: BarcodeRow = { type: BarcodeType.EAN13, value: EAN13 };
  const createRow = (barcode: BarcodeRow): Row => ({ ...barcode, key: "new" });

  it("adds the first row when the list is empty", () => {
    expect(placeScannedBarcode<Row>([], scanned, createRow)).toEqual({
      rows: [{ ...scanned, key: "new" }],
      index: 0,
    });
  });

  it("fills the last row when its value is still empty, keeping its key", () => {
    const rows: Row[] = [
      { type: BarcodeType.Code39, value: "ABCD", key: "a" },
      { type: BarcodeType.Code128, value: "", key: "b" },
    ];

    const placed = placeScannedBarcode(rows, scanned, createRow);

    expect(placed.index).toBe(1);
    expect(placed.rows[1]).toEqual({ ...scanned, key: "b" });
    expect(rows[1].value).toBe("");
  });

  it("appends a row when the last one already has a value", () => {
    const rows: Row[] = [{ type: BarcodeType.Code39, value: "ABCD", key: "a" }];

    const placed = placeScannedBarcode(rows, scanned, createRow);

    expect(placed.index).toBe(1);
    expect(placed.rows).toEqual([rows[0], { ...scanned, key: "new" }]);
  });
});
