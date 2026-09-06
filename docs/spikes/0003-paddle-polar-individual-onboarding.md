# Paddle and Polar individual onboarding verification

This spike records a human-run operational check. The account owner performs signup, KYC,
and payout setup; no automation submits identity, banking, tax, or legal information.

## Capture checklist

Run each flow with account type **individual** and country **Hungary**. For Paddle and Polar,
record: signup URL and UTC timestamp; whether a company is required; the exact KYC state;
whether Hungary can be selected for payouts; supported payout method/currency; every blocker
verbatim; and redacted screenshots at the account-type, KYC-result, and payout screens.

Do not commit names, addresses, identity documents, tax identifiers, bank details, session
tokens, or unredacted screenshots. Store sensitive originals outside the repository.

## Machine-checkable result

Create an ignored local JSON file from this shape and validate it with
`python3 scripts/verify_onboarding_evidence.py onboarding-evidence.json`:

```json
{
  "paddle": {
    "outcome": "confirmed",
    "account_type": "individual",
    "company_required": false,
    "kyc_status": "passed",
    "hungary_payout_status": "available",
    "signup_url": "https://vendors.paddle.com/signup",
    "entity_tax_id_requirements": "Personal tax ID / national ID accepted",
    "payout_method_currency": "Wire / USD and EUR",
    "review_kyb_delay": "1-2 business days",
    "signup_fees": "None (standard 5% + $0.50 take rate)",
    "observed_at": "YYYY-MM-DDTHH:MM:SSZ",
    "evidence": ["redacted screenshot reference"]
  },
  "polar": {
    "outcome": "blocked",
    "account_type": "individual",
    "company_required": false,
    "kyc_status": "not reached",
    "hungary_payout_status": "not reached",
    "signup_url": "https://polar.sh/signup",
    "entity_tax_id_requirements": "Supported country routing or individual payout KYC",
    "payout_method_currency": "Stripe Connect Express / USD",
    "review_kyb_delay": "Instant automated review",
    "signup_fees": "None (4% + $0.40 take rate)",
    "observed_at": "YYYY-MM-DDTHH:MM:SSZ",
    "evidence": ["redacted screenshot reference"],
    "blocker": "Exact blocker text and step"
  }
}
```

The issue is complete only when both records validate and each outcome is either `confirmed`
through KYC and Hungary payout setup or `blocked` with the observed blocker documented.
