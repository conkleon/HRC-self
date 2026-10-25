/**
 * Self-Service Custody Steps
 *
 * The screens a volunteer moves through on the public self-service pages:
 * PIN entry, picking or adding their name, confirming a take or a return,
 * and the result. Presentational only; every form posts to the route's
 * action, which decides everything on the server.
 *
 * @see {@link file://./../../routes/qr+/_public+/$qrId_.self-custody.tsx}
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 */
import { useId, useReducer, useRef } from "react";
import { Form, useFetcher } from "react-router";

import Input from "~/components/forms/input";
import { Button } from "~/components/shared/button";
import { useDisabled } from "~/hooks/use-disabled";

/** A volunteer as the search returns them. */
type Volunteer = { id: string; name: string };

/** The item the page is about. */
export type SelfCustodyItem = {
  title: string;
  locationName: string | null;
};

/** Error text shown under a form, from the action. */
type ErrorProps = { error?: string | null };

/** Title and location of the scanned item. */
export function ItemCard({ item }: { item: SelfCustodyItem }) {
  return (
    <div className="mb-6 rounded-md border border-gray-200 bg-white p-4 text-left">
      <p className="text-lg font-semibold text-gray-900">{item.title}</p>
      {item.locationName ? (
        <p className="text-sm text-gray-600">Location: {item.locationName}</p>
      ) : null}
    </div>
  );
}

/** Red message for an action error that is not tied to one field. */
export function FormError({ error }: ErrorProps) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-4 text-sm text-error-600">
      {error}
    </p>
  );
}

/**
 * Asks for the workspace PIN before anything else is shown.
 *
 * @param props.error - Message from a failed attempt
 */
export function PinForm({ error }: ErrorProps) {
  const disabled = useDisabled();
  return (
    <Form method="post" className="text-left">
      <input type="hidden" name="intent" value="unlock" />
      <Input
        label="Workspace PIN"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        required
        error={error ?? undefined}
        className="mb-4"
      />
      <p className="mb-4 text-sm text-gray-600">
        Ask your team leader for the PIN. You only need to enter it once every
        12 hours on this phone.
      </p>
      <Button type="submit" disabled={disabled} className="w-full max-w-full">
        {disabled ? "Checking..." : "Continue"}
      </Button>
    </Form>
  );
}

type PickerState = {
  query: string;
  selected: Volunteer | null;
  addingNew: boolean;
};

type PickerAction =
  | { type: "typed"; query: string }
  | { type: "picked"; volunteer: Volunteer }
  | { type: "add_new" }
  | { type: "back" };

function pickerReducer(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case "typed":
      return { ...state, query: action.query, selected: null };
    case "picked":
      return { ...state, selected: action.volunteer };
    case "add_new":
      return { ...state, addingNew: true, selected: null };
    case "back":
      return { query: state.query, selected: null, addingNew: false };
  }
}

/**
 * Lets the volunteer find their name (3 letters or more) or add it.
 *
 * With an `itemTitle` (the scan page) the last step takes that item: intents
 * `take` and `take-new`. Without one (the browse page) it only says who the
 * volunteer is: a found name continues with `?member=<id>`, a new name posts
 * intent `add-me`.
 *
 * @param props.itemTitle - The item to take, shown on the confirm button
 * @param props.error - Message from a failed take or add
 * @param props.nameError - Validation message for a new name
 * @param props.emailError - Validation message for a new volunteer's optional email
 */
