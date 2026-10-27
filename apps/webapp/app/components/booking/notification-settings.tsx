/**
 * Workspace-level booking notification settings component.
 *
 * Rendered in Settings > Bookings. Provides three controls for configuring
 * who receives email notifications for bookings across the entire workspace:
 *
 * 1. **Notify booking creator** — auto-submit toggle
 * 2. **Notify on new booking requests**: auto-submit toggle
 * 3. **Always notify these users** — DynamicDropdown picker with explicit save
 *
 * @module
 */
import { useCallback, useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { useZorm } from "react-zorm";
import z from "zod";
import DynamicDropdown from "~/components/dynamic-dropdown/dynamic-dropdown";
import FormRow from "~/components/forms/form-row";
import { Switch } from "~/components/forms/switch";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { Spinner } from "~/components/shared/spinner";
import { useDisabled } from "~/hooks/use-disabled";
import type { ModelFilterItem } from "~/hooks/use-model-filters";
import {
  PICKABLE_RECIPIENT_AUDIENCE,
  RESERVATION_AUDIENCE,
} from "~/utils/permissions/role-audience";
import { resolveTeamMemberName } from "~/utils/user";
import { NotificationPreview } from "./notification-preview";

/** Zod schema for the "notify booking creator" toggle form. */
export const NotifyBookingCreatorSchema = z.object({
  notifyBookingCreator: z
    .string()
    .transform((val) => val === "on")
    .default("false"),
});

/** Zod schema for the "notify admins on new booking" toggle form. */
export const NotifyAdminsOnNewBookingSchema = z.object({
  notifyAdminsOnNewBooking: z
    .string()
    .transform((val) => val === "on")
    .default("false"),
});

/** Subset of workspace booking settings relevant to notification configuration. */
type BookingSettings = {
  notifyBookingCreator: boolean;
  notifyAdminsOnNewBooking: boolean;
  alwaysNotifyTeamMembers: Array<{ id: string; name: string }>;
};

/**
 * Workspace-level notification settings card.
 *
 * @param bookingSettings - Current workspace-level notification settings
 */
export function NotificationSettings({
  bookingSettings,
}: {
  bookingSettings: BookingSettings;
}) {
  const { t } = useTranslation();
  const creatorFetcher = useFetcher();
  const adminsFetcher = useFetcher();
  const alwaysNotifyFetcher = useFetcher();

  const creatorZo = useZorm(
    "NotifyBookingCreatorForm",
    NotifyBookingCreatorSchema
  );
  const adminsZo = useZorm(
    "NotifyAdminsOnNewBookingForm",
    NotifyAdminsOnNewBookingSchema
  );

  const creatorDisabled = useDisabled(creatorFetcher);
  const adminsDisabled = useDisabled(adminsFetcher);
  const alwaysNotifyDisabled = useDisabled(alwaysNotifyFetcher);

  // Track both current and initial selection to detect unsaved changes
  const initialIds = bookingSettings.alwaysNotifyTeamMembers.map((tm) => tm.id);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const hasUnsavedChanges =
    selectedIds.length !== initialIds.length ||
    selectedIds.some((id) => !initialIds.includes(id));

  // Name map for the preview — seeded from saved always-notify members,
  // updated as new members are selected in the dropdown
  const [selectedNameMap, setSelectedNameMap] = useState<Map<string, string>>(
    () => {
      const map = new Map<string, string>();
      bookingSettings.alwaysNotifyTeamMembers.forEach((tm) =>
        map.set(tm.id, resolveTeamMemberName(tm))
      );
      return map;
    }
  );

  /** Render dropdown items and capture names for the preview */
  const renderItem = useCallback(
    (item: ModelFilterItem) => {
      const name = resolveTeamMemberName(item, true);
      if (!selectedNameMap.has(item.id)) {
        queueMicrotask(() => {
          setSelectedNameMap((prev) => {
            if (prev.has(item.id)) return prev;
            const next = new Map(prev);
            next.set(item.id, resolveTeamMemberName(item));
            return next;
          });
        });
      }
      return name;
    },
    [selectedNameMap]
  );

  /** Remove a member via the preview X button */
  const handleRemove = useCallback((tmId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== tmId));
  }, []);

  /** Build preview list from selected IDs */
  const previewRecipients = useMemo(
    () =>
      selectedIds.map((tmId) => ({
        id: tmId,
        name: selectedNameMap.get(tmId) ?? tmId,
        reason: "always_notify" as const,
      })),
    [selectedIds, selectedNameMap]
  );

  return (
    <Card className="mt-0 overflow-visible">
      <div className="mb-4 border-b pb-4">
        <h3 className="text-text-lg font-semibold">
          {t("bookings.notificationSettings.emailNotificationRecipients")}
        </h3>
        <p className="text-sm text-gray-600">
          {t("bookings.notificationSettings.theBookingCustodianAlwaysReceives")}
        </p>
      </div>

      {/* Toggle: Notify booking creator */}
      <creatorFetcher.Form
        ref={creatorZo.ref}
        method="post"
        onChange={(e) => {
          void creatorFetcher.submit(e.currentTarget);
        }}
      >
        <FormRow
          rowLabel={t("bookings.notificationSettings.notifyBookingCreator")}
          subHeading={
            <div>
              {t("bookings.notificationSettings.whenSomeoneCreatesABooking")}
            </div>
          }
          className="border-b-0 pb-[10px] pt-0"
        >
          <div className="flex flex-col items-center gap-2">
            <Switch
              name={creatorZo.fields.notifyBookingCreator()}
              disabled={creatorDisabled}
              defaultChecked={bookingSettings.notifyBookingCreator}
              title={t("bookings.notificationSettings.notifyBookingCreator")}
            />
          </div>
        </FormRow>
        <input type="hidden" value="updateNotifyBookingCreator" name="intent" />
      </creatorFetcher.Form>

      {/* Toggle: notify the reservation audience on new booking requests */}
      <adminsFetcher.Form
        ref={adminsZo.ref}
        method="post"
        onChange={(e) => {
          void adminsFetcher.submit(e.currentTarget);
        }}
      >
        <FormRow
          rowLabel={t("bookings.notificationSettings.notifyAllOnNewBooking", {
            RESERVATION_AUDIENCE,
          })}
          subHeading={
            <div>
              {t("bookings.notificationSettings.whenABookingIsReserved", {
                RESERVATION_AUDIENCE,
              })}
            </div>
          }
          className="border-b-0 pb-[10px] pt-0"
        >
          <div className="flex flex-col items-center gap-2">
            <Switch
              name={adminsZo.fields.notifyAdminsOnNewBooking()}
              disabled={adminsDisabled}
              defaultChecked={bookingSettings.notifyAdminsOnNewBooking}
              title={t("bookings.notificationSettings.notifyAllOnNewBooking", {
                RESERVATION_AUDIENCE,
              })}
            />
          </div>
        </FormRow>
        <input
          type="hidden"
          value="updateNotifyAdminsOnNewBooking"
          name="intent"
        />
      </adminsFetcher.Form>

      {/* DynamicDropdown picker: Always notify these users */}
      <alwaysNotifyFetcher.Form method="post">
        <FormRow
          rowLabel={t("bookings.notificationSettings.alwaysNotifyTheseUsers")}
          subHeading={
            <div>
              {t("bookings.notificationSettings.theseUsersReceiveAllBooking")}
            </div>
          }
          className="mt-4 border-b-0 pb-[10px] pt-0"
        >
          <div className="w-full md:w-[512px]">
            <DynamicDropdown
              key={selectedIds.join(",")}
              trigger={
                <div className="flex h-10 w-full items-center justify-between rounded border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50">
                  <span className="truncate text-gray-500">
                    {selectedIds.length > 0
                      ? `${selectedIds.length} user${
                          selectedIds.length !== 1 ? "s" : ""
                        } selected`
                      : t("bookings.notificationSettings.selectUsers")}
                  </span>
                  <ChevronDownIcon className="size-4 shrink-0 text-gray-400" />
                </div>
              }
              triggerWrapperClassName="w-full"
              hideCounter
              className="w-full"
              style={{ width: "var(--radix-popover-trigger-width)" }}
              model={{
                name: "teamMember",
                queryKey: "name",
                deletedAt: null,
                selectableRecipientsOnly: true,
                usersOnly: true,
                // why: no `custodyPurpose` on purpose. This picks members to
                // notify (neither custody nor a booking custodian), and
                // `selectableRecipientsOnly` already narrows to members who
                // may be picked as recipients. The endpoint's assignment
                // fallback resolves to "all" for the members who reach this
                // settings page, and fails closed for anyone else, which is
                // what we want here.
              }}
              initialDataKey="teamMembersForNotify"
              countKey="totalTeamMembersForNotify"
              selectionMode="none"
              defaultValues={selectedIds}
              onSelectionChange={setSelectedIds}
              renderItem={renderItem}
              label={t("bookings.notificationSettings.alwaysNotify")}
              placeholder={t("bookings.notificationSettings.searchTeamMembers")}
            />

            <p className="mt-1.5 text-[13px] text-gray-500">
              {t("bookings.notificationSettings.onlyCanBeAdded", {
                PICKABLE_RECIPIENT_AUDIENCE,
              })}
            </p>

            {hasUnsavedChanges ? (
              <p className="mt-1.5 text-[13px] font-medium text-warning-600">
                {t("bookings.notificationSettings.youHaveUnsavedChanges")}
              </p>
            ) : null}

            {/* Hidden input for form submission */}
            <input
              type="hidden"
              name="alwaysNotifyTeamMemberIds"
              value={selectedIds.join(",")}
            />

            <NotificationPreview
              recipients={previewRecipients}
              adminCount={0}
              notifyAdminsOnNewBooking={false}
              onRemoveRecipient={handleRemove}
            />
          </div>
        </FormRow>

        <div className="text-right">
          <Button
            type="submit"
            disabled={alwaysNotifyDisabled}
            value="updateAlwaysNotifyTeamMembers"
            name="intent"
          >
            {alwaysNotifyDisabled ? (
              <Spinner />
            ) : (
              t("bookings.notificationSettings.saveNotificationSettings")
            )}
          </Button>
        </div>
      </alwaysNotifyFetcher.Form>
    </Card>
  );
}
