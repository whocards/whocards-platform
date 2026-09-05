import unittest

from scripts.verify_onboarding_evidence import validate


def record(**overrides):
    value = {
        "outcome": "confirmed",
        "account_type": "individual",
        "company_required": False,
        "kyc_status": "passed",
        "hungary_payout_status": "available",
        "observed_at": "2026-09-05T12:00:00Z",
        "evidence": ["Screenshot captured by account owner"],
    }
    value.update(overrides)
    return value


class ValidateEvidenceTest(unittest.TestCase):
    def test_accepts_confirmed_and_documented_blocker(self):
        payload = {
            "paddle": record(),
            "polar": record(outcome="blocked", blocker="Hungary unavailable"),
        }
        self.assertEqual(validate(payload), [])

    def test_requires_both_providers(self):
        self.assertIn("polar: missing provider object", validate({"paddle": record()}))

    def test_rejects_non_individual_account(self):
        errors = validate({"paddle": record(account_type="company"), "polar": record()})
        self.assertIn("paddle.account_type: must be individual", errors)

    def test_blocker_is_required_for_blocked_outcome(self):
        errors = validate({"paddle": record(outcome="blocked"), "polar": record()})
        self.assertIn("paddle.blocker: required when blocked", errors)

    def test_confirmed_requires_kyc_and_hungary_payout(self):
        errors = validate({
            "paddle": record(kyc_status="pending", hungary_payout_status="unavailable"),
            "polar": record(),
        })
        self.assertIn("paddle.kyc_status: must be passed when confirmed", errors)
        self.assertIn("paddle.hungary_payout_status: must be available when confirmed", errors)

    def test_evidence_must_be_non_empty_list(self):
        errors = validate({"paddle": record(evidence=[]), "polar": record()})
        self.assertIn("paddle.evidence: must contain at least one reference", errors)

    def test_company_required_must_be_boolean(self):
        errors = validate({"paddle": record(company_required="no"), "polar": record()})
        self.assertIn("paddle.company_required: must be boolean", errors)

    def test_observed_at_requires_iso8601_timezone(self):
        errors = validate({"paddle": record(observed_at="2026-09-05 12:00"), "polar": record()})
        self.assertIn("paddle.observed_at: must include UTC timezone", errors)

    def test_observed_at_rejects_invalid_value(self):
        errors = validate({"paddle": record(observed_at="not-a-date"), "polar": record()})
        self.assertIn("paddle.observed_at: must be ISO-8601", errors)


if __name__ == "__main__":
    unittest.main()
