import { useCallback, useEffect, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useZorm } from "react-zorm";
import { useBookingSettings } from "~/hooks/use-booking-settings";
import { useDisabled } from "~/hooks/use-disabled";
import useFetcherWithReset from "~/hooks/use-fetcher-with-reset";
import { useFormatPrefs } from "~/hooks/use-format-prefs";
import { useRoleAccess } from "~/hooks/use-role-access";
import { useWorkingHours } from "~/hooks/use-working-hours";
import type { BookingPageLoaderData } from "~/routes/_layout+/bookings.$bookingId.overview";
import { getValidationErrors } from "~/utils/http";
import type { DataOrErrorResponse } from "~/utils/http.server";
import { tw } from "~/utils/tw";
import { Dialog, DialogPortal } from "../layout/dialog";
import { Button } from "../shared/button";
import { DateTimePicker } from "../shared/date-time-picker";
import When from "../when/when";
import { WorkingHoursInfo } from "./forms/fields/dates";
import {
  ExtendBookingSchema,
  type ExtendBookingSchemaType,
} from "./forms/forms-schema";

type ExtendBookingDialogProps = {
  className?: string;
  currentEndDate: string;
};

export default function ExtendBookingDialog({
  className,
  currentEndDate,
}: ExtendBookingDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const fetcher = useFetcherWithReset<DataOrErrorResponse>();
  const disabled = useDisabled(fetcher);
  // TIMEZONE FIX: validate the new end date in the user's RESOLVED pref zone.
  // The server action parses the submitted value with that same zone, so using
  // the browser hint here made the two disagree for anyone with an explicit
  // timezone preference.
  const prefs = useFormatPrefs();
  const { booking } = useLoaderData<BookingPageLoaderData>();
  const workingHoursData = useWorkingHours();
  const bookingSettings = useBookingSettings();
  const { isLoading = true, error } = workingHoursData;
  const workingHoursDisabled = disabled || isLoading;
  const roleAccess = useRoleAccess();

  const zo = useZorm(
    "ExtendBooking",
    ExtendBookingSchema({
      prefs,
      workingHours: workingHoursData.workingHours,
      bookingSettings,
      bypassTimeLimits: roleAccess.policy.bookings.bypassTimeLimits,
    })
  );

  function handleOpen() {
    setOpen(true);
  }

  const handleClose = useCallback(() => {
    setOpen(false);
    fetcher.reset();
  }, [fetcher]);

  useEffect(
    function closeOnSuccess() {
      const data = fetcher?.data;
      if (data && "success" in data && data.success) {
        handleClose();
      }
    },
    [fetcher?.data, handleClose]
  );

  /** This handles server side errors in case client side validation fails */

  const validationErrors = getValidationErrors<ExtendBookingSchemaType>(
    fetcher?.data?.error
  );
  return (
    <>
      <Button
        type="button"
        variant="link"
        className="justify-start rounded px-2 py-1.5 text-sm font-medium text-gray-700 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-slate-100 hover:text-gray-700"
        width="full"
        onClick={handleOpen}
      >
        {t("bookings.extendBookingDialog.extendBooking")}
      </Button>

      <DialogPortal>
        <Dialog
          className={tw("lg:max-w-[450px]", className)}
          open={open}
          onClose={handleClose}
          title={
            <div className="flex size-10 items-center justify-center rounded-full bg-primary-25">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary-50">
                <CalendarIcon className="size-4 text-primary-500" />
              </div>
            </div>
          }
        >
          <div className="px-6 pb-4">
            <h3 className="mb-1">
              {t("bookings.extendBookingDialog.extendBooking")}
            </h3>
            <p className="mb-4">
              {t("bookings.extendBookingDialog.changeTheEndDateOf")}
            </p>

            <fetcher.Form ref={zo.ref} method="POST">
              <div className="required-input-label mb-1 text-text-sm font-medium text-gray-700">
                {t("bookings.extendBookingDialog.newEndDate")}
              </div>

              <DateTimePicker
                key={currentEndDate}
                mode="datetime"
                defaultValue={currentEndDate}
                label={t("bookings.extendBookingDialog.endDate")}
                hideLabel
                name={zo.fields.endDate()}
                disabled={disabled || workingHoursDisabled}
                error={
                  validationErrors?.endDate?.message ||
                  zo.errors.endDate()?.message
                }
                className="mb-4 w-full"
                placeholder={t("bookings.extendBookingDialog.booking")}
              />

              <When truthy={!!fetcher?.data?.error}>
                <div className="text-sm text-error-500">
                  {fetcher?.data?.error?.message}
                </div>
                {fetcher.data?.error?.additionalData?.clashingBookings && (
                  <ul className="mb-4 mt-1 list-inside list-disc pl-4">
                    {(
                      fetcher.data.error.additionalData.clashingBookings as {
                        id: string;
                        name: string;
                      }[]
                    ).map((booking) => (
                      <li key={booking.id}>
                        <Button
                          variant="link-gray"
                          className={"text-error-500 no-underline"}
                          target="_blank"
                          to={`/bookings/${booking.id}`}
                        >
                          {booking.name}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </When>

              <WorkingHoursInfo
                workingHoursData={workingHoursData}
                loading={isLoading}
                className="mb-4"
              />
              {error && (
                <p className="mt-1 text-sm text-orange-600">
                  {t(
                    "bookings.extendBookingDialog.workingHoursValidationUnavailable",
                    { error }
                  )}
                </p>
              )}
              <input type="hidden" name="intent" value="extend-booking" />
              <input
                type="hidden"
                name={zo.fields.startDate()}
                value={booking.from.toISOString()}
              />

              <div className="flex items-center gap-2">
                <Button
                  disabled={disabled}
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={handleClose}
                >
                  {t("bookings.extendBookingDialog.cancel")}
                </Button>
                <Button type="submit" className="flex-1" disabled={disabled}>
                  {t("bookings.extendBookingDialog.submit")}
                </Button>
              </div>
            </fetcher.Form>
          </div>
        </Dialog>
      </DialogPortal>
    </>
  );
}
