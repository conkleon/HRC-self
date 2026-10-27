import type { CSSProperties } from "react";
import { archivedAssetBlockedReason } from "@shelf/labels";
import { CopyIcon, PencilIcon, QrCodeIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/shared/button";
import When from "~/components/when/when";
import { useCanArchiveAssets } from "~/hooks/use-can-archive-assets";
import { useOrganizationRoles } from "~/hooks/use-organization-roles";
import type { AssetsFromViewItem } from "~/modules/asset/types";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator.client";
import { tw } from "~/utils/tw";
import { CodePreviewDialog } from "../../code-preview/code-preview-dialog";
import { DeleteAsset } from "../delete-asset";

type AssetQuickActionsProps = {
  className?: string;
  style?: CSSProperties;
  asset: Pick<AssetsFromViewItem, "id" | "title" | "mainImage"> & {
    qrId: string;
    sequentialId?: string | null;
    /** Set on archived rows (the Archived and All views). */
    archivedAt?: Date | string | null;
  };
};

export default function AssetQuickActions({
  className,
  style,
  asset,
}: AssetQuickActionsProps) {
  const { t } = useTranslation();
  const roles = useOrganizationRoles();
  const canArchiveAssets = useCanArchiveAssets();
  /**
   * Archived assets are read-only (issue #382): Edit and Duplicate are greyed
   * with the reason, matching the asset's own Actions menu. The edit page and
   * `duplicateAsset` refuse them too.
   */
  const archivedDisabled = asset.archivedAt
    ? {
        reason: archivedAssetBlockedReason({ canReinstate: canArchiveAssets }),
      }
    : false;

  return (
    <div className={tw("flex items-center gap-2", className)} style={style}>
      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.update,
        })}
      >
        <Button
          size="sm"
          variant="secondary"
          className={"p-2"}
          to={`/assets/${asset.id}/edit`}
          aria-label={t("assets.assetQuickActions.editAssetInformation")}
          tooltip={t("assets.assetQuickActions.editAssetInformation")}
          disabled={archivedDisabled}
        >
          <PencilIcon className="size-4" />
        </Button>
      </When>

      <CodePreviewDialog
        item={{
          id: asset.id,
          title: asset.title,
          qrId: asset.qrId,
          type: "asset",
          sequentialId: asset.sequentialId,
        }}
        trigger={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={"p-2"}
            aria-label={t("assets.assetQuickActions.showAssetLabel")}
            tooltip={t("assets.assetQuickActions.showAssetLabel")}
          >
            <QrCodeIcon className="size-4" />
          </Button>
        }
      />

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.update,
        })}
      >
        <Button
          size="sm"
          variant="secondary"
          className={"p-2"}
          to={`/assets/${asset.id}/overview/duplicate`}
          aria-label={t("assets.assetQuickActions.duplicateAsset")}
          tooltip={t("assets.assetQuickActions.duplicateAsset")}
          disabled={archivedDisabled}
        >
          <CopyIcon className="size-4" />
        </Button>
      </When>

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.delete,
        })}
      >
        <DeleteAsset
          asset={asset}
          trigger={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={"p-2"}
              aria-label={t("assets.assetQuickActions.deleteAsset")}
              tooltip={t("assets.assetQuickActions.deleteAsset")}
            >
              <Trash2Icon className="size-4" />
            </Button>
          }
        />
      </When>
    </div>
  );
}
