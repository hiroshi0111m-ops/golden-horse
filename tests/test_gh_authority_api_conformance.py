#!/usr/bin/env python3
"""Integration self-test for the GOLDEN HORSE authority API conformance runner."""

from __future__ import annotations

import json
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
            self.send_json(
                200 if duplicate else 201,
                {
                    "accepted": True,
                    "balance_g": 995,
                    "server_revision": 1,
                    "bet_id": "bet-selftest",
                    "state_signature": "sig-after-bet",
                    "audit_event_id": "audit-bet",
                },
            )
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
            self.send_json(
                200 if duplicate else 201,
                {
                    "granted": True,
                    "g_ledger_entry_id": "ledger-selftest",
                    "audit_event_id": "audit-reward",
                },
            )
            return

        if self.path == "/v1/visit-rewards/finalize" and key == "qa-refund-selftest":
            self.send_json(
                409,
                {
                    "granted": False,
                    "reject_reason": "refunded",
                    "audit_event_id": "audit-refund",
                },
            )
            return

        self.send_json(404, {"error": "not_found"})


class AuthorityConformanceRunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        AuthorityMockHandler.bet_seen = False
        AuthorityMockHandler.reward_seen = False
        AuthorityMockHandler.request_count = 0
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), AuthorityMockHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def test_nine_case_suite_passes_against_isolated_mock(self) -> None:
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
            self.assertEqual(len(decoded["cases"]), 9)
            self.assertTrue(all(case["status"] == "PASS" for case in decoded["cases"]))
            self.assertEqual(AuthorityMockHandler.request_count, 9)


if __name__ == "__main__":
    unittest.main()
