# kwantklubben-site

The public site for **Kwant Klubben**, an independent student club at the University of Southern Denmark. Plain HTML/CSS/vanilla-JS — no framework, no toolchain, nothing to install. GitHub Pages assembles the pages with Jekyll (layouts and front matter only, no plugins), so pushing to `main` is the build. Live at `kwantklubben.com`.

This repo is intentionally separate from the club's private research repo (`kwantklubben`, not public) and from the public project mirror (`kwantklubben-projects`). Nothing sensitive lives here — brand assets, marketing copy, and a link out to the application form.

## Structure

```
_layouts/default.html the <head>, nav, footer and scripts every page shares.
                      ONE copy — GitHub Pages assembles the pages with Jekyll.
_config.yml           build config: what stays out of the published site.

index.html            landing — hero board, the loop, projects teaser, join
about/index.html      what the klub is, the process in full, AI, joining
projects/index.html   the library, how publishing works, what counts
partners/index.html   collaboration, talks, mentorship, co-designed events
sponsors/index.html   redirect stub -> /partners/  (the old URL is on LinkedIn)

css/styles.css        the original brand stylesheet (tokens + component idiom),
                      a short relaunch section, then the page-furniture classes
js/kk-nav.js          the mobile drawer. Drives the `hidden` ATTRIBUTE, not a class.
js/kk-bean.js         the hero board — one random walk per trading day, stacking
                      into the distribution they are drawn from. No pegs:
                      nothing collides with anything. Inert on any page with no
                      #kk-bean, which is why it can sit in the shared block.
assets/               logos, favicon set
tools/check-site.py   the drift + invariant check. Read the next section.
tools/probe-bean.html harness for the hero board: serve the repo and open it for
                      39 checks against the rendered pixels.
tools/serve-preview.py local preview with the Jekyll layout applied, for when
                      you have no Ruby. Read the next section.

EDITING.md            how to change the site from github.com. Start there.
```

**Local preview.** Opening the files directly no longer works: pages are Jekyll
fragments, so a plain static server shows the raw `---` header and no nav. Run
`python tools/serve-preview.py`, install Jekyll, or push to a branch — CI builds
the site with the same action Pages uses and fails the PR if anything is wrong.
For the hero board alone, `tools/probe-bean.html` runs standalone against
`js/kk-bean.js` with no build.

**Editing the copy?** See [EDITING.md](EDITING.md). The pages carry no inline
styles — 173 were lifted into named classes so a page reads as its words plus a
class name, and `check-site.py` fails if one is added back.

Nav is **About · Projects · Partners**, plus a Contact button (a `mailto:`, not a page — there was nothing a contact page would hold that the mailto does not) and the Join button pointing straight at the application form.

## The style

The chunky idiom **is** the brand: 2px ink borders, hard `4px 4px 0` pop shadows, lime section fills, badges, gridpaper. `css/styles.css` is the original stylesheet, unchanged, with a clearly-marked section appended at the bottom for the few things the relaunch actually needed — the hero chart, a three-column variant of the divided grid, the footer's second link group, a skip link, and one brand fix (the token layer's `--focus-ring` was `--blue-500`; the brand has no blue in it).

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
python tools/serve-preview.py     # -> http://localhost:4000
```

Paths are root-relative, so under `file://` they resolve against your filesystem root — the page renders as unstyled HTML with broken images. That is the expected result of double-clicking the file, not a broken site.

`python -m http.server` fixes the paths but not the pages: every page here is a
Jekyll *fragment*, so a plain static server serves the raw `---` front matter as
visible text with no `<head>`, no nav and no footer. `serve-preview.py` applies
`_layouts/default.html` the way Pages does and sends no-cache headers, so a reload
always shows the file on disk.

It implements exactly the four substitutions this site uses — `page.title`,
`page.description`, `page.url`, `site.url`, plus `{{ content }}` — and nothing
else. It is a **preview, not a build**: it writes no files, and CI still builds
with the real `jekyll-build-pages` action. If a future page needs a Liquid tag
beyond those four, this renders it literally and the CI job's "unrendered Liquid"
assertion is what catches it. Installing Ruby and running `jekyll serve` remains
the higher-fidelity option.

## The hero board

`js/kk-bean.js` replaced the static `assets/hero-distribution.svg`. It runs the
full width of the section with no card around it, so the gridpaper behind it
doubles as its graph paper.

*(An earlier draft of this file documented a `js/kk-tails.js` — a fat-tails chart
on a log-odds axis. No such file has ever existed in this repo. What shipped is
the board below. The fat-tails idea is still a good one and is still unbuilt.)*

**Each bead is one trading day.** It opens at zero and takes twenty-five small
moves through the session, so where it comes to rest is that day's close. Stack
enough days and the pile is Binomial(25, p) — the distribution a day is drawn
from. Months are just `days / 30`, a calendar convenience for reading the
horizon; nothing in the model knows what a month is, and a *trading* month is
nearer 21 days.

