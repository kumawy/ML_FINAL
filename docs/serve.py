#!/usr/bin/env python3
"""Serve the offline presentation on loopback, including H.264 byte ranges."""
from __future__ import annotations

import http.server
import os
from pathlib import Path
import socketserver
import webbrowser

ROOT = Path(__file__).resolve().parent


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self._range = None
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        self._range = None
        path = Path(self.translate_path(self.path))
        if not path.is_file() or "Range" not in self.headers:
            return super().send_head()
        size = path.stat().st_size
        try:
            unit, span = self.headers["Range"].split("=", 1)
            start_text, end_text = span.split("-", 1)
            if unit != "bytes" or "," in span:
                raise ValueError
            if start_text:
                start = int(start_text)
                end = int(end_text) if end_text else size - 1
            else:
                length = int(end_text)
                if length <= 0:
                    raise ValueError
                start, end = max(0, size - length), size - 1
            if start < 0 or start >= size or end < start:
                raise ValueError
            end = min(end, size - 1)
        except ValueError:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        source = path.open("rb")
        source.seek(start)
        self._range = (start, end)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        return source

    def copyfile(self, source, outputfile):
        if self._range is None:
            return super().copyfile(source, outputfile)
        remaining = self._range[1] - self._range[0] + 1
        try:
            while remaining:
                block = source.read(min(65536, remaining))
                if not block:
                    break
                outputfile.write(block)
                remaining -= len(block)
        except (BrokenPipeError, ConnectionResetError):
            pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def main():
    if not (ROOT / "index.html").exists():
        from build_deck import build
        build()
    for port in range(8786, 8806):
        try:
            server = Server(("127.0.0.1", port), RangeHandler)
            break
        except OSError:
            continue
    else:
        raise RuntimeError("No free local port between 8786 and 8805")
    url = f"http://127.0.0.1:{port}/index.html"
    print(f"ML Final cockpit presentation: {url}", flush=True)
    print("Stop the local server with Ctrl+C.", flush=True)
    if os.environ.get("COCKPIT_NO_BROWSER") != "1":
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
