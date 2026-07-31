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
#
# The marker must be an actual comment near the top AND the page must really be
# a redirect. A bare `"REDIRECT" in text` test (the first version of this) let
# any page opt out of every check by containing that word anywhere at all — in
# prose, in a URL, in a comment — with nothing in the output to show it had.
REDIRECT_MARKER = re.compile(r"<!--\s*REDIRECT\b")
SKIPPED = []


def _is_redirect(path):
    text = path.read_text(encoding="utf-8", errors="replace")
    if not REDIRECT_MARKER.search(text[:800]):
        return False
    if 'http-equiv="refresh"' not in text:
        return False
    if 'id="kk-nav-panel"' in text:   # a real page wearing the marker
        return False
    SKIPPED.append(path)
    return True


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

        # A class on the <footer> ELEMENT is the 2026-07-29 mobile bug. The
        # override that undoes the wordmark overlay is `footer{display:block}`
        # at (0,0,1); any class selector out-specifies it. Guarded on both
        # sides — here in the markup, and in check_css() for the stylesheet.
        if re.search(r"<footer[^>]*\sclass=", text):
            print("FAIL %s: <footer> carries a class — it out-specifies the "
                  "mobile `footer{display:block}` override and strands the "
                  "KWANT wordmark behind the footer text" % rel(path))
            failures += 1

        # kk-nav.js owns the `hidden` attribute and drops it on init. Markup
        # that ships without it renders the drawer OPEN on the poster-QR path
        # (mobile data, cold cache) until the deferred script lands.
        #
        # Matched at attribute position, not as the substring " hidden": a class
        # list like class="kk-nav__panel hidden" satisfies a substring test while
        # being exactly the class-instead-of-attribute swap this check exists to
        # catch, and `hidden` is a real utility class name in common frameworks.
        nav_panel = re.search(r'<\w+[^>]*id=["\']kk-nav-panel["\'][^>]*>', text)
        if nav_panel is None:
            print("FAIL %s: no #kk-nav-panel — the mobile drawer is missing"
                  % rel(path))
            failures += 1
        else:
            tag = nav_panel.group(0)
            attrs = re.sub(r'=\s*("[^"]*"|\'[^\']*\')', "", tag)  # drop values
            if not re.search(r'(?<=[\s])hidden(?=[\s>/])', attrs):
                print("FAIL %s: #kk-nav-panel must ship with the `hidden` "
                      "ATTRIBUTE — kk-nav.js drives the attribute, not a class"
                      % rel(path))
                failures += 1

        if "TODO(content)" in text or "REPLACE_ME" in text:
            print("FAIL %s: unresolved TODO(content)/REPLACE_ME marker" % rel(path))
            failures += 1

        # A stale or mistyped application link is the single most expensive copy
        # bug on the site — every poster and every LinkedIn post points at it.
        #
        # Match any application-link SHAPE, not just already-correct ones. The
        # first version only compared strings that already looked like
        # `https://forms.gle/...`, so an http:// link, a docs.google.com/forms
        # link, or a silently deleted CTA all passed.
        links = re.findall(
            r'https?://(?:forms\.gle|docs\.google\.com/forms)[^"\s<]*', text)
        for found in links:
            if found != FORM_URL:
                print("FAIL %s: application link %s is not %s"
                      % (rel(path), found, FORM_URL))
                failures += 1
        if not links:
            print("FAIL %s: no application link at all — every page carries the "
                  "Join CTA in the shared nav" % rel(path))
            failures += 1
    return failures


