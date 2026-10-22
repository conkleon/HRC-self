/**
 * Self-Service Browse Lists
 *
 * The browse page's screens once a volunteer has unlocked the phone and said
 * who they are: a bar naming them, two tabs ("Available" and "Your items"),
 * and in each tab a list of kits and single items with one big Take or Return
 * button per row. The Available tab searches as the volunteer types and
 * filters by kind, location and category; every choice lives in the URL, so
 * the server builds each list and the back button works.
 *
 * Laid out for phones first: rows wrap long names instead of cutting them,
 * buttons are at least 44px tall, and inputs use 16px text so iOS does not
 * zoom in on focus. Presentational only; every form posts to the route's
 * action, which re-checks everything on the server.
 *
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 * @see {@link file://./self-custody-steps.tsx}
 */
import { useEffect, useRef } from "react";
import type { FormEvent, MouseEvent } from "react";
import { Package } from "lucide-react";
import { Form, useLocation, useNavigation, useSubmit } from "react-router";

import Input from "~/components/forms/input";
import { AssetsIcon } from "~/components/icons/library";
import { Button } from "~/components/shared/button";
import { useDisabled } from "~/hooks/use-disabled";
import { tw } from "~/utils/tw";

/** A row of either list: a single item or a kit. */
export type BrowseItem = {
  kind: "item" | "kit";
  id: string;
  title: string;
  locationName: string | null;
  categoryName: string | null;
  /** Active items in the kit; null for a single item. */
  itemCount: number | null;
};

/** One page of offered entries, as the loader sends it. */
export type BrowseItemsPage = {
  items: BrowseItem[];
  page: number;
  totalPages: number;
  totalCount: number;
};

/** The two tabs: what can be taken, and what the volunteer holds. */
export type BrowseTab = "take" | "mine";

/** The volunteer's narrowing of the Available tab, as the URL carries it. */
type BrowseListFilters = {
  query: string;
  kind: "all" | "item" | "kit";
  locationId: string | null;
  categoryId: string | null;
};

/** The locations and categories the Available tab can filter by. */
export type BrowseFilterOptions = {
  locations: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

/** How long typing pauses before the list reloads. */
const SEARCH_DEBOUNCE_MS = 300;

/** Choices of the kind filter, in display order. */
const KIND_OPTIONS: { value: BrowseListFilters["kind"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "item", label: "Items" },
  { value: "kit", label: "Kits" },
];

/** No filter at all: the Available tab as first opened. */
const NO_FILTERS: BrowseListFilters = {
  query: "",
  kind: "all",
  locationId: null,
  categoryId: null,
};

/** Whether the volunteer has narrowed the list in any way. */
function isFiltered(filters: BrowseListFilters) {
  return (
    filters.query !== "" ||
    filters.kind !== "all" ||
    filters.locationId !== null ||
    filters.categoryId !== null
  );
}

/**
 * The search string for a view of the page, keeping who the volunteer is.
 * Defaults are left out so links stay short.
 */
function listSearch({
  memberId,
  tab,
  filters = NO_FILTERS,
  page = 1,
}: {
  memberId: string;
  tab: BrowseTab;
  filters?: BrowseListFilters;
  page?: number;
}) {
  const params = new URLSearchParams({ member: memberId });
  if (tab === "mine") params.set("tab", "mine");
  if (filters.query) params.set("q", filters.query);
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.locationId) params.set("location", filters.locationId);
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (page > 1) params.set("page", String(page));
  return `?${params.toString()}`;
}

/**
 * Names the volunteer the page acts for. The phone remembers them; "Not you?"
 * posts intent `forget`, which clears that and goes back to choosing a name.
 *
 * @param props.name - The chosen volunteer
 */
export function VolunteerBar({ name }: { name: string }) {
  const disabled = useDisabled();
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-left">
      <p className="min-w-0 break-words text-gray-700">
        You are <strong>{name}</strong>
      </p>
      <Form method="post">
        <input type="hidden" name="intent" value="forget" />
        <Button type="submit" variant="link" disabled={disabled}>
          Not you?
        </Button>
      </Form>
    </div>
  );
}

/**
 * The two tabs, as links so each is its own URL. Switching keeps the
 * Available tab's filters.
 *
 * @param props.tab - The open tab
 * @param props.offeredCount - Entries in the Available tab, as filtered
 * @param props.mineCount - Kits and items the volunteer holds
 */
