# SafeSpend Register

A deploy-ready Progressive Web App that combines an old-school running checkbook register with payday-based bill reservations, automatic Plaid transaction reconciliation, and Twilio SMS variance alerts.

## What is working

- Mobile-first PWA that can be added to an iPhone Home Screen
- Fully interactive local demo at `/demo`
- Manual deposits and withdrawals with a running balance
- Recurring bills assigned to the latest payday before they are due
- Actual balance, documented register balance, reserved bills, variance, and safe-to-spend calculations
- Supabase password-free authentication and Row Level Security
- Plaid Link token creation and public-token exchange
- Encrypted Plaid access tokens using AES-256-GCM
- `/transactions/sync` support with cursors, added/modified/removed transaction handling, and Plaid webhooks
- Automatic matching against manual entries, recurring bills, and expected paycheck deposits
- Review queue for undocumented bank transactions
- Twilio SMS alerts with delivery-status logging and optional Resend email fallback
- Vercel and Netlify deployment files plus a daily fallback sync job
- Plaid webhook JWT verification in non-sandbox environments

## Important reconciliation model

SafeSpend keeps four numbers separate:

1. **Actual bank balance** — supplied by Plaid.
2. **Documented register balance** — the baseline bank balance plus documented entries after the baseline.
3. **Variance** — actual bank balance minus documented register balance.
4. **Safe to spend** — available bank balance minus bills reserved for the current payday cycle and the user’s safety floor.

On the first Plaid connection, historical transactions are imported as historical and the current bank balance becomes the register baseline. Future posted transactions are matched automatically. Unmatched posted activity enters the review queue and can trigger an SMS.

## Test immediately without external accounts

```bash
npm install
npm run dev
```

Open `http://localhost:3000/demo`. The demo is saved in local storage and includes two undocumented transactions so the entire variance-review flow can be tested.

## Configure the live application

### 1. Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/0001_initial.sql` in the SQL editor, or use the Supabase CLI.
3. In Authentication, enable Email sign-in.
4. Add your local and deployed URLs to the allowed redirect URLs.
5. Copy the project URL, anon key, and service-role key into `.env.local`.

The service-role key is server-only. Never prefix it with `NEXT_PUBLIC_`.

### 2. Create the Plaid token-encryption key

Generate a 32-byte key:

```bash
openssl rand -base64 32
```

Save it as `PLAID_TOKEN_ENCRYPTION_KEY`. Changing this key later will make previously stored Plaid access tokens unreadable unless they are re-encrypted first.

### 3. Plaid Sandbox

1. Create a Plaid developer account.
2. Add your client ID and Sandbox secret.
3. Leave both `PLAID_ENV=sandbox` and `NEXT_PUBLIC_PLAID_ENV=sandbox`.
4. Set `NEXT_PUBLIC_APP_URL` to the public HTTPS deployment URL before testing webhooks.
5. Sign in, open Settings, and choose **Connect checking account**.
6. In Plaid Sandbox, use a Sandbox institution and test credentials when presented by Plaid Link.
7. After connecting, use **Create $42.17 Sandbox variance** in Settings to create a custom transaction, sync it, and test the review/SMS flow.

Plaid sends transaction-change webhooks to:

```text
https://YOUR-DOMAIN/api/plaid/webhook
```

A local `localhost` URL cannot receive Plaid webhooks. Use a Vercel/Netlify preview or an HTTPS tunnel for webhook testing.

### 4. Twilio SMS

Add either a Messaging Service SID or a Twilio sending number. A Messaging Service is preferred.

```text
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
# or TWILIO_FROM_NUMBER=+1...
```

For real US customer messages, complete the applicable A2P 10DLC registration and document the opt-in experience. The included opt-in checkbox is deliberately unchecked and includes frequency, rate, STOP, and HELP language.

### 5. Scheduled fallback sync

Set a long random `CRON_SECRET`. Plaid webhooks are the primary update mechanism; the daily job is a fallback and sends daily-summary alerts for users who selected that mode.

Vercel uses `vercel.json`. Netlify uses `netlify/functions/daily-sync.mts`.

## Environment variables

Copy `.env.example` to `.env.local`.

```bash
cp .env.example .env.local
```

Never expose these values to browser code:

- `SUPABASE_SERVICE_ROLE_KEY`
- `PLAID_SECRET`
- `PLAID_TOKEN_ENCRYPTION_KEY`
- `TWILIO_AUTH_TOKEN`
- `RESEND_API_KEY`
- `CRON_SECRET`

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repository into Vercel.
3. Add all environment variables.
4. Deploy.
5. Update `NEXT_PUBLIC_APP_URL` to the production HTTPS URL and redeploy.
6. Confirm the Plaid webhook endpoint returns a successful response.

## Deploy to Netlify

1. Push this folder to GitHub.
2. Import it in Netlify.
3. Add all environment variables.
4. Netlify detects Next.js and applies its current OpenNext adapter automatically.
5. Deploy and set `NEXT_PUBLIC_APP_URL` to the production URL.

## Add to an iPhone Home Screen

1. Open the deployed app in Safari.
2. Tap **Share**.
3. Select **Add to Home Screen**.
4. Launch SafeSpend from its icon.

## Validation commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Or run all checks:

```bash
npm run check
```

## Production hardening before charging customers

- Have counsel review privacy, terms, SMS consent, TCPA/CTIA practices, and financial-data disclosures.
- Complete Plaid Production access and Twilio A2P registration.
- Add account disconnection, Plaid update mode, data deletion, and export.
- Move webhook work to a durable queue as user volume grows.
- Add application monitoring, rate limits, idempotency tracing, and provider alerting.
- Conduct a security review and penetration test.
- Avoid describing SafeSpend as a bank, fiduciary, payment processor, or guarantee against overdrafts.

## Structure

```text
src/app                    Next.js pages and API routes
src/components             PWA and finance interface
src/lib/reconciliation.ts  Plaid sync, matching, variance, and notification logic
supabase/migrations         Database schema and RLS policies
netlify/functions           Netlify scheduled fallback
public/sw.js                Offline PWA shell
```
