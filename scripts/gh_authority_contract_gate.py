#!/usr/bin/env python3
"""Validate the GOLDEN HORSE RC authority contract and expose implementation readiness."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "golden_horse_authoritative_state_v1.json"
REPORT_PATH = ROOT / "authority-contract-readiness-report.json"

PAYMENT_FIELDS = {
    "payment_provider",
    "external_payment_id",
    "payment_status",
    "paid_at",
    "refund_status",
}
BET_REQUEST_FIELDS = {
    "member_id",
    "race_id",
    "bet_type",
    "selections",
    "stake_g",
    "idempotency_key",
    "client_revision",
    "device_id",
    "location_assertion_id",
}
BET_RESPONSE_FIELDS = {
    "accepted",
    "server_revision",
    "state_signature",
    "bet_id",
    "balance_g",
    "accepted_at",
    "audit_event_id",
    "reject_reason",
}
ALLOWED_INSIDE_RADIUS = {"reservation", "qr", "payment", "check_in", "check_out"}
REJECTED_INSIDE_RADIUS = {"game_play", "bet"}
REQUIRED_EVIDENCE = {
    "offline_bet_rejected_by_server",
    "duplicate_bet_single_debit",
    "revision_rollback_rejected",
    "state_signature_tamper_rejected",
    "gps_radius_bet_rejected",
    "visit_reward_duplicate_prevented",
    "audit_event_recorded",
}
CODE_SUFFIXES = {".js", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".go", ".rs", ".java", ".rb"}


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def find_backend_files(roots: list[str]) -> list[str]:
    found: list[str] = []
    for relative in roots:
        base = ROOT / relative
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix.lower() in CODE_SUFFIXES:
                found.append(path.relative_to(ROOT).as_posix())
    return sorted(found)


def validate(contract: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    square = contract.get("square_scope", {})
    trust = contract.get("trust_boundary", {})
    bet = contract.get("bet_acceptance", {})
    integrity = contract.get("state_integrity", {})
    gps = contract.get("gps_policy", {})
    reward = contract.get("visit_reward", {})
    audit = contract.get("audit", {})
    gate = contract.get("rc_gate", {})

    require(contract.get("schema_version") == 1, "schema_version must be 1", errors)
    require(square.get("golden_horse_must_not_implement_square") is True,
            "Square implementation must remain external", errors)
    require(set(square.get("allowed_payment_connector_fields", [])) == PAYMENT_FIELDS,
            "Square connector fields must be the five approved fields only", errors)
    require(trust.get("client_storage_authoritative") is False,
            "client storage must not be authoritative", errors)
    require(trust.get("server_secret_must_never_reach_client") is True,
            "server signing secret must never reach the client", errors)
    require(set(bet.get("required_request_fields", [])) == BET_REQUEST_FIELDS,
            "BET request fields are incomplete", errors)
    require(set(bet.get("required_response_fields", [])) == BET_RESPONSE_FIELDS,
            "BET response fields are incomplete", errors)
    require(bet.get("offline_policy") == "fail_closed",
            "offline BET policy must fail closed", errors)
    require(bet.get("stale_revision_policy") == "reject",
            "stale revisions must be rejected", errors)
    require(bet.get("duplicate_policy") == "return_original_result_without_second_debit",
            "duplicate BET must return the original result without a second debit", errors)
    require(integrity.get("revision_rule") == "strictly_monotonic_per_member",
            "member state revision must be strictly monotonic", errors)
    require(integrity.get("audit_all_rejections") is True,
            "all integrity rejections must be audited", errors)
    require(set(gps.get("server_rejects_inside_radius", [])) == REJECTED_INSIDE_RADIUS,
            "server must reject only game play and BET inside the prohibited radius", errors)
    require(set(gps.get("server_allows_inside_radius", [])) == ALLOWED_INSIDE_RADIUS,
            "reservation/payment/check-in/check-out operations must remain allowed", errors)
    require(set(reward.get("required_payment_connector_fields", [])) == PAYMENT_FIELDS,
            "visit reward must use the approved payment connector fields", errors)
    require(reward.get("server_finalizes_g_grant") is True,
            "visit reward G grant must be finalized by the server", errors)
    require(reward.get("default_delay_minutes") == 10,
            "default visit reward delay must be 10 minutes", errors)
    require(audit.get("append_only") is True,
            "audit log must be append-only", errors)
    require(gate.get("implementation_required") is True,
            "backend implementation must be required before RC", errors)
    require(set(gate.get("required_evidence", [])) == REQUIRED_EVIDENCE,
            "RC authority evidence list is incomplete", errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-implementation", action="store_true")
    args = parser.parse_args()

    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    errors = validate(contract)
    backend_roots = contract["rc_gate"]["accepted_backend_roots"]
    backend_files = find_backend_files(backend_roots)
    implementation_status = "PRESENT_UNVERIFIED" if backend_files else "BLOCKED_MISSING"

    report = {
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "contract": CONTRACT_PATH.relative_to(ROOT).as_posix(),
        "contract_validation": "PASS" if not errors else "FAIL",
        "server_implementation": implementation_status,
        "backend_files": backend_files,
        "errors": errors,
        "rc_ready": not errors and bool(backend_files),
        "note": (
            "Contract validation is not server implementation evidence. "
            "RC remains blocked until required backend evidence passes."
        ),
    }
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if errors:
        return 1
    if args.require_implementation and not backend_files:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
