/**
 * @file Error block shown when a CSV import is refused.
 *
 * Renders the error title and message followed by every table of problems the
 * server can attach to an import error: QR code conflicts, duplicate barcodes,
 * kit custody conflicts, incorrect headers and per-row errors. Used by the
 * admin upload dialog and by the preview stage of the content import.
 *
 * @see {@link file://./../import-content-file-form.tsx} Admin upload dialog consumer
 * @see {@link file://./../../../utils/import-row-errors.ts} Row error shape
 */
import { useTranslation } from "react-i18next";
import type { DuplicateBarcode } from "~/modules/barcode/service.server";
import type { QRCodePerImportedAsset } from "~/modules/qr/service.server";
import { readImportRowErrors } from "~/utils/import-row-errors";
import { ImportRowErrorsTable } from "../../shared/import-row-errors-table";
import { Table, Td, Th, Tr } from "../../table";

/** A kit custody conflict reported by the import pre-flight checks. */
type KitCustodyConflict = {
  asset: string;
  custodian: string;
  kit: string;
  issue: string;
};

/** A CSV header the importer could not interpret. */
type DefectedHeader = { incorrectHeader: string; errorMessage: string };

/** Props for {@link ImportErrorDetails}. */
type ImportErrorDetailsProps = {
  error: {
    title?: string;
    message: string;
    /** Untyped payload of the server error. Its members are narrowed before use. */
    additionalData?: unknown;
  };
};

/**
 * Renders an import error and every problem table its `additionalData` carries.
 *
 * @param props.error - The error payload returned by an import action
 * @returns The error block, ending with the "fix your CSV" footer
 */
