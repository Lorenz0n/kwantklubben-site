#!/usr/bin/env python3
"""serve-preview.py — local preview without Ruby.

GitHub Pages assembles this site with Jekyll, so every page on disk is a
FRAGMENT: front matter, then body, with no <head>, no nav and no footer. A plain
`python -m http.server` therefore shows the raw `---` header and an unstyled
page, which is what README.md warns about. Installing Ruby just to look at a CSS
change is a heavy answer to a small problem.

This is the small answer. The site uses no plugins, no collections and no Liquid
beyond four variable substitutions, so the whole of the build we depend on is:

    front matter -> page.title / page.description / page.layout
    body         -> {{ content }} inside _layouts/<layout>.html
    {{ page.url }} / {{ site.url }} from _config.yml

That is what this implements, and nothing else. It is a PREVIEW, not a build:
it produces no files, CI still builds with the real jekyll-build-pages action,
and anything this gets wrong is caught there. If a future page needs a Liquid
tag beyond the four above, this will render it literally and the CI job's
"unrendered Liquid" assertion is what will tell you.

    python tools/serve-preview.py          # -> http://localhost:4000
    python tools/serve-preview.py 8080

No caching headers are sent, so a reload always shows the file on disk.
"""

import http.server
import os
import posixpath
import re
import socketserver
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAYOUTS = os.path.join(ROOT, "_layouts")

FRONT_MATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.S)


def read(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def site_config():
    """Only the keys the layout actually interpolates."""
    cfg = {"url": ""}
    path = os.path.join(ROOT, "_config.yml")
    if not os.path.exists(path):
        return cfg
    for line in read(path).splitlines():
        m = re.match(r"^(\w+):\s*(\S.*?)\s*$", line)
        if m and m.group(1) in cfg:
            cfg[m.group(1)] = m.group(2).strip("'\"")
    return cfg


def parse_front_matter(text):
    """Return (data, body). data is {} when the file has no front matter."""
    m = FRONT_MATTER.match(text)
    if not m:
        return {}, text
    data = {}
    for line in m.group(1).splitlines():
        kv = re.match(r"^(\w[\w-]*):\s*(.*?)\s*$", line)
        if kv:
            val = kv.group(2)
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "'\"":
                val = val[1:-1]
            data[kv.group(1)] = val
    return data, text[m.end():]


def render(text, page_url):
    """Apply the layout, if the page asks for one."""
    data, body = parse_front_matter(text)
    if not data.get("layout"):
        # A page with no front matter is a static passthrough — the sponsors
        # redirect stub is one — and Jekyll ships it byte for byte.
        return body
    layout_path = os.path.join(LAYOUTS, data["layout"] + ".html")
    if not os.path.exists(layout_path):
        return body
    out = read(layout_path).replace("{{ content }}", body)
    site = site_config()
    subs = {
        "page.title": data.get("title", ""),
        "page.description": data.get("description", ""),
        "page.url": page_url,
        "site.url": site.get("url", ""),
    }
    for key, val in subs.items():
        out = out.replace("{{ " + key + " }}", val)
    return out


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Preview only. A cached hero script is exactly the bug you do not want
        # while you are staring at the hero trying to see whether it changed.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        served = self.serve_page(path)
        if not served:
            super().do_GET()

    def serve_page(self, url_path):
        """True when this was an .html page we rendered ourselves."""
        clean = posixpath.normpath(urllib.parse.unquote(url_path))
        if clean.endswith("/") or clean in ("", "."):
            clean = posixpath.join(clean, "index.html")
        if url_path.endswith("/"):
            clean = posixpath.join(posixpath.normpath(urllib.parse.unquote(url_path)),
                                   "index.html")
        if not clean.endswith(".html"):
            return False

        rel = clean.lstrip("/")
        disk = os.path.join(ROOT, *rel.split("/"))
        if not os.path.isfile(disk):
            return False

        page_url = "/" + rel
        if page_url.endswith("/index.html"):
            page_url = page_url[: -len("index.html")]

        try:
            out = render(read(disk), page_url).encode("utf-8")
        except OSError:
            return False

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)
        return True

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
    with Server(("127.0.0.1", port), Handler) as httpd:
        sys.stderr.write(
            "kwantklubben preview  ->  http://localhost:%d\n"
            "  serving %s\n"
            "  layouts applied, no caching, ctrl-c to stop\n" % (port, ROOT)
        )
        httpd.serve_forever()


if __name__ == "__main__":
    main()
