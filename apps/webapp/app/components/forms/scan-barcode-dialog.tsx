/**
 * Scan Barcode Dialog
 *
 * Opens the camera from the asset and kit forms so a barcode can be scanned
 * into the form instead of typed. It saves nothing: an accepted scan is handed
 * back to `BarcodesInput`, which places it in a row that is submitted with the
 * rest of the form.
 *
 * The scanner is mounted only while the dialog is open, so the camera stops
 * the moment it closes.
 *
 * @see {@link file://./barcodes-input.tsx}
 * @see {@link file://./scanned-barcode.ts} the accept and reject rules
 * @see {@link file://../code-preview/scan-barcode-tab.tsx} the same scanner for saved items
 */
import { useState } from "react";
import { BarcodeDisplay } from "~/components/barcode/barcode-display";
import { Dialog, DialogPortal } from "~/components/layout/dialog";
import { CodeScanner } from "~/components/scanner/code-scanner";
import type { OnCodeDetectionSuccessProps } from "~/components/scanner/code-scanner";
import { Button } from "~/components/shared/button";
import { useScannerCameraId } from "~/hooks/use-scanner-camera-id";
import { BARCODE_TYPE_OPTIONS } from "~/modules/barcode/constants";
import { resolveScannedBarcode } from "./scanned-barcode";
import type { BarcodeRow, ScannedBarcodeResult } from "./scanned-barcode";

/** Props for {@link ScanBarcodeDialog}. */
type ScanBarcodeDialogProps = {
  /** Whether the dialog, and with it the camera, is open. */
  open: boolean;
  /** Closes the dialog without adding anything. */
  onClose: () => void;
  /** Rows already on the form, so a duplicate scan is refused here. */
  existingBarcodes: BarcodeRow[];
  /** Receives the accepted barcode; the dialog closes right after. */
  onUse: (barcode: BarcodeRow) => void;
};

/**
 * Camera dialog that scans one barcode for the asset or kit form.
 *
 * @param props - See {@link ScanBarcodeDialogProps}
 */
export function ScanBarcodeDialog({
  open,
  onClose,
  existingBarcodes,
  onUse,
}: ScanBarcodeDialogProps) {
  return (
    <DialogPortal>
      <Dialog
        open={open}
        onClose={onClose}
        title={<h3>Scan barcode</h3>}
        className="sm:max-w-xl"
      >
        {open ? (
          <ScanBarcodeBody
            existingBarcodes={existingBarcodes}
            onCancel={onClose}
            onUse={(barcode) => {
              onUse(barcode);
              onClose();
            }}
          />
        ) : null}
      </Dialog>
    </DialogPortal>
  );
}

/**
 * The scanner and its result overlay. Mounted fresh on every opening, so no
 * scan from an earlier opening can be offered again.
 */
function ScanBarcodeBody({
  existingBarcodes,
  onCancel,
  onUse,
}: {
  existingBarcodes: BarcodeRow[];
  onCancel: () => void;
  onUse: (barcode: BarcodeRow) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<ScannedBarcodeResult | null>(null);
  const savedCameraId = useScannerCameraId();

  function handleDetection(detection: OnCodeDetectionSuccessProps) {
    // The camera can report the same code on a few frames before the pause
    // lands; the first result stands until the user scans again.
    setResult(
      (current) => current ?? resolveScannedBarcode(detection, existingBarcodes)
    );
    setPaused(true);
  }

  function handleSetPaused(next: boolean) {
    setPaused(next);
    // Resuming means "scan again": forget the result being shown.
    if (!next) setResult(null);
  }

  const accepted = result?.status === "accepted" ? result.barcode : null;
  const rejected = result?.status === "rejected" ? result : null;

  return (
    <div className="px-6 pb-4">
      <CodeScanner
        onCodeDetectionSuccess={handleDetection}
        paused={paused}
        setPaused={handleSetPaused}
        allowNonShelfCodes={false}
        hideBackButtonText
        forceMode="camera"
        overlayPosition="centered"
        savedCameraId={savedCameraId}
        // Bounded so the dialog fits a short window; the video crops to fit.
        className="!h-[min(400px,50vh)] min-h-[200px]"
        errorTitle={rejected?.title}
        errorMessage={rejected?.message}
        scanMessage={
          accepted ? (
            <DetectedBarcode
              barcode={accepted}
              onScanAgain={() => handleSetPaused(false)}
              onUse={() => onUse(accepted)}
            />
          ) : undefined
        }
      />
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Preview of an accepted scan with the choice to use it or scan again. */
function DetectedBarcode({
  barcode,
  onScanAgain,
  onUse,
}: {
  barcode: BarcodeRow;
  onScanAgain: () => void;
  onUse: () => void;
}) {
  const typeLabel =
    BARCODE_TYPE_OPTIONS.find((option) => option.value === barcode.type)
      ?.label ?? barcode.type;

  return (
    <div className="w-full space-y-3 text-left">
      <div className="rounded-lg border bg-gray-50 p-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            {typeLabel}
          </span>
          <span className="truncate font-mono text-sm text-gray-700">
            {barcode.value}
          </span>
        </div>
        <div className="mt-2 flex justify-center">
          <BarcodeDisplay
            type={barcode.type}
            value={barcode.value}
            maxWidth="150px"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onScanAgain}>
          Scan again
        </Button>
        <Button type="button" onClick={onUse}>
          Use barcode
        </Button>
      </div>
    </div>
  );
}
