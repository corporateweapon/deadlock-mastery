"""Local dev server for Deadlock Mastery: static files, caching disabled.

    python serve.py [port]      (default 8787)
"""
import functools, http.server, pathlib, sys, webbrowser

ROOT = pathlib.Path(__file__).resolve().parent / "public"
PORT = next((int(a) for a in sys.argv[1:] if a.isdigit()), 8787)


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the console quiet except for errors
        if args and str(args[1])[:1] in "45":
            super().log_message(fmt, *args)


if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}/"
    print(f"Deadlock Mastery running at {url}  (Ctrl+C to stop)")
    if "--no-open" not in sys.argv:
        webbrowser.open(url)
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT),
                                    functools.partial(NoCache, directory=str(ROOT))).serve_forever()
