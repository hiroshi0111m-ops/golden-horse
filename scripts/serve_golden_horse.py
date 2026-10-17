from __future__ import annotations

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import socket

ROOT = Path(__file__).resolve().parents[1]


def exact_active_index() -> Path | None:
    requested = os.environ.get("GH_ACTIVE_INDEX", "").strip()
    if not requested:
        return None

    candidate = Path(requested)
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    candidate = candidate.resolve()
    root = ROOT.resolve()

    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise SystemExit("GH_ACTIVE_INDEX はリポジトリ内のファイルを指定してください。") from exc

    if not candidate.is_file():
        raise SystemExit(f"GH_ACTIVE_INDEX が見つかりません: {candidate}")
    if candidate.name.lower() != "index.html":
        raise SystemExit("GH_ACTIVE_INDEX は index.html を指定してください。")
    return candidate


def find_active_index() -> Path:
    exact = exact_active_index()
    if exact is not None:
        return exact

    candidates = []
    for path in ROOT.rglob("index.html"):
        if any(part in {".git", "node_modules"} for part in path.parts):
            continue
        try:
            candidates.append((path.stat().st_size, path))
        except OSError:
            pass
    if not candidates:
        raise SystemExit("GOLDEN HORSE index.html が見つかりません。")
    candidates.sort(reverse=True, key=lambda item: item[0])
    return candidates[0][1]


def lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        sock.close()


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
