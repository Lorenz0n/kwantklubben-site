"""Fail if any page has drifted from the shared blocks or broken a site invariant.

The site has no build step and no templating (a deliberate choice — see
docs/superpowers/specs/2026-07-17-site-restructure-design.md, D-9), so
HEAD-COMMON, NAV, FOOTER and SCRIPTS are literally duplicated in every page.
Every path inside them is root-relative (D-8) precisely so they *can* be
byte-identical.

This file replaced tools/check-partials.py after the 2026-07-29 relaunch
(38a783c, reverted in aa3da65). That commit grew the site from three pages to
five, hand-edited the old script's hardcoded three-file list, and shipped:

  * three pages whose font URL had lost `&family=Chewy`, so the 37vw footer
    wordmark fell back to system cursive — at metrics the -3.3vw nudge was not
    tuned for, which clipped it out of its own overflow:hidden box;
  * a `.kk-footer{display:grid}` rule (0,1,0) that silently out-specified the
    mobile `footer{display:block}` override (0,0,1), so the footer overlay was
    never undone on phones;
  * nav markup switched to an `.is-open` class while kk-nav.js still drove the
    `hidden` attribute.

Only the first is pure block drift. The other two are invariants a diff between
two files cannot see, so this script checks invariants as well — and it globs
the page list rather than hardcoding it, so adding a sixth page cannot silently
opt out of the check.

    python tools/check-site.py

Exit code 0 = clean, 1 = at least one failure.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BLOCKS = ["HEAD-COMMON", "NAV", "FOOTER", "SCRIPTS"]

# The one page every other page is compared against. Pinned rather than taken
# from the front of the sorted glob, so failure messages always name index.html
# as the source of truth instead of whichever page happens to sort first.
REFERENCE = ROOT / "index.html"

# Redirect stubs carry no shared blocks by design. They opt out with a REDIRECT
# marker in an HTML comment — a marker in the file itself, so the opt-out is
# visible when you read the page rather than buried in this script.
def _is_redirect(path):
    return "REDIRECT" in path.read_text(encoding="utf-8")


def _discover():
    found = sorted(
        p for p in ROOT.glob("**/index.html")
        if ".git" not in p.parts and not _is_redirect(p)
    )
    if REFERENCE in found:
        found.remove(REFERENCE)
        return [REFERENCE] + found
    return found


PAGES = _discover()

FORM_URL = "https://forms.gle/P5Aw4ka85QUZiUmZ9"


def rel(path):
    return path.relative_to(ROOT).as_posix()


def grab(text, name, path):
    """Return the body between <!-- ==== NAME ==== --> and <!-- ==== /NAME ==== -->."""
    pattern = r"<!-- =+ %s =+ -->\n(.*?)<!-- =+ /%s =+ -->" % (
        re.escape(name), re.escape(name),
    )
    match = re.search(pattern, text, re.S)
    if not match:
        print("FAIL %s: missing or malformed '%s' block sentinels" % (rel(path), name))
        return None
    return match.group(1)


def check_blocks(sources):
    """Every shared block byte-identical across every page."""
    failures = 0
    for name in BLOCKS:
        reference = grab(sources[PAGES[0]], name, PAGES[0])
        if reference is None:
            failures += 1
            continue
        for path in PAGES[1:]:
            body = grab(sources[path], name, path)
            if body is None:
                failures += 1
            elif body != reference:
                print("FAIL %s: '%s' block differs from %s"
                      % (rel(path), name, rel(PAGES[0])))
                failures += 1
    return failures


def check_invariants(sources):
    """Content facts that must hold on every page, which a diff cannot see."""
    failures = 0
    for path in PAGES:
        text = sources[path]

        # The wordmark is set in Chewy at 37vw with a -3.3vw nudge tuned to
        # Chewy's own internal leading. Without the font it falls back to system
        # cursive and clips out of its box. This is the 2026-07-29 bug.
        if "family=Chewy" not in text:
            print("FAIL %s: font URL is missing &family=Chewy — the KWANT "
                  "wordmark falls back to system cursive" % rel(path))
            failures += 1

        if "kk-footer-word" not in text:
            print("FAIL %s: no .kk-footer-word — the KWANT wordmark is absent"
                  % rel(path))
            failures += 1

        # kk-nav.js owns the `hidden` attribute and drops it on init. Markup
        # that ships without it renders the drawer OPEN on the poster-QR path
        # (mobile data, cold cache) until the deferred script lands.
        nav_panel = re.search(r'<div[^>]*id="kk-nav-panel"[^>]*>', text)
        if nav_panel is None:
            print("FAIL %s: no #kk-nav-panel — the mobile drawer is missing"
                  % rel(path))
            failures += 1
        elif " hidden" not in nav_panel.group(0):
            print("FAIL %s: #kk-nav-panel must ship with the `hidden` attribute "
                  "— kk-nav.js drives the attribute, not a class" % rel(path))
            failures += 1

        if "TODO(content)" in text or "REPLACE_ME" in text:
            print("FAIL %s: unresolved TODO(content)/REPLACE_ME marker" % rel(path))
            failures += 1

        # A stale or mistyped application link is the single most expensive copy
        # bug on the site — every poster and every LinkedIn post points at it.
        for found in re.findall(r'https://forms\.gle/[A-Za-z0-9]+', text):
            if found != FORM_URL:
                print("FAIL %s: form link %s does not match %s"
                      % (rel(path), found, FORM_URL))
                failures += 1
    return failures


def check_links(sources):
    """Every root-relative href in the shared nav resolves to a file that exists."""
    nav = grab(sources[PAGES[0]], "NAV", PAGES[0])
    if nav is None:
        return 1
    failures = 0
    for href in re.findall(r'href="(/[^"#]*)"', nav):
        target = ROOT / "index.html" if href == "/" else ROOT / href.strip("/") / "index.html"
        if not target.exists():
            print('FAIL nav: href="%s" resolves to a missing %s' % (href, rel(target)))
            failures += 1
    return failures


def main():
    if not PAGES:
        print("FAIL: no pages found under %s" % ROOT)
        return 1
    if PAGES[0] != REFERENCE:
        print("FAIL: %s is missing — it is the source of truth for every "
              "shared block" % rel(REFERENCE))
        return 1

    # read_text() applies universal newlines, so the repo's CRLF working tree
    # (git warns "LF will be replaced by CRLF") cannot trigger a false drift.
    sources = {p: p.read_text(encoding="utf-8") for p in PAGES}

    failures = check_blocks(sources) + check_invariants(sources) + check_links(sources)

    if failures:
        print("\n%d failure(s) across %d page(s)" % (failures, len(PAGES)))
        return 1
    print("ok: %d blocks identical and invariants hold across %d pages"
          % (len(BLOCKS), len(PAGES)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
