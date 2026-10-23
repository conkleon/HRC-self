/**
 * Settings > Self-service (`/settings/self-service`)
 *
 * Owners and Administrators turn self-service custody on or off and set the
 * workspace PIN. With it on, anyone who scans an item's QR code without being
 * logged in can, after entering the PIN, take the item into their custody or
 * return it under their NRM name. Managers are emailed about every take and
 * return.
 *
 * The same page sets up the browse list for items without a usable label:
 * what it offers (items with a tag, or stored in chosen locations and their
 * sub-locations), and its secret link (shown as a QR code for a poster),
 * which can be replaced to retire old copies.
 *
 * Gated like the General settings page (`generalSettings`: read to view,
 * update to change), and only offered in team workspaces, where NRMs exist.
 *
 * @see {@link file://./../../modules/self-custody/settings.server.ts}
 * @see {@link file://./../qr+/_public+/$qrId_.self-custody.tsx}
 * @see {@link file://./../self-service+/$token.tsx}
 */
import { OrganizationType } from "@prisma/client";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, useActionData, useLoaderData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";

import { Form } from "~/components/custom-form";
import { ErrorContent } from "~/components/errors";
import Input from "~/components/forms/input";
import type { HeaderData } from "~/components/layout/header/types";
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import { useDisabled } from "~/hooks/use-disabled";
import { PinSchema } from "~/modules/self-custody/schemas";
import {
  browseLinkUrl,
  getSelfCustodySettings,
  listSelfCustodyLocationChoices,
  renderBrowseLinkQr,
  rotateSelfCustodyBrowseToken,
  setSelfCustodyEnabled,
  setSelfCustodyOffer,
  setSelfCustodyPin,
} from "~/modules/self-custody/settings.server";
import { getTagsForAssetTagsFilter } from "~/modules/tag/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { ShelfError, makeShelfError } from "~/utils/error";
import { getValidationErrors } from "~/utils/http";
import type { DataOrErrorResponse } from "~/utils/http.server";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

/** The PIN form: 4 to 8 digits, typed twice. */
export const SetPinSchema = z
  .object({ pin: z.string(), confirmPin: z.string() })
  .superRefine(({ pin, confirmPin }, ctx) => {
    const valid = PinSchema.safeParse(pin);
    if (!valid.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: valid.error.issues[0]?.message ?? "Use 4 to 8 digits",
        path: ["pin"],
      });
    } else if (pin !== confirmPin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The two PINs do not match",
        path: ["confirmPin"],
      });
    }
  });

const IntentSchema = z.object({
  intent: z.enum(["toggle", "set-pin", "set-offer", "rotate-link"]),
});
const ToggleSchema = z.object({ enabled: z.string().optional() });
/** An empty value clears the tag. */
const TagSchema = z.object({ tagId: z.string().optional() });
/** The ticked locations, one `locationIds` entry each; none clears them. */
const LocationIdsSchema = z.array(z.string().min(1));

