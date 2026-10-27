import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { isQuantityTracked } from "~/modules/asset/utils";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { LocationSelect } from "../location/location-select";
import { Button } from "../shared/button";
import { WarningBox } from "../shared/warning-box";

export const BulkLocationUpdateSchema = z.object({
  assetIds: z.array(z.string()).optional().default([]),
  kitIds: z.array(z.string()).optional().default([]),
  newLocationId: z.string({ required_error: "Please select a location" }),
});

export default function BulkLocationUpdateDialog() {
  const { t } = useTranslation();
  const zo = useZorm("BulkLocationUpdate", BulkLocationUpdateSchema);

  /**
   * Bulk location update has no per-asset qty input, so QUANTITY_TRACKED
   * assets are skipped server-side (`bulkUpdateAssetLocation` filters
   * them out — see `modules/asset/service.server.ts`). Surface that
   * skip up-front so the user isn't surprised by partial application.
   * Mirrors {@link file://./bulk-assign-custody-dialog.tsx} — same
   * pattern, same copy shape.
   */
  const selectedItems = useAtomValue(selectedBulkItemsAtom);
  const quantityTrackedCount = selectedItems.filter((item) =>
    isQuantityTracked(item)
  ).length;

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="location"
      arrayFieldId="assetIds"
    >
      {({ disabled, handleCloseDialog, fetcherError }) => (
        <div>
          {quantityTrackedCount > 0 ? (
            <div className="mb-4">
              <WarningBox>
                <span>
                  {t(
                    "assets.bulkLocationUpdateDialog.quantityTrackedAssetSIn",
                    { quantityTrackedCount }
                  )}
                </span>
              </WarningBox>
            </div>
          ) : null}
          <div className="relative z-50 mb-8">
            <LocationSelect isBulk hideClearButton />
            {zo.errors.newLocationId()?.message ? (
              <p className="text-sm text-error-500">
                {zo.errors.newLocationId()?.message}
              </p>
            ) : null}
            {fetcherError ? (
              <p className="text-sm text-error-500">{fetcherError}</p>
            ) : null}
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              width="full"
              disabled={disabled}
              onClick={handleCloseDialog}
            >
              {t("assets.bulkLocationUpdateDialog.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
            >
              {t("assets.bulkLocationUpdateDialog.confirm")}
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
