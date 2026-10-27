/**
 * Self-Service Scan
 *
 * The "Scan a code" button on the public self-service page. A volunteer who
 * already said who they are scans an item's or a kit's QR code or barcode with
 * the phone camera. The scanner only reads the code: an accepted scan puts it
 * in the URL (`?scan=&scanType=`) and the page shows what it is through
 * `ScannedItemPanel`.
 *
 * @see {@link file://./scanned-item.tsx}
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 * @see {@link file://./../scanner/code-scanner.tsx}
 */
import { useState } from "react";
import { ScanQrCode } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";

import { Dialog, DialogPortal } from "~/components/layout/dialog";
import { CodeScanner } from "~/components/scanner/code-scanner";
import type { OnCodeDetectionSuccessProps } from "~/components/scanner/code-scanner";
import { Button } from "~/components/shared/button";
import { scanSearchParams } from "./scanned-item";

/**
 * "Scan a code": opens the camera, and on an accepted scan shows what it is.
 * The camera runs only while the dialog is open.
 */
export function ScanCodeButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 w-full max-w-full"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <ScanQrCode className="size-5" aria-hidden="true" />
          {t("custody.scanCode.scanACode")}
        </span>
      </Button>
      <DialogPortal>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={<h3>{t("custody.scanCode.scanAnItemOrKit")}</h3>}
          className="sm:max-w-xl"
        >
          {open ? <ScanBody onDone={() => setOpen(false)} /> : null}
        </Dialog>
      </DialogPortal>
    </>
  );
}

/**
 * The camera and its error overlay. Mounted fresh on every opening, so a
 * refusal from an earlier opening is never shown again.
 */
function ScanBody({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The page is public: the app's search-params hook reads the signed-in
  // layout, so the query is read and set through the location directly.
  const { search } = useLocation();
  const navigate = useNavigate();

  function handleDetection({
    value,
    type,
    error: detectionError,
  }: OnCodeDetectionSuccessProps) {
    setPaused(true);
    if (detectionError || !type) {
      setError(detectionError ?? "This is not a code Shelf can read.");
      return;
    }
    void navigate(
      `?${scanSearchParams(new URLSearchParams(search), { value, type })}`
    );
    onDone();
  }

  function handleSetPaused(next: boolean) {
    setPaused(next);
    // Resuming means "scan again": forget the refusal being shown.
    if (!next) setError(null);
  }

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
        // Bounded so the dialog fits a phone screen; the video crops to fit.
        className="!h-[min(400px,50vh)] min-h-[200px]"
        errorTitle={error ? "Can't use this code" : undefined}
        errorMessage={error ?? undefined}
      />
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("custody.scanCode.cancel")}
        </Button>
      </div>
    </div>
  );
}