export function ImportErrorDetails({ error }: ImportErrorDetailsProps) {
  const { t } = useTranslation();
  const additionalData =
    error.additionalData && typeof error.additionalData === "object"
      ? (error.additionalData as Record<string, unknown>)
      : {};
  const { rowErrors, totalRowErrors } = readImportRowErrors(additionalData);

  return (
    <div className="overflow-y-scroll">
      <h5 className="text-red-500">{error.title}</h5>
      <p className="text-red-500">{error.message}</p>
      {additionalData.duplicateCodes ? (
        <BrokenQrCodesTable
          title={t("assets.importErrorDetails.duplicateCodes")}
          data={additionalData.duplicateCodes as QRCodePerImportedAsset[]}
        />
      ) : null}
      {additionalData.nonExistentCodes ? (
        <BrokenQrCodesTable
          title={t("assets.importErrorDetails.nonExistentCodes")}
          data={additionalData.nonExistentCodes as QRCodePerImportedAsset[]}
        />
      ) : null}
      {additionalData.linkedCodes ? (
        <BrokenQrCodesTable
          title={t("assets.importErrorDetails.alreadyLinkedCodes")}
          data={additionalData.linkedCodes as QRCodePerImportedAsset[]}
        />
      ) : null}
      {additionalData.connectedToOtherOrgs ? (
        <BrokenQrCodesTable
          title={t("assets.importErrorDetails.someCodesDoNotBelong")}
          data={additionalData.connectedToOtherOrgs as QRCodePerImportedAsset[]}
        />
      ) : null}

      {additionalData.duplicateBarcodes ? (
        <DuplicateBarcodesTable
          data={additionalData.duplicateBarcodes as DuplicateBarcode[]}
        />
      ) : null}

      {additionalData.kitCustodyConflicts ? (
        <table className="mt-4 w-full rounded-md border text-left text-sm">
          <thead className="bg-error-100 text-xs">
            <tr>
              <th scope="col" className="px-2 py-1">
                {t("assets.importErrorDetails.asset")}
              </th>
              <th scope="col" className="px-2 py-1">
                {t("assets.importErrorDetails.custodian")}
              </th>
              <th scope="col" className="px-2 py-1">
                {t("assets.importErrorDetails.kit")}
              </th>
              <th scope="col" className="px-2 py-1">
                {t("assets.importErrorDetails.issue")}
              </th>
            </tr>
          </thead>
          <tbody>
            {(additionalData.kitCustodyConflicts as KitCustodyConflict[]).map(
              (conflict) => (
                <tr
                  // Compose a stable key from the conflict fields: the backend
                  // can surface the same asset twice for different issues, so
                  // `issue` is part of the key.
                  key={`${conflict.asset}-${conflict.kit}-${conflict.custodian}-${conflict.issue}`}
                  className="border-b"
                >
                  <td className="px-2 py-1">{conflict.asset}</td>
                  <td className="px-2 py-1">{conflict.custodian}</td>
                  <td className="px-2 py-1">{conflict.kit}</td>
                  <td className="px-2 py-1">{conflict.issue}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      ) : null}

      {Array.isArray(additionalData.defectedHeaders) ? (
        <table className="mt-4 w-full rounded-md border text-left text-sm">
          <thead className="bg-error-100 text-xs">
            <tr>
              <th scope="col" className="px-2 py-1">
                {t("assets.importErrorDetails.incorrectHeader")}
              </th>
              <th scope="col" className="px-2 py-1">
                {t("assets.importErrorDetails.error")}
              </th>
            </tr>
          </thead>
          <tbody>
            {(additionalData.defectedHeaders as DefectedHeader[]).map(
              (header) => (
                <tr key={header.incorrectHeader}>
                  <td className="px-2 py-1">{header.incorrectHeader}</td>
                  <td className="px-2 py-1">{header.errorMessage}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      ) : null}

      {rowErrors ? (
        <ImportRowErrorsTable
          rowErrors={rowErrors}
          totalRowErrors={totalRowErrors}
        />
      ) : null}

      <p className="mt-2">
        {t("assets.importErrorDetails.pleaseFixYourCsvFile")}
      </p>
    </div>
  );
}

/**
 * Table of imported assets whose QR code is unusable.
 *
 * @param props.title - Heading naming the kind of conflict
 * @param props.data - The offending assets with their QR IDs
 */
function BrokenQrCodesTable({
  title,
  data,
}: {
  title: string;
  data: QRCodePerImportedAsset[];
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3">
      <h5>{title}</h5>
      <Table className="mt-1 [&_td]:p-1 [&_th]:p-1">
        <thead>
          <Tr>
            <Th>{t("assets.importErrorDetails.assetTitle")}</Th>
            <Th>{t("assets.importErrorDetails.qrId")}</Th>
          </Tr>
        </thead>
        <tbody>
          {/* Titles are not unique and duplicateCodes repeats whole entries,
              so the static row's position is part of its key. */}
          {data.map((code: { title: string; qrId: string }, index) => (
            <Tr key={`${code.qrId}-${code.title}-${index}`}>
              <Td>{code.title}</Td>
              <Td>{code.qrId}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/**
 * Table of barcode values used by more than one imported asset.
 *
 * @param props.data - Each duplicated barcode with the rows that use it
 */
function DuplicateBarcodesTable({ data }: { data: DuplicateBarcode[] }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3">
      <h5>{t("assets.importErrorDetails.duplicateBarcodes")}</h5>
      <Table className="mt-1 [&_td]:p-1 [&_th]:p-1">
        <thead>
          <Tr>
            <Th>{t("assets.importErrorDetails.barcode")}</Th>
            <Th>{t("assets.importErrorDetails.usedByAssets")}</Th>
          </Tr>
        </thead>
        <tbody>
          {data.map((barcode) => (
            <Tr key={barcode.value}>
              <Td className="align-top">{barcode.value}</Td>
              <Td className="whitespace-normal">
                <ul className="list-disc pl-4">
                  {barcode.assets.map((asset) => (
                    // The CSV `row` number is unique per imported asset within
                    // one error payload; title and type guard the case where
                    // the same row surfaces under several barcodes.
                    <li key={`${asset.row}-${asset.type}-${asset.title}`}>
                      {t("assets.importErrorDetails.line", {
                        title: asset.title,
                        type: asset.type,
                        row: asset.row,
                      })}
                    </li>
                  ))}
                </ul>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
