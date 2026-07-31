# Kwant Klubben Site Relaunch — Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current three-page site with a truthful five-page site for a new student club, built on an editorial/Swiss layout system with one interactive mathematical hero, and guarded by a check that makes the July 29 class of bugs impossible to ship again.

**Architecture:** Static HTML/CSS/vanilla-JS on GitHub Pages, no build step (unchanged). The four shared blocks stay hand-duplicated, but `tools/check-site.py` now globs *every* page rather than a hardcoded list of three, asserts content invariants (Chewy is loaded, the form URL is right, no `TODO(content)` survives), and runs in CI so a drifted page cannot reach production. The visual system moves from the current neo-brutalist idiom (2px ink borders, `4px 4px 0` pop shadows, lime fills) to a minimal editorial one: paper ground, monumental Space Grotesk headlines, hairline rules, micro mono labels, and one monochrome dot-matrix canvas.

**Tech Stack:** HTML5, CSS custom properties (existing brand tokens kept verbatim), vanilla ES5-compatible JS, 2D canvas, Python 3 for the check script, GitHub Actions.

---

## Decision you need to confirm before Task 3

The brief says *keep the brand system*. The reference you linked ([qclay_design, via @CollectUI](https://x.com/CollectUI/status/2081819438278664330)) is a near-white editorial page: monumental single-line headline flush to the margins, hairline rules carrying numbered micro-labels, one centred monochrome dot-matrix sculpture, and almost nothing else. That composition and the current KK component idiom cannot both survive — pop shadows and 2px ink borders on every card are the opposite of it.

**What I propose to keep, exactly:** the logo and favicon set, the `lime / ink / paper` tokens, Space Grotesk + Space Mono, the LinkedIn link, and the oversized Chewy `KWANT` footer.

**What I propose to retire on the marketing site:** `--pop-*` shadows, 2px borders as a default, lime as a section *fill*. Lime becomes a rare accent — the Join CTA, link underlines, and the minority of hero dots that mark excess tail mass. Ground is `--paper-50` (`#FBF9F2`), not pure white, which is what keeps it reading as Kwant Klubben rather than as a generic Swiss template.

The tokens in `css/styles.css` lines 12–202 are **not touched** either way; only the component layer below them changes. Say the word if you want the pop-shadow idiom preserved instead and I'll rework Task 3 before anything else starts.

---

## The hero: "The Surface"

A `<canvas>` rendering a dot matrix — a regular grid of dots in a shallow isometric projection, where **each dot's radius encodes the height of a probability surface at that grid point**. Not decoration: the surface is a real mixture density, a Gaussian core plus a heavy-tailed component, and the dots that sit in the region where the mixture exceeds the Gaussian are drawn in lime. That is the club's own subject matter, rendered as the reference's centred sculpture.

| | Behaviour |
|---|---|
| Idle | Slow automatic orbit, ±14°, plus a low-frequency breathing term on the tail weight. |
| Pointer move | Orbit follows the cursor (parallax), and a local lens raises dots near it — dragging a bump through the field. |
| Click / tap | A radial shock propagates out and relaxes back over ~2s. Visible mean reversion. |
| Idle 6s | Automatic orbit resumes. |
| Readout | Live mono line under the sculpture: `1,040 nodes · κ 4.2 · orbit 14°`. Real numbers from the simulation. |
| `prefers-reduced-motion` | One static frame, no rAF loop, no pointer response. |
| Mobile | Grid density scales with width; tap = shock; no pointer orbit. |

~1,000 dots batched into one path per colour bucket per frame — trivially 60fps on a 2D canvas, no dependencies.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Landing: hero, what we do, the loop, projects teaser, join band |
| `about/index.html` | What the club is, the loop in full, AI-with-human-ownership, culture |
| `projects/index.html` | The library — one Example Project card, how publishing works |
| `partners/index.html` | Collaboration, speakers, mentorship, workshops, co-designed events |
| `contact/index.html` | Email primary, LinkedIn secondary |
| `sponsors/index.html` | Meta-refresh stub → `/partners/`; keeps printed and LinkedIn links alive |
| `css/styles.css` | Tokens (lines 1–202, untouched) + new editorial component layer replacing lines 295–588 |
| `js/kk-surface.js` | **New.** The hero canvas |
| `js/kk-nav.js` | Kept. `hidden`-attribute idiom, unchanged — nav markup must not switch to a class |
| `js/kk-motion.js` | Kept verbatim (design-system original, must not be edited) |
| `tools/check-site.py` | **Replaces** `check-partials.py`. Glob-driven partial check + content invariants |
| `.github/workflows/check.yml` | **New.** Runs `check-site.py` on push and PR |
| `README.md` | Rewritten for five pages and the new check |

---

## Task 1: The check script, before the site it checks

The July 29 relaunch shipped three bugs that a check would have caught, and rewrote the check in the same commit. This task lands the guard first, on the *current* site, so it is demonstrably able to fail.

**Files:**
- Create: `tools/check-site.py`
- Delete: `tools/check-partials.py`

- [ ] **Step 1: Write the check script**

```python
"""Fail if any page has drifted from the shared blocks or broken a site invariant.

The site has no build step and no templating (docs/superpowers/specs/
2026-07-17-site-restructure-design.md, D-9), so HEAD-COMMON, NAV, FOOTER and
SCRIPTS are literally duplicated in every page. Every path in them is
root-relative (D-8) precisely so they *can* be byte-identical.

The 2026-07-29 relaunch is why this file replaced check-partials.py. That commit
grew the site from three pages to five, hand-edited a hardcoded FILES list, and
shipped:
  * three pages whose font URL had lost `&family=Chewy`, so the 37vw footer
    wordmark fell back to system cursive and clipped out of its own box;
  * a `.kk-footer{display:grid}` rule that out-specified the mobile
    `footer{display:block}` override;
  * nav markup on a `.is-open` class while kk-nav.js still drove `hidden`.
Only the first is a pure drift bug. The others are invariants, so this script
checks invariants too.

    python tools/check-site.py

Exit 0 = clean, 1 = at least one failure.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BLOCKS = ["HEAD-COMMON", "NAV", "FOOTER", "SCRIPTS"]

# Pages that carry the four shared blocks. Globbed, never hardcoded — adding a
# page must not be able to silently opt out of the check.
PAGES = sorted(
    p for p in ROOT.glob("**/index.html")
    if ".git" not in p.parts and "REDIRECT" not in p.read_text(encoding="utf-8")
)

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
    reference_path = PAGES[0]
    for name in BLOCKS:
        reference = grab(sources[reference_path], name, reference_path)
        if reference is None:
            failures += 1
            continue
        for path in PAGES[1:]:
            body = grab(sources[path], name, path)
            if body is None:
                failures += 1
            elif body != reference:
                print("FAIL %s: '%s' block differs from %s"
                      % (rel(path), name, rel(reference_path)))
                failures += 1
    return failures


def check_invariants(sources):
    """Content facts that must hold on every page."""
    failures = 0
    for path in PAGES:
        text = sources[path]

        # The footer wordmark is set in Chewy at 37vw with a -3.3vw nudge tuned
        # to Chewy's internal leading. Without the font it clips out of its box.
        if "family=Chewy" not in text:
            print("FAIL %s: font URL is missing &family=Chewy — the KWANT "
                  "wordmark will fall back to system cursive" % rel(path))
            failures += 1

        if "kk-footer-word" not in text:
            print("FAIL %s: no .kk-footer-word — the KWANT wordmark is absent"
                  % rel(path))
            failures += 1

        # kk-nav.js owns the `hidden` attribute. Markup that ships without it
        # renders the drawer open on cold mobile caches until the script lands.
        if 'id="kk-nav-panel"' in text and "hidden" not in text.split(
                'id="kk-nav-panel"')[1][:40]:
            print("FAIL %s: #kk-nav-panel must ship with the `hidden` attribute"
                  % rel(path))
            failures += 1

        if "TODO(content)" in text or "REPLACE_ME" in text:
            print("FAIL %s: unresolved TODO(content)/REPLACE_ME marker" % rel(path))
            failures += 1

        # A stale or mistyped application link is the single most expensive
        # copy bug on the site.
        if "forms.gle" in text and FORM_URL not in text:
            print("FAIL %s: a forms.gle link does not match %s"
                  % (rel(path), FORM_URL))
            failures += 1
    return failures


def check_links():
    """Every root-relative href in the nav resolves to a file that exists."""
    failures = 0
    nav = grab(PAGES[0].read_text(encoding="utf-8"), "NAV", PAGES[0])
    if nav is None:
        return 1
    for href in re.findall(r'href="(/[^"#]*)"', nav):
        target = ROOT / href.strip("/") / "index.html" if href != "/" else ROOT / "index.html"
        if not target.exists():
            print("FAIL nav: href=\"%s\" resolves to a missing %s"
                  % (href, rel(target)))
            failures += 1
    return failures


def main():
    if not PAGES:
        print("FAIL: no pages found")
        return 1
    sources = {p: p.read_text(encoding="utf-8") for p in PAGES}
    failures = check_blocks(sources) + check_invariants(sources) + check_links()
    if failures:
        print("\n%d failure(s) across %d page(s)" % (failures, len(PAGES)))
        return 1
    print("ok: %d blocks identical and invariants hold across %d pages"
          % (len(BLOCKS), len(PAGES)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run it against the current site to prove it passes today**

Run: `python tools/check-site.py`
Expected: `ok: 4 blocks identical and invariants hold across 3 pages`

If it reports failures, the script is wrong — the current three-page site is known-good on all these invariants. Fix the script, not the site.

- [ ] **Step 3: Prove it catches the real bug**

Temporarily strip Chewy from one page's font URL and re-run:

```bash
python - <<'PY'
import pathlib
p = pathlib.Path("projects/index.html")
p.write_text(p.read_text(encoding="utf-8").replace("&family=Chewy", ""), encoding="utf-8")
PY
python tools/check-site.py
```

Expected: `FAIL projects/index.html: font URL is missing &family=Chewy …` plus a `HEAD-COMMON` drift failure, exit 1.

- [ ] **Step 4: Restore and confirm clean**

Run: `git checkout projects/index.html && python tools/check-site.py`
Expected: `ok: 4 blocks identical and invariants hold across 3 pages`

- [ ] **Step 5: Remove the superseded script and commit**

```bash
git rm tools/check-partials.py
git add tools/check-site.py
git commit -m "test: glob-driven site check with content invariants

Replaces check-partials.py, whose hardcoded three-file list is what let the
2026-07-29 relaunch ship three pages with no Chewy in the font URL."
```

---

## Task 2: Run the check in CI

A local check nobody runs is the same as no check.

**Files:**
- Create: `.github/workflows/check.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: check

on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  check-site:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Shared blocks and site invariants
        run: python tools/check-site.py
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/check.yml
git commit -m "ci: run check-site.py on every push and PR"
```

---

## Task 3: The editorial CSS layer

**Confirm the decision at the top of this plan before starting.**

**Files:**
- Modify: `css/styles.css` — keep lines 1–202 (tokens) and lines 204–293 (base + motion) verbatim; replace lines 295–588 (components + site layout) with the layer below.

- [ ] **Step 1: Verify the token block is untouched**

Run: `python -c "import pathlib; t=pathlib.Path('css/styles.css').read_text(encoding='utf-8'); print(t.index('/* --- source: components/core/Button.jsx --- */'))"`
Expected: a byte offset printed. Everything before it stays; everything from it onward is replaced.

- [ ] **Step 2: Replace the component layer**

The full replacement CSS is written during execution against the live token names in lines 12–202. It provides, in this order:

1. **Layout primitives** — `.kk-shell` (max-width 1440px, 40px gutters, 24px at ≤700px), `.kk-rule` (1px `--paper-300` hairline), `.kk-micro` (Space Mono, 11px, `.12em` tracking, uppercase, `--ink-400`).
2. **Type scale** — `.kk-display` at `clamp(3.2rem, 9.2vw, 9rem)`, `line-height: .88`, `letter-spacing: -.045em`; `.kk-h2` at `clamp(2rem, 4.4vw, 3.6rem)`; `.kk-lede` at `clamp(1.05rem, 1.5vw, 1.3rem)` with `max-width: 46ch`.
3. **Numbered rule nav** — `.kk-index` as a flex row of `01 About / 02 Projects / 03 Partners / 04 Contact` sitting directly on a hairline, wrapping to two rows at ≤700px.
4. **The one button** — `.kk-cta`: lime fill, ink text, 1px ink border, no shadow, `border-radius: var(--radius-sm)`, hover lifts to `--lime-400` only. Replaces all four `.kk-btn--*` variants.
5. **Hero** — `.kk-hero` at `min-height: calc(100svh - var(--nav-h))`, `.kk-hero__canvas` absolutely positioned, `.kk-hero__readout` mono micro-line.
6. **Editorial sections** — `.kk-band` (vertical rhythm, 96px desktop / 64px mobile), `.kk-cols` (12-col grid, collapsing to 1), `.kk-numbered` (the loop's three steps on hairlines).
7. **Project card** — `.kk-project`: hairline border, no shadow, no fill; status as a mono micro-label, not a stamp.
8. **Footer** — the existing `footer{display:grid}` / `.kk-footer__inner` / `.kk-footer-word` rules **carried over verbatim, including the `@media (max-width:700px)` override and its comment**. No `.kk-footer` class is introduced; that class is exactly what broke the override last time.
9. **Nav** — the existing `.kk-nav*` rules carried over verbatim, including the `hidden`-attribute cascade and its landmine comment.

- [ ] **Step 3: Verify the footer override still wins on mobile**

Serve the site and load it at 375px wide (Task 12 covers the browser pass in full). For now, a static grep guard:

Run: `grep -n "footer{ display:block; }\|\.kk-footer{" css/styles.css`
Expected: the `@media (max-width: 700px)` block still contains `footer{ display:block; }`, and there is **no** `.kk-footer{` class selector anywhere in the file.

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "style: editorial component layer, brand tokens unchanged

Retires the pop-shadow/2px-border idiom on the marketing site. Tokens
(lines 1-202) and the footer/nav cascade carry over verbatim."
```

---

## Task 4: The hero canvas

**Files:**
- Create: `js/kk-surface.js`

- [ ] **Step 1: Write the module**

Full implementation written during execution. Contract, fixed here:

- Reads `#kk-surface`; returns immediately if absent, so the file is inert on the four interior pages.
- Grid of `cols × rows` where `cols = clamp(24, round(width / 34), 46)` and `rows = round(cols * 0.62)`.
- Height function: `z(x, y) = (1 - w) · N(r) + w · T(r)`, `r` the radial distance from centre, `N` a unit Gaussian, `T` a Student-t-shaped tail term, `w` breathing slowly in `[0.06, 0.22]`.
- Isometric projection with orbit angle `θ`, dot radius `= 1 + 4.2 · z`, dots with `T(r) > N(r)` drawn in `--lime-600`, the rest in `--ink-900`.
- Per frame: bucket dots by colour, one `beginPath()` / `fill()` per bucket. Two fills per frame total.
- `pointermove` sets the orbit target and a lens centre; `pointerdown` pushes a shock `(t₀, x, y)` that decays over 2000ms; 6s without pointer events restores automatic orbit.
- Exposes nothing globally. Cleans up its `resize` listener on `pagehide`.
- `matchMedia('(prefers-reduced-motion: reduce)').matches` → draw exactly one frame at `θ = 14°`, bind no pointer handlers, never call `requestAnimationFrame`.
- Writes the live readout into `#kk-surface-readout` as `<n> nodes · κ <k> · orbit <deg>°`.

- [ ] **Step 2: Verify it is inert without its canvas**

Run: `node -e "global.document={getElementById:()=>null};require('./js/kk-surface.js');console.log('inert ok')"`
Expected: `inert ok`, no throw.

- [ ] **Step 3: Commit**

```bash
git add js/kk-surface.js
git commit -m "feat: dot-matrix probability surface for the hero"
```

---

## Task 5: Retire `/sponsors/` first

This comes **before** the page rewrites on purpose. The moment `index.html` gets the new four-item nav, every page still carrying the old three-item nav fails the drift check — and the old sponsors page is one of them. Converting it to a redirect stub now removes it from the checked set, so the only drift the check reports during Tasks 6–10 is drift you are actively working through.

The `/sponsors/` URL is on LinkedIn and possibly on printed material. GitHub Pages cannot serve a 301 from a static repo, so a meta-refresh stub is the honest option.

**Files:** Modify `sponsors/index.html` (full rewrite)

- [ ] **Step 1: Write the stub**

```html
<!DOCTYPE html>
<!-- REDIRECT — no shared blocks; tools/check-site.py skips pages containing this marker. -->
<html lang="en">
<head>
<meta charset="utf-8">
<title>Partners — Kwant Klubben</title>
<link rel="canonical" href="https://kwantklubben.com/partners/">
<meta http-equiv="refresh" content="0; url=/partners/">
</head>
<body>
<p>This page has moved to <a href="/partners/">kwantklubben.com/partners</a>.</p>
</body>
</html>
```

- [ ] **Step 2: Confirm the check drops it from the set**

Run: `python tools/check-site.py`
Expected: `ok: 4 blocks identical and invariants hold across 2 pages` — down from 3. If it still says 3, the `REDIRECT` marker filter in `PAGES` is broken.

- [ ] **Step 3: Commit**

```bash
git add sponsors/index.html
git commit -m "feat: redirect /sponsors/ to /partners/"
```

---

## Tasks 6–10: The five pages

**The check is expected to FAIL from the moment Task 6 lands until Task 10 completes.** `index.html` becomes the authoritative source of the four shared blocks; every page not yet rewritten still carries the old ones. That is drift you are mid-way through resolving, not a regression. Do not "fix" it by editing the check. It goes green at the end of Task 10 and must stay green after that.

---

## Task 6: The landing page

**Files:**
- Modify: `index.html` (full rewrite)

Shared blocks are authored **here first**, then pasted into Tasks 6–9 unchanged. The `HEAD-COMMON` font URL must read exactly:

```
https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Chewy&display=swap
```

Nav block:

```html
<div class="kk-nav__panel" id="kk-nav-panel" hidden>
  <a href="/about/">About</a>
  <a href="/projects/">Projects</a>
  <a href="/partners/">Partners</a>
  <a href="/contact/">Contact</a>
</div>
<a class="kk-cta" href="https://forms.gle/P5Aw4ka85QUZiUmZ9" target="_blank" rel="noopener">Join the Klub</a>
```

`SCRIPTS` block gains `<script src="/js/kk-surface.js" defer></script>` — it is inert where there is no canvas, which keeps the block byte-identical across all five pages.

**Final copy — use verbatim:**

| Slot | Text |
|---|---|
| Hero micro, left | `Independent student club · University of Southern Denmark` |
| Hero micro, right | `Odense, DK` |
| Headline | `Curiosity, quantified.` |
| Lede | `Kwant Klubben is an independent student club at the University of Southern Denmark exploring quantitative finance through code, data, mathematics, and discussion.` |
| Readout | `<n> nodes · κ <k> · orbit <d>° — move to tilt, click to perturb` |
| 01 heading | `Ideas, tested.` |
| 01 body | `Members arrive with different backgrounds and different questions — a strategy idea, a paper, a piece of mathematics, a chart that looks wrong. The club is where you actually work through them, with people who find the same things interesting.` |
| 02 heading | `The loop.` |
| 02 · Ideation | `A question worth spending time on. A paper, a hunch, a dataset, or something a lecture left unfinished.` |
| 02 · Learning process | `Read it, code it, simulate it, argue about it. This is where most of the time goes, and that is the point.` |
| 02 · Output | `Leave something behind — a finding, a tool, a write-up, or a clear negative result. All four count.` |
| 03 heading | `The library is open.` |
| 03 body | `Everything the club chooses to publish lands in a public repository. Our first projects are in progress.` |
| 03 card | Title `Example Project` · status `In progress` · body `Results coming soon.` |
| 04 heading | `Bring a question.` |
| 04 body | `Applications are open continuously, mainly to students at SDU. All levels are welcome — we ask about your background so we can point you somewhere useful, not to filter you out. Active participation is expected; exams and life are understood.` |
| 04 CTA | `Join the Klub ↗` → the form URL |

Headline alternates, if `Curiosity, quantified.` does not land: `Take markets apart.` or `Quantitative finance, from first principles.`

- [ ] **Step 1: Write `index.html`**
- [ ] **Step 2: Serve and load it**

Run: `python -m http.server 8000` then open `http://localhost:8000`
Expected: hero fills the viewport, the dot surface renders and responds to the pointer, the readout counts real nodes.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: landing page on the editorial system"
```

---

## Task 7: About

**Files:** Create `about/index.html`

Shared blocks pasted from `index.html` **unmodified**. Content per the brief: what the club is; the loop in full; research and simulation of quantitative strategies; shared learning; AI-assisted work with human ownership; community and professional development; all levels welcome; **no trading execution at this stage** stated plainly, as a fact about where the club is rather than as a disclaimer.

- [ ] **Step 1: Write the page, pasting the four blocks from `index.html`**
- [ ] **Step 2:** Run `python tools/check-site.py` → Expected: still failing, but `about/index.html` must **not** appear in the output. Only `projects/index.html` should.
- [ ] **Step 3:** `git add about/index.html && git commit -m "feat: about page"`

---

## Task 8: Projects

**Files:** Modify `projects/index.html` (full rewrite)

Exactly one card: `Example Project` / `Results coming soon.` — nothing that implies a result exists. Below it, a short mono note on how publishing works: projects live in the private research repo, get copied to the public `kwantklubben-projects` mirror on explicit approval, and this page indexes that mirror. The card fields (`title`, `question`, `tags`, `status`, `summary`, `author`, `date`, `source`) match `PROJECT_FORMAT.md` so real cards drop straight in.

No Sharpe ratios, no survived/killed stamps, no project statistics.

- [ ] **Step 1: Write the page**
- [ ] **Step 2:** Run `python tools/check-site.py` → Expected: still failing, on the two pages not yet written
- [ ] **Step 3:** `git add projects/index.html && git commit -m "feat: projects library with the single example card"`

---

## Task 9: Partners

**Files:** Create `partners/index.html`

Collaboration, speakers, mentorship, workshops, opportunities, co-designed events, visibility to ambitious quantitative-finance students. Written from the perspective of an active membership community, with **no specific promise the club cannot currently fulfil** — no audience numbers, no recruiting-pipeline claims, no named partners. CTA is `hello@kwantklubben.com`.

- [ ] **Step 1: Write the page**
- [ ] **Step 2:** Run `python tools/check-site.py` → Expected: still failing, on `contact/index.html` alone
- [ ] **Step 3:** `git add partners/index.html && git commit -m "feat: partners page, replacing the sponsor pitch"`

---

## Task 10: Contact — and the check goes green

**Files:** Create `contact/index.html`

`hello@kwantklubben.com` as the primary CTA, LinkedIn secondary. No form, no backend, no personal-data collection.

- [ ] **Step 1: Write the page**

- [ ] **Step 2: The check must now pass**

Run: `python tools/check-site.py`
Expected: `ok: 4 blocks identical and invariants hold across 5 pages`

This is the first green since Task 6. If it is not green here, a shared block was retyped rather than pasted somewhere in Tasks 6–10 — diff the reported page against `index.html` and paste, do not hand-edit.

- [ ] **Step 3:** `git add contact/index.html && git commit -m "feat: contact page"`

---

## Task 11: README

**Files:** Modify `README.md`

Update the structure table to seven pages, replace every `check-partials.py` reference with `check-site.py`, drop the stale "12 TODO(content) hits" section (the check now enforces zero), and document that `js/kk-surface.js` is inert without `#kk-surface`.

- [ ] **Step 1: Rewrite**
- [ ] **Step 2:** Run `grep -rn "check-partials" .` → Expected: no hits outside `docs/`
- [ ] **Step 3:** `git add README.md && git commit -m "docs: README for the five-page site"`

---

## Task 12: Browser verification

Nothing here is optional, and none of it can be claimed without the output in front of you.

- [ ] **Step 1:** `python -m http.server 8000` from the repo root
- [ ] **Step 2:** At **1440×900**, load `/`, `/about/`, `/projects/`, `/partners/`, `/contact/`. On each, confirm: nav renders once, `KWANT` is visible **in Chewy** at the footer (a cursive fallback is the July 29 bug, so check the letterforms, not just that something is there), no horizontal scrollbar.
- [ ] **Step 3:** At **375×812**, repeat. Confirm the ☰ drawer opens and closes, and that `KWANT` sits **below** the footer text rather than behind it — this is the specific regression from last time.
- [ ] **Step 4:** On `/`, confirm the surface responds to pointer movement and to a click, and that the readout numbers change.
- [ ] **Step 5:** Enable `prefers-reduced-motion: reduce` in DevTools rendering, reload `/`. Confirm the surface renders one static frame and the CPU profile shows no rAF loop.
- [ ] **Step 6:** Confirm every nav link and both CTAs resolve — the form link opens `https://forms.gle/P5Aw4ka85QUZiUmZ9`, `hello@kwantklubben.com` opens a mail client, `/sponsors/` lands on `/partners/`.
- [ ] **Step 7:** Run `python tools/check-site.py` one final time → Expected: `ok: 4 blocks identical and invariants hold across 5 pages`

---

## Task 13: Pull request

- [ ] **Step 1:** `git push -u origin site-relaunch`
- [ ] **Step 2:** Open the PR with `gh pr create`, body covering: what changed, the three bugs from `38a783c` and how `check-site.py` now prevents each, and the brand-idiom decision from the top of this plan.
- [ ] **Step 3:** Confirm the `check` workflow passes on the PR before requesting review.

---

## Out of scope

- The private `kwantklubben` repo. It is on branch `strategy-pairs-twins` with a large uncommitted working tree; nothing here touches it.
- The publishing workflow (`publish-projects.yml`) and the public mirror — already built and merged.
- The Google Form's two recommended optional fields. That is a Forms edit, not a site change.
