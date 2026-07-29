# kwantklubben-site

The public site for **Kwant Klubben**, an independent student club at the University of Southern Denmark. Plain static HTML/CSS/vanilla-JS, no build step. Deployed via GitHub Pages at `kwantklubben.com`.

This repo is intentionally separate from the club's private research repo (`kwantklubben`, not public) and from the public project mirror (`kwantklubben-projects`). Nothing sensitive lives here — brand assets, marketing copy, and a link out to the application form.

## Structure

```
index.html            landing — hero canvas, the loop, projects teaser, join
about/index.html      what the klub is, the process in full, AI, joining
projects/index.html   the library, how publishing works, what counts
partners/index.html   collaboration, talks, mentorship, co-designed events
sponsors/index.html   redirect stub -> /partners/  (the old URL is on LinkedIn)

css/styles.css        the original brand stylesheet (tokens + component idiom),
                      plus a short relaunch section at the bottom
js/kk-motion.js       count-up + scroll-reveal. A verbatim copy of the
                      design-system original — do not edit it here.
js/kk-nav.js          the mobile drawer. Drives the `hidden` ATTRIBUTE, not a class.
js/kk-surface.js      the hero's dot-matrix canvas. Inert on any page with no
                      #kk-surface, which is why it can sit in the shared block.
assets/               logos, favicon set
tools/check-site.py   the drift + invariant check. Read the next section.
```

Nav is **About · Projects · Partners**, plus a Contact button (a `mailto:`, not a page — there was nothing a contact page would hold that the mailto does not) and the Join button pointing straight at the application form.

## The style

The chunky idiom **is** the brand: 2px ink borders, hard `4px 4px 0` pop shadows, lime section fills, badges, gridpaper. `css/styles.css` is the original stylesheet, unchanged, with a clearly-marked section appended at the bottom for the few things the relaunch actually needed — the hero canvas frame, a three-column variant of the divided grid, the footer's second link group, a skip link, and one brand fix (the token layer's `--focus-ring` was `--blue-500`; the brand has no blue in it).

If you are adding to this site, use the existing components. Do not introduce a second visual system.

## The check

There is no build step and no templating, so `HEAD-COMMON`, `NAV`, `FOOTER` and `SCRIPTS` are **literally duplicated** in all four pages. Every path inside them is root-relative precisely so they can be byte-identical.

**To change the nav, footer, head or scripts: edit `index.html`, paste into the other three, then run the check.**

```
python tools/check-site.py     # -> "ok: 4 blocks identical, invariants and CSS cascade rules hold across 4 pages"
```

It also runs in CI on every push and pull request (`.github/workflows/check.yml`).

It is not a build step — it produces nothing and the site works without it. It exists because the July 2026 relaunch grew the site from three pages to five, hand-edited the old script's hardcoded three-file list, and shipped three pages whose font URL had lost `&family=Chewy`. So beyond comparing the blocks, it asserts things a diff cannot see, on every page it finds by glob:

| Invariant | Why it is checked |
|---|---|
| `&family=Chewy` in the font URL | The footer wordmark is Chewy at 37vw with a `-3.3vw` nudge tuned to its metrics. Without the font it falls back to system cursive and clips out of its own box. |
| `.kk-footer-word` present | Same wordmark, absent entirely. |
| No class on the `<footer>` element | `footer{display:block}` (0,0,1) is what undoes the wordmark overlay on phones. Any class selector out-specifies it. |
| `#kk-nav-panel` ships with `hidden` | Checked at attribute position, not as a substring — `class="… hidden"` would satisfy a substring test while being exactly the class-for-attribute swap this catches. `kk-nav.js` is deferred and owns that attribute; without it the drawer renders **open** on a cold mobile cache. |
| An application link exists and matches | Any `forms.gle` **or** `docs.google.com/forms` link, over http or https, must equal the one true form URL — and at least one must be present. It is on every poster. |
| No `TODO(content)` / `REPLACE_ME` | Placeholders must not reach production. |
| Every root-relative nav `href` resolves | A nav pointing at a directory that does not exist. |
| The CSS cascade rules | No bare `.kk-footer` class selector; the mobile `footer{display:block}` override still present; no `display` declared inside `.js .kk-nav__panel`. |

Pages opt out by containing a `REDIRECT` marker in a comment near the top **and** actually being a redirect — that is how `sponsors/index.html` is excluded. Skipped pages are printed, so an opt-out is visible in the CI log.

### Two rules the CSS depends on

Both of these broke in July 2026 and both are cheap to break again:

- **No class on the `<footer>` element.** The mobile override that undoes the wordmark overlay is `footer{display:block}`. Any class selector out-specifies it and strands the letters behind the footer text on phones.
- **The nav drawer is driven by the `hidden` attribute**, never by an `.is-open` class. `css/styles.css` has a long comment explaining why declaring `display` in the mobile `.kk-nav__panel` block makes `hidden` inert. Read it before touching that block.

## Local preview

**Always serve it. Never open `index.html` with `file://`.**

```
python -m http.server 8000        # from the repo root
```

then open `http://localhost:8000`.

Paths are root-relative, so under `file://` they resolve against your filesystem root — the page renders as unstyled HTML with broken images. That is the expected result of double-clicking the file, not a broken site.

## The hero canvas

`js/kk-surface.js` replaced the static `assets/hero-distribution.svg` inside the same card, with the same border and the same pop shadow. It plots the signed excess `f = mixture − fitted_normal` of a fat-tailed bivariate density over the axis-aligned normal fitted to it, on a fixed halftone lattice. Dot positions never move; only radius carries information. Lime marks `f > 0` — the tails, where the normal understates real mass. Pointer warps the sampling coordinates; click sends a decaying annulus.

It draws one frame at boot, then runs a `requestAnimationFrame` loop that pauses when the canvas is off-screen or the tab is hidden. Under `prefers-reduced-motion: reduce` it draws a single static frame, binds no pointer listeners, and never calls `requestAnimationFrame` at all.

## Deploy

Push to `main`. GitHub Pages deploys from `main` / root. The custom domain is set in repo Settings → Pages, which manages the `CNAME` file automatically.
