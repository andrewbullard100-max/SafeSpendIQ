# SafeSpend testing guide

## Fastest test: no accounts required

1. Run `npm install`.
2. Run `npm run dev`.
3. Open `http://localhost:3000/demo`.
4. Review the dashboard, add bills, change payday timing, add register entries, and open **Review**.
5. Add the two simulated undocumented transactions to the register.
6. Open **Settings** and select **Send test alert** to preview the alert behavior without sending a real SMS.

The demo saves changes in the browser’s local storage. Clear site data to reset it.

## Full Plaid and SMS test

1. Create Supabase, Plaid Sandbox, and Twilio accounts.
2. Run the SQL migration in `supabase/migrations/0001_initial.sql`.
3. Copy `.env.example` to `.env.local` and enter the credentials.
4. Generate the encryption key with `openssl rand -base64 32`.
5. Deploy the app to an HTTPS Vercel or Netlify URL so Plaid can reach the webhook.
6. Set `NEXT_PUBLIC_APP_URL` to that deployment URL.
7. Sign in by email and connect a Plaid Sandbox checking account.
8. Enter a phone number in E.164 format, actively select SMS consent, and save.
9. Select **Create $42.17 Sandbox variance**.
10. The custom Plaid transaction will be synced and should appear in **Review**. If it exceeds the selected threshold, Twilio sends the variance alert.

## What to verify

- A manual register entry matches the later Plaid transaction instead of creating a duplicate.
- A recurring bill with a similar amount, date, and merchant hint is documented automatically.
- An unmatched posted withdrawal creates a negative variance and enters Review.
- Pending transactions do not trigger an alert.
- The same variance fingerprint does not send duplicate SMS alerts.
- Adding the transaction to the register reduces or resolves the variance.
- Daily alert mode waits for the scheduled fallback job.
- STOP and HELP handling is configured in the Twilio Messaging Service.

## Before inviting outside testers

- Use a separate Supabase project and Plaid environment for testing.
- Do not share service-role, Plaid secret, encryption, Twilio, or cron credentials.
- Add privacy policy, terms, contact information, and a data-deletion process.
- Confirm Twilio registration and consent requirements before texting real users.
