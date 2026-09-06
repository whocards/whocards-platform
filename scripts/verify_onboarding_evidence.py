#!/usr/bin/env python3
"""Validate the human-captured Paddle/Polar onboarding evidence file."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

PROVIDERS = ("paddle", "polar")
STRING_FIELDS = (
    "signup_url",
    "entity_tax_id_requirements",
    "payout_method_currency",
    "review_kyb_delay",
    "signup_fees",
)
REQUIRED = (
    "account_type",
    "company_required",
    "kyc_status",
    "hungary_payout_status",
    *STRING_FIELDS,
    "observed_at",
    "evidence",
)
FINAL_STATUSES = {"confirmed", "blocked"}


def validate(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return ["root must be a JSON object"]
    errors: list[str] = []
    for provider in PROVIDERS:
        record = payload.get(provider)
        if not isinstance(record, dict):
            errors.append(f"{provider}: missing provider object")
            continue
        for field in REQUIRED:
            if record.get(field) in (None, "", []):
                errors.append(f"{provider}.{field}: required")
        for sfield in STRING_FIELDS:
            val = record.get(sfield)
            if val is not None and (not isinstance(val, str) or not val.strip()):
                errors.append(f"{provider}.{sfield}: must be non-empty string")
        outcome = record.get("outcome")
        if not isinstance(outcome, str) or outcome not in FINAL_STATUSES:
            errors.append(f"{provider}.outcome: must be confirmed or blocked")
        if record.get("account_type") != "individual":
            errors.append(f"{provider}.account_type: must be individual")
        if not isinstance(record.get("company_required"), bool):
            errors.append(f"{provider}.company_required: must be boolean")
        observed_at = record.get("observed_at")
        if observed_at is not None:
            if not isinstance(observed_at, str) or not observed_at.strip():
                errors.append(f"{provider}.observed_at: must be ISO-8601")
            else:
                try:
                    parsed = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
                    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(None):
                        errors.append(f"{provider}.observed_at: must include UTC timezone")
                except ValueError:
                    errors.append(f"{provider}.observed_at: must be ISO-8601")
        if outcome == "blocked":
            blocker = record.get("blocker")
            if not isinstance(blocker, str) or not blocker.strip():
                errors.append(f"{provider}.blocker: required when blocked")
        evidence = record.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            errors.append(f"{provider}.evidence: must contain at least one reference")
        elif not all(isinstance(x, str) and x.strip() for x in evidence):
            errors.append(f"{provider}.evidence: entries must be non-empty strings")
        if outcome == "confirmed":
            if record.get("kyc_status") != "passed":
                errors.append(f"{provider}.kyc_status: must be passed when confirmed")
            if record.get("hungary_payout_status") != "available":
                errors.append(f"{provider}.hungary_payout_status: must be available when confirmed")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence_file", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.evidence_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"INVALID: cannot read JSON evidence ({error})")
        return 1
    errors = validate(payload)
    if errors:
        print("INVALID")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print("VALID: Paddle and Polar have conclusive individual-onboarding records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
