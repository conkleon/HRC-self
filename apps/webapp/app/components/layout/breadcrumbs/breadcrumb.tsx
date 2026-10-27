import { useTranslation } from "react-i18next";
import type { UIMatch } from "react-router";
import { ChevronRight } from "~/components/icons/library";

export function Breadcrumb({
  match,
  isLastItem,
}: {
  match: UIMatch<any, any>;
  isLastItem: boolean;
}) {
  const { t } = useTranslation();
  let breadcrumb = match?.handle?.breadcrumb(match);
  /**
   * If the value is "single" that means we have to
   * take the page title and render it.
   * This takes care of showing the correct title in asset show page*/
  if (typeof breadcrumb === "string") {
    if (breadcrumb === "single") {
      if (match?.data?.location) {
        breadcrumb = (
          <span className="single-crumb">
            {match?.data?.location?.name || t("nav.breadcrumb.notFound")}
          </span>
        );
      } else if (match?.data?.organization) {
        breadcrumb = (
          <span className="single-crumb">
            {match?.data?.organization?.name || t("nav.breadcrumb.notFound")}
          </span>
        );
      } else if (match?.data?.booking) {
        breadcrumb = (
          <span className="single-crumb">
            {match?.data?.booking?.name || t("nav.breadcrumb.notFound")}
          </span>
        );
      } else if (match?.data?.kit) {
        breadcrumb = (
          <span className="single-crumb">
            {match?.data?.kit?.name || t("nav.breadcrumb.notFound")}
          </span>
        );
      } else if (match?.data?.session) {
        breadcrumb = (
          <span className="single-crumb">
            {match?.data?.session?.name || t("nav.breadcrumb.notFound")}
          </span>
        );
      } else if (match?.data?.userName) {
        breadcrumb = (
          <span className="single-crumb">
            {match?.data?.userName || t("nav.breadcrumb.notFound")}
          </span>
        );
      } else {
        breadcrumb = (
          <span className="single-crumb">
            {match?.data?.asset?.title || t("nav.breadcrumb.notFound")}
          </span>
        );
      }
    } else {
      breadcrumb = <span className="single-crumb">{breadcrumb}</span>;
    }
  }

  return breadcrumb ? (
    <div className="breadcrumb">
      {breadcrumb}{" "}
      {!isLastItem && (
        <span className="mx-2.5 md:mx-4">
          <ChevronRight className="inline align-middle" />
        </span>
      )}
    </div>
  ) : null;
}
