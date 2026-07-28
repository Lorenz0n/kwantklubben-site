#!/usr/bin/env python3
"""Check that every page carries the same navigation and footer links."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "index.html",
    "about/index.html",
    "projects/index.html",
    "partners/index.html",
    "contact/index.html",
]
EXPECTED_NAV = ["/about/", "/projects/", "/partners/", "/contact/"]
EXPECTED_SHARED = [
    "https://forms.gle/P5Aw4ka85QUZiUmZ9",
    "mailto:hello@kwantklubben.com",
    "https://www.linkedin.com/company/kwant-klubben",
]


def main() -> int:
    errors = []
    for relative in FILES:
        path = ROOT / relative
        text = path.read_text(encoding="utf-8")
        nav_match = re.search(r'<div class="kk-nav__panel".*?</div>', text, re.S)
        footer_match = re.search(r'<footer class="kk-footer">.*?</footer>', text, re.S)
        if not nav_match:
            errors.append(f"{relative}: navigation missing")
            continue
        if not footer_match:
            errors.append(f"{relative}: footer missing")
            continue
        nav = nav_match.group(0)
        footer = footer_match.group(0)
        for link in EXPECTED_NAV:
            if f'href="{link}"' not in nav:
                errors.append(f"{relative}: navigation missing {link}")
        for link in EXPECTED_SHARED:
            if link not in text:
                errors.append(f"{relative}: shared link missing {link}")
        if "kk-footer-word" not in footer or ">KWANT<" not in footer:
            errors.append(f"{relative}: KWANT footer wordmark missing")
    if errors:
        print("shared page check failed:")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print(f"shared page check passed: navigation, contact, application, and footer across {len(FILES)} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
