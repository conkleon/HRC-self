# Self-Service Custody

Self-service custody lets people without a Shelf account, such as volunteers,
take an item into their custody and return it by scanning its QR code on their
own phone. They are recorded as **non-registered members** (NRMs), so their
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

- a note on the item ("**Maria P.** took custody via self-service scan.");
- a `CUSTODY_ASSIGNED` or `CUSTODY_RELEASED` activity event with no acting
  user, linked to the volunteer's NRM, marked `via: self-service`.

## Protection

The page is public: anyone holding the sticker, or a photo of it, can open it.
The following limits are in place:

| Limit                                               | Value                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Wrong PINs per phone (IP address)                   | 5 in 15 minutes, then locked for 15 minutes                                                     |
| Wrong PINs per workspace, from any number of phones | 50 in 15 minutes, then self-service locks for 15 minutes                                        |
| Requests to the page per IP address                 | 30 per minute                                                                                   |
| Name search                                         | nothing listed under 3 letters, at most 10 names, NRMs only (registered users are never listed) |
| New names                                           | 2 to 60 characters; the same name in different case or spacing reuses the existing NRM          |

Everything is checked on the server for every action: that self-service is
still on, that the phone holds an unlock for the current PIN, and the item's
current state. Two volunteers taking the same item at the same moment cannot
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

| Piece                                                       | Path                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Public page                                                 | `apps/webapp/app/routes/qr+/_public+/$qrId_.self-custody.tsx`                      |
| Redirect from an anonymous scan                             | `apps/webapp/app/routes/qr+/_public+/$qrId.tsx`                                    |
| Settings page                                               | `apps/webapp/app/routes/_layout+/settings.self-service.tsx`                        |
| Services (PIN, lockout, cookie, volunteers, custody, email) | `apps/webapp/app/modules/self-custody/`                                            |
| Manager email                                               | `apps/webapp/app/emails/self-custody-alert.tsx`                                    |
| Email audience                                              | `notifications.selfCustodyAlerts` in `packages/permissions/src/policies.ts`        |
| Rate limit                                                  | `selfCustodyRateLimit` in `apps/webapp/server/rate-limit.ts`                       |
| Schema                                                      | `Organization.selfCustodyEnabled`, `selfCustodyPinHash`, `selfCustodyPinUpdatedAt` |
