---
description: Every user-facing string in the webapp goes through i18next, as a whole sentence
paths:
  - "apps/webapp/app/**/*.tsx"
  - "apps/webapp/app/i18n/**"
---

# User-Facing Text Goes Through `t()`

The webapp ships English and Greek (`apps/webapp/app/i18n/`). A hard-coded
string shows English to a Greek user, and nothing fails: add the English to
`locales/en/<area>.json`, the Greek to `locales/el/<area>.json` (the parity
test fails until you do), and render it with `t()` or `<Trans>`.

Translate **whole sentences**. A sentence assembled from fragments or an
English plural suffix cannot be translated, because Greek order and agreement
differ.

```tsx
// ❌ Bad
<p>{count} asset{count === 1 ? "" : "s"} {t("assets.x.willBeAdded")}</p>
<Trans i18nKey="a.b" components={{ 0: <Link to={url} /> }} />  // slot dropped

// ✅ Good: plural keys a.b_one / a.b_other, numbered slots in an ARRAY
<p>{t("assets.x.willBeAdded", { count })}</p>
<Trans t={t} i18nKey="a.b" components={[<Link key="slot0" to={url} />]} />
```

Use `t` in a memo/effect only with `t` in its deps. Never branch on display
text; match ids or enums. Use the Greek terms in `i18n/GLOSSARY.md`.
Full guide: `apps/docs/translations.md`.
