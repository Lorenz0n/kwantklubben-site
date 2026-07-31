"""Fail if the site has broken an invariant that a file diff cannot see.

HISTORY. HEAD-COMMON, NAV, FOOTER and SCRIPTS used to be literally duplicated in
every page, and most of this script existed to catch them drifting apart. They
now live once in `_layouts/default.html` and GitHub Pages assembles the pages
with Jekyll, so drift is no longer possible and that check is gone.

What is NOT gone is the reason the check existed. The 2026-07-29 relaunch shipped
three bugs, and only one of them was drift:

  * three pages whose font URL had lost `&family=Chewy`, so the 37vw footer
    wordmark fell back to system cursive — at metrics the -3.3vw nudge was not
    tuned for, which clipped it out of its own overflow:hidden box;
  * a `.kk-footer{display:grid}` rule (0,1,0) that silently out-specified the
    mobile `footer{display:block}` override (0,0,1), so the footer overlay was
    never undone on phones;
  * nav markup switched to an `.is-open` class while kk-nav.js still drove the
    `hidden` attribute.

The last two are invariants, not duplication, and they are still checked here —
now against the layout, which is the only copy. Two more were added later, each
after costing real time:

  * a stray `}` in the stylesheet, which makes the CSS parser discard the rule
    that FOLLOWS it. It cost `.kk-loop-grid` its `display:grid` and the symptom
    appeared nowhere near the cause;
  * inline `style=` attributes, 173 of which were lifted into named classes so
    the copy is findable. One added back is not a problem; fifty are.

    python tools/check-site.py

Exit code 0 = clean, 1 = at least one failure.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LAYOUT = ROOT / "_layouts" / "default.html"

# Redirect stubs are plain static files with no front matter and no layout. They
# opt out with a REDIRECT marker in an HTML comment — a marker in the file
# itself, so the opt-out is visible when you read the page rather than buried in
# this script.
#
# The marker must be an actual comment near the top AND the page must really be
# a redirect. A bare `"REDIRECT" in text` test (the first version of this) let
# any page opt out of every check by containing that word anywhere at all.
REDIRECT_MARKER = re.compile(r"<!--\s*REDIRECT\b")
SKIPPED = []

FORM_URL = "https://forms.gle/P5Aw4ka85QUZiUmZ9"


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
    """Glob the pages rather than hardcoding them, so a sixth page cannot
    silently opt out of the check by not being on a list."""
    return sorted(
        p for p in ROOT.glob("**/index.html")
        if ".git" not in p.parts
        and "_site" not in p.parts
        and not _is_redirect(p)
    )


PAGES = _discover()


def rel(path):
    return path.relative_to(ROOT).as_posix()


def check_build_model():
    """The Jekyll assumptions the whole site now rests on."""
    failures = 0
    if not LAYOUT.exists():
        print("FAIL: _layouts/default.html is missing — every page references it "
              "as `layout: default`, and without it Jekyll emits the page body "
              "with no <head>, no nav and no footer")
        return 1

    if (ROOT / ".nojekyll").exists():
        print("FAIL: .nojekyll is back. It switches Jekyll OFF, so the pages "
              "would be served with their raw `---` front matter visible at the "
              "top and no layout applied at all")
        failures += 1

    if not (ROOT / "_config.yml").exists():
        print("FAIL: _config.yml is missing — tools/ and the markdown docs would "
              "be published as part of the site")
        failures += 1
    return failures


def check_front_matter(sources):
    """Every page declares the layout and its own title and description."""
    failures = 0
    seen = {}
    for path in PAGES:
        text = sources[path]
        m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
        if not m:
            print("FAIL %s: no YAML front matter. Jekyll only applies a layout "
                  "to files that open with a `---` block, so this page would be "
                  "published as a bare fragment." % rel(path))
            failures += 1
            continue
        fm = m.group(1)
        if not re.search(r"^layout:\s*default\s*$", fm, re.M):
            print("FAIL %s: front matter does not set `layout: default`" % rel(path))
            failures += 1
        for key in ("title", "description"):
            mm = re.search(r"^%s:\s*'(.*)'\s*$" % key, fm, re.M)
            if not mm or not mm.group(1).strip():
                print("FAIL %s: front matter has no non-empty `%s`. It is what "
                      "fills <title>/<meta description> for this page."
                      % (rel(path), key))
                failures += 1
            elif key == "title":
                if mm.group(1) in seen:
                    print("FAIL %s: <title> is identical to %s. Every page needs "
                          "its own." % (rel(path), seen[mm.group(1)]))
                    failures += 1
                seen[mm.group(1)] = rel(path)

        # A page is a fragment now. A full document here would be wrapped in the
        # layout's <html>/<body> a second time.
        body = text[m.end():]
        if re.search(r"<!DOCTYPE|<html[\s>]|<body[\s>]", body, re.I):
            print("FAIL %s: page body contains a full HTML document. Pages are "
                  "fragments — the scaffolding lives in _layouts/default.html."
                  % rel(path))
            failures += 1
    return failures


def check_layout_invariants():
    """Content facts that must hold in the shared layout.

    These used to be asserted once per page. There is only one copy now, so they
    are asserted once — but they are the same invariants, and they still cannot
    be seen by diffing two files.
    """
    text = LAYOUT.read_text(encoding="utf-8")
    failures = 0

    # The wordmark is set in Chewy at 37vw with a -3.3vw nudge tuned to Chewy's
    # own internal leading. Without the font it falls back to system cursive and
    # clips out of its box. This is the 2026-07-29 bug.
    if "family=Chewy" not in text:
        print("FAIL _layouts/default.html: font URL is missing &family=Chewy — "
              "the KWANT wordmark falls back to system cursive")
        failures += 1

    if "kk-footer-word" not in text:
        print("FAIL _layouts/default.html: no .kk-footer-word — the KWANT "
              "wordmark is absent")
        failures += 1

    # A class on the <footer> ELEMENT is the 2026-07-29 mobile bug. The override
    # that undoes the wordmark overlay is `footer{display:block}` at (0,0,1);
    # any class selector out-specifies it. Guarded on both sides — here in the
    # markup, and in check_css() for the stylesheet.
    if re.search(r"<footer[^>]*\sclass=", text):
        print("FAIL _layouts/default.html: <footer> carries a class — it "
              "out-specifies the mobile `footer{display:block}` override and "
              "strands the KWANT wordmark behind the footer text")
        failures += 1

    # kk-nav.js owns the `hidden` attribute and drops it on init. Markup that
    # ships without it renders the drawer OPEN on the poster-QR path (mobile
    # data, cold cache) until the deferred script lands.
    #
    # Matched at attribute position, not as the substring " hidden": a class list
    # like class="kk-nav__panel hidden" satisfies a substring test while being
    # exactly the class-instead-of-attribute swap this check exists to catch.
    nav_panel = re.search(r'<\w+[^>]*id=["\']kk-nav-panel["\'][^>]*>', text)
    if nav_panel is None:
        print("FAIL _layouts/default.html: no #kk-nav-panel — the mobile drawer "
              "is missing")
        failures += 1
    else:
        attrs = re.sub(r'=\s*("[^"]*"|\'[^\']*\')', "", nav_panel.group(0))
        if not re.search(r'(?<=[\s])hidden(?=[\s>/])', attrs):
            print("FAIL _layouts/default.html: #kk-nav-panel must ship with the "
                  "`hidden` ATTRIBUTE — kk-nav.js drives the attribute, not a class")
            failures += 1

    # The layout must actually place the page.
    for token in ("{{ content }}", "{{ page.title }}", "{{ page.description }}"):
        if token not in text:
            print("FAIL _layouts/default.html: missing `%s`" % token)
            failures += 1
    return failures


def check_form_links(sources):
    """The application link, everywhere it appears.

    A stale or mistyped application link is the single most expensive copy bug
    on the site — every poster and every LinkedIn post points at it.

    Matches any application-link SHAPE, not just already-correct ones. The first
    version only compared strings that already looked like `https://forms.gle/`,
    so an http:// link, a docs.google.com/forms link, or a silently deleted CTA
    all passed.
    """
    failures = 0
    texts = dict(sources)
    texts[LAYOUT] = LAYOUT.read_text(encoding="utf-8")
    total = 0
    for path, text in texts.items():
        links = re.findall(
            r'https?://(?:forms\.gle|docs\.google\.com/forms)[^"\s<]*', text)
        total += len(links)
        for found in links:
            if found != FORM_URL:
                print("FAIL %s: application link %s is not %s"
                      % (rel(path), found, FORM_URL))
                failures += 1
    if total == 0:
        print("FAIL: no application link anywhere on the site")
        failures += 1
    return failures


def check_markers(sources):
    failures = 0
    for path in PAGES:
        if "TODO(content)" in sources[path] or "REPLACE_ME" in sources[path]:
            print("FAIL %s: unresolved TODO(content)/REPLACE_ME marker" % rel(path))
            failures += 1
    return failures


def check_inline_styles(sources):
    """No `style=` attributes in the pages or the layout.

    173 of them were lifted into named classes so that a page reads as its words
    plus a class name and the copy can be found and changed without wading
    through declarations. One inline style added back is not a disaster, but
    fifty are, and fifty is what you get by adding one at a time.
    """
    failures = 0
    targets = dict(sources)
    targets[LAYOUT] = LAYOUT.read_text(encoding="utf-8")
    for path, text in targets.items():
        for m in re.finditer(r'<(\w+)[^>]*?\sstyle="([^"]*)"', text):
            line = text[:m.start()].count("\n") + 1
            print("FAIL %s:%d: inline style on <%s>. Give it a class in "
                  "css/styles.css instead — see EDITING.md.\n"
                  "     %s" % (rel(path), line, m.group(1), m.group(2)[:80]))
            failures += 1
    return failures


def check_css():
    """The cascade rules the site's layout depends on, asserted in the stylesheet."""
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


