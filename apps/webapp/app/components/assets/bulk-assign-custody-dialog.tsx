import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { toCustodyAssignmentItem } from "~/components/team-member/custody-assignment-item";
import { InlineTeamMemberCreation } from "~/components/team-member/inline-team-member-creation";
import { useRoleAccess } from "~/hooks/use-role-access";
import { isQuantityTracked } from "~/modules/asset/utils";
import { createCustodianSchema } from "~/modules/custody/schema";
import { type loader } from "~/routes/_layout+/assets._index";
import {
  AssetQuantitiesSchema,
  AssetSourceLocationsSchema,
} from "~/utils/asset-quantities-schema";
import { tw } from "~/utils/tw";
import { resolveTeamMemberName } from "~/utils/user";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import DynamicSelect from "../dynamic-select/dynamic-select";
import { Button } from "../shared/button";
import { WarningBox } from "../shared/warning-box";

export const BulkAssignCustodySchema = z.object({
  assetIds: z.array(z.string()).min(1),
  custodian: createCustodianSchema(),
  /**
   * Units per quantity-tracked asset, sent only by the scanner, which shows a
   * quantity input on each scanned row. This dialog selects rows on the assets
   * index, where there is nowhere to say how many units each hand-over covers,
   * so it sends nothing and those assets keep being skipped.
   */
  quantities: AssetQuantitiesSchema,
  /**
   * Where each quantity-tracked asset's units come from, sent only by the
   * scanner, and only for pools placed at two or more locations. Keyed by
   * asset id: a location id or `"unplaced"`.
   */
  sourceLocations: AssetSourceLocationsSchema,
});

export default function BulkAssignCustodyDialog() {
  const { t } = useTranslation();
  const zo = useZorm("BulkAssignCustody", BulkAssignCustodySchema);

  const assignsSelfOnly = useRoleAccess().custody.assign === "self";
  const { currentUserTeamMember } = useLoaderData<typeof loader>();

  const selectedItems = useAtomValue(selectedBulkItemsAtom);
  const quantityTrackedCount = selectedItems.filter((item) =>
    isQuantityTracked(item)
  ).length;

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="assign-custody"
      title={`${assignsSelfOnly ? "Take" : "Assign"} custody of assets`}
      description={`These assets are currently available. You're about to assign custody to ${
        assignsSelfOnly ? "yourself" : "one of your team members"
      }.`}
      actionUrl="/api/assets/bulk-assign-custody"
      arrayFieldId="assetIds"
    >
      {({ disabled, handleCloseDialog, fetcherError }) => (
        <div className="modal-content-wrapper">
          {quantityTrackedCount > 0 ? (
            <div className="mb-4">
              <WarningBox>
                <span>
                  {t("assets.bulkAssignCustodyDialog.quantityTrackedAssetSIn", {
                    quantityTrackedCount,
                  })}
                </span>
              </WarningBox>
            </div>
          ) : null}
          <div className="relative z-50 mb-8">
            {assignsSelfOnly && currentUserTeamMember ? (
              <input
                type="hidden"
                name="custodian"
                value={JSON.stringify({
                  id: currentUserTeamMember.id,
                  name: resolveTeamMemberName(currentUserTeamMember),
                })}
              />
            ) : (
              <DynamicSelect
                disabled={disabled}
                model={{
                  name: "teamMember",
                  queryKey: "name",
                  deletedAt: null,
                  // ASSET custody: SELF_SERVICE may only take custody itself
                  // and BASE never.
                  custodyPurpose: "custody-assignment",
                }}
                fieldName="custodian"
                contentLabel={t("assets.bulkAssignCustodyDialog.teamMembers")}
                initialDataKey="teamMembers"
                countKey="totalTeamMembers"
                placeholder={t(
                  "assets.bulkAssignCustodyDialog.selectATeamMember"
                )}
                allowClear
                closeOnSelect
                transformItem={toCustodyAssignmentItem}
                extraContent={({ onItemCreated, closePopover }) => (
                  <InlineTeamMemberCreation
                    onItemCreated={onItemCreated}
                    closePopover={closePopover}
                    transformItem={toCustodyAssignmentItem}
                  />
                )}
                renderItem={(item) => resolveTeamMemberName(item, true)}
              />
            )}
            {zo.errors.custodian()?.message ? (
              <p className="text-sm text-error-500">
                {zo.errors.custodian()?.message}
              </p>
            ) : null}
            {fetcherError ? (
              <p className="text-sm text-error-500">{fetcherError}</p>
            ) : null}
          </div>

          <div className={tw("flex gap-3", assignsSelfOnly && "-mt-8")}>
            <Button
              type="button"
              variant="secondary"
              width="full"
              disabled={disabled}
              onClick={handleCloseDialog}
            >
              {t("assets.bulkAssignCustodyDialog.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
            >
              {t("assets.bulkAssignCustodyDialog.confirm")}
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
