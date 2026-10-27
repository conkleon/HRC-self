import { useTranslation } from "react-i18next";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { LocationSelect } from "../location/location-select";
import { Button } from "../shared/button";

export const KitBulkLocationUpdateSchema = z.object({
  kitIds: z.array(z.string()).min(1),
  newLocationId: z.string({ required_error: "Please select a location" }),
});

export default function KitBulkLocationUpdateDialog() {
  const { t } = useTranslation();
  const zo = useZorm("KitBulkLocationUpdate", KitBulkLocationUpdateSchema);

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="location"
      arrayFieldId="kitIds"
      actionUrl="/api/kits/bulk-actions"
    >
      {({ disabled, handleCloseDialog, fetcherError }) => (
        <div>
          <input type="hidden" name="intent" value="bulk-update-location" />

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

          <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              <strong>
                {t("kits.bulkLocationUpdateDialog.locationUpdateNotice")}
              </strong>{" "}
              {t("kits.bulkLocationUpdateDialog.changingKitLocationsWillAlso")}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              width="full"
              disabled={disabled}
              onClick={handleCloseDialog}
            >
              {t("kits.bulkLocationUpdateDialog.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
            >
              {t("kits.bulkLocationUpdateDialog.confirm")}
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
