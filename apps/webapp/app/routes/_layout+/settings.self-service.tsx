/**
 * Settings > Self-service (`/settings/self-service`)
 *
 * Owners and Administrators turn self-service custody on or off and set the
 * workspace PIN. With it on, anyone who scans an item's QR code without being
 * logged in can, after entering the PIN, take the item into their custody or
 * return it under their NRM name. Managers are emailed about every take and
 * return.
 *
 * Gated like the General settings page (`generalSettings`: read to view,
 * update to change), and only offered in team workspaces, where NRMs exist.
 *
 * @see {@link file://./../../modules/self-custody/settings.server.ts}
 * @see {@link file://./../qr+/_public+/$qrId_.self-custody.tsx}
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
  getSelfCustodySettings,
  setSelfCustodyEnabled,
  setSelfCustodyPin,
} from "~/modules/self-custody/settings.server";
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

const IntentSchema = z.object({ intent: z.enum(["toggle", "set-pin"]) });
const ToggleSchema = z.object({ enabled: z.string().optional() });

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
    return payload({
      header,
      settings: await getSelfCustodySettings(organizationId),
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
  const { settings } = useLoaderData<typeof loader>();
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
    </div>
  );
}
