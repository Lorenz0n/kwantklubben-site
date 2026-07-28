#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGES = {
    "/": ROOT / "index.html",
    "/about/": ROOT / "about/index.html",
    "/projects/": ROOT / "projects/index.html",
    "/partners/": ROOT / "partners/index.html",
    "/contact/": ROOT / "contact/index.html",
}
REQUIRED = {
    "https://forms.gle/P5Aw4ka85QUZiUmZ9": "application link",
    "mailto:hello@kwantklubben.com": "club email",
    "https://www.linkedin.com/company/kwant-klubben": "LinkedIn link",
}
STALE = re.compile(r"TODO\(content\)|REPLACE_ME|live paper|Honestly killed|Survived validation|Strategies spec'd|IBKR paper|USD 100k|Net Sharpe|permutation p|trials\.csv", re.I)

errors = []
for route, path in PAGES.items():
    if not path.exists():
        errors.append(f"{route}: missing {path.relative_to(ROOT)}")
        continue
    text = path.read_text(encoding="utf-8")
    if not text.lstrip().lower().startswith("<!doctype html>"):
        errors.append(f"{route}: missing doctype")
    if STALE.search(text):
        errors.append(f"{route}: stale or unsupported claim found")
    for needle, label in REQUIRED.items():
        if needle not in text:
            errors.append(f"{route}: missing {label}")

for path in PAGES.values():
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    if 'class="kk-nav__panel" id="kk-nav-panel"' not in text:
        errors.append(f"{path.relative_to(ROOT)}: missing navigation panel")
    if 'class="kk-footer-word' not in text:
        errors.append(f"{path.relative_to(ROOT)}: missing KWANT footer wordmark")

if errors:
    print("site check failed:")
    print("\n".join(f"- {error}" for error in errors))
    sys.exit(1)

print(f"site check passed: {len(PAGES)} pages, required links present, stale claims absent")
