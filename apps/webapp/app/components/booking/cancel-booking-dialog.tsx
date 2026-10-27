import { useTranslation } from "react-i18next";
import { useActionData } from "react-router";
import { useZorm } from "react-zorm";
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
import { useDisabled } from "~/hooks/use-disabled";
import { getValidationErrors } from "~/utils/http";
import type { DataOrErrorResponse } from "~/utils/http.server";
import { tw } from "~/utils/tw";
import { Form } from "../custom-form";
import { CancelBookingSchema } from "./forms/forms-schema";
import { AlertIcon } from "../icons/library";

type CancelBookingDialogProps = {
  bookingName: string;
};

export function CancelBookingDialog({ bookingName }: CancelBookingDialogProps) {
  const { t } = useTranslation();
  const disabled = useDisabled();
  const zo = useZorm("CancelBooking", CancelBookingSchema);
  const actionData = useActionData<DataOrErrorResponse>();

  /** This handles server side errors in case client side validation fails */
  const validationErrors = getValidationErrors<typeof CancelBookingSchema>(
    actionData?.error
  );

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="link"
          className="justify-start rounded-sm px-2 py-1.5 text-sm font-medium text-gray-700 outline-none hover:bg-slate-100 hover:text-gray-700"
          width="full"
        >
          {t("bookings.cancelBookingDialog.cancel")}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto md:m-0">
            <span className="flex size-12 items-center justify-center rounded-full bg-error-50 p-2 text-error-600">
              <AlertIcon />
            </span>
          </div>
          <AlertDialogTitle>
            {t("bookings.cancelBookingDialog.cancel2", { bookingName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("bookings.cancelBookingDialog.areYouSureYouWant")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form method="post" ref={zo.ref}>
          <input type="hidden" name="intent" value="cancel" />
          <div className="mb-4">
            <label
              htmlFor="cancellationReason"
              className="mb-1 block text-left text-[14px] font-medium text-gray-700"
            >
              {t("bookings.cancelBookingDialog.cancellationReason")}{" "}
              <span className="font-normal text-gray-500">
                {t("bookings.cancelBookingDialog.optional")}
              </span>
            </label>
            <textarea
              id="cancellationReason"
              name={zo.fields.cancellationReason()}
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-primary-500 focus:ring-primary-500"
              placeholder={t(
                "bookings.cancelBookingDialog.letTheCustodianKnowWhy"
              )}
              disabled={disabled}
              aria-describedby="cancellationReason-description"
            />
            {(validationErrors?.cancellationReason?.message ||
              zo.errors.cancellationReason()?.message) && (
              <p className="text-sm text-error-500">
                {validationErrors?.cancellationReason?.message ||
                  zo.errors.cancellationReason()?.message}
              </p>
            )}
            <p
              id="cancellationReason-description"
              className="-mt-1 text-text-sm text-gray-500"
            >
              {t("bookings.cancelBookingDialog.ifTheCustodianHasAn")}
            </p>
          </div>
          <AlertDialogFooter>
            <div className="flex justify-center gap-2">
              <AlertDialogCancel asChild>
                <Button type="button" variant="secondary" disabled={disabled}>
                  {t("bookings.cancelBookingDialog.goBack")}
                </Button>
              </AlertDialogCancel>
              <Button
                type="submit"
                className={tw(
                  "border-error-600 bg-error-600 hover:border-error-800 hover:bg-error-800"
                )}
                disabled={disabled}
              >
                {t("bookings.cancelBookingDialog.cancelBooking")}
              </Button>
            </div>
          </AlertDialogFooter>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
