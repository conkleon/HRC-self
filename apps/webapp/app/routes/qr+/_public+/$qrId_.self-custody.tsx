/**
 * Self-Service Custody Page (`/qr/:qrId/self-custody`)
 *
 * Public page a volunteer reaches by scanning an item's or a kit's QR code on
 * their own phone, when the workspace has self-service custody turned on.
 * Without an account they enter the workspace PIN, find or add their name
 * among the workspace's NRMs, and take the item or the whole kit into their
 * custody, or return it.
 *
 * Everything is decided on the server, per request: the workspace comes from
 * the QR (never from the form), self-service must still be on, the phone must
 * hold a valid unlock cookie for the current PIN, and the item's state is read
 * fresh. Names are only revealed to an unlocked phone.
 *
 * @see {@link file://./../../../modules/self-custody/custody.server.ts}
 * @see {@link file://./../../../modules/self-custody/kit-custody.server.ts}
 * @see {@link file://./../../../components/self-custody/self-custody-steps.tsx}
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";

import { getClientIpFromRequest } from "@server/client-ip";
import {
  DoneNotice,
  FormError,
  ItemCard,
  PinForm,
  ReturnPanel,
  StaffOnlyNotice,
  VolunteerPicker,
} from "~/components/self-custody/self-custody-steps";
import { Button } from "~/components/shared/button";
import {
  getSelfCustodyState,
  selfReturnCustody,
  selfTakeCustody,
} from "~/modules/self-custody/custody.server";
import type {
  SelfCustodyOrganization,
  SelfCustodyState,
} from "~/modules/self-custody/custody.server";
import {
  selfReturnKitCustody,
  selfTakeKitCustody,
} from "~/modules/self-custody/kit-custody.server";
import {
  checkLockout,
  clearFailedPins,
  recordFailedPin,
} from "~/modules/self-custody/lockout.server";
import { verifyPin } from "~/modules/self-custody/pin.server";
import { NewVolunteerSchema } from "~/modules/self-custody/schemas";
import {
  isUnlocked,
  serializeUnlockCookie,
} from "~/modules/self-custody/unlock-cookie.server";
import {
  findOrCreateVolunteer,
  searchVolunteers,
} from "~/modules/self-custody/volunteers.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { ShelfError, makeShelfError } from "~/utils/error";
import type { AdditionalData } from "~/utils/error";
import { getValidationErrors } from "~/utils/http";
import type { DataOrErrorResponse } from "~/utils/http.server";
import {
  assertIsPost,
  error,
  getParams,
  parseData,
  payload,
} from "~/utils/http.server";

export const meta = () => [{ title: appendToMetaTitle("Take or return") }];

const ParamsSchema = z.object({ qrId: z.string() });

const IntentSchema = z.object({
  intent: z.enum(["unlock", "search", "take", "take-new", "return"]),
});

/** A refusal with a fixed status and message, never sent to Sentry. */
function refuse(
  status: 400 | 401 | 403 | 429,
  message: string,
  additionalData: AdditionalData
) {
  return new ShelfError({
    cause: null,
    title: "Self-service",
    message,
    additionalData,
    label: "Custody",
    status,
    shouldBeCaptured: false,
  });
}

