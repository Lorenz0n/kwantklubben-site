# Kwant Klubben site — multi-page restructure

**Date:** 2026-07-17
**Status:** approved design, not yet implemented
**Repo:** `Lorenz0n/kwantklubben-site` (public)

## Context

The site launched as a single page (`Nav → Hero → Manifesto → StatsBand →
Projects → Join → Footer`), live at kwantklubben.com. Recruiting starts
2026-08-31 when posters go up; the poster QR code is the primary entry point,
so **mobile is the main traffic pattern**, not desktop.

This round turns it into a three-page site (`/`, `/projects/`, `/sponsors/`)
and adds a sponsors pitch. About remains an anchor on `/` (D-6), so it is
three pages, not four.

## Decisions

| # | Decision | Why |
|---|---|---|
| D-1 | Logo in the nav links to `/` | Standard convention; it was an unlinked `<img>`. |
| D-2 | `Manifesto` → `About` in the nav | Alfred's call. Section id `#manifesto` → `#about`. |
| D-3 | Drop the `Join` nav link | Redundant with the `Join the klub` CTA sitting next to it. |
| D-4 | `Projects` becomes `/projects/` | Alfred's call. Home keeps a 3-card teaser. |
| D-5 | New `/sponsors/` page | Pitch **to** prospective sponsors now; a "Current sponsors" logo strip grafts on above the pitch once the first one signs, at the **same URL** — so posters and LinkedIn never need reprinting. |
| D-6 | About stays an anchor on `/`, not its own page | Keeps the page the poster QR lands on substantive. Accepted cost: nav mixes `#about` with `/projects/` and `/sponsors/`. |
| D-7 | Mobile nav = hamburger | Measured: the big lockup (124px) + 3 links + CTA needs **474px** but only **343px** is available at 390px wide — overflows by 131px. Alfred chose the hamburger over a two-row nav to keep the lockup big and the nav at 100px. |
| D-8 | Root-relative paths (`/css/styles.css`) | Makes nav/footer markup byte-identical across all three files — otherwise `/projects/index.html` needs `../css/…` and the blocks drift. Safe: the CNAME serves at the apex. |
| D-9 | Nav/footer duplicated across 3 HTML files | The plan pins zero-build/zero-framework. For 3 pages, duplication is cheaper than adding a build step. Each block gets a banner comment marking it copy-paste. Revisit if the site reaches ~6 pages. |
| D-10 | New `js/kk-nav.js` for the hamburger | The plan pins `js/kk-motion.js` as a verbatim copy — do not edit it. |
| D-11 | Project card **content** stays placeholder | Alfred: "these projects are just placeholders." Every `TODO(content)` marker is preserved, including on the new `/projects/` page. |

## Known-stale content (NOT fixed this round, by decision D-11)

Recorded so it isn't lost:

- The **pairs-twins card claims "Net Sharpe 0.71"**. The real verdict
  (commit `bbf4caa`) is a **KILL at net Sharpe −0.69**, NW t −4.11, perm
  p 0.89, WF OOS −0.74. The card's TODO says "no verdict recorded yet" —
  that comment is itself stale.
- Three **real, documented** KILLs exist on `main` and could populate the
  teaser with zero fabrication: `tsmom-multiasset` (perm p 0.112),
  `xs-momentum` (net SR −0.08 at 24.5× turnover), `pairs-twins` (net SR −0.69).
- Four cards are unbacked, for two different reasons. **Three have no repo
  folder at all** — Options pricer, Stylized facts, Markov regime. **One is
  superseded** — NVO/LLY pairs, which the real pairs-twins KILL now covers
  (NVO/LLY took 18 divergence stops, mostly selling LLY's GLP-1 repricing).
- `strategies/pairs-twins/SPEC.md` still says `Status | in validation`
  despite the KILL (private repo hygiene, not a site issue).
- `strategies/low-beta/` and `strategies/vix-carry/` contain only
  `__pycache__` on `main` — their work is presumably in open PRs #6/#10/#11/#12.

**Safety net:** the launch plan gates poster-printing on
`grep -r "TODO(content)"` returning clean. Posters go up 2026-08-31, so
these resolve before any real traffic arrives.

## Page structure

```
/                    index.html
  Hero
  About              (#about — renamed from #manifesto)
  StatsBand
  Projects teaser    3 cards + "See all projects →" → /projects/
  Join
/projects/           projects/index.html    full card list
/sponsors/           sponsors/index.html    pitch
```

## Nav spec

**Desktop (>700px)** — unchanged shape, new contents:

```
[KWANT KLUBBEN → /]        About   Projects   Sponsors   [Join the klub]
```

- `About` → `/#about` · `Projects` → `/projects/` · `Sponsors` → `/sponsors/`
- CTA `Join the klub` → `/#join`
- Logo wrapped in `<a href="/">`.

**Mobile (≤700px)** — hamburger:

```
[KWANT KLUBBEN → /]        [Join the klub]   [☰]
```

Measured to need 300px of the 343px available. Tapping `☰` opens a panel
listing About / Projects / Sponsors.

Requirements for `js/kk-nav.js`:
- Toggle button carries `aria-expanded` and `aria-controls`.
- `Escape` closes the panel and returns focus to the toggle.
- Panel is `hidden` when closed (not just visually hidden) so it stays out
  of the tab order.
- The existing rule `.kk-nav__links a:not(:last-child){display:none}` is
  replaced, not kept — it is what makes sub-pages unreachable on a phone.
- Progressive enhancement: the panel markup must not be `display:none` by
  default in CSS without a `.js` guard, matching the `.js .kk-onview`
  pattern already established in `css/styles.css` — if the script fails,
  the links must remain reachable.

## Sponsors page

Sections, top to bottom:

1. **(Future)** `Current sponsors` logo strip — omitted at launch; this is
   where it lands so the URL never changes.
2. **Pitch header** — "Sponsor Kwant Klubben".
3. **Who we are** — 2–3 lines, derived from the manifesto. No member count
   (it is near-zero pre-launch; a fabricated one contradicts the club ethos).
4. **What a sponsor gets** — *draft copy, for Alfred to edit before publish.*
   This is the club making promises; the wording must be his:
   - Access to SDU quant-inclined students for recruiting
   - A workshop or talk slot with the club
   - Logo on the site and on campus posters
5. **Get in touch** — `mailto:` to Alfred, consistent with the Join
   section's current fallback. Marked `TODO(content)` if a dedicated
   sponsor contact route is wanted later.

## Non-goals

- Per-project detail pages (the teaser gets **one** `See all projects →`
  link, not per-card `See more` links — there is nothing to link to yet).
- Fixing project card content or StatsBand numbers (D-11).
- A build step, templating, or framework.
- Touching `js/kk-motion.js`.
- Any change to the private research repo.

## Verification

- `python -m http.server` at repo root; check `/`, `/projects/`, `/sponsors/`.
- Every nav link resolves on every page — no 404s, no dead anchors.
- At **390px**: hamburger opens, all three destinations reachable, panel
  closes on `Escape`, focus returns to the toggle.
- With JS disabled: nav links still reachable (D-10 progressive enhancement).
- `prefers-reduced-motion: reduce`: no panel animation.
- Confirm the footer wordmark still bleeds correctly on all three pages
  (it is part of the duplicated footer block).
- `grep -rn "TODO(content)"` — markers preserved, none silently dropped.
