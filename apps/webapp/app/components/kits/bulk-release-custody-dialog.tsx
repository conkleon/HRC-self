import { useTranslation } from "react-i18next";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { Button } from "../shared/button";

export const BulkReleaseKitCustodySchema = z.object({
  kitIds: z.array(z.string()).min(1),
});

export default function BulkReleaseCustodyDialog() {
  const { t } = useTranslation();
  const zo = useZorm("BulkReleaseKitCustody", BulkReleaseKitCustodySchema);

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="release-custody"
      title={t("kits.bulkReleaseCustodyDialog.releaseCustodyOverKits")}
      description={t("kits.bulkReleaseCustodyDialog.areYouSureYouWant")}
      actionUrl="/api/kits/bulk-actions"
      arrayFieldId="kitIds"
    >
      {({ fetcherError, disabled, handleCloseDialog }) => (
        <div className="modal-content-wrapper">
          <input type="hidden" value="bulk-release-custody" name="intent" />

          {fetcherError ? (
            <p className="text-sm text-error-500">{fetcherError}</p>
          ) : null}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              width="full"
              disabled={disabled}
              onClick={handleCloseDialog}
            >
              {t("kits.bulkReleaseCustodyDialog.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
            >
              {t("kits.bulkReleaseCustodyDialog.confirm")}
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
