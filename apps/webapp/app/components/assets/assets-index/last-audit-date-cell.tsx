/**
 * Last audit date cell
 *
 * Renders the "Last audit date" column of the advanced assets index. When the
 * column is available, the date is a hover card trigger that lazily loads the
 * asset's recent and upcoming audits. When audits are locked for the workspace
 * the cell is a call to action instead.
 *
 * @see {@link file://./advanced-asset-columns.tsx}
 * @see {@link file://./../../../routes/api+/assets.$assetId.audit-history.ts}
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { AuditHistoryListItem } from "~/components/audit/asset-audit-history-list";
import { AssetAuditHistoryList } from "~/components/audit/asset-audit-history-list";
import { DateS } from "~/components/shared/date";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/shared/hover-card";
import useApiQuery from "~/hooks/use-api-query";
import type { LastAuditDateAccess } from "~/modules/asset/last-audit-date-access";
import { tw } from "~/utils/tw";
import { Td } from "./advanced-columns/td";

/**
 * Response body of the audit-history endpoint. A failed request answers with
 * an `error` object and no lists; a successful one stamps `error: null`.
 */
type AuditHistoryData = {
  recent?: AuditHistoryListItem[];
  upcoming?: AuditHistoryListItem[];
  error?: unknown;
};

/** Body of the hover card: loading, empty and populated states. */
function HistoryBody({
  assetId,
  data,
  failed,
}: {
  assetId: string;
  data: AuditHistoryData | undefined;
  failed: boolean;
}) {
  const { t } = useTranslation();
  if (failed || (data && (data.error || !data.recent || !data.upcoming))) {
    return (
      <p className="text-sm text-gray-600">
        {t("assets.lastAuditDateCell.couldNotLoadAudits")}
      </p>
    );
  }

  if (!data || !data.recent || !data.upcoming) {
    return (
      <p className="text-sm text-gray-600" role="status">
        {t("assets.lastAuditDateCell.loadingAudits")}
      </p>
    );
  }

  const { recent, upcoming } = data;
  if (recent.length === 0 && upcoming.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        {t("assets.lastAuditDateCell.noAuditsForThisAsset")}
      </p>
    );
  }

  return (
    <AssetAuditHistoryList
      assetId={assetId}
      recent={recent}
      upcoming={upcoming}
    />
  );
}

/**
 * Table cell for the last audit date column.
 *
 * @param props.assetId - The asset the row belongs to
 * @param props.lastAuditDate - ISO date of the latest counted audit, if any
 * @param props.access - `available` shows the date, `locked` a CTA, `hidden` nothing
 */
export function LastAuditDateCell({
  assetId,
  lastAuditDate,
  access,
}: {
  assetId: string;
  lastAuditDate: string | null | undefined;
  access: LastAuditDateAccess;
}) {
  const { t } = useTranslation();
  /** Load once per mount: set when the card first opens, never reset. */
  const [requested, setRequested] = useState(false);
  const { data, error } = useApiQuery<AuditHistoryData>({
    api: `/api/assets/${assetId}/audit-history`,
    enabled: access === "available" && requested,
  });

  if (access === "hidden") return null;

  if (access === "locked") {
    return (
      <Td>
        <Link
          to="/audits"
          className="text-sm font-medium text-primary-700 hover:underline"
        >
          {t("assets.lastAuditDateCell.unlockAudits")}
        </Link>
      </Td>
    );
  }

  function handleOpenChange(open: boolean) {
    if (open) setRequested(true);
  }

  return (
    <Td>
      <HoverCard openDelay={200} onOpenChange={handleOpenChange}>
        <HoverCardTrigger asChild>
          {/* The dashed underline marks the value as hoverable for details. */}
          <button
            type="button"
            className={tw(
              "border-b border-dashed border-gray-400 text-left text-sm leading-tight hover:border-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
              !lastAuditDate && "text-gray-500"
            )}
          >
            {lastAuditDate ? (
              <DateS date={lastAuditDate} />
            ) : (
              t("assets.lastAuditDateCell.neverAudited")
            )}
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="w-80 p-4" align="start">
          <HistoryBody assetId={assetId} data={data} failed={Boolean(error)} />
        </HoverCardContent>
      </HoverCard>
    </Td>
  );
}
