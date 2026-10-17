#!/usr/bin/env python3
"""Inventory GOLDEN HORSE authoritative server integration without touching product code."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "authoritative-server-inventory.json"

SERVER_DIRS = {"api", "app", "backend", "functions", "server", "services", "supabase"}
SERVER_SUFFIXES = {".go", ".java", ".js", ".kt", ".php", ".py", ".rb", ".rs", ".ts"}
MANIFEST_NAMES = {
    "Dockerfile",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "serverless.yml",
    "serverless.yaml",
    "supabase.toml",
    "vercel.json",
}
SCHEMA_MARKERS = {"migrations", "schema.sql", "prisma"}
REQUIRED_PAYMENT_FIELDS = {
    "payment_provider",
    "external_payment_id",
    "payment_status",
    "paid_at",
    "refund_status",
}
AUTHORITY_TERMS = {
    "idempotency",
    "request_id",
    "audit_log",
    "bet_endpoint",
    "submit_bet",
    "accept_bet",
}

tracked = subprocess.check_output(
    ["git", "ls-files"], cwd=ROOT, text=True
).splitlines()

server_candidates: list[str] = []
manifests: list[str] = []
schemas: list[str] = []
scanned_runtime_files: list[str] = []
field_hits = {key: [] for key in sorted(REQUIRED_PAYMENT_FIELDS)}
authority_hits = {key: [] for key in sorted(AUTHORITY_TERMS)}

for rel in tracked:
    path = Path(rel)
    parts_lower = {part.lower() for part in path.parts}
    name_lower = path.name.lower()

    if path.name in MANIFEST_NAMES:
        manifests.append(rel)
    if SCHEMA_MARKERS & parts_lower or name_lower in SCHEMA_MARKERS:
        schemas.append(rel)

    runtime_candidate = (
        bool(SERVER_DIRS & parts_lower)
        and path.suffix.lower() in SERVER_SUFFIXES
        and ".github" not in parts_lower
        and "scripts" not in parts_lower
        and "checkpoints" not in parts_lower
    )
    if runtime_candidate:
        server_candidates.append(rel)

    # Generated checkpoints and QA scripts are client/test evidence, not authority.
    if (
        "checkpoints" in parts_lower
        or ".github" in parts_lower
        or "scripts" in parts_lower
        or path.suffix.lower() not in SERVER_SUFFIXES | {".sql", ".json", ".toml", ".yaml", ".yml"}
    ):
        continue

    full = ROOT / path
    try:
        body = full.read_text(encoding="utf-8", errors="replace").lower()
    except OSError:
        continue
    scanned_runtime_files.append(rel)
    for field in field_hits:
        if field in body:
            field_hits[field].append(rel)
    for term in authority_hits:
        if term in body:
            authority_hits[term].append(rel)

has_authoritative_backend = bool(server_candidates) and (
    any(field_hits.values()) or any(authority_hits.values())
)
report = {
    "head": subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip(),
    "tracked_file_count": len(tracked),
    "server_candidates": sorted(server_candidates),
    "runtime_manifests": sorted(manifests),
    "database_schema_candidates": sorted(schemas),
    "scanned_runtime_files": sorted(scanned_runtime_files),
    "required_payment_field_hits": field_hits,
    "authority_term_hits": authority_hits,
    "authoritative_backend_present": has_authoritative_backend,
    "interpretation": (
        "Authoritative server integration candidate found; inspect before any product change."
        if has_authoritative_backend
        else "No authoritative BET/payment server integration was found in this repository snapshot."
    ),
}
REPORT_PATH.write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))

if not has_authoritative_backend:
    raise SystemExit(
        "AUTHORITATIVE_SERVER_INVENTORY=ABSENT "
        "offline BET fail-closed cannot be proven or fixed server-side in this snapshot"
    )

print("AUTHORITATIVE_SERVER_INVENTORY=PASS")
