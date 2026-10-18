#!/usr/bin/env python3
"""Run the GOLDEN HORSE authoritative API conformance suite.

The fixture can be validated without a live API. A live run is intentionally
black-box and must target an isolated GOLDEN HORSE test environment.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE = ROOT / "contracts" / "golden_horse_authority_conformance_v1.json"
REPORT_PATH = ROOT / "authority-api-conformance-report.json"

PAYMENT_FIELDS = {
    "payment_provider",
    "external_payment_id",
    "payment_status",
    "paid_at",
    "refund_status",
}
REQUIRED_CATEGORIES = {
    "authoritative_state",
    "idempotent_bet",
    "revision_rollback",
    "gps_radius",
    "gps_fraud_detection",
    "gps_allowed_operation",
    "visit_reward",
    "visit_reward_precondition",
    "visit_reward_exclusion",
}
GPS_FRAUD_REASONS = {"mock_location", "location_tampering", "device_mismatch"}
VISIT_REWARD_EXCLUSION_REASONS = {"cancelled", "refunded", "unused", "duplicate_charge"}
VISIT_REWARD_PRECONDITION_REASONS = {
    "configured_delay_not_elapsed",
    "inside_prohibited_radius",
}
VISIT_REWARD_PRECONDITION_SIGNALS = {
    "configured_delay_not_elapsed": ("configured_delay_elapsed", False),
    "inside_prohibited_radius": ("outside_prohibited_radius_when_gps_enabled", False),
}
REQUIRED_REWARD_LINK_FIELDS = {
    "reservation_id",
    "external_payment_id",
    "member_id",
    "g_ledger_entry_id",
}
ALLOWED_METHODS = {"GET", "POST"}
SENSITIVE_HEADERS = {"authorization", "cookie", "proxy-authorization", "x-api-key"}


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def lookup(value: Any, dotted_path: str) -> Any:
    current = value
    for part in dotted_path.split("."):
        if not isinstance(current, dict) or part not in current:
            raise KeyError(dotted_path)
        current = current[part]
    return current


def replace_token(value: Any, token: str, replacement: str) -> Any:
    if isinstance(value, str):
        return value.replace(token, replacement)
    if isinstance(value, list):
        return [replace_token(item, token, replacement) for item in value]
    if isinstance(value, dict):
        return {
            key: replace_token(item, token, replacement)
            for key, item in value.items()
        }
    return value


def validate_fixture(fixture: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    cases = fixture.get("cases")
    token = fixture.get("run_token")

    require(fixture.get("schema_version") == 1, "schema_version must be 1", errors)
    require(
        fixture.get("requires_isolated_test_environment") is True,
        "suite must require an isolated test environment",
        errors,
    )
    require(isinstance(token, str) and bool(token), "run_token must be non-empty", errors)
    require(
        set(fixture.get("payment_connector_fields", [])) == PAYMENT_FIELDS,
        "payment connector fields must be the five approved fields only",
        errors,
    )
    require(isinstance(cases, list) and bool(cases), "cases must be a non-empty list", errors)
    if not isinstance(cases, list):
        return errors

    ids: set[str] = set()
    categories: set[str] = set()
    prior_ids: set[str] = set()
    fraud_reasons_seen: set[str] = set()
    exclusion_reasons_seen: set[str] = set()
    precondition_reasons_seen: set[str] = set()
    for index, case in enumerate(cases):
        prefix = f"cases[{index}]"
        if not isinstance(case, dict):
            errors.append(f"{prefix} must be an object")
            continue
        case_id = case.get("id")
        category = case.get("category")
        method = case.get("method")
        path = case.get("path")
        expected_status = case.get("expected_status")
        expected_fields = case.get("expected_fields")

        require(isinstance(case_id, str) and bool(case_id), f"{prefix}.id is required", errors)
        if isinstance(case_id, str):
            require(case_id not in ids, f"duplicate case id: {case_id}", errors)
            ids.add(case_id)
        require(isinstance(category, str), f"{prefix}.category is required", errors)
        if isinstance(category, str):
            categories.add(category)
        require(method in ALLOWED_METHODS, f"{prefix}.method must be GET or POST", errors)
        require(
            isinstance(path, str) and path.startswith("/") and "://" not in path,
            f"{prefix}.path must be a relative API path",
            errors,
        )
        require(
            isinstance(expected_status, int) and 100 <= expected_status <= 599,
            f"{prefix}.expected_status must be an HTTP status",
            errors,
        )
        require(
            isinstance(expected_fields, dict) and bool(expected_fields),
            f"{prefix}.expected_fields must be a non-empty object",
            errors,
        )

        headers = case.get("headers", {})
        require(isinstance(headers, dict), f"{prefix}.headers must be an object", errors)
        if isinstance(headers, dict):
            for name in headers:
                require(
                    name.lower() not in SENSITIVE_HEADERS,
                    f"{prefix}.headers must not contain credentials",
                    errors,
                )

        if method == "GET":
            require("body" not in case, f"{prefix} GET case must not have a body", errors)
        else:
            require(isinstance(case.get("body"), dict), f"{prefix}.body is required", errors)

        if category in {
            "visit_reward",
            "visit_reward_precondition",
            "visit_reward_exclusion",
        }:
            body = case.get("body", {})
            if isinstance(body, dict):
                connector_fields = set(body).intersection(PAYMENT_FIELDS)
                require(
                    connector_fields == PAYMENT_FIELDS,
                    f"{prefix} must include all five payment connector fields",
                    errors,
                )
                forbidden_aliases = {
                    "transaction_id",
                    "square_payment_id",
                    "payment_token",
                    "card_nonce",
                    "card_number",
                }
                require(
                    not set(body).intersection(forbidden_aliases),
                    f"{prefix} contains a forbidden payment implementation field",
                    errors,
                )

        if category == "visit_reward":
            body = case.get("body", {})
            same_as = case.get("same_as", {})
            if expected_status == 201 and isinstance(expected_fields, dict):
                require(
                    REQUIRED_REWARD_LINK_FIELDS.issubset(expected_fields),
                    f"{prefix} successful reward must return reservation, payment, member, and G ledger linkage",
                    errors,
                )
                if isinstance(body, dict):
                    for field in REQUIRED_REWARD_LINK_FIELDS - {"g_ledger_entry_id"}:
                        require(
                            expected_fields.get(field) == body.get(field),
                            f"{prefix} successful reward must echo {field}",
                            errors,
                        )
                require(
                    expected_fields.get("g_ledger_entry_id") == "$nonempty",
                    f"{prefix} successful reward must require a G ledger entry",
                    errors,
                )
            if expected_status == 200 and isinstance(same_as, dict):
                expected_links = {
                    field: f"visit_reward_granted.{field}"
                    for field in REQUIRED_REWARD_LINK_FIELDS
                }
                require(
                    expected_links.items() <= same_as.items(),
                    f"{prefix} duplicate reward must preserve all prior linkage IDs",
                    errors,
                )

        if category == "visit_reward_precondition":
            body = case.get("body", {})
            reason = (
                expected_fields.get("reject_reason")
                if isinstance(expected_fields, dict)
                else None
            )
            require(
                expected_status == 409,
                f"{prefix} reward precondition must expect HTTP 409",
                errors,
            )
            if isinstance(reason, str):
                precondition_reasons_seen.add(reason)
            require(
                reason in VISIT_REWARD_PRECONDITION_REASONS,
                f"{prefix} reward precondition has an unsupported reject_reason",
                errors,
            )
            if isinstance(expected_fields, dict):
                require(
                    expected_fields.get("granted") is False,
                    f"{prefix} reward precondition must deny the G grant",
                    errors,
                )
                require(
                    expected_fields.get("audit_event_id") == "$nonempty",
                    f"{prefix} reward precondition must require an audit event",
                    errors,
                )
            if isinstance(body, dict) and reason in VISIT_REWARD_PRECONDITION_SIGNALS:
                signal, expected_value = VISIT_REWARD_PRECONDITION_SIGNALS[reason]
                require(
                    body.get(signal) is expected_value,
                    f"{prefix} must prove {signal} is {expected_value}",
                    errors,
                )

        if category == "visit_reward_exclusion":
            body = case.get("body", {})
            require(
                expected_status == 409,
                f"{prefix} reward exclusion must expect HTTP 409",
                errors,
            )
            if isinstance(expected_fields, dict):
                reason = expected_fields.get("reject_reason")
                if isinstance(reason, str):
                    exclusion_reasons_seen.add(reason)
                require(
                    reason in VISIT_REWARD_EXCLUSION_REASONS,
                    f"{prefix} reward exclusion has an unsupported reject_reason",
                    errors,
                )
                require(
                    expected_fields.get("granted") is False,
                    f"{prefix} reward exclusion must deny the G grant",
                    errors,
                )
                require(
                    expected_fields.get("audit_event_id") == "$nonempty",
                    f"{prefix} reward exclusion must require an audit event",
                    errors,
                )
                if isinstance(body, dict):
                    exclusion_signal_ok = {
                        "cancelled": body.get("payment_status") == "cancelled",
                        "refunded": body.get("refund_status") == "refunded",
                        "unused": body.get("actual_use_confirmed") is False,
                        "duplicate_charge": body.get("duplicate_charge_detected") is True,
                    }.get(reason, False)
                    require(
                        exclusion_signal_ok,
                        f"{prefix} request body must carry its exclusion signal",
                        errors,
                    )

        if category == "gps_fraud_detection":
            body = case.get("body", {})
            require(method == "POST", f"{prefix} fraud check must use POST", errors)
            require(expected_status == 403, f"{prefix} fraud check must expect HTTP 403", errors)
            if isinstance(body, dict):
                require(
                    {"member_id", "device_id", "location_assertion_id"}.issubset(body),
                    f"{prefix} fraud check must bind member, device, and location assertion",
                    errors,
                )
            if isinstance(expected_fields, dict):
                reason = expected_fields.get("reject_reason")
                if isinstance(reason, str):
                    fraud_reasons_seen.add(reason)
                require(
                    expected_fields.get("accepted") is False,
                    f"{prefix} fraud check must reject the BET",
                    errors,
                )
                require(
                    reason in GPS_FRAUD_REASONS,
                    f"{prefix} fraud check has an unsupported reject_reason",
                    errors,
                )
                require(
                    expected_fields.get("audit_event_id") == "$nonempty",
                    f"{prefix} fraud check must require an audit event",
                    errors,
                )
                require(
                    expected_fields.get("fraud_event_id") == "$nonempty",
                    f"{prefix} fraud check must require a fraud event",
                    errors,
                )

        same_as = case.get("same_as", {})
        require(isinstance(same_as, dict), f"{prefix}.same_as must be an object", errors)
        if isinstance(same_as, dict):
            for current_path, reference in same_as.items():
                require(
                    isinstance(current_path, str) and bool(current_path),
                    f"{prefix}.same_as field path must be non-empty",
                    errors,
                )
                require(
                    isinstance(reference, str) and "." in reference,
                    f"{prefix}.same_as reference must be case.field",
                    errors,
                )
                if isinstance(reference, str) and "." in reference:
                    referenced_case = reference.split(".", 1)[0]
                    require(
                        referenced_case in prior_ids,
                        f"{prefix}.same_as must reference an earlier case: {reference}",
                        errors,
                    )
        if isinstance(case_id, str):
            prior_ids.add(case_id)

    require(
        precondition_reasons_seen == VISIT_REWARD_PRECONDITION_REASONS,
        "reward preconditions must cover configured_delay_not_elapsed and inside_prohibited_radius exactly",
        errors,
    )
    require(
        exclusion_reasons_seen == VISIT_REWARD_EXCLUSION_REASONS,
        "reward exclusions must cover cancelled, refunded, unused, and duplicate_charge exactly",
        errors,
    )
    require(
        fraud_reasons_seen == GPS_FRAUD_REASONS,
        "GPS fraud cases must cover mock_location, location_tampering, and device_mismatch exactly",
        errors,
    )
    require(
        categories == REQUIRED_CATEGORIES,
        "fixture categories do not exactly match the required authority coverage",
        errors,
    )
    required_order = [
        "initial_state",
        "bet_accept",
        "bet_duplicate",
        "stale_revision_rejected",
        "inside_radius_bet_rejected",
        "mock_location_rejected",
        "location_tampering_rejected",
        "device_mismatch_rejected",
        "checkout_allowed_inside_radius",
        "reward_delay_not_elapsed_rejected",
        "reward_inside_prohibited_radius_rejected",
        "visit_reward_granted",
        "visit_reward_duplicate",
        "visit_reward_scope_retry",
        "cancelled_reward_rejected",
        "refunded_reward_rejected",
        "unused_reward_rejected",
        "duplicate_charge_reward_rejected",
    ]
    require(
        [case.get("id") for case in cases if isinstance(case, dict)] == required_order,
        "case order must preserve stateful conformance dependencies",
        errors,
    )
    return errors


def compare_expected(
    response: dict[str, Any],
    expected: dict[str, Any],
    same_as: dict[str, str],
    prior_responses: dict[str, dict[str, Any]],
) -> list[str]:
    errors: list[str] = []
    for path, wanted in expected.items():
        try:
            actual = lookup(response, path)
        except KeyError:
            errors.append(f"missing response field: {path}")
            continue
        if wanted == "$nonempty":
            if actual is None or actual == "" or actual == [] or actual == {}:
                errors.append(f"response field is empty: {path}")
        elif actual != wanted:
            errors.append(f"{path}: expected {wanted!r}, got {actual!r}")

    for path, reference in same_as.items():
        case_id, reference_path = reference.split(".", 1)
        try:
            actual = lookup(response, path)
        except KeyError:
            errors.append(f"missing response field: {path}")
            continue
        try:
            wanted = lookup(prior_responses[case_id], reference_path)
        except (KeyError, TypeError):
            errors.append(f"unavailable reference: {reference}")
            continue
        if actual != wanted:
            errors.append(f"{path}: expected same value as {reference}")
    return errors


def execute_case(
    base_url: str,
    case: dict[str, Any],
    token: str,
    run_id: str,
    timeout: float,
    bearer_token: str | None,
    transport_retries: int,
) -> tuple[int | None, dict[str, Any] | None, str | None, int]:
    rendered = replace_token(case, token, run_id)
    url = base_url.rstrip("/") + rendered["path"]
    headers = {
        str(key): str(value)
        for key, value in rendered.get("headers", {}).items()
    }
    headers["Accept"] = "application/json"
    if bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"

    body = None
    if "body" in rendered:
        body = json.dumps(rendered["body"], ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    retry_safe = rendered["method"] == "GET" or any(
        key.lower() == "idempotency-key" and value
        for key, value in headers.items()
    )
    max_attempts = 1 + transport_retries if retry_safe else 1
    status: int | None = None
    raw = b""

    for attempt in range(1, max_attempts + 1):
        request = urllib.request.Request(
            url,
            data=body,
            headers=headers,
            method=rendered["method"],
        )
        status = None
        raw = b""
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                status = response.status
                raw = response.read()
        except urllib.error.HTTPError as error:
            status = error.code
            raw = error.read()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if attempt < max_attempts:
                continue
            return (
                None,
                None,
                f"connection failed after {attempt} attempt(s): {type(error).__name__}",
                attempt,
            )
        break

    if not raw:
        return status, None, "response body is empty", attempt
    try:
        decoded = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return status, None, "response body is not UTF-8 JSON", attempt
    if not isinstance(decoded, dict):
        return status, None, "response JSON must be an object", attempt
    return status, decoded, None, attempt

def write_report(report: dict[str, Any], output: Path) -> None:
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.environ.get("GH_AUTHORITY_API_URL"))
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--timeout-seconds", type=float, default=10.0)
    parser.add_argument("--transport-retries", type=int, choices=range(0, 4), default=1)
    parser.add_argument("--require-api", action="store_true")
    args = parser.parse_args()

    try:
        fixture = json.loads(args.fixture.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        report = {
            "checked_at_utc": datetime.now(timezone.utc).isoformat(),
            "fixture": str(args.fixture),
            "fixture_validation": "FAIL",
            "api_execution": "NOT_RUN",
            "errors": [f"fixture load failed: {type(error).__name__}"],
            "cases": [],
            "note": "No live API claims were made.",
        }
        write_report(report, args.output)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    fixture_errors = validate_fixture(fixture)
    run_id = args.run_id or (
        datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "-" + uuid4().hex[:8]
    )
    report: dict[str, Any] = {
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "fixture": args.fixture.relative_to(ROOT).as_posix()
        if args.fixture.is_relative_to(ROOT)
        else str(args.fixture),
        "suite_id": fixture.get("suite_id"),
        "run_id": run_id,
        "fixture_validation": "PASS" if not fixture_errors else "FAIL",
        "api_execution": "NOT_RUN",
        "api_target_configured": bool(args.base_url),
        "authentication_configured": bool(os.environ.get("GH_AUTHORITY_API_BEARER_TOKEN")),
        "transport_retries": args.transport_retries,
        "errors": fixture_errors,
        "cases": [],
        "note": (
            "Fixture validation is not server implementation evidence. "
            "A PASS requires execution against an isolated GOLDEN HORSE test API."
        ),
    }

    if fixture_errors:
        write_report(report, args.output)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    if not args.base_url:
        report["api_execution"] = "BLOCKED_NO_URL"
        for case in fixture["cases"]:
            report["cases"].append({"id": case["id"], "status": "NOT_RUN"})
        write_report(report, args.output)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2 if args.require_api else 0

    if not args.base_url.startswith(("https://", "http://")):
        report["api_execution"] = "BLOCKED_INVALID_URL"
        report["errors"].append("base URL must use http or https")
        write_report(report, args.output)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2

    prior_responses: dict[str, dict[str, Any]] = {}
    blocked = False
    for case in fixture["cases"]:
        if blocked:
            report["cases"].append({"id": case["id"], "status": "NOT_RUN"})
            continue
        actual_status, response, transport_error, transport_attempts = execute_case(
            args.base_url,
            case,
            fixture["run_token"],
            run_id,
            args.timeout_seconds,
            os.environ.get("GH_AUTHORITY_API_BEARER_TOKEN"),
            args.transport_retries,
        )
        case_errors: list[str] = []
        if transport_error:
            case_errors.append(transport_error)
            blocked = actual_status is None
        if actual_status != case["expected_status"]:
            case_errors.append(
                f"HTTP status: expected {case['expected_status']}, got {actual_status}"
            )
        if response is not None:
            case_errors.extend(
                compare_expected(
                    response,
                    replace_token(
                        case["expected_fields"],
                        fixture["run_token"],
                        run_id,
                    ),
                    replace_token(
                        case.get("same_as", {}),
                        fixture["run_token"],
                        run_id,
                    ),
                    prior_responses,
                )
            )
            prior_responses[case["id"]] = response

        case_result: dict[str, Any] = {
            "id": case["id"],
            "status": "PASS" if not case_errors else "FAIL",
            "expected_http_status": case["expected_status"],
            "actual_http_status": actual_status,
            "transport_attempts": transport_attempts,
            "errors": case_errors,
        }
        report["cases"].append(case_result)

    failures = [case for case in report["cases"] if case["status"] == "FAIL"]
    if blocked:
        report["api_execution"] = "BLOCKED_CONNECTION"
        report["errors"].append("live API connection could not be established")
        exit_code = 2
    elif failures:
        report["api_execution"] = "FAIL"
        exit_code = 1
    else:
        report["api_execution"] = "PASS"
        exit_code = 0

    write_report(report, args.output)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
