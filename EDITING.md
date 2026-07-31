# Editing the site

Everything here can be changed from github.com — click a file, click the pencil,
commit. Nothing to install and nothing to run: GitHub Pages builds the site for
you. A commit to `main` is live on kwantklubben.com about a minute later.

CI does two things on every push: runs `tools/check-site.py`, and builds the
site the same way Pages does. If either fails, the site does **not** break — the
last good version keeps serving — but your change will not go live until it
passes. The failure message tells you what to fix and where.

---

## The one-minute version

To change wording, find the page, find the section, edit the text between the
tags. That is all.

```html
<h1 class="kk-hero__title">
  Randomness has a <span class="kk-accent">shape.</span>
</h1>
```

Change `Randomness has a` and `shape.` — leave the `class="..."` alone. The class
is what makes it look right; the text is yours.

---

## Where the words live

Each page is split by big comment banners, e.g. `<!-- ===== HERO ===== -->`.
Search for the banner name and you are in the right place. Line numbers below are
approximate and shift as copy changes — the banner is the reliable landmark.

### `index.html` — the landing page

| Section | Line | What it is |
|---|---|---|
| `HERO` | 7 | Headline, the sentence under it, the two buttons, the bean board |
| `THE LOOP` | 33 | "From a question to something real" — the three numbered steps |
| `PROJECTS` | 58 | "Nothing published yet" and the single placeholder card |
| `JOIN` | 91 | "Bring a question" and the what-the-form-asks panel |

### `about/index.html`

| Section | Line | What it is |
|---|---|---|
| `PAGE HEAD` | 7 | "A club for people who want to know why" |
| `01 WHAT IT IS` | 21 | "New, small, and building" |
| `02 THE PROCESS` | 35 | The three process cards |
| `03 AI` | 61 | "Fast tools, human ownership" |
| `04 JOINING` | 75 | "All levels, genuinely" |
| `JOIN` | 97 | Shared join band |

### `projects/index.html`

| Section | Line | What it is |
|---|---|---|
| `PAGE HEAD` | 7 | "Nothing published yet" |
| `THE LIBRARY` | 21 | The placeholder project card |
| `HOW PUBLISHING WORKS` | 44 | "Nothing goes public by accident" |
| `WHAT COUNTS` | 70 | "Findings, tools, and dead ends" |
| `JOIN` | 84 | Shared join band |

### `partners/index.html`

| Section | Line | What it is |
|---|---|---|
| `PAGE HEAD` | 7 | "Work with the klub" and the three offer cards |
| `WHAT WE CAN OFFER` | 51 | "A new klub, said plainly" |
| `GET IN TOUCH` | 66 | "Let's talk" |

`sponsors/index.html` is a redirect stub to `/partners/`. The old URL is on
LinkedIn, so it has to keep working. Do not delete it.

---

## The nav, footer and head live in one file

`_layouts/default.html` holds everything every page shares — the `<head>`, the
nav, the footer, and the script tags. **There is one copy.** Change the nav there
and all four pages change.

GitHub Pages assembles the pages with Jekyll. You do not run anything; pushing is
the build.

Each page file is now just its own content, with a small header on top:

```
---
layout: default
title: 'About — Kwant Klubben'
description: 'What the klub is, how a project runs, and how to join.'
---

<section class="kk-band--paper">
  ...only this page's content...
</section>
```

- `title` fills `<title>` — it is what shows in a browser tab and in Google.
- `description` fills the meta description — the grey text under a search result.
- `layout: default` picks `_layouts/default.html`. Do not change it.

Keep the `---` lines. They are what tells Jekyll to wrap the page in the layout;
without them the page is published as a bare fragment with no nav and no styling.

**Do not add `.nojekyll` back.** It switches the build off, and every page would
then show its raw `---` header as text.

---

## Things that will fail the check

- **An inline `style="..."` in a page.** Add a class in `css/styles.css` instead.
  173 of these were lifted out so the copy is findable; the guard exists so they
  do not creep back one at a time.
