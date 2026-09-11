# Stats page env vars

How to get every value the public [`/stats`](https://whocards.cc/stats) page reads, and how to
set them on Netlify. The code lives in `apps/website/src/server/stats`; the schema is in
`apps/website/src/env.ts`.

Everything about Answers — questions answered, the platform split, the weekly trend,
active Devices, Decks, languages, countries — comes straight from Postgres and needs no
extra config. Two **optional** external sources fill in the rest:

| Card             | Source                      | Vars                                                                                                                          |
| ---------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| iOS installs     | App Store Connect Sales API | `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_PRIVATE_KEY`, `APP_STORE_CONNECT_VENDOR_NUMBER` |
| Android installs | Google Play reports bucket  | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_REPORTS_BUCKET`                                                              |

Countries need no key: every recorded Answer is stamped with the ISO country code Netlify
attaches to the request (the `x-country` header), so the count is a plain group-by.

None of them gate the build. A source with any var missing shows **"Not connected yet."**; a
source whose vars are set but whose call fails (bad key, missing permission, network) shows
**"Temporarily unavailable."** Each source degrades on its own, so you can connect them one at a
time.

**Where values go:** locally, the root `.env` (the website reads it via `vite.envDir`). In
production, the Netlify site **`whocards-calmly`** (serves whocards.cc).

## Before you start: production migration

The page reads three things that migrations add: `answer.platform` (`0002`), `answer.country`
(`0003`) and the `stats_snapshot` table (`0004`). Netlify deploys don't run migrations, so
run them against production **before** the page ships:

```sh
pnpm --filter website db:migrate
```

`DB_URL` in the root `.env` is the production database, so this touches prod: read the
pending migration files first, and don't run `db:push` (it diffs the whole schema and can
drop columns).

---

## 1. App Store Connect (iOS installs)

Needs an App Store Connect **Admin** or the **Account Holder**. If the team has never used the
API, the Account Holder has to click **Request Access** on the Integrations page once.

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** →
   **Team Keys** tab.
2. **Generate API Key** (the **+** button). Name it `whocards-stats`. Give it the **Sales** role
   (older UIs call it "Sales and Reports"). Sales is the least privilege that can read sales
   reports; Admin also works but grants far more.
3. Copy the key's **Key ID** from its row, and the **Issuer ID** shown above the table (one per
   team).
4. **Download API Key**: a file `AuthKey_<KEY_ID>.p8`. Apple lets you download it **once**.
   Store it in the password manager.
5. Vendor number: **Payments and Financial Reports**. The number next to the legal entity name at
   the top left (also in **Sales and Trends** → **Reports**).

| Var                               | Value                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `APP_STORE_CONNECT_KEY_ID`        | Key ID, e.g. `2X9R4HXF34`                                                          |
| `APP_STORE_CONNECT_ISSUER_ID`     | Issuer ID, a UUID                                                                  |
| `APP_STORE_CONNECT_PRIVATE_KEY`   | The whole `.p8` file, `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----` |
| `APP_STORE_CONNECT_VENDOR_NUMBER` | The numeric vendor number, e.g. `85012345`                                         |

**The private key must keep its line breaks.** The code passes it to the JWT signer as-is and
doesn't unescape `\n`. In Netlify, paste the file contents as they are (multi-line values are
fine). In the local `.env`, wrap the value in **double** quotes. Real line breaks or `\n` both
work there, since dotenv expands `\n` inside double quotes.

What it counts: first-time downloads (Product Type Identifier `1*`; updates are excluded),
summed over the 30 days ending yesterday (UTC). Apple publishes each day's report about a day
late. A day with no report yet counts as 0.

**If the card says "Temporarily unavailable":**

- `401`: wrong Key ID or Issuer ID, a mangled private key (lost line breaks), or the key was
  revoked.
- `403`: the key's role can't read sales reports. Generate a new one with Sales.
- A wrong vendor number also fails every request.

## 2. Google Play (Android installs)

Needs a Google Cloud project you can create service accounts in, and a Play Console **Admin**.

1. [Google Cloud Console](https://console.cloud.google.com) → pick (or create) a project →
   **IAM & Admin** → **Service Accounts** → **Create service account**. Name it `whocards-stats`.
   It needs **no** Cloud IAM roles; skip that step.
2. Open the account → **Keys** → **Add key** → **Create new key** → **JSON**. The key file
   downloads once; store it in the password manager.
3. Play Console → **Users and permissions** → **Invite new users**. Paste the service account's
   email (the `client_email` in the JSON, `…@….iam.gserviceaccount.com`). Under **Account
   permissions**, tick **View app information and download bulk reports (read-only)**. Nothing
   else is needed. Send the invite; service accounts are accepted automatically.
4. Bucket name: Play Console → **Download reports** → **Statistics** → **Copy Cloud Storage
   URI**. It looks like `gs://pubsite_prod_rev_01234567890123456789/stats/installs/`. The bucket
   is only the `pubsite_prod_rev_…` part.

| Var                                | Value                                                         |
| ---------------------------------- | ------------------------------------------------------------- |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | The whole downloaded JSON key file, as one value              |
| `GOOGLE_PLAY_REPORTS_BUCKET`       | `pubsite_prod_rev_01234567890123456789` (no `gs://`, no path) |

To get the JSON onto one line (no `jq` needed):

```sh
node -e 'process.stdout.write(JSON.stringify(require(process.argv[1])))' ~/Downloads/key.json
```

In the local `.env`, wrap it in **single** quotes. Double quotes would turn the `\n` inside
`private_key` into real line breaks, and then `JSON.parse` fails.

The code only reads `client_email` and `private_key`. If the file doesn't parse, or either field
is missing, the source counts as not configured and the card shows "Not connected yet", not an
error.

What it counts: "Daily User Installs" from Google's monthly installs overview CSVs (current and
previous month, for package `com.whocards.mobile`), summed over the same 30 days as iOS.

