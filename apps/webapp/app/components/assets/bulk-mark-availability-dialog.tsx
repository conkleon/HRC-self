import { useTranslation } from "react-i18next";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { Button } from "../shared/button";

export const BulkMarkAvailabilitySchema = z.object({
  assetIds: z.string().array().min(1),
  type: z.enum(["available", "unavailable"]),
});

export default function BulkMarkAvailabilityDialog({
  type,
}: {
  type: z.infer<typeof BulkMarkAvailabilitySchema>["type"];
}) {
  const { t } = useTranslation();
  const zo = useZorm("BulkMarkAvailability", BulkMarkAvailabilitySchema);

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type={type}
      title={t("assets.bulkMarkAvailabilityDialog.markAssetsAs", { type })}
      description={t(
        "assets.bulkMarkAvailabilityDialog.markAllSelectedAssetsAs",
        { type, type2: type }
      )}
      actionUrl="/api/assets/bulk-mark-availability"
      arrayFieldId="assetIds"
    >
      {({ fetcherError, disabled, handleCloseDialog }) => (
        <div className="modal-content-wrapper">
          <input type="hidden" name="type" value={type} />

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
              {t("assets.bulkMarkAvailabilityDialog.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
            >
              {t("assets.bulkMarkAvailabilityDialog.confirm")}
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
