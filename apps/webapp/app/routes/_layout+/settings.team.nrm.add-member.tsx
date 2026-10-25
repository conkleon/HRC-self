import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useActionData, useNavigation } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { Form } from "~/components/custom-form";
import Input from "~/components/forms/input";
import { UserIcon } from "~/components/icons/library";
import { Button } from "~/components/shared/button";
import { NrmEmailInput } from "~/components/team-member/nrm-email-input";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import { NewOrEditMemberSchema } from "~/modules/team-member/schemas";
import { createTeamMember } from "~/modules/team-member/service.server";
import styles from "~/styles/layout/custom-modal.css?url";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { getValidationErrors } from "~/utils/http";
import { payload, error, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
export const meta = () => [{ title: appendToMetaTitle("Add team member") }];

/**
 * Opens the add-member modal for callers who may create team members.
 *
 * @throws {ShelfError} 403 when the caller lacks `nonRegisteredMember: create`
 */
export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    await requirePermission({
      userId,
      request,
      entity: PermissionEntity.nonRegisteredMember,
      action: PermissionAction.create,
    });

    return payload({
      showModal: true,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

/**
 * The add-member form, plus the flag the inline picker form sends to get the
 * created member back instead of a redirect.
 */
const AddMemberSchema = NewOrEditMemberSchema.extend({
  preventRedirect: z.string().optional(),
});

/**
 * Creates a non-registered team member in the caller's organization.
 *
 * Serves two forms: this route's modal, which redirects to the NRM list, and
 * the inline "create team member" form inside the custodian pickers
 * (`preventRedirect=true`), which gets the new member back to select it.
 *
 * @returns A redirect to the non-registered members list, the created member
 *   for the inline form, or the failure with its status
 */
export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.nonRegisteredMember,
      action: PermissionAction.create,
    });

    const { name, email, preventRedirect } = parseData(
      await request.formData(),
      AddMemberSchema
    );

    const teamMember = await createTeamMember({ name, email, organizationId });

    if (preventRedirect === "true") {
      return data(
        payload({
          success: true,
          teamMember: {
            id: teamMember.id,
            name: teamMember.name,
            email: teamMember.email,
            userId: teamMember.userId,
          },
        })
      );
    }

    sendNotification({
      title: "Successfully added a new team member",
      message: "You are now able to give this team member custody over assets.",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return redirect(`/settings/team/nrm`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export function links() {
  return [{ rel: "stylesheet", href: styles }];
}

export default function AddMember() {
  const zo = useZorm("NewMember", NewOrEditMemberSchema);

  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const disabled = isFormProcessing(navigation.state);

  /** Server-side validation errors, shown when client-side validation is bypassed */
  const validationErrors = getValidationErrors<typeof NewOrEditMemberSchema>(
    actionData?.error
  );

  /** Focus the name field when the modal route mounts (replaces autoFocus). */
  const nameInputRef = useAutoFocus<HTMLInputElement>();

  return (
    <>
      <div className="modal-content-wrapper">
        <div className="mb-4 inline-flex size-8 items-center justify-center  rounded-full bg-primary-100 p-2 text-primary-600">
          <UserIcon />
        </div>
        <div className="mb-5">
          <h4>Add team member</h4>
          <p>
            Team members are added to your environment but do not have an
            account to log in with.
          </p>
        </div>
        <Form method="post" ref={zo.ref}>
          <Input
            ref={nameInputRef}
            name={zo.fields.name()}
            type="text"
            label="Name"
            className="mb-4"
            placeholder="Enter team member’s name"
            required
            error={validationErrors?.name?.message || zo.errors.name()?.message}
            disabled={disabled}
          />
          <NrmEmailInput
            name={zo.fields.email()}
            className="mb-8"
            error={
              validationErrors?.email?.message || zo.errors.email()?.message
            }
            disabled={disabled}
          />
          <Button
            variant="primary"
            width="full"
            type="submit"
            disabled={disabled}
          >
            Add team member
          </Button>
        </Form>
        {actionData?.error && (
          <div className="text-sm text-error-500">
            {actionData.error.message}
          </div>
        )}
      </div>
    </>
  );
}
