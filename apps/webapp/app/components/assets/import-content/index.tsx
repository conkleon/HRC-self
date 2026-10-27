/**
 * @file Content import page body.
 *
 * Renders the import instructions (CSV rules, custom fields, QR codes,
 * barcodes, quantity-tracked columns) followed by the upload, preview and
 * confirm flow. Confirming queues a background import and leaves this page for
 * its progress view.
 *
 * One import runs per workspace at a time. While one is queued or running the
 * page shows its live progress at the top and holds the upload form; both
 * clear as soon as the polled status reaches COMPLETED or FAILED.
 *
 * @see {@link file://./flow.tsx} Upload, preview and confirm stages
 * @see {@link file://./../../../routes/_layout+/assets.import.tsx} Route handler
 */
import { Trans, useTranslation } from "react-i18next";
import { formatCount } from "~/modules/asset-import/format";
import type { AssetImportStatusPayload } from "~/modules/asset-import/types";
import { getAppName } from "~/modules/branding/instance-branding";
import { helpSiteUrl } from "~/utils/help-site";
import { useBarcodePermissions } from "~/utils/permissions/use-barcode-permissions";
import { slugify } from "~/utils/slugify";
import { ContentImportFlow } from "./flow";
import { isActiveStatus, useAssetImportStatus } from "./import-progress";
import Icon from "../../icons/icon";
import { Button } from "../../shared/button";
import { WarningBox } from "../../shared/warning-box";
import When from "../../when/when";

/** CSV helper tool on the help site; null hides the hint. */
const CSV_HELPER_URL = helpSiteUrl("/csv-helper");

/** Props for {@link ImportContent}. */
type ImportContentProps = {
  /** The workspace's QUEUED or RUNNING import from the loader, if any. */
  runningImport: AssetImportStatusPayload | null;
};

/**
 * Main content component for the CSV asset import page. Displays
 * instructions, rules and the upload flow, held while another import runs.
 *
 * @param props - See {@link ImportContentProps}
 */
export const ImportContent = ({ runningImport }: ImportContentProps) =>
  runningImport ? (
    <ImportContentWithRunningImport runningImport={runningImport} />
  ) : (
    <ImportContentBody runningStatus={null} />
  );

/**
 * Follows the running import and passes its live status down while it is
 * still active. Split out so polling only runs when there is an import.
 *
 * @param props.runningImport - The import from the loader
 */
function ImportContentWithRunningImport({
  runningImport,
}: {
  runningImport: AssetImportStatusPayload;
}) {
  const status = useAssetImportStatus(runningImport.id, runningImport);
  return (
    <ImportContentBody
      runningStatus={isActiveStatus(status.status) ? status : null}
    />
  );
}

/**
 * Notice that another import is running, with a link to its progress page.
 * Not a live region: the count changes on every poll.
 *
 * @param props.status - Live status of the running import
 */
function RunningImportBox({ status }: { status: AssetImportStatusPayload }) {
  const { t } = useTranslation();
  return (
    <div className="my-4 flex flex-col gap-3 rounded border border-primary-200 bg-primary-25 p-3 text-sm text-primary-700 sm:flex-row sm:items-center sm:justify-between">
      <p>
        An import is running ({formatCount(status.processedRows)} of{" "}
        {formatCount(status.totalRows)}). You can upload another file when it
        finishes.
      </p>
      <Button
        to={`/assets/import/${status.id}`}
        variant="secondary"
        size="xs"
        className="shrink-0"
      >
        {t("assets.index.viewProgress")}
      </Button>
    </div>
  );
}

/**
 * The page body.
 *
 * @param props.runningStatus - Live status of an active import that holds the
 * upload form, or null when the form is open
 */
