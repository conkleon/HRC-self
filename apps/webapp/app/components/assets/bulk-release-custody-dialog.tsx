import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { isQuantityTracked } from "~/modules/asset/utils";
import { AssetQuantitiesSchema } from "~/utils/asset-quantities-schema";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { Button } from "../shared/button";
import { WarningBox } from "../shared/warning-box";

export const BulkReleaseCustodySchema = z.object({
  assetIds: z.array(z.string()).min(1),
  /**
   * Units per quantity-tracked asset, sent only by the scanner, which shows a
   * quantity input on each scanned row. This dialog selects rows on the assets
   * index, where there is nowhere to say how many units come back, so it sends
   * nothing and those assets keep being skipped.
   */
  quantities: AssetQuantitiesSchema,
});

export default function BulkReleaseCustodyDialog() {
  const { t } = useTranslation();
  const zo = useZorm("BulkReleaseCustody", BulkReleaseCustodySchema);

  const selectedItems = useAtomValue(selectedBulkItemsAtom);
  const quantityTrackedCount = selectedItems.filter((item) =>
    isQuantityTracked(item)
  ).length;

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="release-custody"
      title={t("assets.bulkReleaseCustodyDialog.releaseCustodyOfAssets")}
      description={t("assets.bulkReleaseCustodyDialog.areYouSureYouWant")}
      actionUrl="/api/assets/bulk-release-custody"
      arrayFieldId="assetIds"
    >
      {({ disabled, handleCloseDialog, fetcherError }) => (
        <div className="modal-content-wrapper">
          {quantityTrackedCount > 0 ? (
            <div className="mb-4">
              <WarningBox>
                <span>
                  {t(
                    "assets.bulkReleaseCustodyDialog.quantityTrackedAssetSIn",
                    { quantityTrackedCount }
                  )}
                </span>
              </WarningBox>
            </div>
          ) : null}
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
              {t("assets.bulkReleaseCustodyDialog.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
            >
              {t("assets.bulkReleaseCustodyDialog.confirm")}
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
