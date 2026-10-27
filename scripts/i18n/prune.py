"""Removes keys from locales/en/<area>.json that no webapp source references.

  python3 scripts/i18n/prune.py <area>

Run it after rewriting fragments into whole sentences, then rebuild the other
languages with tm.py so they drop the same keys. Plural variants (_one,
_other, ...) count as used when their base key is. Nested groups (such as
scanner.blockers) are left alone, because their keys are built by id.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(os.path.dirname(os.path.dirname(HERE)), "apps", "webapp", "app")

area = sys.argv[1]
path = os.path.join(APP, "i18n", "locales", "en", f"{area}.json")
data = json.load(open(path, encoding="utf-8"))
found = subprocess.run(
    ["grep", "-rhoE", '"' + area + r'\.[A-Za-z0-9_.]+"', APP, "--include=*.ts", "--include=*.tsx"],
    capture_output=True,
    text=True,
).stdout
used = {s.strip('"') for s in found.split()}

removed = []
for group in list(data):
    if not isinstance(data[group], dict):
        continue
    for key in list(data[group]):
        if isinstance(data[group][key], dict):
            continue
        base = re.sub(r"_(zero|one|two|few|many|other)$", "", key)
        if f"{area}.{group}.{base}" not in used:
            removed.append(f"{group}.{key}")
            del data[group][key]
    if not data[group]:
        del data[group]

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
print(f"removed {len(removed)}:", removed)