export function VolunteerPicker({
  itemTitle,
  error,
  nameError,
  emailError,
}: {
  itemTitle?: string;
  error?: string | null;
  nameError?: string | null;
  emailError?: string | null;
}) {
  const search = useFetcher<{ volunteers?: Volunteer[] }>();
  const [state, dispatch] = useReducer(pickerReducer, {
    query: "",
    selected: null,
    // A field error means the "add me" form was just submitted.
    addingNew: Boolean(nameError || emailError),
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabled = useDisabled();
  const emailHintId = useId();

  const onType = (query: string) => {
    dispatch({ type: "typed", query });
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) return;
    timer.current = setTimeout(() => {
      void search.submit({ intent: "search", q: query }, { method: "post" });
    }, 250);
  };

  if (state.addingNew) {
    return (
      <Form method="post" className="text-left">
        <input
          type="hidden"
          name="intent"
          value={itemTitle ? "take-new" : "add-me"}
        />
        <FormError error={error} />
        <Input
          label="Your full name"
          name="name"
          autoComplete="name"
          required
          minLength={2}
          maxLength={60}
          defaultValue={state.query}
          error={nameError ?? undefined}
          className="mb-4"
        />
        <Input
          label="Your email (optional)"
          name="email"
          type="email"
          autoComplete="email"
          error={emailError ?? undefined}
          aria-describedby={emailHintId}
        />
        <p id={emailHintId} className="mb-4 mt-1 text-sm text-gray-600">
          Add it to get your booking details by email. You can leave it empty.
        </p>
        <Button
          type="submit"
          disabled={disabled}
          className="mb-3 w-full max-w-full"
        >
          {disabled
            ? "Saving..."
            : itemTitle
            ? `Take ${itemTitle}`
            : "Continue"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full max-w-full"
          onClick={() => dispatch({ type: "back" })}
        >
          Back to search
        </Button>
      </Form>
    );
  }

  const volunteers =
    state.query.trim().length >= 3 ? search.data?.volunteers ?? [] : [];
  const searched = state.query.trim().length >= 3 && search.state === "idle";

  return (
    <div className="text-left">
      <FormError error={error} />
      <Input
        label="Find your name"
        name="q"
        autoComplete="off"
        placeholder="Type at least 3 letters"
        value={state.query}
        onChange={(event) => onType(event.target.value)}
        className="mb-3"
      />

      {volunteers.length > 0 ? (
        <ul aria-label="Matching names" className="mb-4 flex flex-col gap-2">
          {volunteers.map((volunteer) => (
            <li key={volunteer.id}>
              <Button
                type="button"
                variant={
                  state.selected?.id === volunteer.id ? "primary" : "secondary"
                }
                aria-pressed={state.selected?.id === volunteer.id}
                className="w-full max-w-full justify-start"
                onClick={() => dispatch({ type: "picked", volunteer })}
              >
                {volunteer.name}
              </Button>
            </li>
          ))}
        </ul>
      ) : searched && search.data ? (
        <p className="mb-4 text-sm text-gray-600">No one by that name yet.</p>
      ) : null}

      {state.selected && !itemTitle ? (
        <Form method="get" className="mb-4">
          <input type="hidden" name="member" value={state.selected.id} />
          <Button
            type="submit"
            disabled={disabled}
            className="w-full max-w-full"
          >
            {`Continue as ${state.selected.name}`}
          </Button>
        </Form>
      ) : state.selected ? (
        <Form method="post" className="mb-4">
          <input type="hidden" name="intent" value="take" />
          <input type="hidden" name="teamMemberId" value={state.selected.id} />
          <Button
            type="submit"
            disabled={disabled}
            className="w-full max-w-full"
          >
            {disabled
              ? "Saving..."
              : `Take ${itemTitle} as ${state.selected.name}`}
          </Button>
        </Form>
      ) : null}

      <Button
        type="button"
        variant="link"
        onClick={() => dispatch({ type: "add_new" })}
      >
        I'm not on the list, add me
      </Button>
    </div>
  );
}

/**
 * Shows who holds the item and lets them return it.
 *
 * @param props.holderName - Who has the item now
 * @param props.error - Message from a failed return
 */
export function ReturnPanel({
  holderName,
  error,
}: {
  holderName: string;
  error?: string | null;
}) {
  const disabled = useDisabled();
  return (
    <Form method="post" className="text-left">
      <input type="hidden" name="intent" value="return" />
      <FormError error={error} />
      <p className="mb-4 text-gray-700">
        Held by <strong>{holderName}</strong>.
      </p>
      <Button type="submit" disabled={disabled} className="w-full max-w-full">
        {disabled ? "Saving..." : "Return this item"}
      </Button>
    </Form>
  );
}

/** Why an item is referred to staff, in the volunteer's words. */
const UNSUPPORTED_COPY: Record<string, string> = {
  "kit-qr": "This code belongs to a kit. Kits are handed out by staff.",
  "not-linked": "This code is not linked to an item yet.",
  archived: "This item is out of service.",
  "quantity-tracked":
    "This item is counted in stock and is handed out by staff.",
  "kit-member":
    "This item is part of a kit and is handed out with it by staff.",
  "kit-custody":
    "This item went out as part of a kit. Please return the kit to staff.",
  "checked-out": "This item is booked out. Please return it to staff.",
  unavailable:
    "This item is not available right now, for example because it is being repaired.",
};

/**
 * Explains that staff must handle this item.
 *
 * @param props.reason - The unsupported reason from the server
 */
export function StaffOnlyNotice({ reason }: { reason: string }) {
  return (
    <div className="text-left">
      <p className="mb-2 text-gray-700">
        {UNSUPPORTED_COPY[reason] ?? "This item can't be handled here."}
      </p>
      <p className="text-gray-700">Please ask a staff member.</p>
    </div>
  );
}

/**
 * Confirms a finished take or return.
 *
 * @param props.kind - What just happened
 * @param props.assetTitle - The item
 * @param props.volunteerName - Who took or returned it
 */
export function DoneNotice({
  kind,
  assetTitle,
  volunteerName,
}: {
  kind: "taken" | "returned";
  assetTitle: string;
  volunteerName: string;
}) {
  return (
    <div role="status" className="text-left">
      <p className="mb-2 text-lg font-semibold text-gray-900">
        {kind === "taken" ? "Done." : "Thanks."}
      </p>
      <p className="mb-4 text-gray-700">
        {kind === "taken"
          ? `${assetTitle} is now in the custody of ${volunteerName}.`
          : `${assetTitle} is returned.`}
      </p>
      <p className="text-sm text-gray-600">
        You can close this page, or scan the next item.
      </p>
    </div>
  );
}
