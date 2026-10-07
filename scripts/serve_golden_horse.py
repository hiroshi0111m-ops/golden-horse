from __future__ import annotations

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import socket
import sys

ROOT = Path(__file__).resolve().parents[1]


def find_active_index() -> Path:
    candidates = []
    for p in ROOT.rglob("index.html"):
        if any(part in {".git", "node_modules"} for part in p.parts):
            continue
        try:
            candidates.append((p.stat().st_size, p))
        except OSError:
            pass
    if not candidates:
        raise SystemExit("GOLDEN HORSE index.html が見つかりません。")
    candidates.sort(reverse=True, key=lambda x: x[0])
    return candidates[0][1]


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        s.close()


index = find_active_index()
docroot = index.parent
port = int(os.environ.get("GH_PORT", "8000"))
os.chdir(docroot)

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in {"", "/"}:
            self.path = "/index.html"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
ip = lan_ip()

print("=" * 64)
print("GOLDEN HORSE 無料ローカルDEVサーバー")
print(f"ACTIVE: {index.relative_to(ROOT)}")
print(f"PC:     http://127.0.0.1:{port}/")
print(f"PHONE:  http://{ip}:{port}/")
print("スマホとPCを同じWi-Fiにつないで PHONE のURLを開いてください。")
print("終了するときはこの画面で Ctrl+C")
print("=" * 64)

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\n停止しました。")
finally:
    server.server_close()
