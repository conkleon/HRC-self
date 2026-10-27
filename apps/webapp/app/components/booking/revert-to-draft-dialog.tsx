import { useState } from "react";
import { BookingStatus, type Booking } from "@prisma/client";
import { Trans, useTranslation } from "react-i18next";
import { useDisabled } from "~/hooks/use-disabled";
import { Dialog, DialogPortal } from "../layout/dialog";
import { Button } from "../shared/button";

type RevertToDraftProps = {
  booking: Pick<Booking, "name" | "status">;
};

export default function RevertToDraftDialog({ booking }: RevertToDraftProps) {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const disabled = useDisabled();
  function handleOpenDialog() {
    setIsDialogOpen(true);
  }

  function handleCloseDialog() {
    setIsDialogOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="link"
        className="hidden justify-start rounded-sm px-2 py-1.5 text-left text-sm font-medium text-gray-700 outline-none hover:bg-slate-100 hover:text-gray-700 md:block"
        width="full"
        onClick={handleOpenDialog}
        disabled={booking.status !== BookingStatus.RESERVED}
      >
        {t("bookings.revertToDraftDialog.revertToDraft")}
      </Button>
      <DialogPortal>
        <Dialog
          className="md:max-w-sm"
          open={isDialogOpen}
          onClose={handleCloseDialog}
          title={
            <div>
              <h3>{t("bookings.revertToDraftDialog.revertingToDraftState")}</h3>
            </div>
          }
        >
          <div className="px-6 pb-4">
            <p className="mb-4">
              <Trans
                t={t}
                i18nKey="bookings.revertToDraftDialog.areYouSureYouWant"
                values={{ name: booking.name }}
                components={[<span key="slot0" className="font-bold" />]}
              />
            </p>

            <form method="post" className="flex w-full items-center gap-4">
              <input type="hidden" name="intent" value="revert-to-draft" />
              <Button
                variant="secondary"
                className="flex-1"
                type="button"
                onClick={handleCloseDialog}
              >
                {t("bookings.revertToDraftDialog.cancel")}
              </Button>
              <Button className="flex-1" type="submit" disabled={disabled}>
                {t("bookings.revertToDraftDialog.confirm")}
              </Button>
            </form>
          </div>
        </Dialog>
      </DialogPortal>

      {/* Only for mobile */}
      <Button
        type="button"
        variant="link"
        className="block justify-start rounded-sm px-2 py-1.5 text-left text-sm font-medium text-gray-700 outline-none hover:bg-slate-100 hover:text-gray-700  md:hidden"
        width="full"
        onClick={handleOpenDialog}
        disabled={booking.status !== BookingStatus.RESERVED}
      >
        {t("bookings.revertToDraftDialog.revertToDraft")}
      </Button>
    </>
  );
}
