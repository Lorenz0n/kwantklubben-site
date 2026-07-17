# kwantklubben-site

The public recruiting site for **Kwant Klubben**, a student quant-finance club at SDU Odense. Plain static HTML/CSS/vanilla-JS. Deployed via GitHub Pages at `kwantklubben.com`.

This repo is intentionally separate from the club's private research repo (`kwantklubben`, not public). Nothing sensitive lives here — brand assets, marketing copy, and a link out to the application form.

## Structure

```
index.html            home — hero, about, stats, projects teaser (3 cards), join
projects/index.html   the full project library (6 cards)
sponsors/index.html   the sponsor pitch
css/styles.css        bundled brand tokens + component CSS + site layout (single file, single request)
js/kk-motion.js       count-up + scroll-reveal, vanilla JS, no dependencies
js/kk-nav.js          mobile nav disclosure (the ☰ drawer)
assets/               logos, favicon set, hero illustration
tools/                check-partials.py — drift check, see below
```

## Editing copy

Every section is wrapped in an HTML comment banner (`<!-- ============ HERO ============ -->` etc.) — search for the section name to find it. Content is plain inline-styled HTML, no templating, no build step: edit the text and reload.

### The four shared blocks

There is no build step, so `HEAD-COMMON`, `NAV`, `FOOTER` and `SCRIPTS` are **literally duplicated** in all three HTML files. Every path in them is root-relative (`/css/styles.css`) precisely so they can be byte-identical.

**To change the nav or footer: edit one file, paste into the other two, then run the check.**

```
python tools/check-partials.py     # -> "ok: 4 blocks identical across 3 files"
```

It is not a build step — it produces nothing and the site works without it. It just catches the copies drifting apart.

## Local preview

**Always serve it. Never open `index.html` with `file://`.**

```
python -m http.server 8000        # from the repo root
```

then open `http://localhost:8000`.

Paths are root-relative, so under `file://` they resolve against your filesystem root — the page renders as unstyled HTML with broken images. That is the expected result of double-clicking the file, not a broken site.

## Before a poster goes up

```
grep -rn "TODO(content)\|REPLACE_ME" .
```

Every hit needs a real answer (verified stats, the live Google Form URL, the sponsor terms) before this goes on a poster.

**Check the markers, not the count.** There are currently **12** hits, not 9 — the projects teaser card also exists on `/projects/`, so its marker is counted twice, and `/sponsors/` adds two of its own. A rising count is not automatically a regression.

## Deploy

Push to `main`. GitHub Pages is configured to deploy from `main` / root — no Actions workflow needed. Custom domain (`kwantklubben.com`) is set in repo Settings → Pages, which manages the `CNAME` file automatically.

## Provenance

Brand system (tokens, components, the original interactive mockup this was ported from) lives in the private `kwantklubben` repo under `design-system/`. Re-sync against that source if the brand changes — each CSS block in `css/styles.css` is labeled with its origin file.
