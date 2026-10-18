#!/usr/bin/env python3
"""Integration self-test for the GOLDEN HORSE authority API conformance runner."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts" / "gh_authority_api_conformance.py"
FIXTURE = ROOT / "contracts" / "golden_horse_authority_conformance_v1.json"


class AuthorityMockHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    bet_seen = False
    reward_seen = False
    request_count = 0
    violate_duplicate_bet = False
    violate_mock_location_evidence = False
    violate_unused_reward = False
    violate_reward_link = False
    expected_authorization: str | None = None
    authorization_seen = False

    def log_message(self, format: str, *args: Any) -> None:
        return

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        decoded = json.loads(raw.decode("utf-8"))
        if not isinstance(decoded, dict):
            raise ValueError("request body must be an object")
        return decoded

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        type(self).request_count += 1
        if type(self).expected_authorization is not None:
            type(self).authorization_seen = (
                self.headers.get("Authorization") == type(self).expected_authorization
            )
            if not type(self).authorization_seen:
                self.send_json(401, {"error": "unauthorized"})
                return
        if self.path == "/v1/state/guest-authority-qa-selftest":
            self.send_json(
                200,
                {
                    "member_id": "guest-authority-qa-selftest",
                    "balance_g": 1000,
                    "server_revision": 0,
                    "state_signature": "sig-initial",
                },
            )
            return
        self.send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        type(self).request_count += 1
        body = self.read_json()
        key = self.headers.get("Idempotency-Key")

        if self.path == "/v1/bets" and key == "qa-bet-selftest":
            expected = {
                "member_id": "guest-authority-qa-selftest",
                "race_id": "qa-race-001",
                "bet_type": "win",
                "selections": [1],
                "stake_g": 5,
                "idempotency_key": "qa-bet-selftest",
                "client_revision": 0,
                "device_id": "qa-device-selftest",
                "location_assertion_id": "qa-location-outside-selftest",
            }
            if body != expected:
                self.send_json(400, {"error": "unexpected_request"})
                return
            duplicate = type(self).bet_seen
            type(self).bet_seen = True
            payload = {
                "accepted": True,
                "balance_g": 995,
                "server_revision": 1,
                "bet_id": "bet-selftest",
                "state_signature": "sig-after-bet",
                "audit_event_id": "audit-bet",
            }
            if duplicate and type(self).violate_duplicate_bet:
                payload.update(
                    {
                        "balance_g": 990,
                        "server_revision": 2,
                        "bet_id": "bet-duplicate-wrong",
                        "state_signature": "sig-duplicate-wrong",
                    }
                )
            self.send_json(200 if duplicate else 201, payload)
            return

        if self.path == "/v1/bets" and key == "qa-stale-selftest":
            self.send_json(
                409,
                {
                    "accepted": False,
                    "reject_reason": "stale_revision",
                    "balance_g": 995,
                    "server_revision": 1,
                    "audit_event_id": "audit-stale",
                },
            )
            return

        if self.path == "/v1/bets" and key == "qa-gps-selftest":
            self.send_json(
                403,
                {
                    "accepted": False,
                    "reject_reason": "inside_prohibited_radius",
                    "balance_g": 995,
                    "server_revision": 1,
                    "audit_event_id": "audit-gps",
                },
            )
            return

        fraud_reasons = {
            "qa-mock-location-selftest": "mock_location",
            "qa-location-tampering-selftest": "location_tampering",
            "qa-device-mismatch-selftest": "device_mismatch",
        }
        if self.path == "/v1/bets" and key in fraud_reasons:
            payload = {
                "accepted": False,
                "reject_reason": fraud_reasons[key],
                "balance_g": 995,
                "server_revision": 1,
                "audit_event_id": f"audit-{fraud_reasons[key]}",
                "fraud_event_id": f"fraud-{fraud_reasons[key]}",
            }
            if (
                key == "qa-mock-location-selftest"
                and type(self).violate_mock_location_evidence
            ):
                payload.pop("fraud_event_id")
            self.send_json(403, payload)
            return

        if self.path == "/v1/visits/check-out":
            self.send_json(
                200,
                {
                    "checked_out": True,
                    "audit_event_id": "audit-checkout",
                },
            )
            return

        if self.path == "/v1/visit-rewards/finalize" and key == "qa-reward-selftest":
            required_payment = {
                "payment_provider",
                "external_payment_id",
                "payment_status",
                "paid_at",
                "refund_status",
            }
            if not required_payment.issubset(body):
                self.send_json(400, {"error": "missing_payment_connector"})
                return
            duplicate = type(self).reward_seen
            type(self).reward_seen = True
            payload = {
                "granted": True,
                "reservation_id": body["reservation_id"],
                "external_payment_id": body["external_payment_id"],
                "member_id": body["member_id"],
                "g_ledger_entry_id": "ledger-selftest",
                "audit_event_id": "audit-reward",
            }
            if not duplicate and type(self).violate_reward_link:
                payload.pop("external_payment_id")
            self.send_json(200 if duplicate else 201, payload)
            return

        exclusion_reasons = {
            "qa-cancelled-selftest": "cancelled",
            "qa-refund-selftest": "refunded",
            "qa-unused-selftest": "unused",
            "qa-duplicate-charge-selftest": "duplicate_charge",
        }
        if self.path == "/v1/visit-rewards/finalize" and key in exclusion_reasons:
            reason = exclusion_reasons[key]
            if key == "qa-unused-selftest" and type(self).violate_unused_reward:
                self.send_json(
                    201,
                    {
                        "granted": True,
                        "g_ledger_entry_id": "ledger-unused-wrong",
                        "audit_event_id": "audit-unused-wrong",
                    },
                )
                return
            self.send_json(
                409,
                {
                    "granted": False,
                    "reject_reason": reason,
                    "audit_event_id": f"audit-{reason}",
                },
            )
            return

        self.send_json(404, {"error": "not_found"})


class AuthorityConformanceRunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        AuthorityMockHandler.bet_seen = False
        AuthorityMockHandler.reward_seen = False
        AuthorityMockHandler.request_count = 0
        AuthorityMockHandler.violate_duplicate_bet = False
        AuthorityMockHandler.violate_mock_location_evidence = False
        AuthorityMockHandler.violate_unused_reward = False
        AuthorityMockHandler.violate_reward_link = False
        AuthorityMockHandler.expected_authorization = None
        AuthorityMockHandler.authorization_seen = False
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), AuthorityMockHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def test_fifteen_case_suite_passes_against_isolated_mock(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(RUNNER),
                    "--base-url",
                    f"http://127.0.0.1:{self.server.server_port}",
                    "--fixture",
                    str(FIXTURE),
                    "--output",
                    str(report),
                    "--run-id",
                    "selftest",
                    "--require-api",
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            decoded = json.loads(report.read_text(encoding="utf-8"))
            self.assertEqual(decoded["fixture_validation"], "PASS")
            self.assertEqual(decoded["api_execution"], "PASS")
            self.assertEqual(len(decoded["cases"]), 15)
            self.assertTrue(all(case["status"] == "PASS" for case in decoded["cases"]))
            self.assertEqual(AuthorityMockHandler.request_count, 15)

    def test_duplicate_second_debit_is_reported_as_failure(self) -> None:
        AuthorityMockHandler.violate_duplicate_bet = True
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(RUNNER),
                    "--base-url",
                    f"http://127.0.0.1:{self.server.server_port}",
                    "--fixture",
                    str(FIXTURE),
                    "--output",
                    str(report),
                    "--run-id",
                    "selftest",
                    "--require-api",
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            decoded = json.loads(report.read_text(encoding="utf-8"))
            self.assertEqual(decoded["api_execution"], "FAIL")
            duplicate = next(
                case for case in decoded["cases"] if case["id"] == "bet_duplicate"
            )
            self.assertEqual(duplicate["status"], "FAIL")
            self.assertTrue(
                any("balance_g" in error for error in duplicate["errors"])
            )
            self.assertTrue(
                any("bet_accept.bet_id" in error for error in duplicate["errors"])
            )

    def test_missing_fraud_event_is_reported_as_failure(self) -> None:
        AuthorityMockHandler.violate_mock_location_evidence = True
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(RUNNER),
                    "--base-url",
                    f"http://127.0.0.1:{self.server.server_port}",
                    "--fixture",
                    str(FIXTURE),
                    "--output",
                    str(report),
                    "--run-id",
                    "selftest",
                    "--require-api",
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            decoded = json.loads(report.read_text(encoding="utf-8"))
            fraud_case = next(
                case
                for case in decoded["cases"]
                if case["id"] == "mock_location_rejected"
            )
            self.assertEqual(fraud_case["status"], "FAIL")
            self.assertTrue(
                any("fraud_event_id" in error for error in fraud_case["errors"])
            )

    def test_unused_visit_wrongly_granted_is_reported_as_failure(self) -> None:
        AuthorityMockHandler.violate_unused_reward = True
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(RUNNER),
                    "--base-url",
                    f"http://127.0.0.1:{self.server.server_port}",
                    "--fixture",
                    str(FIXTURE),
                    "--output",
                    str(report),
                    "--run-id",
                    "selftest",
                    "--require-api",
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            decoded = json.loads(report.read_text(encoding="utf-8"))
            unused_case = next(
                case
                for case in decoded["cases"]
                if case["id"] == "unused_reward_rejected"
            )
            self.assertEqual(unused_case["status"], "FAIL")
            self.assertTrue(
                any(
                    "HTTP status" in error or "granted" in error
                    for error in unused_case["errors"]
                )
            )

    def test_missing_reward_link_is_reported_as_failure(self) -> None:
        AuthorityMockHandler.violate_reward_link = True
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(RUNNER),
                    "--base-url",
                    f"http://127.0.0.1:{self.server.server_port}",
                    "--fixture",
                    str(FIXTURE),
                    "--output",
                    str(report),
                    "--run-id",
                    "selftest",
                    "--require-api",
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            decoded = json.loads(report.read_text(encoding="utf-8"))
            reward = next(
                case
                for case in decoded["cases"]
                if case["id"] == "visit_reward_granted"
            )
            self.assertEqual(reward["status"], "FAIL")
            self.assertTrue(
                any("external_payment_id" in error for error in reward["errors"])
            )

    def test_missing_api_url_returns_blocker_without_false_pass(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            environment = os.environ.copy()
            environment.pop("GH_AUTHORITY_API_URL", None)
            environment.pop("GH_AUTHORITY_API_BEARER_TOKEN", None)
            result = subprocess.run(
                [
                    sys.executable,
                    str(RUNNER),
                    "--fixture",
                    str(FIXTURE),
                    "--output",
                    str(report),
                    "--run-id",
                    "selftest",
                    "--require-api",
                ],
                cwd=ROOT,
                env=environment,
                text=True,
                capture_output=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            decoded = json.loads(report.read_text(encoding="utf-8"))
            self.assertEqual(decoded["fixture_validation"], "PASS")
            self.assertEqual(decoded["api_execution"], "BLOCKED_NO_URL")
            self.assertTrue(
                all(case["status"] == "NOT_RUN" for case in decoded["cases"])
            )

    def test_bearer_token_is_used_but_never_written_to_evidence(self) -> None:
        secret = "qa-secret-must-not-leak"
        AuthorityMockHandler.expected_authorization = f"Bearer {secret}"
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            environment = os.environ.copy()
            environment["GH_AUTHORITY_API_BEARER_TOKEN"] = secret
            result = subprocess.run(
                [
                    sys.executable,
                    str(RUNNER),
                    "--base-url",
                    f"http://127.0.0.1:{self.server.server_port}",
                    "--fixture",
                    str(FIXTURE),
                    "--output",
                    str(report),
                    "--run-id",
                    "selftest",
                    "--require-api",
                ],
                cwd=ROOT,
                env=environment,
                text=True,
                capture_output=True,
                timeout=30,
                check=False,
            )
            evidence = report.read_text(encoding="utf-8")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue(AuthorityMockHandler.authorization_seen)
            self.assertNotIn(secret, result.stdout)
            self.assertNotIn(secret, result.stderr)
            self.assertNotIn(secret, evidence)
            decoded = json.loads(evidence)
            self.assertTrue(decoded["authentication_configured"])
            self.assertEqual(decoded["api_execution"], "PASS")


if __name__ == "__main__":
    unittest.main()
