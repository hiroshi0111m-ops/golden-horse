from __future__ import annotations

import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def main() -> int:
    port = free_port()
    marker = "GH_ACTIVE_INDEX_EXACT_PASS"
    with tempfile.TemporaryDirectory(dir=ROOT) as temp_dir:
        fixture = Path(temp_dir) / "index.html"
        fixture.write_text(f"<!doctype html><title>{marker}</title>{marker}", encoding="utf-8")
        relative = fixture.relative_to(ROOT)

        env = os.environ.copy()
        env["GH_ACTIVE_INDEX"] = str(relative)
        env["GH_PORT"] = str(port)
        process = subprocess.Popen(
            [sys.executable, str(ROOT / "scripts/serve_golden_horse.py")],
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        output = ""
        try:
            deadline = time.monotonic() + 12
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    output += process.stdout.read() if process.stdout else ""
                    raise RuntimeError(f"server exited early: {output}")
                try:
                    with urlopen(f"http://127.0.0.1:{port}/", timeout=1) as response:
                        body = response.read().decode("utf-8")
                    if marker not in body:
                        raise RuntimeError(
                            "GH_ACTIVE_INDEX was ignored; exact fixture marker not served"
                        )
                    print(f"SERVE_ACTIVE_INDEX=PASS path={relative}")
                    return 0
                except OSError:
                    time.sleep(0.2)
            raise RuntimeError("server did not become ready within 12 seconds")
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
