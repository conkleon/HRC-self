/**
 * NRM Email Input
 *
 * The optional email field of every staff-facing form that creates or edits a
 * non-registered member (Settings and the inline "create team member" form in
 * the custodian pickers). The hint is linked with `aria-describedby`, so a
 * screen reader announces what the address is used for.
 *
 * @see {@link file://./new-team-member-form.tsx}
 * @see {@link file://./../../modules/team-member/schemas.ts}
 */
import { forwardRef, useId } from "react";
import Input from "~/components/forms/input";
import { tw } from "~/utils/tw";

/** Props for {@link NrmEmailInput}. */
type NrmEmailInputProps = {
  /** Field name, from the form's zorm `fields.email()` */
  name: string;
  /** Validation error to show under the field */
  error?: string;
  disabled?: boolean;
  /** The stored email when editing an existing member */
  defaultValue?: string | null;
  /** Class name for the wrapper element */
  className?: string;
};

/** Optional email input for a non-registered member, with its usage hint. */
export const NrmEmailInput = forwardRef<HTMLInputElement, NrmEmailInputProps>(
  function NrmEmailInput(
    { name, error, disabled, defaultValue, className },
    ref
  ) {
    const hintId = useId();

    return (
      <div className={tw("flex flex-col gap-1", className)}>
        <Input
          ref={ref}
          name={name}
          type="email"
          autoComplete="off"
          label="Email (optional)"
          placeholder="name@example.com"
          defaultValue={defaultValue ?? undefined}
          error={error}
          disabled={disabled}
          aria-describedby={hintId}
        />
        <p id={hintId} className="text-xs text-gray-600">
          Booking emails go to this address. It does not give them an account.
        </p>
      </div>
    );
  }
);
