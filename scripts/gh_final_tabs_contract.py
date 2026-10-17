from __future__ import annotations

import os
import re
import sys
from html import unescape
from pathlib import Path

INDEX = Path(os.environ.get("GH_ACTIVE_INDEX", "checkpoints/V173_MOBILE_NAV_SAFE_AREA/index.html"))
EXPECTED = [
    ("home", "ホーム"),
    ("startPage", "レース"),
    ("horse", "育成"),
    ("campaign", "特典"),
    ("login", "マイページ"),
]


def strip_tags(value: str) -> str:
    return re.sub(r"<[^>]+>", "", unescape(value)).strip()


def main() -> int:
    html = INDEX.read_text(encoding="utf-8")
    nav_match = re.search(r'<nav class="gh-v60-nav"[^>]*>(.*?)</nav>', html, re.S)
    if not nav_match:
        print("FINAL_TABS=FAIL nav not found", file=sys.stderr)
        return 1

    buttons = re.findall(
        r'<button class="gh-v60-nav-item" data-page="([^"]+)"[^>]*><span>.*?</span>(.*?)</button>',
        nav_match.group(1),
        re.S,
    )
    actual = [(target, strip_tags(label)) for target, label in buttons]

    errors: list[str] = []
    if actual != EXPECTED:
        errors.append(f"expected {EXPECTED}, got {actual}")

    for target, _ in EXPECTED:
        if not re.search(rf'<section id="{re.escape(target)}"(?:\s|>)', html):
            errors.append(f"missing target section: {target}")

    nav_html = nav_match.group(1)
    for obsolete in ("cards", "gacha"):
        if f'data-page="{obsolete}"' in nav_html:
            errors.append(f"obsolete final-tab target remains: {obsolete}")

    if errors:
        print("FINAL_TABS=FAIL " + " | ".join(errors), file=sys.stderr)
        return 1

    print("FINAL_TABS=PASS " + repr(actual))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
