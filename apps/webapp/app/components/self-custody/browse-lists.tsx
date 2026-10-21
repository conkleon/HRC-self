/**
 * Self-Service Browse Lists
 *
 * The browse page's screens once a volunteer has unlocked the phone and said
 * who they are: a bar naming them, the items they hold (each with Return),
 * and the items offered for self-service (searchable, paginated, each with
 * Take). Presentational only; every form posts to the route's action, which
 * re-checks everything on the server.
 *
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 * @see {@link file://./self-custody-steps.tsx}
 */
import { Form } from "react-router";

import Input from "~/components/forms/input";
import { Button } from "~/components/shared/button";
import { useDisabled } from "~/hooks/use-disabled";

/** An item row: what the list shows of an asset. */
export type BrowseItem = {
  id: string;
  title: string;
  locationName: string | null;
};

/** One page of offered items, as the loader sends it. */
export type BrowseItemsPage = {
  items: BrowseItem[];
  page: number;
  totalPages: number;
  totalCount: number;
};

/** The search string for another page of the list, keeping who and what. */
function pageSearch({
  memberId,
  query,
  page,
}: {
  memberId: string;
  query: string;
  page: number;
}) {
  const params = new URLSearchParams({ member: memberId });
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  return `?${params.toString()}`;
}

/**
 * Names the volunteer the page acts for, with a way to switch.
 *
 * @param props.name - The chosen volunteer
 * @param props.switchTo - The page without a chosen volunteer
 */
export function VolunteerBar({
  name,
  switchTo,
}: {
  name: string;
  switchTo: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-left">
      <p className="text-gray-700">
        You are <strong>{name}</strong>
      </p>
      <Button variant="link" to={switchTo}>
        Not you?
      </Button>
    </div>
  );
}

/**
 * One item with its action button, which posts `intent`, the item and the
 * volunteer.
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
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3 text-left">
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900">{item.title}</p>
        {item.locationName ? (
          <p className="truncate text-sm text-gray-600">{item.locationName}</p>
        ) : null}
      </div>
      <Form method="post" className="shrink-0">
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="assetId" value={item.id} />
        <input type="hidden" name="teamMemberId" value={memberId} />
        <Button
          type="submit"
          variant={intent === "take" ? "primary" : "secondary"}
          disabled={disabled}
          aria-label={`${label} ${item.title}`}
        >
          {label}
        </Button>
      </Form>
    </li>
  );
}

/**
 * The items the volunteer holds, each with Return.
 *
 * @param props.items - Their returnable items
 * @param props.memberId - The volunteer's team member id
 */
export function MyItems({
  items,
  memberId,
}: {
  items: BrowseItem[];
  memberId: string;
}) {
  const disabled = useDisabled();
  return (
    <section aria-labelledby="my-items" className="mb-8 text-left">
      <h2 id="my-items" className="mb-3 text-lg font-semibold">
        Your items
      </h2>
      {items.length === 0 ? (
        <p className="text-gray-600">You have no items right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              memberId={memberId}
              intent="return"
              label="Return"
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The items offered for self-service: a name search, one page of items each
 * with Take, and links to the other pages.
 *
 * @param props.list - The current page
 * @param props.query - The current search
 * @param props.memberId - The volunteer's team member id
 */
export function OfferedItems({
  list,
  query,
  memberId,
}: {
  list: BrowseItemsPage;
  query: string;
  memberId: string;
}) {
  const disabled = useDisabled();
  return (
    <section aria-labelledby="offered-items" className="text-left">
      <h2 id="offered-items" className="mb-3 text-lg font-semibold">
        Available to take
      </h2>

      <Form method="get" role="search" className="mb-4 flex items-end gap-2">
        <input type="hidden" name="member" value={memberId} />
        <Input
          label="Search by name"
          name="q"
          type="search"
          autoComplete="off"
          defaultValue={query}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={disabled}>
          Search
        </Button>
      </Form>

      {list.items.length === 0 ? (
        <p className="text-gray-600">
          {query
            ? `Nothing available matches "${query}".`
            : "Nothing is available to take right now."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              memberId={memberId}
              intent="take"
              label="Take"
              disabled={disabled}
            />
          ))}
        </ul>
      )}

      {list.totalPages > 1 ? (
        <nav
          aria-label="Pages"
          className="mt-4 flex items-center justify-between gap-2"
        >
          {list.page > 1 ? (
            <Button
              variant="secondary"
              to={pageSearch({ memberId, query, page: list.page - 1 })}
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
              to={pageSearch({ memberId, query, page: list.page + 1 })}
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
