/**
 * Kit Status Badge
 *
 * The chip that names a kit's state, plus the pure label/colour mappings behind
 * it. Rendered on the kits index, the kit detail header, the location kit
 * lists, and beside a booking's kit rows — where it sits directly above the
 * member assets' own status badges.
 *
 * A kit holding an item marked unavailable for bookings cannot be booked, so
 * it never reads "Available": that label becomes a grey "Unavailable", like
 * the asset badge. Any other status (in custody, checked out) is still shown,
 * with the unavailable icon beside it.
 *
 * @see {@link file://./../assets/asset-status-badge/status-labels.ts} — the
 *   asset-side pair of the same two mappings
 */

import { KitStatus } from "@prisma/client";
import { ASSET_UNAVAILABLE_LABEL, KIT_STATUS_LABELS } from "@shelf/labels";
import { useTranslation } from "react-i18next";
import { useLabel } from "~/i18n/use-label";
import { BADGE_COLORS, type BadgeColorScheme } from "~/utils/badge-colors";
import type { ExtendedKitStatus } from "~/utils/booking-assets";
import { Badge } from "../shared/badge";
import { UnavailableBadge } from "../shared/unavailable-badge";

/**
 * Maps a kit status — including the booking-derived `PARTIALLY_CHECKED_IN`
 * pseudo-status — to its user-facing label.
 *
 * Every string comes from the shared `@shelf/labels` package, so the companion
 * app's kit badges cannot word a state differently from the website's.
 *
 * @param status The persisted `KitStatus`, or a booking-context pseudo-status
 * @returns Short human-readable label suitable for a badge
 */
export function userFriendlyKitStatus(status: ExtendedKitStatus) {
  switch (status) {
    case KitStatus.IN_CUSTODY:
      return KIT_STATUS_LABELS.IN_CUSTODY;
    case KitStatus.CHECKED_OUT:
      return KIT_STATUS_LABELS.CHECKED_OUT;
    case "PARTIALLY_CHECKED_IN":
      return KIT_STATUS_LABELS.PARTIALLY_CHECKED_IN;
    default:
      return KIT_STATUS_LABELS.AVAILABLE;
  }
}

/**
 * Maps a kit status to its badge colour scheme. Pairs with
 * {@link userFriendlyKitStatus}.
 */
export const kitStatusColorMap = (
  status: ExtendedKitStatus
): BadgeColorScheme => {
  switch (status) {
    case KitStatus.IN_CUSTODY:
      return BADGE_COLORS.blue;
    case "PARTIALLY_CHECKED_IN":
      return BADGE_COLORS.blue;
    case KitStatus.CHECKED_OUT:
      return BADGE_COLORS.violet;
    default:
      // AVAILABLE
      return BADGE_COLORS.green;
  }
};

/**
 * Renders a kit's status chip, followed by an "unavailable" marker when the kit
 * cannot be booked.
 *
 * @param status The kit's status in the surface's context
 * @param availableToBook Whether every asset in the kit is bookable; `false`
 *   adds the explanatory unavailable badge beside the status
 */
export function KitStatusBadge({
  status,
  availableToBook = true,
}: {
  status: ExtendedKitStatus;
  availableToBook: boolean;
}) {
  const { t } = useTranslation();
  const translate = useLabel();
  const title = t("kits.kitStatusBadge.unavailableTitle");
  if (!availableToBook && status === KitStatus.AVAILABLE) {
    return (
      <div className="flex items-center gap-[6px]" title={title}>
        <Badge color={BADGE_COLORS.gray.bg} textColor={BADGE_COLORS.gray.text}>
          {translate(ASSET_UNAVAILABLE_LABEL)}
        </Badge>
      </div>
    );
  }

  const colors = kitStatusColorMap(status);
  return (
    <div className="flex items-center gap-[6px]">
      <Badge color={colors.bg} textColor={colors.text}>
        {translate(userFriendlyKitStatus(status))}
      </Badge>
      {!availableToBook && <UnavailableBadge title={title} />}
    </div>
  );
}
