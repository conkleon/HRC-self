import { useTranslation } from "react-i18next";
import { useZorm } from "react-zorm";
import z from "zod";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { Button } from "../shared/button";

export const BulkRemoveFromKitsSchema = z.object({
  assetIds: z.string().array().min(1),
});

/**
 * why: no reserved-booking warning here, unlike the two kit-scoped removal
 * surfaces (`kits.$kitId.assets.manage-assets` and the kit row's Remove
 * dialog). This selection spans arbitrary kits — the operator never sees which
 * kits are involved, so "removes them from N reserved bookings" has no kit to
 * anchor it to; `BulkUpdateDialogContent` has no pre-submit data-loading hook
 * to fetch the impact with; and the query would be the broadest of the three
 * (every selected asset's memberships, plus the select-all path). Deferred.
 */
export default function BulkRemoveFromKits() {
  const { t } = useTranslation();
  const zo = useZorm("BulkRemoveFromKits", BulkRemoveFromKitsSchema);

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="remove-from-kit"
      title={t("assets.bulkRemoveFromKits.removeAssetsFromKits")}
      description={t("assets.bulkRemoveFromKits.thisActionWillRemoveThe")}
      actionUrl="/api/assets/bulk-remove-from-kits"
      arrayFieldId="assetIds"
    >
      {({ disabled, handleCloseDialog, fetcherError }) => (
        <div className="modal-content-wrapper">
          {fetcherError ? (
            <p className="mb-2 text-sm text-error-500">{fetcherError}</p>
          ) : null}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              width="full"
              disabled={disabled}
              onClick={handleCloseDialog}
            >
              {t("assets.bulkRemoveFromKits.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
            >
              {t("assets.bulkRemoveFromKits.confirm")}
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