def check_links():
    """Every root-relative href in the shared nav resolves to a file that exists."""
    nav = LAYOUT.read_text(encoding="utf-8")
    failures = 0
    for href in re.findall(r'href="(/[^"#]*)"', nav):
        if "." in href.rsplit("/", 1)[-1]:      # an asset, not a page
            target = ROOT / href.strip("/")
        else:
            target = ROOT / "index.html" if href == "/" else ROOT / href.strip("/") / "index.html"
        if not target.exists():
            print('FAIL layout: href="%s" resolves to a missing %s' % (href, rel(target)))
            failures += 1
    return failures


def main():
    if not PAGES:
        print("FAIL: no pages found under %s" % ROOT)
        return 1

    build = check_build_model()
    if build and not LAYOUT.exists():
        return 1

    # read_text() applies universal newlines, so the repo's CRLF working tree
    # (git warns "LF will be replaced by CRLF") cannot trigger a false failure.
    sources = {p: p.read_text(encoding="utf-8") for p in PAGES}

    failures = (build
                + check_front_matter(sources)
                + check_layout_invariants()
                + check_form_links(sources)
                + check_markers(sources)
                + check_inline_styles(sources)
                + check_css()
                + check_links())

    # Print what opted out, so a page escaping the checks is visible in CI
    # rather than silently absent from the count.
    for p in SKIPPED:
        print("note: %s skipped (REDIRECT stub)" % rel(p))

    if failures:
        print("\n%d failure(s) across %d page(s)" % (failures, len(PAGES)))
        return 1
    print("ok: layout invariants, front matter and CSS cascade rules hold "
          "across %d pages" % len(PAGES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