def check_css():
    """The cascade rules the site's layout depends on, asserted in the stylesheet.

    Both of these broke in 38a783c, and neither is visible to a page-to-page
    diff — which is the whole reason this file checks more than block drift.
    """
    path = ROOT / "css" / "styles.css"
    if not path.exists():
        print("FAIL: css/styles.css is missing")
        return 1
    raw = path.read_text(encoding="utf-8")
    # Blank out comments, preserving newlines so reported line numbers still
    # match the file. The rules below are ABOUT the cascade, and the stylesheet
    # explains them in prose that necessarily names the very selectors it
    # forbids — scanning the raw text flags its own documentation.
    css = re.sub(r"/\*.*?\*/",
                 lambda m: re.sub(r"[^\n]", " ", m.group(0)), raw, flags=re.S)
    failures = 0

    # `.kk-footer__inner`, `.kk-footer__links` and `.kk-footer-word` are fine —
    # they are descendants. A bare `.kk-footer` class selector is not.
    bare = re.search(r"\.kk-footer(?![\w-])", css)
    if bare:
        line = css[:bare.start()].count("\n") + 1
        print("FAIL css/styles.css:%d: bare `.kk-footer` class selector. At "
              "(0,1,0) it out-specifies the mobile `footer{display:block}` "
              "override at (0,0,1). Style the ELEMENT." % line)
        failures += 1

    if not re.search(r"(?<![\w.\-])footer\s*\{\s*display:\s*block", css):
        print("FAIL css/styles.css: the mobile `footer{ display:block; }` "
              "override is gone — the KWANT wordmark will sit behind the "
              "footer text on phones instead of below it")
        failures += 1

    # The mobile drawer block must not declare `display`: it ties with
    # `.kk-nav__panel[hidden]` at (0,2,0) and wins on source order, which makes
    # `hidden` inert and leaves the drawer open and in the tab order.
    panel = re.search(r"\.js \.kk-nav__panel\s*\{(.*?)\}", css, re.S)
    if panel and re.search(r"(?<![\w-])display\s*:", panel.group(1)):
        line = css[:panel.start()].count("\n") + 1
        print("FAIL css/styles.css:%d: `.js .kk-nav__panel` declares `display`. "
              "It ties with `.kk-nav__panel[hidden]` and wins on source order, "
              "making the `hidden` attribute inert." % line)
        failures += 1

    # A stray `}` at the top level is silent: the browser does not warn, the
    # file still loads, and every rule up to it still applies -- but the parser
    # discards the NEXT rule while recovering. A dangling declaration left
    # behind by an edit cost `.kk-loop-grid` its `display:grid` this way, and
    # the only symptom was the "How it works" band quietly stacking.
    depth = 0
    for i, ch in enumerate(css):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth < 0:
                line = css[:i].count("\n") + 1
                print("FAIL css/styles.css:%d: unbalanced `}` at the top level. "
                      "CSS error recovery swallows the rule that FOLLOWS it, so "
                      "the damage shows up somewhere else entirely." % line)
                failures += 1
                break
    else:
        if depth != 0:
            print("FAIL css/styles.css: %d unclosed `{` — everything after it is "
                  "absorbed into the wrong rule." % depth)
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


def check_inline_styles(sources):
    """No `style=` attributes in the pages.

    173 of them were lifted into named classes so that a page reads as its words
    plus a class name and the copy can be found and changed without wading
    through declarations. One inline style added back is not a disaster, but
    fifty are, and fifty is what you get by adding one at a time.
    """
    failures = 0
    for path, text in sources.items():
        for m in re.finditer(r'<(\w+)[^>]*?\sstyle="([^"]*)"', text):
            line = text[:m.start()].count("\n") + 1
            print("FAIL %s:%d: inline style on <%s>. Give it a class in "
                  "css/styles.css instead — see EDITING.md.\n"
                  "     %s" % (rel(path), line, m.group(1), m.group(2)[:80]))
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

    failures = (check_blocks(sources) + check_invariants(sources)
                + check_links(sources) + check_css()
                + check_inline_styles(sources))

    # Print what opted out, so a page escaping the checks is visible in CI
    # rather than silently absent from the count.
    for p in SKIPPED:
        print("note: %s skipped (REDIRECT stub)" % rel(p))

    if failures:
        print("\n%d failure(s) across %d page(s)" % (failures, len(PAGES)))
        return 1
    print("ok: %d blocks identical, invariants and CSS cascade rules hold "
          "across %d pages" % (len(BLOCKS), len(PAGES)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
