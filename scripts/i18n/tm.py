"""Translation-memory helper for the webapp's Greek (or any second) locale.

Every English string that has been translated once is kept in
translation-memory.json, so a string reused across screens ("Cancel",
"Location") is translated once and reads the same everywhere.

  python3 scripts/i18n/tm.py todo <area> [lang]
      Writes scripts/i18n/.work/todo-<area>.json: the English values in
      locales/en/<area>.json that have no translation yet, in order.

  python3 scripts/i18n/tm.py merge <area> <file.json>... [--lang el]
      Adds index-aligned translations of that todo list to the memory.
      Refuses translations that lose a {{placeholder}} or <tag>.

  python3 scripts/i18n/tm.py build <area> [lang]
      Writes locales/<lang>/<area>.json from locales/en/<area>.json and the
      memory. Fails, listing them, when a string has no translation.

  python3 scripts/i18n/tm.py seed [lang]
      Adds every pair from the existing locales/<lang>/*.json to the memory,
      overwriting older entries: run it after editing Greek files directly,
      or the next build would restore the old wording. labels.json is
      maintained by hand and skipped.

The language defaults to "el". See apps/docs/translations.md.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
LOC = os.path.join(REPO, "apps", "webapp", "app", "i18n", "locales")
WORK = os.path.join(HERE, ".work")

# Areas edited by hand, never built from the memory: the same English word
# ("Reserved") needs a different Greek gender for an asset and a booking.
HAND_MAINTAINED = {"labels"}


def memory_path(lang):
    name = "translation-memory.json" if lang == "el" else f"translation-memory.{lang}.json"
    return os.path.join(HERE, name)


def load_memory(lang):
    path = memory_path(lang)
    return json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}


def save_memory(lang, tm):
    with open(memory_path(lang), "w", encoding="utf-8") as f:
        json.dump(dict(sorted(tm.items())), f, ensure_ascii=False, indent=1)
        f.write("\n")


def values(node, out):
    for v in node.values():
        if isinstance(v, dict):
            values(v, out)
        elif v not in out:
            out.append(v)
    return out


def pairs(en, other):
    for k, v in en.items():
        if isinstance(v, dict):
            yield from pairs(v, other.get(k, {}))
        elif k in other:
            yield v, other[k]


def marks(s):
    """Placeholders and component tags, which every translation must keep."""
    return sorted(re.findall(r"\{\{\s*([\w.]+)[^}]*\}\}", s) + re.findall(r"</?\w+>", s))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    lang = "el"
    if "--lang" in sys.argv:
        lang = sys.argv[sys.argv.index("--lang") + 1]
        args.remove(lang)
    cmd = args[0]
    tm = load_memory(lang)
    os.makedirs(WORK, exist_ok=True)

    if cmd == "seed":
        lang = args[1] if len(args) > 1 else lang
        tm = load_memory(lang)
        added = 0
        for f in sorted(os.listdir(os.path.join(LOC, "en"))):
            other = os.path.join(LOC, lang, f)
            if not os.path.exists(other):
                continue
            en = json.load(open(os.path.join(LOC, "en", f), encoding="utf-8"))
            if f == "labels.json":
                continue  # hand-maintained; see HAND_MAINTAINED
            for a, b in pairs(en, json.load(open(other, encoding="utf-8"))):
                # The locale files are what reviewers edit, so they win.
                if marks(a) == marks(b) and tm.get(a) != b:
                    tm[a] = b
                    added += 1
        save_memory(lang, tm)
        print(f"seeded or updated {added}, memory has {len(tm)} entries")
        return

    area = args[1]
    if cmd in ("todo", "build") and len(args) > 2:
        lang = args[2]
        tm = load_memory(lang)
    en = json.load(open(os.path.join(LOC, "en", f"{area}.json"), encoding="utf-8"))

    if cmd == "todo":
        todo = [v for v in values(en, []) if v not in tm]
        with open(os.path.join(WORK, f"todo-{area}.json"), "w", encoding="utf-8") as f:
            json.dump(todo, f, ensure_ascii=False, indent=0)
        print(f"{len(todo)} new strings for {area}")
    elif cmd == "merge":
        todo = json.load(open(os.path.join(WORK, f"todo-{area}.json"), encoding="utf-8"))
        translated = sum((json.load(open(c, encoding="utf-8")) for c in args[2:]), [])
        if len(translated) != len(todo):
            sys.exit(f"{len(translated)} translations for {len(todo)} English strings")
        bad = [(a, b) for a, b in zip(todo, translated) if marks(a) != marks(b)]
        for a, b in bad:
            print("PLACEHOLDER MISMATCH:", a, "|", b)
        if bad:
            sys.exit(1)
        tm.update(zip(todo, translated))
        save_memory(lang, tm)
        print(f"memory has {len(tm)} entries")
    elif cmd == "build":
        if area in HAND_MAINTAINED:
            sys.exit(f"{area}.json is maintained by hand; edit locales/{lang}/{area}.json directly")
        missing = []

        def translate(node):
            out = {}
            for k, v in node.items():
                if isinstance(v, dict):
                    out[k] = translate(v)
                elif v in tm:
                    out[k] = tm[v]
                else:
                    missing.append(v)
            return out

        result = translate(en)
        if missing:
            print("MISSING:", json.dumps(missing, ensure_ascii=False, indent=1))
            sys.exit(1)
        with open(os.path.join(LOC, lang, f"{area}.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"built {lang}/{area}.json")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
