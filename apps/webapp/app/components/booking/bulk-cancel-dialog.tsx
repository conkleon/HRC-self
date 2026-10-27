import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { selectedBulkItemsAtom } from "~/atoms/list";
import type { BookingsIndexLoaderData } from "~/routes/_layout+/bookings._index";
import { isSelectingAllItems } from "~/utils/list";
import { BookingsListFields } from "./bookings-list-fields";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { Button } from "../shared/button";

export const BulkCancelBookingsSchema = z.object({
  bookingIds: z.array(z.string()).min(1),
});

export default function BulkCancelDialog() {
  const { t } = useTranslation();
  const { totalItems } = useLoaderData<BookingsIndexLoaderData>();

  const bookingsSelected = useAtomValue(selectedBulkItemsAtom);
  const totalSelected = isSelectingAllItems(bookingsSelected)
    ? totalItems
    : bookingsSelected.length;

  const zo = useZorm("BulkCancelBookings", BulkCancelBookingsSchema);

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="cancel"
      arrayFieldId="bookingIds"
      actionUrl="/api/bookings/bulk-actions"
      title={t("bookings.bulkCancelDialog.cancelBookings", { totalSelected })}
      description={t("bookings.bulkCancelDialog.areYouSureYouWant", {
        totalSelected,
      })}
    >
      {({ disabled, fetcherError, handleCloseDialog }) => (
        <>
          <input type="hidden" value="bulk-cancel" name="intent" />
          <BookingsListFields />

          {fetcherError ? (
            <p className="text-sm text-error-500">{fetcherError}</p>
          ) : null}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              width="full"
              disabled={disabled}
              onClick={handleCloseDialog}
            >
              {t("bookings.bulkCancelDialog.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
              className="border-error-600 bg-error-600 hover:border-error-800 hover:bg-error-800"
            >
              {t("bookings.bulkCancelDialog.confirm")}
            </Button>
          </div>
        </>
      )}
    </BulkUpdateDialogContent>
  );
}
