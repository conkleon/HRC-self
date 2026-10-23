/**
 * Self-Service Browse Page (`/self-service/:token`)
 *
 * Public page where a volunteer picks equipment from a list instead of
 * scanning its QR code, for items whose label is missing or out of reach. The
 * link (usually a poster QR at the depot) names the workspace by a secret
 * token that admins can replace from Settings > Self-service.
 *
 * Steps: enter the workspace PIN, say who you are (find your name among the
 * workspace's NRMs, or add it; the phone remembers the choice until "Not
 * you?"), then take items and kits offered for
 * self-service, or return what you hold. A quantity-tracked item is taken and
 * returned by the unit: the row posts `units`, how many to take or how many
 * came back. The offered list searches as you
 * type and filters by kind, location and category, all carried in the URL.
 * Only the volunteer's own items and kits can be returned here; returning
 * someone else's still needs the item's QR code or a staff member.
 *
 * Everything is decided on the server, per request: the workspace comes from
 * the token (never from the form), self-service must still be on, the phone
 * must hold a valid unlock cookie for the current PIN, the volunteer in
 * `?member=` must be a live NRM of the workspace, and take and return
 * re-check the offer (tag or location) and the holder inside their
 * transactions.
 *
 * @see {@link file://./../../modules/self-custody/browse.server.ts}
 * @see {@link file://./../../modules/self-custody/custody.server.ts}
 * @see {@link file://./../../modules/self-custody/kit-custody.server.ts}
 * @see {@link file://./../../modules/self-custody/quantity.server.ts}
 * @see {@link file://./../../components/self-custody/browse-lists.tsx}
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import { z } from "zod";

import { getClientIpFromRequest } from "@server/client-ip";
import { ErrorContent } from "~/components/errors";
import { ShelfFullLogo } from "~/components/marketing/logos";
import {
  ListTabs,
  MyItems,
  OfferedItems,
  VolunteerBar,
} from "~/components/self-custody/browse-lists";
import type {
  BrowseFilterOptions,
  BrowseItem,
  BrowseItemsPage,
  BrowseTab,
} from "~/components/self-custody/browse-lists";
import {
  DoneNotice,
  FormError,
  PinForm,
  VolunteerPicker,
} from "~/components/self-custody/self-custody-steps";
import {
  getBrowseWorkspace,
  listBrowseFilterOptions,
  listOfferedItems,
  listVolunteerItems,
} from "~/modules/self-custody/browse.server";
import type {
  BrowseFilters,
  SelfCustodyBrowseOrganization,
} from "~/modules/self-custody/browse.server";
import {
  selfReturnCustody,
  selfTakeCustody,
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
import {
  hasSelfCustodyOffer,
  resolveSelfCustodyOffer,
} from "~/modules/self-custody/offer.server";
import { verifyPin } from "~/modules/self-custody/pin.server";
import {
  selfReturnQuantity,
  selfTakeQuantity,
} from "~/modules/self-custody/quantity.server";
import { VolunteerNameSchema } from "~/modules/self-custody/schemas";
import {
  isUnlocked,
  serializeUnlockCookie,
} from "~/modules/self-custody/unlock-cookie.server";
import {
  getRememberedVolunteerId,
  serializeForgottenVolunteer,
  serializeRememberedVolunteer,
} from "~/modules/self-custody/volunteer-cookie.server";
import {
  findOrCreateVolunteer,
  getVolunteer,
  searchVolunteers,
} from "~/modules/self-custody/volunteers.server";
import type { Volunteer } from "~/modules/self-custody/volunteers.server";
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
import { tw } from "~/utils/tw";
import { requiredNumberFromString } from "~/utils/zod-numeric";

export const meta = () => [{ title: appendToMetaTitle("Self-service") }];

const ParamsSchema = z.object({ token: z.string() });

const IntentSchema = z.object({
  intent: z.enum(["unlock", "search", "add-me", "forget", "take", "return"]),
});

const NewVolunteerSchema = z.object({ name: VolunteerNameSchema });

/** Take or return names one target: a kit, or else a single item. */
const ItemActionSchema = z.union([
  z.object({ kitId: z.string().min(1), teamMemberId: z.string().min(1) }),
  z.object({ assetId: z.string().min(1), teamMemberId: z.string().min(1) }),
]);

/**
 * The unit count a quantity-tracked row posts: how many to take, or how many
 * came back. Its range depends on the item and is checked by the service.
 */
