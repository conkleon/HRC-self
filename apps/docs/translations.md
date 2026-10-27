# Translations (i18n)

The webapp ships in English and Greek. Every user-facing string is looked up
through [i18next](https://www.i18next.com/) and
[react-i18next](https://react.i18next.com/), so adding a language is a matter
of adding a folder of JSON files.

## Choosing the language

The language of each request is resolved on the server, in this order:

1. The user's own choice: **Account settings → Language & region → Language**
   (stored in `User.locale`).
2. The instance default, `DEFAULT_LOCALE` in `.env` (e.g. `DEFAULT_LOCALE="el"`).
   Pages without a session (login, the self-service page) always use this.
3. English.

The root loader resolves it once per navigation and sets `<html lang>`, so the
server render and the browser agree. Saving the Language & region form re-runs
the root loader, which switches the whole app at once.

## Where strings live

```
apps/webapp/app/i18n/
├── config.ts          # SUPPORTED_LOCALES, resolveLocale()
├── instance.ts        # createI18n(locale)
├── i18n.server.ts     # getServerT(context) for loaders and actions
├── use-label.ts       # useLabel(): translates @shelf/labels constants
├── GLOSSARY.md        # fixed Greek terms (asset, kit, custody, ...)
└── locales/
    ├── en/<area>.json # English: the source of truth
    └── el/<area>.json # Greek: must mirror English exactly
```

Each `<area>.json` (`assets`, `bookings`, `kits`, `custody`, `scanner`, `auth`,
`nav`, `settings`, `common`, `labels`) is a top-level key, so
`t("assets.form.save")` reads `locales/<lang>/assets.json`.

Keys are **typed** against the English files: a misspelt or removed key is a
compile error. `locale-parity.test.ts` fails when a Greek file is missing a key,
has an extra one, leaves a value empty, or drops a `{{placeholder}}` or a
`<0>` component tag.

## Writing translatable UI

```tsx
// Plain text and props
const { t } = useTranslation();
<Button>{t("assets.form.save")}</Button>
<Input label={t("assets.form.name")} />

// Values
t("bookings.dates.overdueBy", { days })        // "Overdue by {{days}} days"

// Plurals: _one / _other keys, chosen by `count`
t("assets.bulkAddToKitDialog.description", { count: selected.length })

// A sentence that wraps elements: one key, numbered slots
<Trans
  t={t}
  i18nKey="kits.kitsKitidAssetsAssignCustody.kitIsPartOfAn"
  components={[<Link key="slot0" to={url} />]}
/>
// "Kit is part of an <0>upcoming booking</0>. ..."
```

Rules that keep translations correct:

- **Translate whole sentences.** Never build a sentence from fragments
  (`` `${count} asset${count > 1 ? "s" : ""}` ``, `"Add" + t("another")`).
  Greek word order and agreement differ; use a plural key or `<Trans>`.
- **Numbered `<Trans>` slots need an array**, not an object:
  `components={[...]}`. An object is not read by position and the wrapped
  element silently disappears.
- **Put `t` in the dependency array** of any `useMemo`, `useCallback` or
  `useEffect` that calls it, or memoised text keeps the old language after a
  switch.
- **Pure builders** (scanner blockers, column definitions at module scope)
  cannot call hooks. Return `<Trans i18nKey="..." count={n} />`: it reads the
  language from React context when it renders.
- **Text built on the server** (loader headings, toasts) uses
  `const t = await getServerT(context)`.
- **Never compare against display text.** Match by id or enum: a translated
  title no longer equals `"Updates"`.
- Strings users must type exactly (`I AGREE`, CSV column names, field types)
  stay in English in every language.

## Converting a screen

`scripts/i18n/` holds the codemods that rewrote phase 1, the checks for the
mistakes above, and the translation memory the Greek files are built from.
Its [README](../../scripts/i18n/README.md) walks through converting an area.

## Adding a language

1. Add the code and its native name to `SUPPORTED_LOCALES` and
   `LOCALE_NATIVE_NAMES` in `config.ts`.
2. Copy `locales/en/` to `locales/<code>/` and translate the values.
3. Register the files in `resources.ts`.
4. Run the parity test: `pnpm webapp:test -- --run app/i18n`.

## Not translated yet

Phase 1 covers sign-in, navigation, assets, bookings, kits, custody (including
the self-service page) and the scanner. Still in English: settings and admin
pages, reports, audits, locations, categories, emails, PDFs, and messages
built on the server (toasts, validation and error messages). They fall back to
English cleanly until their area is converted.