**If the card says "Temporarily unavailable":**

- `403` from Cloud Storage: the Play Console permission hasn't propagated. **This can take up
  to 24 hours** after the invite. Also check that it was granted under _Account_ permissions,
  not only on the app.
- A token exchange failure: the key was deleted or the JSON was mangled.
- A Cloud Storage API error naming the project: enable the **Cloud Storage JSON API** in the
  service account's project (new projects usually have it on).

## 3. Hourly refresh (`STATS_REFRESH_SECRET`)

The page doesn't compute anything per request. A Netlify scheduled function
(`apps/website/netlify/functions/refresh-stats.mts`, `@hourly`) calls
`POST /api/stats/refresh`, which runs every query and store fetch once and stores the result
in `stats_snapshot`. The page reads the newest row. Without a fresh row (none yet, or older
than 3 hours because the schedule is broken) the page computes inline and stores that, so the
schedule is an optimisation, not a dependency.

The route needs a bearer token so nobody else can make the site hammer Apple and Google:

```sh
openssl rand -hex 32
```

| Var                    | Value                                           |
| ---------------------- | ----------------------------------------------- |
| `STATS_REFRESH_SECRET` | The random string. At least 16 characters long. |

Set it on Netlify (next section) **and** in the root `.env`, so you can trigger a refresh by
hand after connecting a source instead of waiting for the hour:

```sh
pnpm --filter website stats:refresh                       # production
pnpm --filter website stats:refresh -- http://localhost:4321   # local dev server
```

Scheduled functions only run on the production deploy, not on previews or branch deploys.
Their logs are under Netlify → **Logs** → **Functions** → `refresh-stats`.

---

## 4. Set them on Netlify

Site: **`whocards-calmly`**. Not `whocards-app`, which is WhoCards @ Work.

**In the UI:** Netlify → `whocards-calmly` → **Site configuration** → **Environment variables** →
**Add a variable**:

- Tick **Contains secret values** for the keys (`*_PRIVATE_KEY`, `*_JSON`, `STATS_REFRESH_SECRET`).
- Scopes: keep **all scopes**, or at least **Builds** and **Functions**. `~env` reads
  `import.meta.env`, which can be resolved at build time or by the SSR function at request time,
  so the vars need to be visible to both.
- Deploy contexts: the same value for Production and Deploy Previews is fine. The page only
  reads aggregates.

**With the CLI** (from the repo, logged in with `netlify login`):

```sh
# 1. The CLI's link is global to the repo and IGNORES --site. Check it first:
netlify status            # must say whocards-calmly
# If it doesn't:
netlify unlink && netlify link --name whocards-calmly

# 2. Set the values
netlify env:set APP_STORE_CONNECT_KEY_ID 2X9R4HXF34
netlify env:set APP_STORE_CONNECT_ISSUER_ID <issuer-uuid>
netlify env:set APP_STORE_CONNECT_PRIVATE_KEY "$(cat ~/Downloads/AuthKey_2X9R4HXF34.p8)" --secret
netlify env:set APP_STORE_CONNECT_VENDOR_NUMBER 85012345
netlify env:set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON \
  "$(node -e 'process.stdout.write(JSON.stringify(require(process.argv[1])))' ~/Downloads/key.json)" --secret
netlify env:set GOOGLE_PLAY_REPORTS_BUCKET pubsite_prod_rev_01234567890123456789
netlify env:set STATS_REFRESH_SECRET "$(openssl rand -hex 32)" --secret

# 3. Read back the names (not values) to confirm they landed on the right site
netlify env:list
```

The link gotcha is real: an early `env:set` once landed on the wrong site (see
`docs/plans/2026-07-04-app-foundation-overnight.md`). Always check `netlify status` first.

**Then redeploy.** Env changes only apply to new deploys: **Deploys** → **Trigger deploy** →
**Deploy site**, or push a commit.

**Watch for the 4 KB function limit.** Netlify caps the env vars a function can see at 4 KB in
total (an AWS Lambda limit). The Google JSON key alone is about 2.3 KB, and the site already
carries `DB_URL`, the Resend keys and the rest. If the deploy fails on function env size, trim
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` to the two fields the code uses:

```sh
node -e 'const k=require(process.argv[1]);process.stdout.write(JSON.stringify({client_email:k.client_email,private_key:k.private_key}))' ~/Downloads/key.json
```

## 5. Check /stats

Open <https://whocards.cc/stats> after the deploy finishes:

- A number means the source is live.
- **"Not connected yet."** means a var is missing on this deploy, or the Google JSON didn't
  parse. Check the var names and scopes, then redeploy.
- **"Temporarily unavailable."** means the vars are there but the call failed. See the
  troubleshooting list for that source above.

Freshness: the numbers come from the hourly snapshot, and the page itself is cached for 5
minutes in the browser and 1 hour at the CDN (served stale for up to 24 hours while it
refreshes). A deploy clears the CDN cache but not the snapshot. So after connecting a source,
run `pnpm --filter website stats:refresh`, then redeploy (or wait up to an hour) to see it. The
"Updated" line at the bottom of the page shows the snapshot's timestamp.

## Rotating a key

Create the new key first, set it on Netlify, redeploy, check `/stats`, **then** revoke the old
one:

- App Store Connect: **Revoke** on the key's row.
- Google Cloud: delete the old key under the service account's **Keys**.
