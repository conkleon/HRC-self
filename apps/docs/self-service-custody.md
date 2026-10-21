# Self-Service Custody

Self-service custody lets people without a Shelf account, such as volunteers,
take an item into their custody and return it on their own phone: by scanning
the item's QR code, or by picking it from the workspace's
[browse list](#the-browse-list) when the label is missing or out of reach. They are recorded as **non-registered members** (NRMs), so their
custody shows up in item history, the team pages and the custody reports like
any custody a staff member assigned.

## How it works for a volunteer

1. They scan the item's QR sticker with their phone camera.
2. They enter the **workspace PIN**. The phone stays unlocked for 12 hours, so
   taking several items asks for it only once.
3. They see the item's name and location, and then one of the following:
   - **Available:** they type at least 3 letters of their name and pick it from
     the list, or tap **I'm not on the list, add me** and type their full name.
     Then they confirm **Take [item] as [name]**.
   - **Held by someone:** the page shows who has it, and **Return this item**
     gives it back.
   - **Ask a staff member:** the item can't be handled here (see
     [Scope](#scope)).

Staff who scan a QR without being logged in see a **Log in** link at the
bottom of the page and get the normal flow after logging in.

## The browse list

For equipment whose QR label is missing, damaged or hard to reach, volunteers
can pick items from a list instead of scanning.

1. They open the workspace's browse link, usually by scanning a poster QR at
   the depot.
2. They enter the workspace PIN (the same unlock as the scan page: a phone
   unlocked on one is unlocked on the other).
3. They say who they are: find their name, or add it.
4. They see two lists:
   - **Your items:** every individual item in their own custody, each with
     **Return**. Items someone else holds never appear here and can't be
     returned from the list; those still need the item's QR code.
   - **Available to take:** items with the workspace's self-service tag that
     are available right now, 20 per page, with a name search. Each has
     **Take**.

### Setting it up

In **Settings > Self-service > Browse list**:

1. **Choose the tag.** Only available items with this tag are listed. Add the
   tag to items from the asset list, one by one or with the bulk tag action.
   With no tag chosen, the list offers nothing.
2. **Create the link.** The page shows the link and its QR code. Use
   **Download QR code** to print a poster.
3. **Replace link** retires the old link and every printed copy of it at once,
   for example after a poster went missing. The PIN is unchanged.

Removing the tag from an item takes it off the list straight away; a volunteer
who still has the old list open is refused when they press **Take**.

## Turning it on

Owners and Administrators: **Settings > Self-service** (team workspaces only).

1. **Set the PIN.** It must be 4 to 8 digits. Share it with volunteers at their
   briefing, not on the QR sticker.
2. Click **Turn on**. This stays disabled until a PIN is set.

To stop self-service at any time, click **Turn off**. From then on, anonymous
scans show the normal "please log in" page.

### Changing the PIN

Saving a new PIN signs every volunteer phone out straight away: their next
action asks for the new PIN. Change it when someone who knew it should no
longer have access.

## What managers receive

Every Owner, Administrator and Manager of the workspace gets an email for each
take and each return, for example "Maria P. took Radio #12", with a **View
item** button. Each change also writes:

- a note on the item ("**Maria P.** took custody via self-service scan.", or
  "... from the self-service list.");
- a `CUSTODY_ASSIGNED` or `CUSTODY_RELEASED` activity event with no acting
  user, linked to the volunteer's NRM, marked `via: self-service`. Actions from
  the browse list also carry `source: list`.

The email says which of the two pages was used.

## Protection

Both pages are public: anyone holding a sticker, a photo of it or the browse
link can open them. The browse link is a 24-character random token, so it
can't be guessed, but treat a leaked link like a leaked sticker: the PIN still
guards everything behind it. The following limits are in place, shared by both
pages:

| Limit                                               | Value                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Wrong PINs per phone (IP address)                   | 5 in 15 minutes, then locked for 15 minutes                                                     |
| Wrong PINs per workspace, from any number of phones | 50 in 15 minutes, then self-service locks for 15 minutes                                        |
| Requests to the pages per IP address                | 30 per minute                                                                                   |
| Name search                                         | nothing listed under 3 letters, at most 10 names, NRMs only (registered users are never listed) |
| New names                                           | 2 to 60 characters; the same name in different case or spacing reuses the existing NRM          |

Everything is checked on the server for every action: that self-service is
still on, that the phone holds an unlock for the current PIN, and the item's
current state. On the browse list, the volunteer is re-checked as an NRM of the
workspace on every request, taking re-checks the self-service tag inside the
same atomic claim, and returning releases custody only when that volunteer
holds it. Two volunteers taking the same item at the same moment cannot
both succeed: the second sees "Someone has just taken this item."

The lockout counters live in the app's memory. They reset when the app
restarts and assume a single app container, which is how the
[self-hosted stack](./self-hosted-stack.md) runs.

## Scope

Self-service handles **individual** assets. The following are referred to staff:

- kits, and assets that belong to a kit;
- items whose custody came with a kit;
- quantity-tracked (stock) items;
- items checked out on a booking;
- archived items.

Item photos are not shown on the page.

## For developers

| Piece                                                       | Path                                                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Public page (scan)                                          | `apps/webapp/app/routes/qr+/_public+/$qrId_.self-custody.tsx`                                                                    |
| Public page (browse list)                                   | `apps/webapp/app/routes/self-service+/$token.tsx`                                                                                |
| Redirect from an anonymous scan                             | `apps/webapp/app/routes/qr+/_public+/$qrId.tsx`                                                                                  |
| Settings page                                               | `apps/webapp/app/routes/_layout+/settings.self-service.tsx`                                                                      |
| Services (PIN, lockout, cookie, volunteers, custody, email) | `apps/webapp/app/modules/self-custody/`                                                                                          |
| Manager email                                               | `apps/webapp/app/emails/self-custody-alert.tsx`                                                                                  |
| Email audience                                              | `notifications.selfCustodyAlerts` in `packages/permissions/src/policies.ts`                                                      |
| Rate limit                                                  | `selfCustodyRateLimit` in `apps/webapp/server/rate-limit.ts`                                                                     |
| Schema                                                      | `Organization.selfCustodyEnabled`, `selfCustodyPinHash`, `selfCustodyPinUpdatedAt`, `selfCustodyTagId`, `selfCustodyBrowseToken` |
