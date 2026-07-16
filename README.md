# kwantklubben-site

The public recruiting site for **Kwant Klubben**, a student quant-finance club at SDU Odense. Plain static HTML/CSS/vanilla-JS. Deployed via GitHub Pages at `kwantklubben.com`.

This repo is intentionally separate from the club's private research repo (`kwantklubben`, not public). Nothing sensitive lives here — brand assets, marketing copy, and a link out to the application form.

## Structure

```
index.html        the whole site — one page, seven sections
css/styles.css    bundled brand tokens + component CSS + site layout (single file, single request)
js/kk-motion.js   count-up + scroll-reveal, vanilla JS, no dependencies
assets/           logos, favicon set, hero illustration
```

## Editing copy

Every section in `index.html` is wrapped in an HTML comment banner (`<!-- ============ HERO ============ -->` etc.) — search for the section name to find it. Content is plain inline-styled HTML, no templating, no build step: edit the text directly and refresh.

Before publishing, grep for anything still flagged:

```
grep -rn "TODO(content)\|REPLACE_ME" .
```

Every hit needs a real answer (verified stats, the live Google Form URL, the LinkedIn page URL) before this goes on a poster.

## Local preview

```
python -m http.server 8000
```

then open `http://localhost:8000`.

## Deploy

Push to `main`. GitHub Pages is configured to deploy from `main` / root — no Actions workflow needed. Custom domain (`kwantklubben.com`) is set in repo Settings → Pages, which manages the `CNAME` file automatically.

## Provenance

Brand system (tokens, components, the original interactive mockup this was ported from) lives in the private `kwantklubben` repo under `design-system/`. Re-sync against that source if the brand changes — each CSS block in `css/styles.css` is labeled with its origin file.