/** Refuses personal workspaces: they have no NRMs to hand items to. */
function assertTeamWorkspace(type: OrganizationType | undefined) {
  if (type === OrganizationType.PERSONAL) {
    throw new ShelfError({
      cause: null,
      title: "Not available",
      message: "Self-service custody is only available in team workspaces.",
      label: "Settings",
      status: 403,
      shouldBeCaptured: false,
    });
  }
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    const { organizationId, currentOrganization } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.read,
    });
    assertTeamWorkspace(currentOrganization.type);

    const header: HeaderData = { title: "Self-service" };
    const [settings, { tags }, locations] = await Promise.all([
      getSelfCustodySettings(organizationId),
      getTagsForAssetTagsFilter({ organizationId }),
      listSelfCustodyLocationChoices(organizationId),
    ]);
    const browseUrl = settings.browseToken
      ? browseLinkUrl(settings.browseToken)
      : null;
    return payload({
      header,
      settings,
      tags: tags
        .map((tag) => ({ id: tag.id, name: tag.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      locations,
      browseUrl,
      browseQr: browseUrl ? await renderBrowseLinkQr(browseUrl) : null,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();

  try {
    const { organizationId, currentOrganization } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.update,
    });
    assertTeamWorkspace(currentOrganization.type);

    const formData = await request.formData();
    const { intent } = parseData(formData, IntentSchema);

    if (intent === "toggle") {
      const enabled = parseData(formData, ToggleSchema).enabled === "on";
      await setSelfCustodyEnabled({ organizationId, enabled });
      sendNotification({
        title: enabled ? "Self-service turned on" : "Self-service turned off",
        message: enabled
          ? "Volunteers can now take and return items by scanning their QR code."
          : "Scanning a QR code without logging in no longer offers self-service.",
        icon: { name: "success", variant: "success" },
        senderId: userId,
      });
      return data(payload({ success: true }));
    }

    if (intent === "set-offer") {
      const tagId = parseData(formData, TagSchema).tagId || null;
      const locationIds = LocationIdsSchema.parse(
        formData.getAll("locationIds")
      );
      await setSelfCustodyOffer({ organizationId, tagId, locationIds });
      sendNotification({
        title: "Browse list updated",
        message:
          tagId || locationIds.length > 0
            ? "Volunteers see the available items with the tag or in the chosen locations."
            : "The browse list offers no items until you choose a tag or a location.",
        icon: { name: "success", variant: "success" },
        senderId: userId,
      });
      return data(payload({ success: true }));
    }

    if (intent === "rotate-link") {
      await rotateSelfCustodyBrowseToken(organizationId);
      sendNotification({
        title: "New link created",
        message: "Old links and posters no longer work. Print the new QR code.",
        icon: { name: "success", variant: "success" },
        senderId: userId,
      });
      return data(payload({ success: true }));
    }

    const { pin } = parseData(formData, SetPinSchema, {
      additionalData: { userId, organizationId },
      shouldBeCaptured: false,
    });
    await setSelfCustodyPin({ organizationId, pin });
    sendNotification({
      title: "PIN saved",
      message: "Volunteers need the new PIN the next time they scan an item.",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });
    return data(payload({ success: true }));
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export const handle = {
  breadcrumb: () => "Self-service",
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

export const ErrorBoundary = () => <ErrorContent />;

export default function SelfServiceSettings() {
  const { settings, tags, locations, browseUrl, browseQr } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<DataOrErrorResponse>();
  const zo = useZorm("SetPin", SetPinSchema);
  const disabled = useDisabled();

  /** Server-side errors, shown when client-side validation is bypassed. */
  const validationErrors = getValidationErrors<typeof SetPinSchema>(
    actionData?.error
  );
  const formError =
    actionData?.error && !validationErrors ? actionData.error.message : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-md border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold">Self-service custody</h2>
        <p className="mb-4 max-w-2xl text-gray-600">
          Let volunteers without an account take an item into their custody, or
          return it, by scanning its QR code on their own phone. They enter the
          workspace PIN, then pick their name from your non-registered members
          or add it. Owners, Administrators and Managers are emailed about every
          take and return.
        </p>

        {formError ? (
          <p role="alert" className="mb-4 text-sm text-error-600">
            {formError}
          </p>
        ) : null}

        <Form method="post" className="flex items-center gap-4">
          <input type="hidden" name="intent" value="toggle" />
          {settings.enabled ? null : (
            <input type="hidden" name="enabled" value="on" />
          )}
          <p className="text-gray-700">
            Status: <strong>{settings.enabled ? "On" : "Off"}</strong>
          </p>
          <Button
            type="submit"
            variant={settings.enabled ? "secondary" : "primary"}
            disabled={disabled || (!settings.enabled && !settings.hasPin)}
          >
            {settings.enabled ? "Turn off" : "Turn on"}
          </Button>
        </Form>
        {!settings.hasPin ? (
          <p className="mt-2 text-sm text-gray-600">
            Set a PIN below before turning self-service on.
          </p>
        ) : null}
      </section>

      <section className="rounded-md border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold">
          {settings.hasPin ? "Change the PIN" : "Set the PIN"}
        </h2>
        <p className="mb-4 max-w-2xl text-gray-600">
          4 to 8 digits, shared with volunteers at their briefing. Changing it
          signs every volunteer phone out, so they need the new PIN on their
          next scan.
          {settings.pinUpdatedAt ? (
            <>
              {" "}
              Last changed <DateS date={settings.pinUpdatedAt} includeTime />.
            </>
          ) : null}
        </p>

        <Form
          method="post"
          ref={zo.ref}
          className="flex max-w-sm flex-col gap-4"
        >
          <input type="hidden" name="intent" value="set-pin" />
          <Input
            label="New PIN"
            name={zo.fields.pin()}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            required
            error={validationErrors?.pin?.message || zo.errors.pin()?.message}
          />
          <Input
            label="Repeat the PIN"
            name={zo.fields.confirmPin()}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            required
            error={
              validationErrors?.confirmPin?.message ||
              zo.errors.confirmPin()?.message
            }
          />
          <div>
            <Button type="submit" disabled={disabled}>
              {disabled ? "Saving..." : "Save PIN"}
            </Button>
          </div>
        </Form>
      </section>

      <BrowseListSection
        tags={tags}
        tagId={settings.tagId}
        locations={locations}
        locationIds={settings.locationIds}
        browseUrl={browseUrl}
        browseQr={browseQr}
      />
    </div>
  );
}

/**
 * Sets up the browse list: what it offers (a tag, locations) and its link
 * and QR.
 *
 * @param props.tags - The workspace's asset tags, by name
 * @param props.tagId - The chosen tag, null for none
 * @param props.locations - The workspace's locations, in tree order
 * @param props.locationIds - The chosen locations
 * @param props.browseUrl - The current link, null until one is created
 * @param props.browseQr - The link as a PNG data URL, null without a link
 */
function BrowseListSection({
  tags,
  tagId,
  locations,
  locationIds,
  browseUrl,
  browseQr,
}: {
  tags: { id: string; name: string }[];
  tagId: string | null;
  locations: { id: string; name: string; depth: number }[];
  locationIds: string[];
  browseUrl: string | null;
  browseQr: string | null;
}) {
  const disabled = useDisabled();
  const chosenLocations = new Set(locationIds);
  return (
    <section className="rounded-md border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold">Browse list</h2>
      <p className="mb-4 max-w-2xl text-gray-600">
        For items whose QR label is missing or hard to reach. Volunteers open
        the link below, enter the PIN and say who they are. They can take any
        available item that has the chosen tag or is stored in one of the chosen
        locations, and return items they hold themselves.
      </p>

      <Form method="post" className="mb-6 flex max-w-sm flex-col gap-2">
        <input type="hidden" name="intent" value="set-offer" />
        <label htmlFor="self-service-tag" className="font-medium text-gray-700">
          Items with this tag are listed
        </label>
        <select
          id="self-service-tag"
          name="tagId"
          defaultValue={tagId ?? ""}
          aria-describedby="self-service-tag-hint"
          className="rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="">No tag</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <p id="self-service-tag-hint" className="text-sm text-gray-600">
          Add the tag to items from the asset list, one by one or in bulk.
        </p>

        <fieldset
          className="mt-4 flex flex-col gap-2"
          aria-describedby="self-service-locations-hint"
        >
          <legend className="mb-2 font-medium text-gray-700">
            Items in these locations are listed
          </legend>
          {locations.length > 0 ? (
            <div className="max-h-64 overflow-y-auto rounded-md border border-gray-300 px-3 py-2">
              {locations.map((location) => (
                <label
                  key={location.id}
                  className="flex items-center gap-2 py-1 text-gray-700"
                  // why: indents each sub-location under its parent
                  style={{ paddingLeft: `${location.depth * 20}px` }}
                >
                  <input
                    type="checkbox"
                    name="locationIds"
                    value={location.id}
                    defaultChecked={chosenLocations.has(location.id)}
                    className="size-4 rounded border-gray-300"
                  />
                  {location.name}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              This workspace has no locations yet.
            </p>
          )}
          <p id="self-service-locations-hint" className="text-sm text-gray-600">
            Choosing a location includes all its sub-locations. An item is
            listed when it has the tag or is in one of these locations. With no
            tag and no location, the list offers nothing.
          </p>
        </fieldset>

        <div>
          <Button type="submit" disabled={disabled}>
            Save
          </Button>
        </div>
      </Form>

      {browseUrl && browseQr ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <img
            src={browseQr}
            alt="QR code that opens the self-service browse list"
            className="size-40 rounded border border-gray-200"
          />
          <div className="flex min-w-0 flex-col gap-3">
            <p className="break-all text-sm text-gray-700">{browseUrl}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={browseQr}
                download="self-service-list-qr.png"
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Download QR code
              </a>
              <Form method="post">
                <input type="hidden" name="intent" value="rotate-link" />
                <Button type="submit" variant="secondary" disabled={disabled}>
                  Replace link
                </Button>
              </Form>
            </div>
            <p className="text-sm text-gray-600">
              Replacing the link stops the old one and every printed copy.
            </p>
          </div>
        </div>
      ) : (
        <Form method="post">
          <input type="hidden" name="intent" value="rotate-link" />
          <Button type="submit" disabled={disabled}>
            Create link
          </Button>
        </Form>
      )}
    </section>
  );
}
