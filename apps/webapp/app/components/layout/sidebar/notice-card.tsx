import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import { XIcon } from "~/components/icons/library";
import { Button } from "~/components/shared/button";
import { getAppName } from "~/modules/branding/instance-branding";
import type { loader } from "~/routes/_layout+/_layout";
import { helpSiteUrl } from "~/utils/help-site";

export const SidebarNoticeCard = () => {
  const { t } = useTranslation();
  const { hideNoticeCard } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const tutorialUrl = helpSiteUrl(
    "/blog/new-shelf-pwa-progresive-web-application-live-learn-how-to-use"
  );

  let optimisticHideNoticeCard = hideNoticeCard;
  if (fetcher.formData) {
    optimisticHideNoticeCard =
      fetcher.formData.get("noticeCardVisibility") === "hidden";
  }

  return optimisticHideNoticeCard ? null : (
    <div className="support-banner mb-6 hidden rounded border bg-gray-50 px-2 py-3 md:block">
      <div className="flex justify-between align-middle">
        <h5 className="mb-1 font-semibold text-gray-900">
          {t("nav.noticeCard.installForMobile", { appName: getAppName() })}
        </h5>
        <div className="mt-[-6px]">
          <fetcher.Form
            method="post"
            action="/api/user/prefs/dismiss-notice-card"
          >
            <input type="hidden" name="noticeCardVisibility" value="hidden" />
            <button type="submit">
              <XIcon />
            </button>
          </fetcher.Form>
        </div>
      </div>

      <p className="text-gray-600">
        {t("nav.noticeCard.alwaysAvailableAccessToWith", {
          appName: getAppName(),
        })}
      </p>
      <img
        src="/static/images/carlos-support.jpg"
        alt={t("nav.noticeCard.support", { appName: getAppName() })}
        className="my-4 rounded"
      />
      {tutorialUrl ? (
        <p>
          <Button variant="link" to={tutorialUrl}>
            {t("nav.noticeCard.writtenTutorial")}
          </Button>
        </p>
      ) : null}
    </div>
  );
};
