import type { Barcode } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { MetaFunction, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import { z } from "zod";
import { CategoryBadge } from "~/components/assets/category-badge";
import { BarcodeCard } from "~/components/barcode/barcode-card";
import type { HeaderData } from "~/components/layout/header/types";
import { LocationBadge } from "~/components/location/location-badge";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
import { InfoTooltip } from "~/components/shared/info-tooltip";
import When from "~/components/when/when";
import { getKitOverviewFields } from "~/modules/kit/fields";
import { getKit } from "~/modules/kit/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { getClientHint } from "~/utils/client-hints";
import { formatCurrency } from "~/utils/currency";
import { makeShelfError } from "~/utils/error";
import { helpSiteUrl } from "~/utils/help-site";
import { error, getParams, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { useBarcodePermissions } from "~/utils/permissions/use-barcode-permissions";
import { requirePermission } from "~/utils/roles.server";

/** Knowledge-base article on barcode support; null hides the link. */
const BARCODES_KB_URL = helpSiteUrl("/knowledge-base/alternative-barcodes");

type KitWithOptionalBarcodes = ReturnType<
  typeof useLoaderData<typeof loader>
>["kit"] & {
  barcodes?: Pick<Barcode, "id" | "type" | "value">[];
};

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  const { kitId: id } = getParams(params, z.object({ kitId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const {
      organizationId,
      userOrganizations,
      canUseBarcodes,
      currentOrganization,
    } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.kit,
      action: PermissionAction.read,
    });
    const { locale } = getClientHint(request);

    const kit = await getKit({
      id,
      organizationId,
      userOrganizations,
      request,
      extraInclude: getKitOverviewFields(canUseBarcodes),
    });

    const header: HeaderData = {
      title: `${kit.name}'s overview`,
    };

    return payload({
      kit,
      currentOrganization,
      locale,
      header,
    });
  } catch (cause) {
    const reason = makeShelfError(cause);
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

export const handle = {
  breadcrumb: () => "Overview",
};

export default function KitOverview() {
  const { t } = useTranslation();
  const { kit, currentOrganization, locale } = useLoaderData<typeof loader>();
  const { canUseBarcodes } = useBarcodePermissions();
  // Multiplies per-unit `valuation` by `AssetKit.quantity` — units of
  // this asset *in this kit*, not workspace stock. A QT asset stocked
  // at 100 with 5 in this kit contributes `valuation × 5`, not × 100.
  // Archived members are out of service and add nothing, matching the
  // companion's kit screen.
  const totalValue = kit.assetKits.reduce(
    (total, ak) =>
      ak.asset.archivedAt
        ? total
        : total + (ak.asset.valuation ?? 0) * (ak.quantity ?? 1),
    0
  );

  return (
    <Card className="mt-0 px-[-4] py-[-5] md:border">
      <ul className="item-information">
        <li className="w-full border-b-[1.1px] border-b-gray-100 p-4 last:border-b-0 md:flex">
          <span className="w-1/4 text-[14px] font-medium text-gray-900">
            ID
          </span>
          <div className="mt-1 w-3/5 text-gray-600 md:mt-0">{kit?.id}</div>
        </li>

        {kit?.qrCodes?.[0] ? (
          <li className="w-full border-b-[1.1px] border-b-gray-100 p-4 last:border-b-0 md:flex">
            <span className="w-1/4 text-[14px] font-medium text-gray-900">
              {t("kits.kitsKitidOverview.shelfQrId")}
            </span>
            <div className="mt-1 w-3/5 text-gray-600 md:mt-0">
              {kit.qrCodes[0].id}
            </div>
          </li>
        ) : null}
        <li className="w-full border-b-[1.1px] border-b-gray-100 p-4 last:border-b-0 md:flex">
          <span className="w-1/4 text-[14px] font-medium text-gray-900">
            {t("kits.kitsKitidOverview.created")}
          </span>
          <div className="mt-1 w-3/5 text-gray-600 md:mt-0">
            <DateS date={kit.createdAt} includeTime />
          </div>
        </li>

        {kit?.description ? (
          <li className="w-full border-b-[1.1px] border-b-gray-100 p-4 last:border-b-0 md:flex">
            <span className="w-1/4 text-[14px] font-medium text-gray-900">
              {t("kits.kitsKitidOverview.description")}
            </span>
            <div className="mt-1 whitespace-pre-wrap text-gray-600 md:mt-0 md:w-3/5">
              {kit.description}
            </div>
          </li>
        ) : null}

        <When truthy={!!kit.category}>
          <li className="w-full border-b-[1.1px] border-b-gray-100 p-4 last:border-b-0 md:flex">
            <span className="w-1/4 text-[14px] font-medium text-gray-900">
              {t("kits.kitsKitidOverview.category")}
            </span>
            <div className="mt-1 whitespace-pre-wrap text-gray-600 md:mt-0 md:w-3/5">
              <CategoryBadge category={kit.category} />
            </div>
          </li>
        </When>

        <When truthy={!!kit.location}>
          <li className="w-full border-b-[1.1px] border-b-gray-100 p-4 last:border-b-0 md:flex">
            <span className="w-1/4 text-[14px] font-medium text-gray-900">
              {t("kits.kitsKitidOverview.location")}
            </span>
            <div className="mt-1 md:mt-0 md:w-3/5">
              {kit.location ? (
                <LocationBadge
                  location={{
                    id: kit.location.id,
                    name: kit.location.name,
                    parentId: kit.location.parentId ?? undefined,
                    childCount: kit.location._count?.children ?? 0,
                  }}
                />
              ) : null}
            </div>
          </li>
        </When>

        <li className="w-full border-b-[1.1px] border-b-gray-100 p-4 last:border-b-0 md:flex">
          <span className="w-1/4 text-[14px] font-medium text-gray-900">
            {t("kits.kitsKitidOverview.totalValue")}{" "}
            <InfoTooltip
              iconClassName="size-4"
              content={
                <>
                  <h6>{t("kits.kitsKitidOverview.totalValue")}</h6>
                  <p>{t("kits.kitsKitidOverview.aSumOfAllAssets")}</p>
                </>
              }
            />
          </span>
          <div className="mt-1 whitespace-pre-wrap text-gray-600 md:mt-0 md:w-3/5">
            {formatCurrency({
              value: totalValue,
              locale,
              currency: currentOrganization.currency,
            })}
          </div>
        </li>

        {(() => {
          const kitWithBarcodes = kit as KitWithOptionalBarcodes;
          return (
            kit &&
            kitWithBarcodes.barcodes?.length &&
            kitWithBarcodes.barcodes.length > 0 &&
            canUseBarcodes
          );
        })() ? (
          <li className="w-full p-4 last:border-b-0 md:block">
            <span className="mb-3 flex items-center gap-1 text-[14px] font-medium text-gray-900">
              {t("kits.kitsKitidOverview.barcodes", {
                barcodesCount: (kit as KitWithOptionalBarcodes).barcodes
                  ?.length,
              })}
              <InfoTooltip
                iconClassName="size-4"
                content={
                  <>
                    <h6>{t("kits.kitsKitidOverview.barcodesSupport")}</h6>
                    {BARCODES_KB_URL ? (
                      <p>
                        {t("kits.kitsKitidOverview.wantToKnowMoreAbout")}{" "}
                        <Button
                          variant="link"
                          target="_blank"
                          to={BARCODES_KB_URL}
                        >
                          {t("kits.kitsKitidOverview.barcodeSupport")}
                        </Button>
                      </p>
                    ) : null}
                  </>
                }
              />
            </span>
            <div className="flex flex-wrap gap-3">
              {(kit as KitWithOptionalBarcodes).barcodes?.map((barcode) => (
                <BarcodeCard key={barcode.id} barcode={barcode} />
              ))}
            </div>
          </li>
        ) : null}
      </ul>
    </Card>
  );
}
