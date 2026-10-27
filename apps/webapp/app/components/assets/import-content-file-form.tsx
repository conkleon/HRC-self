/**
 * @file Single-step CSV import form for the admin dashboard.
 * Provides FileForm: file selection, "I AGREE" confirmation and the
 * import result, posted to a route action in one request.
 *
 * @see {@link file://./import-content/index.tsx} The workspace import page body
 * @see {@link file://./../../routes/_layout+/admin-dashboard+/org.$organizationId.tsx}
 */
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import { useDisabled } from "~/hooks/use-disabled";
import useFetcherWithReset from "~/hooks/use-fetcher-with-reset";
import type { action } from "~/routes/_layout+/assets.import";
import Input from "../forms/input";
import { ImportErrorDetails } from "./import-preview/import-error-details";
import { Button } from "../shared/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../shared/modal";
import When from "../when/when";

/**
 * File upload form with confirmation dialog for CSV asset import.
 * Handles file selection, "I AGREE" confirmation, and displays
 * import errors or success state.
 *
 * @param intent - The form intent value sent to the action
 */
export const FileForm = ({ intent }: { intent: string }) => {
  const { t } = useTranslation();
  // Widened to `string` so toUpperCase() doesn't need a cast.
  // The "I AGREE" check happens at submit time.
  const [agreed, setAgreed] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const fetcher = useFetcherWithReset<typeof action>();

  const { data } = fetcher;
  const isSubmitting = useDisabled(fetcher);
  const disabled = isSubmitting || agreed !== "I AGREE";
  const isSuccessful = data && !data.error;

  // Focus the "I AGREE" confirmation input when the dialog opens (replaces
  // `autoFocus`). Re-focuses each time the dialog re-opens; skipped while
  // the success state is showing.
  const agreeInputRef = useAutoFocus<HTMLInputElement>({
    when: isDialogOpen && !isSuccessful,
  });

  /** We use a controlled field for the file, because of the confirmation dialog we have.
   * That way we can disabled the confirmation dialog button until a file is selected
   */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event?.target?.files?.[0];
    if (selectedFile) {
      setSelectedFile(selectedFile);
    }
  };

  return (
    <fetcher.Form
      className="mt-4 w-full"
      method="post"
      ref={formRef}
      encType="multipart/form-data"
    >
      <Input
        type="file"
        name="file"
        label={t("assets.importContentFileForm.selectACsvFile")}
        required
        onChange={handleFileSelect}
        accept=".csv"
      />
      <input type="hidden" name="intent" value={intent} />

      <AlertDialog
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            // Reset form state when dialog is closed
            setAgreed("");
            fetcher.reset();
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            title={t("assets.importContentFileForm.confirmAssetImport")}
            disabled={!selectedFile}
            className="my-4"
          >
            {t("assets.importContentFileForm.confirmAssetImport")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-[600px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("assets.importContentFileForm.confirmAssetImport")}
            </AlertDialogTitle>
            {!isSuccessful ? (
              <>
                <AlertDialogDescription>
                  <Trans
                    t={t}
                    i18nKey="assets.importContentFileForm.youNeedToType0"
                    components={[<b key="slot0" />]}
                  />
                </AlertDialogDescription>
                <Input
                  type="text"
                  label={t("assets.importContentFileForm.confirmation")}
                  ref={agreeInputRef}
                  name="agree"
                  value={agreed}
                  onChange={(e) => setAgreed(e.target.value.toUpperCase())}
                  placeholder={t("assets.importContentFileForm.iAgree2")}
                  pattern="^I AGREE$" // We use a regex to make sure the user types the exact string
                  required
                  onKeyDown={(e) => {
                    if (e.key == "Enter") {
                      e.preventDefault();
                      // Because we use a Dialog the submit buttons is outside of the form so we submit using the fetcher directly
                      if (!disabled) {
                        void fetcher.submit(formRef.current);
                      }
                    }
                  }}
                />
              </>
            ) : null}
          </AlertDialogHeader>

          {data?.error ? <ImportErrorDetails error={data.error} /> : null}

          <When truthy={isSuccessful}>
            <div>
              <b className="text-green-500">
                {t("assets.importContentFileForm.success")}
              </b>
              <p>
                {t("assets.importContentFileForm.yourAssetsHaveBeenImported")}
              </p>
            </div>
          </When>

          <AlertDialogFooter>
            {isSuccessful ? (
              <div className="flex gap-2">
                <AlertDialogCancel asChild>
                  <Button type="button" variant="secondary" width="full">
                    {t("assets.importContentFileForm.close")}
                  </Button>
                </AlertDialogCancel>
                <Button to="/assets" width="full" className="whitespace-nowrap">
                  {t("assets.importContentFileForm.viewNewAssets")}
                </Button>
              </div>
            ) : (
              <>
                <AlertDialogCancel asChild>
                  <Button type="button" variant="secondary">
                    {t("assets.importContentFileForm.cancel")}
                  </Button>
                </AlertDialogCancel>
                <Button
                  type="submit"
                  onClick={() => {
                    // Because we use a Dialog the submit buttons is outside of the form so we submit using the fetcher directly
                    void fetcher.submit(formRef.current);
                  }}
                  disabled={disabled}
                >
                  {isSubmitting
                    ? "Importing..."
                    : t("assets.importContentFileForm.import")}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fetcher.Form>
  );
};