There are **no pegs**, and that is deliberate rather than cosmetic. Nothing ever
collided with anything: every outcome is drawn from a seeded LCG before the bead
moves, so a peg field was 325 arc fills a frame asserting that the shape on the
floor is produced by the apparatus. It is produced by adding up twenty-five
independent days. What is drawn instead is the one true thing about the geometry
— `binX(12.5)` **is** `cx`, so the column every walk opens in is exactly the 0σ
tick it will be measured against, and a faint rule says so.

- **solid bars** — days that actually closed there. A fill means "this happened".
- **lime bars** — the same days, beyond 2σ *of a fair coin*
- **ink outline** — the exact Binomial(25, p) at the odds currently set: where the
  pile *would* sit if every day so far had run at these odds

Because the bars butt together with no gap, the pile reads as one silhouette and
the outline reads through it: **solid is what happened, hollow is what the model
expected.** Where the outline rises above the fill, the model wanted more days
there than arrived.

**Mark type carries the layer, lightness carries the region, and hue is
load-bearing on nothing.** Fill means measured, outline means implied — so the
comparison survives greyscale, print, and all three dichromacies (ink-900 against
lime-800 is 3.65:1 normally and never below 3.36:1 simulated). An earlier build
had this exactly backwards: hue carried the layer and *alpha* carried the
comparison, at 1.10–1.38:1, under bars that were painted on top of it. The
outline is stroked **last**, over the bars, with a paper casing clipped to the
bars so it survives crossing one. Both of those are load-bearing; `probe-bean.html`
asserts them (`C4`).

The x axis is in standard deviations of a **fair** coin and does not move when
you move `P(up move)`. A ruler that slides with the thing it measures cannot show
you that the thing moved. So "beyond 2σ" means *further than a market with no
edge in it would have gone* — which is why the tail figure climbing as you raise
the odds is the point rather than a rounding artefact. The slider is `P(up move)`
and not `P(up day)`: it sets the odds on each of the 25 moves *inside* the
session. The odds that the day itself closes up is a different number, one the
walk produces rather than takes.

`R = 25` is load-bearing. Bar edges sit at half-integers and σ is `sqrt(R)/2`, so
a bar edge coincides with 2σ only when R is an odd perfect square. At 25: σ = 2.5,
mean = 12.5, so ±2σ land on 7.5 and 17.5 — the shared edges of bins 7|8 and 17|18.
Every bar is whole, no width is fudged, and no bar ever straddles the line.

**Only bins 3–22 are drawn**, which is exactly **±4σ**. The full support is ±5σ,
but the outermost σ at each end carried no visible mass at any odds the slider
reaches — it was a flat rule running out to a tick, and it made the board about a
quarter wider than the picture in it. 4σ is the right cut because it also lands on
bin *edges* (12.5 ± 10 = 2.5 and 22.5), so the window is whole bars and its ends
fall exactly on the −4σ and +4σ ticks. `dx` divides by the *drawn* bin count, so
on a wide hero the 44px cap is what narrows the chart (20 × 44 = 880px), while a
phone still spends its whole width and gets fatter bars for it.

Everything outside the window is still simulated and still counted — in `N`, in
the tail percentages, in the moments. It is simply not drawn. At p = 0.5 that is
1.9 × 10⁻⁵ of the pile; at the 0.600 end of the slider the far right bins reach
~4 × 10⁻⁴, so roughly one day in 2,300 lands beyond the frame. The printed figures
stay complete.

**One bead is one DAY.** The readout prints days and then `days / 30` months. The
units here have been wrong before, in both directions, so if you touch the readout
keep them straight — `probe-bean.html` asserts both numbers against the spoken
description, which is the only place the units are stated in words.

**The board is a fixed size.** Its height is one of two values, stepping at 560px,
and the space reserved above it for the readout is a constant per width bracket —
*not* the number of rows the readout happened to wrap to. Both of those were
previously derived, which meant the entire drawing resized as the window moved and
jumped 16px the instant a counter grew a digit. If you add a metric, check it
still fits the reserve rather than making the reserve follow it.

Below the reserve there is a **head gap** before `yTop`, the line the walks open
on, so the beads do not start immediately under the metrics. Note that `MAXH` is
measured from the *end of the readout*, not from `yTop` — so the gap is taken out
of the walk region, which is mostly empty, rather than out of the histogram. Widen
the gap and the walk compresses; the plot floor stays at 366 and the plot stays
126 tall. Keep it that way round if you retune it.

Under `prefers-reduced-motion: reduce` it resolves 2,400 months at once, draws the
finished board, and never calls `requestAnimationFrame` at all. `rAF` is throttled
to a standstill in a background tab, so there is also a fallback that fills the
board if five frames have not run after 2.2 seconds.

## Deploy

Push to `main`. GitHub Pages deploys from `main` / root. The custom domain is set in repo Settings → Pages, which manages the `CNAME` file automatically.
