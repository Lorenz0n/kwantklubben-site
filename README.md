# kwantklubben-site

The public site for **Kwant Klubben**, an independent student club at the University of Southern Denmark. Plain static HTML/CSS/vanilla-JS, no build step. Deployed via GitHub Pages at `kwantklubben.com`.

This repo is intentionally separate from the club's private research repo (`kwantklubben`, not public) and from the public project mirror (`kwantklubben-projects`). Nothing sensitive lives here — brand assets, marketing copy, and a link out to the application form.

## Structure

```
index.html            landing — hero canvas, what we do, the loop, projects teaser, join
about/index.html      what the club is, the loop, AI with human ownership, who it's for
projects/index.html   the library — one Example Project card, how publishing works
partners/index.html   collaboration, talks, mentorship, co-designed events
contact/index.html    email primary, LinkedIn secondary
sponsors/index.html   redirect stub -> /partners/  (the old URL is on LinkedIn)

css/styles.css        brand tokens (unchanged, from the design system) + the site's
                      own editorial component layer. Single file, single request.
js/kk-motion.js       count-up + scroll-reveal. A verbatim copy of the design-system
                      original — do not edit it here.
js/kk-nav.js          the mobile drawer. Drives the `hidden` ATTRIBUTE, not a class.
js/kk-surface.js      the hero's dot-matrix halftone canvas. Inert on any page with
                      no #kk-surface, which is why it can sit in the shared block.
assets/               logos, favicon set
tools/check-site.py   the drift + invariant check. Read the next section.
```

## The check

There is no build step and no templating, so `HEAD-COMMON`, `NAV`, `FOOTER` and `SCRIPTS` are **literally duplicated** in all five pages. Every path inside them is root-relative precisely so they can be byte-identical.

**To change the nav, footer, head or scripts: edit `index.html`, paste into the other four, then run the check.**

```
python tools/check-site.py     # -> "ok: 4 blocks identical and invariants hold across 5 pages"
```

It also runs in CI on every push and pull request (`.github/workflows/check.yml`).

It is not a build step — it produces nothing and the site works without it. It exists because the July 2026 relaunch grew the site from three pages to five, hand-edited the old script's hardcoded three-file list, and shipped three pages whose font URL had lost `&family=Chewy`. So beyond comparing the blocks, it asserts things a diff cannot see, on every page it finds by glob:

| Invariant | Why it is checked |
|---|---|
| `&family=Chewy` in the font URL | The footer wordmark is Chewy at 37vw with a `-3.3vw` nudge tuned to its metrics. Without the font it falls back to system cursive and clips out of its own box. |
| `.kk-footer-word` present | Same wordmark, absent entirely. |
| `#kk-nav-panel` ships with `hidden` | `kk-nav.js` is deferred and owns that attribute. Without it the drawer renders **open** on a cold mobile cache until the script lands. |
| The application form URL matches | A mistyped `forms.gle` link is the most expensive copy bug on the site — it is on every poster. |
| No `TODO(content)` / `REPLACE_ME` | Placeholders must not reach production. |
| Every root-relative nav `href` resolves | A nav pointing at a directory that does not exist. |

Pages opt out by containing a `REDIRECT` marker — that is how `sponsors/index.html` is excluded.

### Two rules the CSS depends on

Both of these broke in July 2026 and both are cheap to break again:

- **No class on the `<footer>` element.** The mobile override that undoes the wordmark overlay is `footer{display:block}` (0,0,1). Any class selector out-specifies it and strands the letters behind the footer text on phones.
- **The nav drawer is driven by the `hidden` attribute**, never by an `.is-open` class. `css/styles.css` has a long comment explaining why declaring `display` in the mobile `.kk-nav__panel` block makes `hidden` inert. Read it before touching that block.

## Local preview

**Always serve it. Never open `index.html` with `file://`.**

```
python -m http.server 8000        # from the repo root
```

then open `http://localhost:8000`.

Paths are root-relative, so under `file://` they resolve against your filesystem root — the page renders as unstyled HTML with broken images. That is the expected result of double-clicking the file, not a broken site.

## The hero canvas

`js/kk-surface.js` plots the signed excess `f = mixture − fitted_normal` of a fat-tailed bivariate density over the axis-aligned normal fitted to it, on a fixed halftone lattice. Dot positions never move; only radius carries information. Lime marks `f > 0` — the peak and the tails, where the normal understates real mass.

It draws one frame at boot, then runs a `requestAnimationFrame` loop that pauses when the canvas is off-screen or the tab is hidden. Under `prefers-reduced-motion: reduce` it draws a single static frame, binds no pointer listeners, and never calls `requestAnimationFrame` at all.

## Deploy

Push to `main`. GitHub Pages deploys from `main` / root. The custom domain is set in repo Settings → Pages, which manages the `CNAME` file automatically.

## Provenance

Brand tokens (colour, type, spacing, effects, motion) live in the private `kwantklubben` repo under `design-system/` and are copied verbatim into the top of `css/styles.css`. Everything below the tokens is this site's own editorial layer and deliberately does **not** use the design system's dashboard component idiom — no pop shadows, no 2px borders, lime as an accent rather than a fill.
