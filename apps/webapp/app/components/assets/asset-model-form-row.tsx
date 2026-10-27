/**
 * Asset Model FormRow
 *
 * The Asset Model selector row used by `AssetForm` (`./form.tsx`).
 * Extracted into its own component because the parent form is already
 * very large and the model selector is the kind of self-contained
 * field that benefits from a dedicated file — keeps the form's render
 * graph readable and gives reviewers a smaller diff to scan.
 *
 * Behaviour:
 * - In bulk-create mode the row is rendered as the FIRST field (Asset
 *   Model drives the inheritance defaults — category, valuation) and
 *   is required.
 * - In single-create mode the row sits in its historical position
 *   between Description and Category and stays optional.
 * - Always hidden for QUANTITY_TRACKED assets — models are an
 *   INDIVIDUAL-only concept (also enforced server-side in
 *   `createAsset` / `updateAsset`).
 *
 * The actual visibility gate (`!isQtyTracked`) is owned by the parent
 * so this component stays a pure render leaf.
 *
 * @see {@link file://./form.tsx} consumer
 */
import { useTranslation } from "react-i18next";
import DynamicSelect from "../dynamic-select/dynamic-select";
import FormRow from "../forms/form-row";
import InlineEntityCreationDialog from "../inline-entity-creation-dialog/inline-entity-creation-dialog";
import { Button } from "../shared/button";

export type AssetModelFormRowProps = {
  disabled: boolean;
  /** When `true`, the row label gets the required-`*` indicator. */
  required: boolean;
  /** Pre-selects an asset model on first render (uncontrolled after). */
  assetModelId?: string | null;
  /**
   * Fired when the user picks (or clears) a model. The parent uses
   * this to apply the model's `defaultCategoryId` to the form's
   * category param so the Category selector re-renders with the new
   * default — see `handleAssetModelChange` in `form.tsx`.
   */
  onChange: (modelId: string | undefined) => void;
  /**
   * Inline error rendered below the selector (red text). Used by the
   * bulk-create client-side guard in `form.tsx` to surface "please
   * select a model" when the user submits without picking one.
   */
  error?: string;
};

export function AssetModelFormRow({
  disabled,
  required,
  assetModelId,
  onChange,
  error,
}: AssetModelFormRowProps) {
  const { t } = useTranslation();
  return (
    <FormRow
      rowLabel={t("assets.assetModelFormRow.assetModel")}
      required={required}
      subHeading={
        <p>
          {t("assets.assetModelFormRow.assignAModelToGroup")}{" "}
          <Button
            to="/settings/asset-models/new"
            variant="link-gray"
            className="text-gray-600 underline"
            target="_blank"
          >
            {t("assets.assetModelFormRow.createAssetModels")}
          </Button>
        </p>
      }
      className="border-b-0 pb-[10px]"
    >
      <div className="w-full">
        <DynamicSelect
          disabled={disabled}
          defaultValue={assetModelId ?? undefined}
          fieldName="assetModelId"
          model={{ name: "assetModel", queryKey: "name" }}
          triggerWrapperClassName="flex flex-col !gap-0 justify-start items-start [&_.inner-label]:w-full [&_.inner-label]:text-left "
          placeholder={t("assets.assetModelFormRow.selectAssetModel")}
          contentLabel={t("assets.assetModelFormRow.assetModels")}
          label={t("assets.assetModelFormRow.assetModel")}
          hideLabel
          initialDataKey="assetModels"
          countKey="totalAssetModels"
          closeOnSelect
          selectionMode="set"
          allowClear={true}
          onChange={onChange}
          extraContent={({ onItemCreated, closePopover }) => (
            <InlineEntityCreationDialog
              title={t("assets.assetModelFormRow.createNewAssetModel")}
              type="assetModel"
              buttonLabel={t("assets.assetModelFormRow.createNewAssetModel")}
              onCreated={(created) => {
                if (created?.type !== "assetModel") return;
                const model = created.entity;
                onItemCreated({
                  id: model.id,
                  name: model.name,
                  metadata: { ...model },
                });
                closePopover();
              }}
            />
          )}
        />
        {error ? <p className="mt-1 text-sm text-error-500">{error}</p> : null}
      </div>
    </FormRow>
  );
}
