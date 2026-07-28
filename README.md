# Kwant Klubben site

Public website for **Kwant Klubben**, an independent student club at the University of Southern Denmark exploring quantitative finance through mathematics, code, data, and discussion.

The website is a small static site deployed through GitHub Pages at `https://kwantklubben.com`.

## Pages

- `/` — landing page and the club's core idea.
- `/about/` — how the club works and what members can expect.
- `/projects/` — public projects mirrored from the approved `kwantklubben-projects` repository.
- `/partners/` — collaboration, workshops, mentorship, and opportunities.
- `/contact/` — `hello@kwantklubben.com` and LinkedIn.

## Repositories

- Private research repo: `Lorenz0n/kwantklubben`.
- Public project mirror: `Lorenz0n/kwantklubben-projects`.
- This website: `Lorenz0n/kwantklubben-site`.

The private repo is where members work. Only projects explicitly marked for publication are copied to the public mirror. The website links only to the public mirror.

## Local preview

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. Do not open the HTML files with `file://`; the site uses root-relative paths.

## Checks

```bash
python tools/check-partials.py
python tools/check-site.py
```

`check-partials.py` keeps the shared head, navigation, footer, and scripts blocks aligned. `check-site.py` checks page routes, required links, stale claims, and the project data contract.

## Content rules

The site describes what the club does without pretending that unpublished work exists. Never add fabricated members, performance figures, project statuses, partners, or results. The temporary project card says only: **Results coming soon.**

## Deployment

Push to `main`; GitHub Pages serves the repository root. The custom domain is stored in `CNAME`.
