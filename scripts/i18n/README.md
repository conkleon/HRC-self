# i18n tooling

Scripts that convert webapp screens to translated text and keep the Greek in
step. The conventions they implement are in
[apps/docs/translations.md](../../apps/docs/translations.md).

| File                      | What it does                                                         |
| ------------------------- | -------------------------------------------------------------------- |
| `extract.js`              | Codemod: hard-coded JSX text and props to `t()` / `<Trans>`          |
| `blockers.js`             | Codemod: scanner blocker `message`/`description` to plural `<Trans>` |
| `check-deps.js`           | Lists memos/effects that call `t` without `t` in their deps          |
| `check-mixed.js`          | Lists elements mixing translated pieces with leftover English        |
| `prune.py`                | Drops English keys no source file references any more                |
| `tm.py`                   | Translation memory: list untranslated strings, merge, build `el/`    |
| `translation-memory.json` | Every English string translated so far, with its Greek               |

The codemods need `ts-morph` (a root dev dependency). `prune.py` and `tm.py`
need Python 3.

## Converting an area

Run from `apps/webapp`. `<area>` is the locale file the strings go to
(`assets`, `bookings`, ...); create `locales/en/<area>.json` and
`locales/el/<area>.json` as `{}` and register them in `app/i18n/resources.ts`
first if the area is new.

```bash
# 1. Text, props and ?: branches, then whole sentences with inline elements
node ../../scripts/i18n/extract.js audits app/i18n/locales /tmp/report.txt app/routes/_layout+/audits*.tsx app/components/audit/*.tsx
node ../../scripts/i18n/extract.js audits app/i18n/locales /tmp/report.txt --trans app/routes/_layout+/audits*.tsx app/components/audit/*.tsx

# 2. Fix what the report and the checks list, by hand:
#    plural fragments become `_one` / `_other` keys, and conditionals inside a
#    sentence become one key per variant
node ../../scripts/i18n/check-mixed.js $(git diff --name-only -- . | sed 's#^apps/webapp/##' | grep tsx$)
node ../../scripts/i18n/check-deps.js  $(git diff --name-only -- . | sed 's#^apps/webapp/##' | grep tsx$)
python3 ../../scripts/i18n/prune.py audits

# 3. Translate only what the memory does not know yet
python3 ../../scripts/i18n/tm.py todo audits      # writes scripts/i18n/.work/todo-audits.json
#    write the Greek, index-aligned, to a JSON array file, then:
python3 ../../scripts/i18n/tm.py merge audits greek.json
python3 ../../scripts/i18n/tm.py build audits     # writes locales/el/audits.json

# 4. Verify
pnpm webapp:validate
```

The report's reasons:

- `mixed-inline` / `trans-skip`: a sentence around elements or conditionals;
  write one key per variant, or a `<Trans>` by hand.
- `no-component`: text outside a component (module-level constants, pure
  builders). Return a `<Trans i18nKey="..." />` element instead, or move the
  text into a component.
- `t-collision`: the component already uses `t` as a variable; rename it and
  re-run.
- `complex-template`: a template string with expressions the codemod will not
  rewrite.

Edits made by hand to `locales/el/*.json` are kept by the next `build` only if
they are in the memory too: run `tm.py seed` after editing Greek files directly.
When the same English appears in several areas, one Greek wording wins for all
of them.

`labels.json` (status, type and role names) is edited by hand and never built,
because one English word needs different Greek genders: an asset is
"Δεσμευμένο", a booking "Δεσμευμένη".
