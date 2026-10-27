import { BookingStatus } from "@prisma/client";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  formatOverdueDuration,
  getLatenessMs,
} from "~/modules/booking/lateness";
import { ONE_DAY, ONE_HOUR } from "~/utils/constants";

export function TimeRemaining({
  to,
  from,
  status,
}: {
  to: Date;
  from: Date;
  status: BookingStatus;
}) {
  const { t } = useTranslation();
  const currentDate = new Date();

  // For these statuses, don't render anything (using direct comparison)
  if (
    status === BookingStatus.COMPLETE ||
    status === BookingStatus.ARCHIVED ||
    status === BookingStatus.CANCELLED
  ) {
    return null;
  }

  // For DRAFT and RESERVED, show time until start
  const isUpcoming =
    status === BookingStatus.DRAFT || status === BookingStatus.RESERVED;

  // Determine which date to use for calculation
  const targetDate = isUpcoming ? from : to;
  const remainingMs = targetDate.getTime() - currentDate.getTime();

  // Handle case where time has already passed
  if (remainingMs < 0) {
    // For OVERDUE status, show how long it's been overdue. Math is delegated
    // to the central helper so the duration formatting matches every other
    // lateness surface.
    if (status === BookingStatus.OVERDUE) {
      const overdueMs =
        getLatenessMs({
          status: BookingStatus.OVERDUE,
          // This badge answers "how far past your CURRENT deadline are you",
          // so it measures against the live `to` — an extension moves that
          // date and the countdown must follow it. Compliance reporting asks
          // the other question and measures against the planned end instead.
          scheduledEnd: to,
          checkInAt: null,
          now: currentDate,
        }) ?? 0;
      const {
        days: overdueDays,
        hours: overdueHours,
        minutes: overdueMinutes,
      } = formatOverdueDuration(overdueMs);

      return (
        <div className="flex items-center text-sm text-gray-600 md:ml-4 [&_span]:whitespace-nowrap">
          <Clock className="mr-1 size-4 text-gray-400" />
          <span className="font-medium text-gray-900">
            {t("bookings.timeRemaining.overdueByDays", { overdueDays })}
          </span>
          {overdueHours > 0 && (
            <>
              <span className="mx-1">·</span>
              <span>{t("bookings.timeRemaining.hours", { overdueHours })}</span>
            </>
          )}
          {overdueMinutes > 0 && (
            <>
              <span className="mx-1">·</span>
              <span>
                {t("bookings.timeRemaining.minutes", { overdueMinutes })}
              </span>
            </>
          )}
        </div>
      );
    }

    return null; // For other statuses where time has passed, don't show anything
  }

  // Calculate time units
  const remainingDays = Math.floor(remainingMs / ONE_DAY);
  const remainingHours = Math.floor((remainingMs % ONE_DAY) / ONE_HOUR);
  const remainingMinutes = Math.floor((remainingMs % ONE_HOUR) / (1000 * 60));

  // For upcoming bookings (DRAFT, RESERVED)
  if (isUpcoming) {
    return (
      <div className="flex items-center text-sm text-gray-600 md:ml-4 [&_span]:whitespace-nowrap">
        <Clock className="mr-1 size-4 text-gray-400" />
        <span className="font-medium text-gray-900">
          {t("bookings.timeRemaining.startsInDays", { remainingDays })}
        </span>
        {remainingHours > 0 && (
          <>
            <span className="mx-1">·</span>
            <span>
              {t("bookings.timeRemaining.hours2", { remainingHours })}
            </span>
          </>
        )}
        {remainingMinutes > 0 && (
          <>
            <span className="mx-1">·</span>
            <span>
              {t("bookings.timeRemaining.minutes2", { remainingMinutes })}
            </span>
          </>
        )}
      </div>
    );
  }

  // For ONGOING status
  return (
    <div className="flex items-center text-sm text-gray-600 md:ml-4 [&_span]:whitespace-nowrap">
      <Clock className="mr-1 size-4 text-gray-400" />
      <span className="font-medium text-gray-900">
        {t("bookings.timeRemaining.days", { remainingDays })}
      </span>
      {remainingHours > 0 && (
        <>
          <span className="mx-1">·</span>
          <span>{t("bookings.timeRemaining.hours2", { remainingHours })}</span>
        </>
      )}
      {remainingMinutes > 0 && (
        <>
          <span className="mx-1">·</span>
          <span>
            {t("bookings.timeRemaining.minutes2", { remainingMinutes })}
          </span>
        </>
      )}
      <span className="ml-1">{t("bookings.timeRemaining.remaining")}</span>
    </div>
  );
}
