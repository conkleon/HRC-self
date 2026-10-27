import { useTranslation } from "react-i18next";
import { UpgradeMessage } from "../marketing/upgrade-message";
import { Button } from "../shared/button";

export const ImportButton = ({
  canImportAssets,
}: {
  canImportAssets: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <Button
      to={`import`}
      variant="secondary"
      role="link"
      disabled={
        !canImportAssets
          ? {
              reason: (
                <>
                  {t("assets.importButton.importingIsNotAvailableOn")}{" "}
                  <UpgradeMessage />
                </>
              ),
            }
          : false
      }
      title={t("assets.importButton.importAssets")}
    >
      {t("assets.importButton.import")}
    </Button>
  );
};
