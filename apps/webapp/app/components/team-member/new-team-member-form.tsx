/**
 * New Team Member Form (inline)
 *
 * Creates a non-registered member from inside a custodian picker, so staff can
 * hand a booking or custody to someone who is not on the list yet without
 * leaving the page. Posts to the Settings add-member action with
 * `preventRedirect=true`, which answers with the created member instead of a
 * redirect; the picker then selects it.
 *
 * @see {@link file://./../../routes/_layout+/settings.team.nrm.add-member.tsx}
 * @see {@link file://./../inline-entity-creation-dialog/inline-entity-creation-dialog.tsx}
 */
import { useEffect } from "react";
import { useZorm } from "react-zorm";
import Input from "~/components/forms/input";
import { Button } from "~/components/shared/button";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import { useDisabled } from "~/hooks/use-disabled";
import useFetcherWithReset from "~/hooks/use-fetcher-with-reset";
import { NewOrEditMemberSchema } from "~/modules/team-member/schemas";
import type { action } from "~/routes/_layout+/settings.team.nrm.add-member";
import { getValidationErrors } from "~/utils/http";
import { NrmEmailInput } from "./nrm-email-input";

/** The member the add-member action returns to the inline form. */
export type CreatedTeamMember = {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
};

/** Props for {@link NewTeamMemberForm}. */
type NewTeamMemberFormProps = {
  /** Closes the surrounding dialog without creating anyone */
  onCancel: () => void;
  /** Receives the created member */
  onSuccess: (teamMember: CreatedTeamMember) => void;
};

/** Inline form that creates a non-registered member with an optional email. */
export function NewTeamMemberForm({
  onCancel,
  onSuccess,
}: NewTeamMemberFormProps) {
  const zo = useZorm("InlineNewTeamMember", NewOrEditMemberSchema);
  const fetcher = useFetcherWithReset<typeof action>();
  const disabled = useDisabled(fetcher);
  const nameInputRef = useAutoFocus<HTMLInputElement>();

  useEffect(() => {
    // Test the value, not the key: `payload()` stamps `error: null` on success.
    if (
      fetcher.data &&
      "teamMember" in fetcher.data &&
      fetcher.data.teamMember
    ) {
      onSuccess(fetcher.data.teamMember);
      fetcher.reset();
    }
  }, [fetcher, onSuccess]);

  /** Server-side validation errors, shown when client-side validation is bypassed */
  const validationErrors = getValidationErrors<typeof NewOrEditMemberSchema>(
    fetcher.data?.error
  );

  return (
    <fetcher.Form
      method="post"
      action="/settings/team/nrm/add-member"
      ref={zo.ref}
      className="flex w-full flex-col gap-4"
    >
      <input type="hidden" name="preventRedirect" value="true" />
      <Input
        ref={nameInputRef}
        name={zo.fields.name()}
        type="text"
        label="Name"
        placeholder="Enter team member’s name"
        required
        data-dialog-initial-focus
        error={validationErrors?.name?.message || zo.errors.name()?.message}
        disabled={disabled}
      />
      <NrmEmailInput
        name={zo.fields.email()}
        error={validationErrors?.email?.message || zo.errors.email()?.message}
        disabled={disabled}
      />

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={onCancel}
          disabled={disabled}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" className="flex-1" disabled={disabled}>
          {disabled ? "Creating..." : "Create"}
        </Button>
      </div>

      {fetcher.data?.error && !validationErrors ? (
        <p className="text-sm text-error-500" role="alert">
          {fetcher.data.error.message}
        </p>
      ) : null}
    </fetcher.Form>
  );
}