function ImportContentBody({
  runningStatus,
}: {
  runningStatus: AssetImportStatusPayload | null;
}) {
  const { t } = useTranslation();
  const { canUseBarcodes } = useBarcodePermissions();

  return (
    <div className="w-full text-left">
      <h3>{t("assets.index.importAssets")}</h3>

      {runningStatus ? <RunningImportBox status={runningStatus} /> : null}

      {/* Intent fork */}
      <div className="my-4 flex gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
        <Icon
          icon="switch"
          size="xs"
          className="mt-0.5 shrink-0 text-gray-500"
        />
        <p className="text-[14px] text-gray-600">
          <b>{t("assets.index.wantToUpdateExistingAssets")}</b>{" "}
          {t("assets.index.ifYouveExportedAssetsFrom")}{" "}
          <Button variant="link" to="/assets/import-update">
            {t("assets.index.goToBulkUpdate")}
          </Button>
        </p>
      </div>

      <h4>{t("assets.index.createNewAssetsFromCsv")}</h4>
      <p>
        <Trans
          t={t}
          i18nKey="assets.index.uploadACsvFileTo"
          components={[
            <Button
              key="slot0"
              variant="link"
              to={
                canUseBarcodes
                  ? "/static/shelf.nu-example-asset-import-from-content-with-barcodes.csv"
                  : "/static/shelf.nu-example-asset-import-from-content.csv"
              }
              target="_blank"
              download={`${slugify(getAppName())}-example-asset-import.csv`}
            />,
          ]}
        />
      </p>

      <WarningBox className="my-4">
        <>
          <strong>IMPORTANT</strong>
          {t("assets.index.useTheTemplateProvidedAbove")}
        </>
      </WarningBox>

      <div className="my-5 flex flex-col gap-4">
        {/* Base rules */}
        <div className="flex gap-3">
          <Icon
            icon="write"
            size="xs"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <div>
            <h5 className="font-semibold">{t("assets.index.baseRules")}</h5>
            <ul className="list-inside list-disc text-[14px] text-gray-600">
              <li>
                <Trans
                  t={t}
                  i18nKey="assets.index.use0Comma0Or"
                  components={[<b key="slot0" />, <b key="slot1" />]}
                />
              </li>
              <li>
                <Trans
                  t={t}
                  i18nKey="assets.index.columnsLike0KitCategory"
                  components={[<b key="slot0" />]}
                />
              </li>
              <li>
                <b>{t("assets.index.tags")}</b>{" "}
                {t("assets.index.canBeCommaSeparatedMissing")}
              </li>
              <li>
                <Trans
                  t={t}
                  i18nKey="assets.index.eachRowCreatesA0"
                  components={[<b key="slot0" />]}
                />
              </li>
              <li>
                <Trans
                  t={t}
                  i18nKey="assets.index.toOnboardStockRoomConsumables"
                  components={[<b key="slot0" />]}
                />
              </li>
            </ul>
          </div>
        </div>

        {/* Custom fields */}
        <div className="flex gap-3">
          <Icon
            icon="settings"
            size="xs"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <div>
            <h5 className="font-semibold">{t("assets.index.customFields")}</h5>
            <p className="text-[14px] text-gray-600">
              <Trans
                t={t}
                i18nKey="assets.index.prefixYourColumnHeadingWith"
                components={[<b key="slot0" />]}
              />
            </p>
            <ul className="list-inside list-disc pl-2 text-[14px] text-gray-600">
              <li>
                <b>{t("assets.index.text")}</b> {t("assets.index.default")}{" "}
                <b>{t("assets.index.boolean")}</b>,{" "}
                <b>{t("assets.index.option")}</b>,{" "}
                <b>{t("assets.index.multilineText")}</b>
              </li>
              <li>
                <b>{t("assets.index.date")}</b>{" "}
                {t("assets.index.mustBeYyyyMmDd")}
              </li>
              <li>
                <b>{t("assets.index.amount")}</b>{" "}
                {t("assets.index.currencyValuesNoSymbolsE")}
              </li>
              <li>
                <b>{t("assets.index.number")}</b>{" "}
                {t("assets.index.numericValuesIncludingNegatives")}
              </li>
            </ul>
            <p className="mt-1 text-[14px] text-gray-600">
              {t("assets.index.exampleHeader")}{" "}
              <b>{t("assets.index.cfPurchaseDateTypeDate")}</b>
            </p>
          </div>
        </div>

        {/* QR codes */}
        <div className="flex gap-3">
          <Icon
            icon="scanQR"
            size="xs"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <div>
            <h5 className="font-semibold">{t("assets.index.qrCodes")}</h5>
            <p className="text-[14px] text-gray-600">
              {t("assets.index.youCanLinkAShelf")}
            </p>
            <ul className="list-inside list-disc pl-2 text-[14px] text-gray-600">
              <li>
                <b>{t("assets.index.existingCode")}</b>{" "}
                {t("assets.index.theQrCodeMustAlready")}
              </li>
              <li>
                <b>{t("assets.index.noDuplicates")}</b>{" "}
                {t("assets.index.eachQridMustBeUnique")}
              </li>
              <li>
                <b>{t("assets.index.noLinkedCodes")}</b>{" "}
                {t("assets.index.theQridMustNotAlready")}
              </li>
              <li>
                <b>{t("assets.index.qrOwnership")}</b>{" "}
                {t("assets.index.theCodeMustBeUnclaimed")}
              </li>
            </ul>
            <p className="mt-1 text-[14px] text-gray-600">
              <Trans
                t={t}
                i18nKey="assets.index.ifNo0Qrid0"
                components={[<b key="slot0" />]}
              />
            </p>
          </div>
        </div>

        {/* Barcodes */}
        <When truthy={canUseBarcodes}>
          <div className="flex gap-3">
            <Icon
              icon="barcode"
              size="xs"
              className="mt-0.5 shrink-0 text-gray-500"
            />
            <div>
              <h5 className="font-semibold">{t("assets.index.barcodes")}</h5>
              <p className="text-[14px] text-gray-600">
                {t("assets.index.importAssetsWithBarcodesUsing")}
              </p>
              <ul className="list-inside list-disc pl-2 text-[14px] text-gray-600">
                <li>
                  <b>{t("assets.index.barcodeCode128")}</b>{" "}
                  {t("assets.index.text440CharactersSupportsLetters")}
                </li>
                <li>
                  <b>{t("assets.index.barcodeCode39")}</b>{" "}
                  {t("assets.index.text443Characters")}
                </li>
                <li>
                  <b>{t("assets.index.barcodeDatamatrix")}</b>{" "}
                  {t("assets.index.text4100Characters")}
                </li>
                <li>
                  <b>{t("assets.index.barcodeExternalqr")}</b>{" "}
                  {t("assets.index.text12048CharactersUrlsText")}
                </li>
                <li>
                  <b>{t("assets.index.barcodeEan13")}</b>{" "}
                  {t("assets.index.text13DigitProductIdentificationCodes")}
                </li>
                <li>
                  <b>{t("assets.index.barcodeItf")}</b>{" "}
                  {t("assets.index.interleaved2Of54")}
                </li>
              </ul>
              <p className="mt-1 text-[14px] text-gray-600">
                <b>{t("assets.index.rules")}</b>{" "}
                {t("assets.index.useCommaSeparationForMultiple")}
              </p>
            </div>
          </div>
        </When>

        {/* Quantity-tracked assets + asset model columns */}
        <div className="flex gap-3">
          <Icon
            icon="asset"
            size="xs"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <div>
            <h5 className="font-semibold">
              {t("assets.index.quantityTrackedAssets2")}
            </h5>
            <p className="text-[14px] text-gray-600">
              {t("assets.index.sixOptionalColumnsLetYou")}
            </p>
            <ul className="list-inside list-disc pl-2 text-[14px] text-gray-600">
              <li>
                <Trans
                  t={t}
                  i18nKey="assets.index.text0Type01Individual"
                  components={[
                    <b key="slot0" />,
                    <code key="slot1" />,
                    <code key="slot2" />,
                    <b key="slot3" />,
                  ]}
                />
              </li>
              <li>
                <Trans
                  t={t}
                  i18nKey="assets.index.text0Quantity0RequiredMust"
                  components={[
                    <b key="slot0" />,
                    <code key="slot1" />,
                    <code key="slot2" />,
                  ]}
                />
              </li>
              <li>
                <Trans
                  t={t}
                  i18nKey="assets.index.text0Minquantity0OptionalNon"
                  components={[<b key="slot0" />, <code key="slot1" />]}
                />
              </li>
              <li>
                <Trans
                  t={t}
                  i18nKey="assets.index.text0Unitofmeasure0OptionalFree"
                  components={[
                    <b key="slot0" />,
                    <code key="slot1" />,
                    <code key="slot2" />,
                    <code key="slot3" />,
                    <code key="slot4" />,
                    <code key="slot5" />,
                    <code key="slot6" />,
                  ]}
                />
              </li>
              <li>
                <Trans
                  t={t}
                  i18nKey="assets.index.text0Consumptiontype0RequiredWhen"
                  components={[
                    <b key="slot0" />,
                    <code key="slot1" />,
                    <code key="slot2" />,
                    <code key="slot3" />,
                    <code key="slot4" />,
                  ]}
                />
              </li>
              <li>
                <Trans
                  t={t}
                  i18nKey="assets.index.text0Assetmodel0OptionalAsset"
                  components={[
                    <b key="slot0" />,
                    <b key="slot1" />,
                    <code key="slot2" />,
                  ]}
                />
              </li>
            </ul>
            <p className="mt-1 text-[14px] text-gray-600">
              <Trans
                t={t}
                i18nKey="assets.index.text0Tip0TheDownloaded"
                components={[
                  <b key="slot0" />,
                  <code key="slot1" />,
                  <code key="slot2" />,
                  <code key="slot3" />,
                  <code key="slot4" />,
                  <code key="slot5" />,
                ]}
              />
            </p>
          </div>
        </div>

        {/* Extra considerations */}
        <div className="flex gap-3">
          <Icon
            icon="question"
            size="xs"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <div>
            <h5 className="font-semibold">{t("assets.index.goodToKnow")}</h5>
            <ul className="list-inside list-disc text-[14px] text-gray-600">
              <li>{t("assets.index.theFirstRowIsUsed")}</li>
              <li>{t("assets.index.yourFileIsCheckedBefore")}</li>
            </ul>
          </div>
        </div>
      </div>

      {CSV_HELPER_URL ? (
        <p className="text-[14px] text-gray-500">
          {t("assets.index.needHelpPreparingYourFile")}{" "}
          <Button variant="link" to={CSV_HELPER_URL} target="_blank">
            {t("assets.index.csvHelperTool")}
          </Button>
          .
        </p>
      ) : null}

      <ContentImportFlow uploadBlocked={!!runningStatus} />
    </div>
  );
}