const UnitsSchema = z.object({
  units: requiredNumberFromString({ fieldName: "Quantity" }).pipe(
    z.number().int("Enter a whole number").nonnegative("Enter 0 or more")
  ),
});

/** Longest search the list accepts; anything longer is cut, not refused. */
const MAX_QUERY_LENGTH = 100;

/** What the page shows, decided by the loader. */
type BrowseView =
  | { view: "off" }
  | { view: "locked" }
  | { view: "no-items" }
  | { view: "identify" }
  | {
      view: "lists";
      volunteer: Volunteer;
      tab: BrowseTab;
      myItems: BrowseItem[];
      list: BrowseItemsPage;
      filters: BrowseFilters;
      filterOptions: BrowseFilterOptions;
    };

/** Reads the list's filters from the URL; unknown values fall back to "any". */
function filtersFrom(url: URL): BrowseFilters {
  const kind = url.searchParams.get("kind");
  return {
    query: (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    kind: kind === "item" || kind === "kit" ? kind : "all",
    locationId: url.searchParams.get("location") || null,
    categoryId: url.searchParams.get("category") || null,
  };
}

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

/** What the workspace offers: its tag and its locations, widened to sub-locations. */
function offerOf(organization: SelfCustodyBrowseOrganization) {
  return resolveSelfCustodyOffer({
    organizationId: organization.id,
    tagId: organization.selfCustodyTagId,
    locationIds: organization.selfCustodyLocations.map(({ id }) => id),
  });
}

/**
 * Decides what an unlocked phone sees, from the URL's member, q and page, and
 * how the remembered-volunteer cookie changes. The volunteer is `?member=`,
 * or else the one this phone remembers; either way they must be a live NRM
 * of the workspace. A valid volunteer is (re-)remembered, which renews the
 * cookie's lifetime; a remembered one who no longer qualifies is forgotten.
 */
async function unlockedView(
  organization: SelfCustodyBrowseOrganization,
  request: Request
): Promise<{ view: BrowseView; setCookie: string | null }> {
  const offer = await offerOf(organization);
  if (!hasSelfCustodyOffer(offer)) {
    return { view: { view: "no-items" }, setCookie: null };
  }

  const url = new URL(request.url);
  const remembered = await getRememberedVolunteerId(request, organization.id);
  const memberId = url.searchParams.get("member") ?? remembered;
  const volunteer = memberId
    ? await getVolunteer({
        organizationId: organization.id,
        teamMemberId: memberId,
      })
    : null;
  if (!volunteer) {
    const stale = memberId !== null && memberId === remembered;
    return {
      view: { view: "identify" },
      setCookie: stale
        ? await serializeForgottenVolunteer({
            request,
            organizationId: organization.id,
          })
        : null,
    };
  }
  const setCookie = await serializeRememberedVolunteer({
    request,
    organizationId: organization.id,
    teamMemberId: volunteer.id,
  });

  const tab: BrowseTab =
    url.searchParams.get("tab") === "mine" ? "mine" : "take";
  const filters = filtersFrom(url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const scope = { organizationId: organization.id, offer };

  // Both tabs show both counts, so both lists load whichever tab is open.
  const [myItems, list, filterOptions] = await Promise.all([
    listVolunteerItems({
      organizationId: organization.id,
      teamMemberId: volunteer.id,
    }),
    listOfferedItems({ ...scope, filters, page }),
    listBrowseFilterOptions(scope),
  ]);
  return {
    view: {
      view: "lists",
      volunteer,
      tab,
      myItems,
      list,
      filters,
      filterOptions,
    },
    setCookie,
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { token } = getParams(params, ParamsSchema);

  try {
    const organization = await getBrowseWorkspace(token);
    const base = { workspaceName: organization.name };

    if (!organization.selfCustodyEnabled) {
      return data(payload<BrowseView & typeof base>({ ...base, view: "off" }));
    }
    if (!(await isUnlocked(request, organization))) {
      return data(
        payload<BrowseView & typeof base>({ ...base, view: "locked" })
      );
    }
    const { view, setCookie } = await unlockedView(organization, request);
    return data(payload<BrowseView & typeof base>({ ...base, ...view }), {
      headers: setCookie ? { "Set-Cookie": setCookie } : undefined,
    });
  } catch (cause) {
    // The token is a secret; it stays out of logs and Sentry.
    const reason = makeShelfError(cause);
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { token } = getParams(params, ParamsSchema);

  try {
    assertIsPost(request);
    const formData = await request.formData();
    const { intent } = parseData(formData, IntentSchema);
    const organization = await getBrowseWorkspace(token);
    const context = { organizationId: organization.id, intent };

    if (!organization.selfCustodyEnabled) {
      throw refuse(
        403,
        "Self-service is turned off for this workspace.",
        context
      );
    }

    if (intent === "unlock") {
      return await unlock(request, formData, organization);
    }

    // "Not you?": forget who this phone acts for, back to choosing a name.
    // Needs no unlock: it only clears this phone's own cookie.
    if (intent === "forget") {
      return redirect(new URL(request.url).pathname, {
        headers: {
          "Set-Cookie": await serializeForgottenVolunteer({
            request,
            organizationId: organization.id,
          }),
        },
      });
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

    if (intent === "add-me") {
      const { name } = parseData(formData, NewVolunteerSchema, {
        additionalData: context,
        shouldBeCaptured: false,
      });
      const volunteer = await findOrCreateVolunteer({
        organizationId: organization.id,
        name,
      });
      const url = new URL(request.url);
      return redirect(
        `${url.pathname}?${new URLSearchParams({ member: volunteer.id })}`,
        {
          headers: {
            "Set-Cookie": await serializeRememberedVolunteer({
              request,
              organizationId: organization.id,
              teamMemberId: volunteer.id,
            }),
          },
        }
      );
    }

    const target = parseData(formData, ItemActionSchema);
    const { teamMemberId } = target;
    // The volunteer must be an NRM of this workspace, as on the loader.
    const volunteer = await getVolunteer({
      organizationId: organization.id,
      teamMemberId,
    });
    if (!volunteer) {
      throw refuse(400, "Please choose your name again.", context);
    }

    const workspace = {
      organizationId: organization.id,
      workspaceName: organization.name,
    };

    // Only a quantity-tracked row sends a unit count.
    const units = formData.has("units")
      ? parseData(formData, UnitsSchema, {
          additionalData: context,
          shouldBeCaptured: false,
        }).units
      : null;

    if (intent === "return") {
      const result =
        "kitId" in target
          ? await selfReturnKitCustody({
              ...workspace,
              kitId: target.kitId,
              holderTeamMemberId: volunteer.id,
            })
          : units !== null
          ? await selfReturnQuantity({
              ...workspace,
              assetId: target.assetId,
              holderTeamMemberId: volunteer.id,
              returned: units,
            })
          : await selfReturnCustody({
              ...workspace,
              assetId: target.assetId,
              source: "list",
              holderTeamMemberId: volunteer.id,
            });
      return data(payload({ done: { kind: "returned" as const, ...result } }));
    }

    const offer = await offerOf(organization);
    if (!hasSelfCustodyOffer(offer)) {
      throw refuse(
        400,
        "No items are offered for self-service right now.",
        context
      );
    }
    const result =
      "kitId" in target
        ? await selfTakeKitCustody({
            ...workspace,
            kitId: target.kitId,
            teamMemberId: volunteer.id,
            requiredOffer: offer,
          })
        : units !== null
        ? await selfTakeQuantity({
            ...workspace,
            assetId: target.assetId,
            teamMemberId: volunteer.id,
            quantity: units,
            requiredOffer: offer,
          })
        : await selfTakeCustody({
            ...workspace,
            assetId: target.assetId,
            source: "list",
            teamMemberId: volunteer.id,
            requiredOffer: offer,
          });
    return data(payload({ done: { kind: "taken" as const, ...result } }));
  } catch (cause) {
    const reason = makeShelfError(cause);
    return data(error(reason), { status: reason.status });
  }
}

/**
 * Checks the PIN under the lockout and, when right, sets the unlock cookie.
 * Shares the lockout counters with the scan page: both guard the same PIN.
 *
 * @throws {ShelfError} 429 while locked out, 400 for a wrong PIN
 */
async function unlock(
  request: Request,
  formData: FormData,
  organization: SelfCustodyBrowseOrganization
) {
  const lockKey = {
    organizationId: organization.id,
    ip: getClientIpFromRequest(request),
  };
  const context = { organizationId: organization.id };

  const lock = checkLockout(lockKey);
  if (lock.locked) {
    const minutes = Math.max(1, Math.ceil(lock.retryAfterSeconds / 60));
    throw refuse(
      429,
      `Too many wrong PINs. Try again in ${minutes} minute${
        minutes === 1 ? "" : "s"
      }.`,
      context
    );
  }

  const { pin } = parseData(formData, z.object({ pin: z.string() }));
  if (!(await verifyPin(pin, organization.selfCustodyPinHash))) {
    recordFailedPin(lockKey);
    throw refuse(400, "Wrong PIN. Please try again.", context);
  }

  clearFailedPins(lockKey);
  return redirect(new URL(request.url).pathname, {
    headers: {
      "Set-Cookie": await serializeUnlockCookie(organization, request),
    },
  });
}

export const ErrorBoundary = () => <ErrorContent />;

/**
 * Logo and a centred column, matching the scan page's public layout. The
 * lists use a wider column that starts at the top, so a long list does not
 * open scrolled to its middle and a tablet uses its width.
 *
 * The root layout sets `overflow-hidden` on `<html>`, so the window never
 * scrolls: the Shell is the page's scroll container (`h-dvh`, which follows
 * the mobile browser bar). Because it is not the window, React Router's scroll
 * restoration does not reach it, so it returns to the top itself whenever
 * `scrollKey` or `resetOn` changes.
 *
 * @param props.wide - The wider, top-aligned column for the lists
 * @param props.scrollKey - Which view is shown (tab, page); a new one starts at the top
 * @param props.resetOn - The latest action result, whose notice sits at the top
 */
function Shell({
  children,
  wide,
  scrollKey,
  resetOn,
}: {
  children: ReactNode;
  wide: boolean;
  scrollKey: string;
  resetOn: unknown;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [scrollKey, resetOn]);

  return (
    <div ref={scroller} className="h-dvh overflow-y-auto overscroll-contain">
      <div className="container flex min-h-full flex-col px-4 py-6 sm:py-12">
        <div
          className={tw(
            "flex flex-1 flex-col text-center",
            wide ? "justify-start" : "justify-center"
          )}
        >
          <Link
            to="/"
            title="Home"
            className="logo mx-auto inline-block h-[32px]"
            reloadDocument
          >
            <ShelfFullLogo className="h-full" />
          </Link>
          <div
            className={tw(
              "mx-auto w-full py-6 sm:py-8",
              wide ? "max-w-2xl" : "max-w-md"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SelfServiceBrowsePage() {
  const loaderData = useLoaderData<typeof loader>();
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
  const nameError =
    getValidationErrors<typeof NewVolunteerSchema>(actionData?.error)?.name
      ?.message ?? null;

  return (
    <Shell
      wide={loaderData.view === "lists"}
      scrollKey={
        loaderData.view === "lists"
          ? `${loaderData.tab}-${loaderData.list.page}`
          : loaderData.view
      }
      resetOn={actionData}
    >
      <h1 className="mb-1 text-[24px] font-semibold">Take or return items</h1>
      <p className="mb-6 text-gray-600">{loaderData.workspaceName}</p>

      {loaderData.view === "off" ? (
        <p className="text-gray-700">
          Self-service is turned off for this workspace. Please ask a staff
          member.
        </p>
      ) : loaderData.view === "locked" ? (
        <PinForm error={errorMessage} />
      ) : loaderData.view === "no-items" ? (
        <p className="text-gray-700">
          No items are offered for self-service yet. Please ask a staff member.
        </p>
      ) : loaderData.view === "identify" ? (
        <>
          <p className="mb-4 text-left text-gray-700">
            First, tell us who you are.
          </p>
          <VolunteerPicker
            error={nameError ? null : errorMessage}
            nameError={nameError}
          />
        </>
      ) : (
        <>
          <VolunteerBar name={loaderData.volunteer.name} />
          {actionData?.done ? (
            <div className="mb-6">
              <DoneNotice {...actionData.done} />
            </div>
          ) : (
            <FormError error={errorMessage} />
          )}
          <ListTabs
            memberId={loaderData.volunteer.id}
            tab={loaderData.tab}
            filters={loaderData.filters}
            offeredCount={loaderData.list.totalCount}
            mineCount={loaderData.myItems.length}
          />
          {loaderData.tab === "mine" ? (
            <MyItems
              items={loaderData.myItems}
              memberId={loaderData.volunteer.id}
            />
          ) : (
            <OfferedItems
              list={loaderData.list}
              filters={loaderData.filters}
              options={loaderData.filterOptions}
              memberId={loaderData.volunteer.id}
            />
          )}
        </>
      )}
    </Shell>
  );
}
