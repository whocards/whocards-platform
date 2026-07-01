# WhoCards emails

React Email templates and the guarded Resend workflow for WhoCards.

## Preview and render

From the repository root:

```bash
pnpm email:dev
pnpm email:render
pnpm email:export
```

`email:dev` opens React Email's local preview. `email:render` writes the Android tester recruitment,
onboarding, day-7, and completion emails as HTML plus authored plain text under
`apps/emails/dist/`. `email:export` exports every template through the React Email CLI.

Set `ANDROID_TESTER_SIGNUP_URL` to the signup form, tester group, or landing page you want the CTA
to open. Preview/render use a non-production placeholder if it is absent; sending requires it.
Set `ANDROID_TESTER_GROUP_URL` to the tester Google Group, `ANDROID_TESTER_OPT_IN_URL` to the
verified Google Play Closed Testing opt-in URL, and `ANDROID_TESTER_FEEDBACK_URL` to the tester
feedback form or contact route. Rendered previews use safe placeholders when these are absent; do
not send onboarding until the group and opt-in flow have been verified with a Google account outside
the owner account.

## Resend configuration

Add these values to the repository's uncommitted `.env` file:

```dotenv
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="WhoCards <hello@whocards.cc>"
ANDROID_TESTER_SIGNUP_URL=https://your-real-signup-url.example
ANDROID_TESTER_GROUP_URL=https://groups.google.com/g/your-tester-group
ANDROID_TESTER_OPT_IN_URL=https://play.google.com/apps/testing/com.whocards.mobile
ANDROID_TESTER_FEEDBACK_URL=https://your-feedback-form.example
EMAIL_TEST_RECIPIENT=you@example.com
```

Before using `hello@whocards.cc`, add and verify `whocards.cc` in Resend, including the DNS records
Resend provides. The `From` value must use that verified domain. Until the domain is verified,
Resend's onboarding sender is only suitable for the account owner's address and must not be used for
a real campaign.

The send helper is exported from `@whocards/emails/resend`. It sends one recipient at a time and
accepts both React and plain-text bodies. A production audience/campaign workflow should handle
consent, unsubscribe links, suppression, batching, and delivery reporting before it is added.

## Send one guarded test

No command sends by default. To send exactly one test message to `EMAIL_TEST_RECIPIENT`, opt in for
that invocation:

```bash
EMAIL_TEST_SEND_CONFIRMED=true pnpm email:test-send
```

The command validates every variable, prefixes the subject with `[TEST]`, and only accepts one valid
email address. It is intentionally not a bulk-send command.

Recommended production subject: **The WhoCards app is almost here — want in early?**

Preview text: **We’re looking for Android testers to help shape the first WhoCards app release.**
