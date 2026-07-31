# Editing the site

Everything here can be changed from github.com — click a file, click the pencil,
commit. There is no build step and nothing to install. A commit to `main` is live
on kwantklubben.com about a minute later.

CI runs `tools/check-site.py` on every push. If it fails, the site does **not**
break — the previous version stays up — but your change will not go live until
the check passes. The failure message tells you what to fix and where.

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
Search for the banner name and you are in the right place.

### `index.html` — the landing page

| Section | Line | What it is |
|---|---|---|
| `HERO` | ~62 | Headline, the sentence under it, the two buttons, the bean board |
| `THE LOOP` | ~88 | "From a question to something real" — the three numbered steps |
| `PROJECTS` | ~113 | "Nothing published yet" and the single placeholder card |
| `JOIN` | ~146 | "Bring a question" and the what-the-form-asks panel |

### `about/index.html`

| Section | Line | What it is |
|---|---|---|
| `PAGE HEAD` | ~61 | "A club for people who want to know why" |
| `01 WHAT IT IS` | ~75 | "New, small, and building" |
| `02 THE PROCESS` | ~89 | The three process cards |
| `03 AI` | ~115 | "Fast tools, human ownership" |
| `04 JOINING` | ~129 | "All levels, genuinely" |
| `JOIN` | ~151 | Shared join band |

### `projects/index.html`

| Section | Line | What it is |
|---|---|---|
| `PAGE HEAD` | ~61 | "Nothing published yet" |
| `THE LIBRARY` | ~75 | The placeholder project card |
| `HOW PUBLISHING WORKS` | ~98 | "Nothing goes public by accident" |
| `WHAT COUNTS` | ~124 | "Findings, tools, and dead ends" |

### `partners/index.html`

| Section | Line | What it is |
|---|---|---|
| `PAGE HEAD` | ~61 | "Work with the klub" |
| (offers) | ~81 | "Come and do something" — the three offer cards |
| `WHAT WE CAN OFFER` | ~105 | "A new klub, said plainly" |
| `GET IN TOUCH` | ~120 | "Let's talk" |

`sponsors/index.html` is a redirect stub to `/partners/`. The old URL is on
LinkedIn, so it has to keep working. Do not delete it.

---

## Four blocks must stay byte-identical

`HEAD-COMMON`, `NAV`, `FOOTER` and `SCRIPTS` are the same text in all four pages.
They are marked in the markup:

```html
<!-- ============ NAV ============ -->
<!-- COPY-PASTE BLOCK — byte-identical in every page. ... -->
```

**If you change one, paste the same change into the other three.** The check
script compares them character by character and fails on any difference —
including a stray space. This is how the nav and footer stay in sync without a
build step.

Changing a nav link, the logo, the footer, or the script tags means editing four
files. Changing page copy means editing one.

---

## Things that will fail the check

- **An inline `style="..."` in a page.** Add a class in `css/styles.css` instead.
  173 of these were lifted out so the copy is findable; the guard exists so they
  do not creep back one at a time.
- **The four shared blocks drifting apart.**
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

**Change the application form link.** It appears as `https://forms.gle/...` in the
NAV block (all four pages) and in the hero and join bands. Search and replace
across the repo, then re-check.

**Change the contact address.** `hello@kwantklubben.com`, in the NAV block and the
footer. Same rule — all four pages.

**Add a real project.** Copy the `kk-card` block inside `THE LIBRARY` in
`projects/index.html`, drop the `kk-card--placeholder` class, and fill it in. The
landing page carries its own teaser copy of the same card.

**Change a colour.** Do not touch hexes in the markup. The palette is a block of
CSS variables at the top of `css/styles.css` — `--ink-*`, `--paper-*`, `--lime-*`.
Change it once there and it changes everywhere.

**Change the hero board.** It is a canvas drawn by `js/kk-bean.js`, not markup.
`tools/probe-bean.html` is its test harness: serve the repo and open
`/tools/probe-bean.html` for 30 checks against the rendered pixels.

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