/** The state as a locked phone may see it: the item, but not who holds it. */
function redact(state: SelfCustodyState): SelfCustodyState {
  if (state.kind !== "in-custody") return state;
  return { ...state, holderName: "" };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { qrId } = getParams(params, ParamsSchema);

  try {
    const { organization, state } = await getSelfCustodyState({ qrId });

    if (!organization.selfCustodyEnabled) {
      const search = new URLSearchParams({ redirectTo: `/qr/${qrId}` });
      return redirect(`/qr/${qrId}/not-logged-in?${search.toString()}`);
    }

    const unlocked = await isUnlocked(request, organization);
    return data(
      payload({
        qrId,
        workspaceName: organization.name,
        unlocked,
        state: unlocked ? state : redact(state),
      })
    );
  } catch (cause) {
    const reason = makeShelfError(cause, { qrId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { qrId } = getParams(params, ParamsSchema);

  try {
    assertIsPost(request);
    const formData = await request.formData();
    const { intent } = parseData(formData, IntentSchema);
    const { organization, state } = await getSelfCustodyState({ qrId });
    const context = { qrId, intent };

    if (!organization.selfCustodyEnabled) {
      throw refuse(
        403,
        "Self-service is turned off for this workspace.",
        context
      );
    }

    if (intent === "unlock") {
      return await unlock(request, formData, organization, qrId);
    }

    if (!(await isUnlocked(request, organization))) {
      throw refuse(401, "Please enter the workspace PIN first.", context);
    }

    if (intent === "search") {
      const { q } = parseData(formData, z.object({ q: z.string() }));
      return data(
        payload({
          volunteers: await searchVolunteers({
            organizationId: organization.id,
            query: q,
          }),
        })
      );
    }

    const target = {
      organizationId: organization.id,
      workspaceName: organization.name,
    };

    if (intent === "return") {
      if (state.kind !== "in-custody") {
        throw refuse(400, "This item is not in anyone's custody.", context);
      }
      const result =
        state.item.kind === "kit"
          ? await selfReturnKitCustody({
              ...target,
              kitId: state.item.id,
              source: "scan",
            })
          : await selfReturnCustody({ ...target, assetId: state.item.id });
      return data(payload({ done: { kind: "returned" as const, ...result } }));
    }

    // take / take-new: the item or kit is the scanned one, never one from the form.
    if (state.kind !== "available") {
      throw refuse(
        400,
        state.kind === "in-custody"
          ? "Someone already has this item."
          : "This item can't be handled here. Please ask a staff member.",
        context
      );
    }

    const teamMemberId =
      intent === "take-new"
        ? (
            await findOrCreateVolunteer({
              organizationId: organization.id,
              ...parseData(formData, NewVolunteerSchema, {
                additionalData: context,
                shouldBeCaptured: false,
              }),
            })
          ).id
        : parseData(formData, z.object({ teamMemberId: z.string().min(1) }))
            .teamMemberId;

    const result =
      state.item.kind === "kit"
        ? await selfTakeKitCustody({
            ...target,
            kitId: state.item.id,
            teamMemberId,
            source: "scan",
          })
        : await selfTakeCustody({
            ...target,
            assetId: state.item.id,
            teamMemberId,
          });
    return data(payload({ done: { kind: "taken" as const, ...result } }));
  } catch (cause) {
    const reason = makeShelfError(cause, { qrId });
    return data(error(reason), { status: reason.status });
  }
}

/**
 * Checks the PIN under the lockout and, when right, sets the unlock cookie.
 *
 * @throws {ShelfError} 429 while locked out, 400 for a wrong PIN
 */
async function unlock(
  request: Request,
  formData: FormData,
  organization: SelfCustodyOrganization,
  qrId: string
) {
  const lockKey = {
    organizationId: organization.id,
    ip: getClientIpFromRequest(request),
  };

  const lock = checkLockout(lockKey);
  if (lock.locked) {
    const minutes = Math.max(1, Math.ceil(lock.retryAfterSeconds / 60));
    throw refuse(
      429,
      `Too many wrong PINs. Try again in ${minutes} minute${
        minutes === 1 ? "" : "s"
      }.`,
      { qrId }
    );
  }

  const { pin } = parseData(formData, z.object({ pin: z.string() }));
  if (!(await verifyPin(pin, organization.selfCustodyPinHash))) {
    recordFailedPin(lockKey);
    throw refuse(400, "Wrong PIN. Please try again.", { qrId });
  }

  clearFailedPins(lockKey);
  return redirect(`/qr/${qrId}/self-custody`, {
    headers: {
      "Set-Cookie": await serializeUnlockCookie(organization, request),
    },
  });
}

export default function SelfCustodyPage() {
  const { qrId, workspaceName, unlocked, state } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<
    DataOrErrorResponse & {
      done?: {
        kind: "taken" | "returned";
        assetTitle: string;
        volunteerName: string;
      };
    }
  >();

  const errorMessage = actionData?.error?.message ?? null;
  const newVolunteerErrors = getValidationErrors<typeof NewVolunteerSchema>(
    actionData?.error
  );
  const nameError = newVolunteerErrors?.name?.message ?? null;
  const emailError = newVolunteerErrors?.email?.message ?? null;

  return (
    <div className="mx-auto w-full max-w-md py-8">
      <h1 className="mb-1 text-[24px] font-semibold">Take or return an item</h1>
      <p className="mb-6 text-gray-600">{workspaceName}</p>

      {state.item ? <ItemCard item={state.item} /> : null}

      {actionData?.done ? (
        <DoneNotice {...actionData.done} />
      ) : !unlocked ? (
        <PinForm error={errorMessage} />
      ) : state.kind === "available" ? (
        <VolunteerPicker
          itemTitle={state.item.title}
          error={nameError || emailError ? null : errorMessage}
          nameError={nameError}
          emailError={emailError}
        />
      ) : state.kind === "in-custody" ? (
        <ReturnPanel
          holderName={state.holderName}
          isKit={state.item.kind === "kit"}
          error={errorMessage}
        />
      ) : (
        <>
          <FormError error={errorMessage} />
          <StaffOnlyNotice reason={state.reason} />
        </>
      )}

      <div className="mt-8 text-center text-sm text-gray-500">
        Staff member?{" "}
        <Button
          variant="link"
          to={`/login?${new URLSearchParams({
            redirectTo: `/qr/${qrId}`,
          }).toString()}`}
        >
          Log in
        </Button>
      </div>
    </div>
  );
}
