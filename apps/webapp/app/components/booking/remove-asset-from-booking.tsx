import type { ReactNode } from "react";
import type { Asset } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { Button } from "~/components/shared/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/shared/modal";
import { useBookingStatusHelpers } from "~/hooks/use-booking-status";
import { useDisabled } from "~/hooks/use-disabled";
import type { BookingWithCustodians } from "~/modules/booking/types";
import { tw } from "~/utils/tw";
import { Form } from "../custom-form";
import { TrashIcon } from "../icons/library";

/**
 * Remove-from-booking confirmation dialog.
 *
 * Accepts an optional `trigger` so callers inside a Popover/menu can render
 * a trigger element styled to match surrounding menu items. When omitted,
 * falls back to the component's built-in trash button for backwards
 * compatibility with existing call sites.
 */
export const RemoveAssetFromBooking = ({
  asset,
  trigger,
}: {
  asset: Asset;
  trigger?: ReactNode;
}) => {
  const { t } = useTranslation();
  const { booking } = useLoaderData<{ booking: BookingWithCustodians }>();
  const { isArchived, isCompleted } = useBookingStatusHelpers(booking.status);
  const disabled = useDisabled();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="link"
            data-test-id="deleteBookingButton"
            icon="trash"
            className={tw(
              "justify-start rounded-sm px-2 py-1.5 text-sm font-medium text-gray-700 outline-none   hover:bg-slate-100 hover:text-gray-700"
            )}
            title={
              isArchived || isCompleted
                ? t(
                    "bookings.removeAssetFromBooking.cannotRemoveAssetsFromCompleted"
                  )
                : undefined
            }
            width="full"
            disabled={disabled || isArchived || isCompleted}
          >
            {t("bookings.removeAssetFromBooking.remove")}
          </Button>
        )}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto md:m-0">
            <span className="flex size-12 items-center justify-center rounded-full bg-error-50 p-2 text-error-600">
              <TrashIcon />
            </span>
          </div>
          <AlertDialogTitle>
            {t("bookings.removeAssetFromBooking.removeFromBooking", {
              title: asset.title,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("bookings.removeAssetFromBooking.areYouSureYouWant")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <div className="flex justify-center gap-2">
            <AlertDialogCancel asChild>
              <Button type="button" variant="secondary" disabled={disabled}>
                {t("bookings.removeAssetFromBooking.cancel")}
              </Button>
            </AlertDialogCancel>

            <Form method="post">
              <input type="hidden" name="assetId" value={asset.id} />
              <Button
                type="submit"
                name="intent"
                value="removeAsset"
                disabled={disabled}
              >
                {t("bookings.removeAssetFromBooking.remove")}
              </Button>
            </Form>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
