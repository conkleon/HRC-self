// Both toggle glyphs come from the same icon set. Radix icons are drawn on a
// 15x15 viewBox with hairline paths; a lucide icon is 24x24 with a 2px
// stroke, so at the same rendered size it reads markedly bolder beside one.
import { CalendarIcon, CubeIcon } from "@radix-ui/react-icons";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/shared/button";
import { ButtonGroup } from "~/components/shared/button-group";
import { useAssetIndexView } from "~/hooks/use-asset-index-view";
import { tw } from "~/utils/tw";

/**
 * Switches the asset index between its list, availability and model views.
 *
 * Renders nothing when no alternative view is offered for the current page or
 * viewport. The model button appears only in advanced mode.
 */
export function AvailabilityViewToggle({
  modeIsSimple = true,
}: {
  modeIsSimple?: boolean;
}) {
  const { t } = useTranslation();
  const { view, shouldShowAvailabilityView, shouldShowModelView, setView } =
    useAssetIndexView();

  if (!shouldShowAvailabilityView) {
    return null;
  }

  const disabledButtonStyles =
    "cursor-not-allowed pointer-events-none bg-gray-50 text-gray-800";
  const buttonStyles = (isActive: boolean) =>
    tw(
      "px-[14px] font-normal text-gray-600 hover:cursor-pointer",
      isActive ? disabledButtonStyles : "",
      modeIsSimple ? "py-[10px]" : ""
    );

  return (
    <div className="flex items-start gap-2">
      <ButtonGroup>
        <Button
          variant="secondary"
          className={buttonStyles(view === "table")}
          disabled={view === "table"}
          type="button"
          onClick={() => setView("table")}
          title={t("assets.viewToggle.switchToListView")}
          tooltip={t("assets.viewToggle.listView")}
          aria-label={t("assets.viewToggle.switchToListView")}
          icon="sort"
        />
        <Button
          variant="secondary"
          className={buttonStyles(view === "availability")}
          disabled={view === "availability"}
          type="button"
          onClick={() => setView("availability")}
          title={t("assets.viewToggle.switchToAvailabilityView")}
          tooltip={t("assets.viewToggle.availabilityView")}
          aria-label={t("assets.viewToggle.switchToAvailabilityView")}
        >
          <CalendarIcon className="size-5" />
        </Button>
        {shouldShowModelView ? (
          <Button
            variant="secondary"
            className={buttonStyles(view === "models")}
            disabled={view === "models"}
            type="button"
            onClick={() => setView("models")}
            title={t("assets.viewToggle.switchToAssetModelView")}
            tooltip={t("assets.viewToggle.assetModelView")}
            aria-label={t("assets.viewToggle.switchToAssetModelView")}
          >
            <CubeIcon className="size-5" />
          </Button>
        ) : null}
      </ButtonGroup>
    </div>
  );
}
