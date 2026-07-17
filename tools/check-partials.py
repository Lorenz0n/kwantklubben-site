"""Fail if the copy-paste blocks have drifted between the three HTML pages.

The site has no build step and no templating (a deliberate choice — see
docs/superpowers/specs/2026-07-17-site-restructure-design.md, D-9), so the nav,
footer, shared <head> and script tags are literally duplicated in index.html,
projects/index.html and sponsors/index.html. Every path in those blocks is
root-relative (D-8) precisely so they *can* be byte-identical. This script is what
turns that from an aspiration into a checked fact.

This is NOT a build step. It produces nothing, the site works without it, and it
is never on the deploy path. Run it before pushing:

    python tools/check-partials.py

Exit code 0 = identical, 1 = drift (or missing sentinels).
"""
import pathlib
import re
import sys

FILES = ["index.html", "projects/index.html", "sponsors/index.html"]
BLOCKS = ["HEAD-COMMON", "NAV", "FOOTER", "SCRIPTS"]
ROOT = pathlib.Path(__file__).resolve().parent.parent


def grab(text, name, path):
    """Return the body between <!-- ==== NAME ==== --> and <!-- ==== /NAME ==== -->."""
    pattern = r"<!-- =+ %s =+ -->\n(.*?)<!-- =+ /%s =+ -->" % (re.escape(name), re.escape(name))
    match = re.search(pattern, text, re.S)
    if not match:
        sys.exit("%s: missing or malformed '%s' block sentinels" % (path, name))
    return match.group(1)


def main():
    # read_text() applies universal newlines, so the repo's CRLF working tree
    # (git warns "LF will be replaced by CRLF") can't trigger a false drift.
    sources = {f: (ROOT / f).read_text(encoding="utf-8") for f in FILES}

    drifted = False
    for name in BLOCKS:
        reference = grab(sources[FILES[0]], name, FILES[0])
        for other in FILES[1:]:
            if grab(sources[other], name, other) != reference:
                print("DRIFT: '%s' differs between %s and %s" % (name, FILES[0], other))
                drifted = True

    if drifted:
        return 1
    print("ok: %d blocks identical across %d files" % (len(BLOCKS), len(FILES)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
