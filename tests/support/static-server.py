#!/usr/bin/env python3
"""Static file server for the browser smoke steps (replaces `python3 -m http.server`).

Identical to `python3 -m http.server <port> --directory <dir>`, except that a missing /favicon.ico answers
204 No Content instead of 404. The V1 app ships no favicon and Chromium asks for one only now and then; the
V1 smoke spec fails on ANY console error, so that 404 made it intermittent (#232). Nothing else is changed:
every other missing file is still a 404, and no V1 file or spec is touched.

usage: static-server.py <port> <directory>
"""
import functools
import http.server
import os
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?", 1)[0] == "/favicon.ico" and not os.path.exists(self.translate_path("/favicon.ico")):
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()


if __name__ == "__main__":
    port, directory = int(sys.argv[1]), sys.argv[2]
    handler = functools.partial(Handler, directory=directory)
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
