from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUS = ROOT / "FREE_AUTOMATION_STATUS.md"

REQUIRED_KEYS = (
    "STATUS_SCHEMA",
    "UPDATED_JST",
    "CURRENT_VERSION",
    "CURRENT_CP",
    "CURRENT_BRANCH",
    "CURRENT_COMMIT",
    "CURRENT_PR",
    "ROLLBACK_VERSION",
    "ROLLBACK_CP",
    "ROLLBACK_COMMIT",
    "NEXT_ONE_ACTION",
)

REQUIRED_SECTIONS = (
    "## PASS",
    "## RED",
    "## NOT TESTED",
    "## PROTECTED / DO NOT TOUCH",
)


def fail(message: str) -> int:
    print(f"FREE_AUTOMATION_STATUS=FAIL {message}", file=sys.stderr)
    return 1


def parse_key_values(text: str) -> dict[str, list[str]]:
    values: dict[str, list[str]] = {}
    for line in text.splitlines():
        match = re.fullmatch(r"([A-Z0-9_]+):\s*(.+)", line.strip())
        if match:
            values.setdefault(match.group(1), []).append(match.group(2).strip())
    return values


def section_body(text: str, heading: str) -> str:
    start = text.find(heading)
    if start < 0:
        return ""
    start += len(heading)
    match = re.search(r"\n##\s+", text[start:])
    end = start + match.start() if match else len(text)
    return text[start:end]


def main() -> int:
    if not STATUS.is_file():
        return fail("missing FREE_AUTOMATION_STATUS.md")

    text = STATUS.read_text(encoding="utf-8")
    if not text.startswith("# GOLDEN HORSE FREE AUTOMATION STATUS\n"):
        return fail("invalid title")

    values = parse_key_values(text)
    for key in REQUIRED_KEYS:
        entries = values.get(key, [])
        if len(entries) != 1:
            return fail(f"{key} must appear exactly once; found {len(entries)}")

    if values["STATUS_SCHEMA"][0] != "1":
        return fail("STATUS_SCHEMA must be 1")
    if not re.fullmatch(r"2026-10-\d{2}", values["UPDATED_JST"][0]):
        return fail("UPDATED_JST must be a 2026-10 date")
    if not values["CURRENT_VERSION"][0].startswith("V174 "):
        return fail("CURRENT_VERSION must remain V174")
    if not values["ROLLBACK_VERSION"][0].startswith("V173 "):
        return fail("ROLLBACK_VERSION must remain V173")
    if not re.fullmatch(r"[0-9a-f]{40}", values["CURRENT_COMMIT"][0]):
        return fail("CURRENT_COMMIT must be a full 40-character lowercase SHA")
    if not re.fullmatch(r"[0-9a-f]{40}", values["ROLLBACK_COMMIT"][0]):
        return fail("ROLLBACK_COMMIT must be a full 40-character lowercase SHA")
    if values["CURRENT_COMMIT"][0] == values["ROLLBACK_COMMIT"][0]:
        return fail("current and rollback commits must differ")
    if not re.fullmatch(r"https://github\.com/hiroshi0111m-ops/golden-horse/pull/\d+", values["CURRENT_PR"][0]):
        return fail("CURRENT_PR must be a GOLDEN HORSE pull request URL")
    if len(values["NEXT_ONE_ACTION"][0]) < 12:
        return fail("NEXT_ONE_ACTION is too vague")

    for heading in REQUIRED_SECTIONS:
        if text.count(heading) != 1:
            return fail(f"{heading} must appear exactly once")

    pass_body = section_body(text, "## PASS")
    red_body = section_body(text, "## RED")
    not_tested_body = section_body(text, "## NOT TESTED")
    protected_body = section_body(text, "## PROTECTED / DO NOT TOUCH")

    for required in (
        "GUEST 1,000G",
        "7頭",
        "最終5タブ",
        "二重送信",
        "V174→V173復旧",
    ):
        if required not in pass_body:
            return fail(f"PASS missing: {required}")

    for forbidden in ("物理Android", "実LINE", "権威BETサーバー", "通信断BET"):
        if forbidden in pass_body:
            return fail(f"PASS must not claim: {forbidden}")

    for required in ("通信断BET", "権威BETサーバー"):
        if required not in red_body:
            return fail(f"RED missing: {required}")

    for required in ("物理Android", "物理iPhone", "実LINE", "実機音声同期"):
        if required not in not_tested_body:
            return fail(f"NOT TESTED missing: {required}")

    for required in ("main自動マージ", "本番公開", "Square本体", "本番会員", "G台帳"):
        if required not in protected_body:
            return fail(f"protected section missing: {required}")

    print(
        "FREE_AUTOMATION_STATUS=PASS "
        f"version={values['CURRENT_VERSION'][0]} "
        f"cp={values['CURRENT_CP'][0]} "
        f"next={values['NEXT_ONE_ACTION'][0]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