- **A page missing its `---` front matter**, or not setting `layout: default`.
- **Two pages sharing a `<title>`.**
- **`.nojekyll` reappearing**, or `_layouts/default.html` / `_config.yml` going
  missing.
- **Removing `&family=Chewy`** from the fonts URL — the giant `KWANT` footer
  wordmark is set in it.
- **Putting a `class` on `<footer>`.** A `.kk-footer` class selector out-specifies
  the mobile `footer{display:block}` rule and drops the wordmark behind the text.
  Style the element.
- **Removing `hidden` from `#kk-nav-panel`.** The script is deferred, so without
  it the mobile drawer renders open on a cold cache.
- **An unbalanced `}` in the stylesheet.** CSS error recovery silently discards
  the *next* rule, so the damage shows up somewhere else entirely. This actually
  happened — it cost the "How it works" band its three-column layout for two
  commits before anyone noticed.
- **A nav link pointing at a page that does not exist.**

Run it yourself before pushing, if you have Python:

```
python tools/check-site.py
```

---

## Common edits

**Change the application form link.** In `_layouts/default.html` for the nav
button, and in `index.html` / `partners/index.html` for the in-page buttons.
`check-site.py` fails if any of them disagree with the canonical URL.

**Change the contact address or the nav links.** `_layouts/default.html`, once.

**Add a real project.** Copy the `kk-card` block inside `THE LIBRARY` in
`projects/index.html`, drop the `kk-card--placeholder` class, and fill it in. The
landing page carries its own teaser copy of the same card.

**Change a colour.** Do not touch hexes in the markup. The palette is a block of
CSS variables at the top of `css/styles.css` — `--ink-*`, `--paper-*`, `--lime-*`.
Change it once there and it changes everywhere.

**Change the hero board.** It is a canvas drawn by `js/kk-bean.js`, not markup.
`tools/probe-bean.html` is its test harness: serve the repo and open
`/tools/probe-bean.html` for 39 checks against the rendered pixels.

Three things in there are easy to break and are asserted. **One bead is one
trading day** — it takes 25 moves through the session and closes once — so the
readout prints days and `days / 30` months. The **implied outline is stroked
last, over the bars**: it is the layer the chart exists to compare against, and
drawing it underneath hides it exactly where a comparison is possible. And the
**board is a fixed size**, with a constant space reserved above it for the
readout, so it does not resize under a dragged window or jump when a counter
grows a digit.

---

## The class vocabulary

You rarely need this — you are usually editing text between tags. But if you are
adding a new block, reuse these rather than inventing styles.

| Class | What it does |
|---|---|
| `kk-band--paper` / `--lime` / `--ink` / `--rule` | Full-width colour band a section sits on |
| `kk-section` | The centred 1200px column. Pair with `kk-section--body`, `--pagehead`, `--band`, `--cta`, `--join` for vertical padding |
| `kk-pagehead__title` / `kk-pagehead__lead` | The h1 and standfirst on an inner page |
| `kk-band__title` / `kk-band__lead` | Section heading and its intro |
| `kk-overline` | The small uppercase label above a heading. `--gap`, `--on-lime`, `--on-ink` position it |
| `kk-prose__p` | Body paragraph. `--sm`, `--lg`, `--gap` are size and spacing variants |
| `kk-card` | The bordered box. `--placeholder` makes it dashed |
| `kk-badge` / `kk-tag` | The small pills. `kk-badge-row` / `kk-tag-row` lay them out |
| `kk-btn` | Buttons. `--primary`, `--secondary`, `--sm`, `--lg`. `kk-btn-row` lays them out |
| `kk-step__n` / `__t` / `__d` | The numbered steps in "How it works" |

Every one is defined in `css/styles.css` under a commented group near the bottom.

**Do not use `kk-badge--survived`, `kk-badge--killed`, `kk-stamp--survived` or
`kk-stamp--killed`.** They exist because they came with the design system, but
"survived / killed" verdict cards are excluded by the klub's brief — the site
does not pass verdicts on research it has not published. Use `kk-badge--neutral`.
