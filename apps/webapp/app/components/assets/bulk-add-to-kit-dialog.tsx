import type { Kit } from "@prisma/client";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useZorm } from "react-zorm";
import z from "zod";
import { bulkDialogAtom } from "~/atoms/bulk-update-dialog";
import {
  selectedBulkItemsAtom,
  selectedBulkItemsCountAtom,
} from "~/atoms/list";
import useApiQuery from "~/hooks/use-api-query";
import { isQuantityTracked } from "~/modules/asset/utils";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import KitSelector from "../kits/kit-selector";
import { Button } from "../shared/button";
import { WarningBox } from "../shared/warning-box";

export const BulkAddToKitSchema = z.object({
  assetIds: z.string().array().min(1),
  kit: z.string().min(1),
});

export default function BulkAddToKitDialog() {
  const { t } = useTranslation();
  const zo = useZorm("BulkAddToKit", BulkAddToKitSchema);

  const selectedAssets = useAtomValue(selectedBulkItemsCountAtom);
  const selectedItems = useAtomValue(selectedBulkItemsAtom);
  // why: bulk add-to-kit can't carry a per-asset quantity input, so qty-tracked
  // assets in the selection are silently skipped server-side (mirrors the
  // bulk-update-location pattern — see `bulkUpdateAssetLocation`). Surfacing
  // the count here lets the user know up-front how many rows will be skipped.
  const quantityTrackedCount = selectedItems.filter((item) =>
    isQuantityTracked(item)
  ).length;
  const bulkDialogOpenState = useAtomValue(bulkDialogAtom);

  const isOpen = bulkDialogOpenState["add-to-kit"] === true;

  const { data, isLoading, error } = useApiQuery<{
    kits: Array<Pick<Kit, "id" | "name">>;
  }>({
    api: "/api/assets/bulk-add-to-kit",
    enabled: isOpen,
  });

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="add-to-kit"
      title={t("assets.bulkAddToKitDialog.addAssetsToAKit")}
      description={t("assets.bulkAddToKitDialog.description", {
        count: selectedAssets,
      })}
      actionUrl="/api/assets/bulk-add-to-kit"
      arrayFieldId="assetIds"
    >
      {({ fetcherError, disabled, handleCloseDialog }) => (
        <div className="modal-content-wrapper">
          {quantityTrackedCount > 0 ? (
            <div className="mb-4">
              <WarningBox>
                <span>
                  {t("assets.bulkAddToKitDialog.quantityTrackedAssetSIn", {
                    quantityTrackedCount,
                  })}
                </span>
              </WarningBox>
            </div>
          ) : null}
          <div className="relative z-50 mb-8">
            <KitSelector
              name={zo.fields.kit()}
              kits={data?.kits || []}
              placeholder={
                isLoading
                  ? "Loading..."
                  : t("assets.bulkAddToKitDialog.selectAKit")
              }
              isLoading={isLoading}
              error={zo.errors.kit()?.message || error || fetcherError}
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              width="full"
              disabled={disabled}
              onClick={handleCloseDialog}
            >
              {t("assets.bulkAddToKitDialog.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
            >
              {t("assets.bulkAddToKitDialog.confirm")}
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