export function ListTabs({
  memberId,
  tab,
  filters,
  offeredCount,
  mineCount,
}: {
  memberId: string;
  tab: BrowseTab;
  filters: BrowseListFilters;
  offeredCount: number;
  mineCount: number;
}) {
  const tabs: { id: BrowseTab; label: string; count: number }[] = [
    { id: "take", label: "Available", count: offeredCount },
    { id: "mine", label: "Your items", count: mineCount },
  ];
  return (
    <nav
      aria-label="Lists"
      className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1"
    >
      {tabs.map(({ id, label, count }) => {
        const current = id === tab;
        return (
          <Button
            key={id}
            variant="link"
            to={listSearch({ memberId, tab: id, filters })}
            aria-current={current ? "page" : undefined}
            className={tw(
              "flex min-h-[44px] w-full max-w-full items-center justify-center gap-2 rounded-md px-3 text-[15px] font-semibold no-underline hover:no-underline",
              current
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            {label}
            <span
              className={tw(
                "rounded-full px-2 py-0.5 text-xs",
                current
                  ? "bg-primary-50 text-primary-700"
                  : "bg-gray-200 text-gray-700"
              )}
            >
              {count}
            </span>
          </Button>
        );
      })}
    </nav>
  );
}

/** The small square in front of a row that tells a kit from a single item. */
function KindBadge({ kind }: { kind: BrowseItem["kind"] }) {
  return (
    <span
      aria-hidden="true"
      className={tw(
        "flex size-10 shrink-0 items-center justify-center rounded-md",
        kind === "kit"
          ? "bg-primary-50 text-primary-700"
          : "bg-gray-100 text-gray-600"
      )}
    >
      {kind === "kit" ? (
        <Package className="size-5" />
      ) : (
        <AssetsIcon className="size-5" />
      )}
    </span>
  );
}

/**
 * One kit or item with its action button, which posts `intent`, the target
 * (`kitId` or `assetId`) and the volunteer.
 */
function ItemRow({
  item,
  memberId,
  intent,
  label,
  disabled,
}: {
  item: BrowseItem;
  memberId: string;
  intent: "take" | "return";
  label: string;
  disabled: boolean;
}) {
  const details = [
    item.kind === "kit"
      ? `Kit of ${item.itemCount} item${item.itemCount === 1 ? "" : "s"}`
      : null,
    item.locationName,
    item.categoryName,
  ].filter((detail): detail is string => Boolean(detail));

  return (
    <li className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left">
      <KindBadge kind={item.kind} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words font-medium text-gray-900">
          {item.title}
        </p>
        {details.length > 0 ? (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-gray-600">
            {details.map((detail) => (
              <span key={detail} className="break-words">
                {detail}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      <Form method="post" className="shrink-0">
        <input type="hidden" name="intent" value={intent} />
        <input
          type="hidden"
          name={item.kind === "kit" ? "kitId" : "assetId"}
          value={item.id}
        />
        <input type="hidden" name="teamMemberId" value={memberId} />
        <Button
          type="submit"
          variant={intent === "take" ? "primary" : "secondary"}
          disabled={disabled}
          aria-label={`${label} ${item.title}`}
          className="min-h-[44px] min-w-[84px] justify-center"
        >
          {label}
        </Button>
      </Form>
    </li>
  );
}

/** A list of rows, all with the same action. */
function Rows({
  items,
  memberId,
  intent,
  label,
}: {
  items: BrowseItem[];
  memberId: string;
  intent: "take" | "return";
  label: string;
}) {
  const disabled = useDisabled();
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <ItemRow
          key={`${item.kind}-${item.id}`}
          item={item}
          memberId={memberId}
          intent={intent}
          label={label}
          disabled={disabled}
        />
      ))}
    </ul>
  );
}

/**
 * The kits and items the volunteer holds, each with Return.
 *
 * @param props.items - What they hold that they can return here
 * @param props.memberId - The volunteer's team member id
 */
export function MyItems({
  items,
  memberId,
}: {
  items: BrowseItem[];
  memberId: string;
}) {
  return (
    <section aria-labelledby="my-items" className="text-left">
      <h2 id="my-items" className="sr-only">
        Your items
      </h2>
      {items.length === 0 ? (
        <p className="py-6 text-center text-gray-600">
          You have no items right now.
        </p>
      ) : (
        <Rows
          items={items}
          memberId={memberId}
          intent="return"
          label="Return"
        />
      )}
    </section>
  );
}

/** Classes shared by the filter dropdowns; 16px text keeps iOS from zooming. */
const SELECT_CLASSES =
  "w-full rounded-[4px] border border-gray-300 bg-white px-3 py-2 text-[16px] text-gray-900 shadow focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100";

/**
 * Search box and filters of the Available tab. Every change reloads the list
 * through a GET of the same page: dropdowns and the kind switch at once,
 * typing after a short pause. Each reload replaces the history entry, so the
 * back button leaves the list instead of stepping through keystrokes.
 */
function OfferedFilters({
  memberId,
  filters,
  options,
}: {
  memberId: string;
  filters: BrowseListFilters;
  options: BrowseFilterOptions;
}) {
  const submit = useSubmit();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  /** Reloads the list with the form's current values, from page 1. */
  function reload(form: HTMLFormElement) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    void submit(form, { replace: true, preventScrollReset: true });
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const field = event.target as HTMLInputElement;
    if (field.name !== "q") {
      reload(form);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => reload(form), SEARCH_DEBOUNCE_MS);
  }

  /** Empties every field in place, then reloads, so nothing goes stale. */
  function clearFilters(event: MouseEvent<HTMLButtonElement>) {
    const { form } = event.currentTarget;
    if (!form) return;
    for (const field of Array.from(form.elements)) {
      if (field instanceof HTMLInputElement && field.name === "q") {
        field.value = "";
      } else if (field instanceof HTMLInputElement && field.name === "kind") {
        field.checked = field.value === "all";
      } else if (field instanceof HTMLSelectElement) {
        field.value = "";
      }
    }
    reload(form);
  }

  return (
    <Form
      method="get"
      role="search"
      aria-label="Search available items"
      onChange={handleChange}
      className="mb-4 flex flex-col gap-3"
    >
      <input type="hidden" name="member" value={memberId} />
      <Input
        label="Search by name"
        hideLabel
        placeholder="Search by name"
        name="q"
        type="search"
        icon="search"
        autoComplete="off"
        enterKeyHint="search"
        defaultValue={filters.query}
      />

      <fieldset>
        <legend className="sr-only">Show</legend>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {KIND_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className="flex min-h-[40px] cursor-pointer items-center justify-center rounded-md text-sm font-medium text-gray-600 has-[:checked]:bg-white has-[:checked]:text-gray-900 has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-300"
            >
              <input
                type="radio"
                name="kind"
                value={value}
                defaultChecked={filters.kind === value}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {options.locations.length > 0 || options.categories.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {options.locations.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Location
              <select
                name="location"
                defaultValue={filters.locationId ?? ""}
                className={SELECT_CLASSES}
              >
                <option value="">Any location</option>
                {options.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {options.categories.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Category
              <select
                name="category"
                defaultValue={filters.categoryId ?? ""}
                className={SELECT_CLASSES}
              >
                <option value="">Any category</option>
                {options.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {isFiltered(filters) ? (
        <Button
          type="button"
          variant="link"
          onClick={clearFilters}
          className="self-start"
        >
          Clear search and filters
        </Button>
      ) : null}
    </Form>
  );
}

/**
 * The kits and items offered for self-service: live search and filters, one
 * page of rows each with Take, and links to the other pages.
 *
 * @param props.list - The current page
 * @param props.filters - The current search and filters
 * @param props.options - Locations and categories to filter by
 * @param props.memberId - The volunteer's team member id
 */
export function OfferedItems({
  list,
  filters,
  options,
  memberId,
}: {
  list: BrowseItemsPage;
  filters: BrowseListFilters;
  options: BrowseFilterOptions;
  memberId: string;
}) {
  const navigation = useNavigation();
  const { pathname } = useLocation();
  // A search, filter or page change of this list; not a take, whose
  // revalidation the row buttons already show as disabled.
  const reloading =
    navigation.state === "loading" &&
    navigation.formMethod !== "POST" &&
    navigation.location.pathname === pathname;

  return (
    <section aria-labelledby="offered-items" className="text-left">
      <h2 id="offered-items" className="sr-only">
        Available to take
      </h2>

      <OfferedFilters memberId={memberId} filters={filters} options={options} />

      <p
        aria-live="polite"
        className={tw(
          "mb-2 text-sm text-gray-600",
          reloading && "animate-pulse"
        )}
      >
        {reloading
          ? "Updating..."
          : `${list.totalCount} ${
              list.totalCount === 1 ? "result" : "results"
            }`}
      </p>

      <div className={tw(reloading && "opacity-60 transition-opacity")}>
        {list.items.length === 0 ? (
          <p className="py-6 text-center text-gray-600">
            {isFiltered(filters)
              ? "Nothing available matches your search."
              : "Nothing is available to take right now."}
          </p>
        ) : (
          <Rows
            items={list.items}
            memberId={memberId}
            intent="take"
            label="Take"
          />
        )}
      </div>

      {list.totalPages > 1 ? (
        <nav
          aria-label="Pages"
          className="mt-4 flex items-center justify-between gap-2"
        >
          {list.page > 1 ? (
            <Button
              variant="secondary"
              className="min-h-[44px]"
              to={listSearch({
                memberId,
                tab: "take",
                filters,
                page: list.page - 1,
              })}
            >
              Previous
            </Button>
          ) : (
            <span />
          )}
          <p className="text-sm text-gray-600">
            Page {list.page} of {list.totalPages}
          </p>
          {list.page < list.totalPages ? (
            <Button
              variant="secondary"
              className="min-h-[44px]"
              to={listSearch({
                memberId,
                tab: "take",
                filters,
                page: list.page + 1,
              })}
            >
              Next
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}
