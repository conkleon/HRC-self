/**
 * @file Entry point for the bulk asset update page (/assets/import-update).
 * Renders instructional UI explaining the CSV-based bulk update workflow
 * and embeds the {@link UpdateImportForm} for the upload/preview/apply flow.
 *
 * @see {@link file://./form.tsx} Upload/preview/apply orchestration
 * @see {@link file://./../../../routes/_layout+/assets.import-update.tsx} Route handler
 */
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { UpdateImportForm } from "./form";
import Icon from "../../icons/icon";
import { Button } from "../../shared/button";

/**
 * Main content component for the bulk asset update page.
 * Displays step-by-step instructions (collapsible after analysis)
 * and embeds the CSV upload form.
 */
export const ImportUpdateContent = () => {
  const { t } = useTranslation();
  const [showInstructions, setShowInstructions] = useState(true);

  return (
    <div className="w-full text-left">
      <h3>{t("assets.index.updateExistingAssets")}</h3>
      <p>{t("assets.index.editYourAssetsInExcel")}</p>

      {showInstructions ? (
        <>
          {/* Step 1: Get the CSV */}
          <div className="my-4 flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
            <Icon
              icon="download"
              size="xs"
              className="shrink-0 text-gray-500"
            />
            <div className="flex-1">
              <p className="text-[14px] text-gray-600">
                <Trans
                  t={t}
                  i18nKey="assets.index.text0Step10Go"
                  components={[
                    <b key="slot0" />,
                    <Button key="slot1" variant="link" to="/assets" />,
                    <b key="slot2" />,
                  ]}
                />
              </p>
            </div>
            <Button variant="secondary" to="/assets">
              {t("assets.index.goToAssetIndex")}
            </Button>
          </div>

          <div className="my-5 flex flex-col gap-4">
            {/* What you can update */}
            <div className="flex gap-3">
              <Icon
                icon="pen"
                size="xs"
                className="mt-0.5 shrink-0 text-gray-500"
              />
              <div>
                <h5 className="font-semibold">
                  {t("assets.index.whatYouCanUpdate")}
                </h5>
                <p className="text-[14px] text-gray-600">
                  <Trans
                    t={t}
                    i18nKey="assets.index.nameDescriptionCategoryLocationTags"
                    components={[<b key="slot0" />]}
                  />
                </p>
                <p className="mt-1 text-[14px] text-gray-600">
                  <Trans
                    t={t}
                    i18nKey="assets.index.text0AssetModel0Is"
                    components={[<b key="slot0" />, <b key="slot1" />]}
                  />
                </p>
                <p className="mt-1 text-[14px] text-gray-600">
                  <Trans
                    t={t}
                    i18nKey="assets.index.for0QuantityTracked0"
                    components={[<b key="slot0" />]}
                  />
                </p>
                <p className="mt-1 text-[14px] text-gray-600">
                  <Trans
                    t={t}
                    i18nKey="assets.index.text0HeadsUpOnQuantity"
                    components={[
                      <b key="slot0" />,
                      <b key="slot1" />,
                      <b key="slot2" />,
                      <code key="slot3" />,
                    ]}
                  />
                </p>
                <p className="mt-1 text-[14px] text-gray-600">
                  <b>{t("assets.index.notSupportedYet")}</b>{" "}
                  {t("assets.index.statusKitAndCustodyCant")}
                </p>
              </div>
            </div>

            {/* Empty cells */}
            <div className="flex gap-3">
              <Icon
                icon="check"
                size="xs"
                className="mt-0.5 shrink-0 text-gray-500"
              />
              <div>
                <h5 className="font-semibold">
                  {t("assets.index.emptyCellsClearValues")}
                </h5>
                <p className="text-[14px] text-gray-600">
                  {t("assets.index.ifAFieldCurrentlyHas")}
                </p>
                <p className="mt-1 text-[14px] text-gray-600">
                  <b>{t("assets.index.exceptions")}</b>{" "}
                  {t("assets.index.assetModelQuantityMinQuantity")}
                </p>
              </div>
            </div>

            {/* Matching */}
            <div className="flex gap-3">
              <Icon
                icon="asset"
                size="xs"
                className="mt-0.5 shrink-0 text-gray-500"
              />
              <div>
                <h5 className="font-semibold">
                  {t("assets.index.howAssetsAreMatched")}
                </h5>
                <p className="text-[14px] text-gray-600">
                  <Trans
                    t={t}
                    i18nKey="assets.index.by0AssetId0"
                    components={[<b key="slot0" />, <b key="slot1" />]}
                  />
                </p>
              </div>
            </div>

            {/* Limits */}
            <div className="flex gap-3">
              <Icon
                icon="settings"
                size="xs"
                className="mt-0.5 shrink-0 text-gray-500"
              />
              <div>
                <h5 className="font-semibold">{t("assets.index.limits")}</h5>
                <p className="text-[14px] text-gray-600">
                  <Trans
                    t={t}
                    i18nKey="assets.index.youCanUpdateUpTo"
                    components={[<b key="slot0" />]}
                  />
                </p>
              </div>
            </div>
          </div>

          <p className="text-[14px] text-gray-500">
            <Trans
              t={t}
              i18nKey="assets.index.text0Tip0JustNeed"
              components={[
                <b key="slot0" />,
                <Button key="slot1" variant="link" to="/assets" />,
                <b key="slot2" />,
              ]}
            />
          </p>

          <p className="mt-1 text-[14px] text-gray-400">
            {t("assets.index.lookingToCreateNewAssets")}{" "}
            <Button variant="link" to="/assets/import">
              {t("assets.index.useTheStandardImport")}
            </Button>
          </p>
        </>
      ) : (
        <button
          type="button"
          className="my-2 text-sm text-gray-500 underline"
          onClick={() => setShowInstructions(true)}
        >
          {t("assets.index.showInstructions")}
        </button>
      )}

      <UpdateImportForm
        onStageChange={(stage) => {
          if (stage === "preview" || stage === "results") {
            setShowInstructions(false);
          } else if (stage === "upload") {
            setShowInstructions(true);
          }
        }}
      />
    </div>
  );
};
