# CAN Kerala AROICON 2027 registration portal

This deployment is a **test registration portal** while the payment gateway is pending.
It saves registrations to a private Google Sheet and does not collect payments.
Pricing rules are unchanged. Friday accommodation is INR 1,750 per person.

## Connection

The browser sends records to POST /api/save-registration. The Vercel function adds
its private secret and forwards the record to the Apps Script receiver. A save is
confirmed only when Google acknowledges the registration ID. Retries reuse the same
ID and payload to avoid duplicate rows after a timeout.

Set these Vercel environment variables for the deployed environment:

- REGISTRATION_MODE: test
- GOOGLE_SHEETS_WEBHOOK_URL: deployed Apps Script URL ending in /exec
- REGISTRATION_SECRET: matching Apps Script property (keep this secret)

Redeploy after changing these settings. Never put the secret in HTML, GitHub,
the browser, or a URL. Keep the Google Sheet restricted to organizers.

## Dashboard

The registration workbook contains a Dashboard tab with formulas for registration
counts, categories, accommodation choices, accompanying persons, reported fees,
and a registration list. A private Google Site embeds that workbook.
Refresh the dashboard to load current data. Organizers need access to both the
Google Site and the Sheet. Download CSV from the Sheet using File > Download.

All rows saved by this test integration are unverified. Reported fees are not
revenue. The dashboard intentionally shows payments collected as zero.

## Limitations and live launch

- Delegate login and room-partner controls remain browser-local. Central saving
  does not yet synchronize subsequent room-partner edits.
- Email alerts are not configured.
- Existing browser-local registrations are not automatically imported.
- Cashfree files are retained, but test checkout does not call them. Do not simply
  enable production keys: live launch requires server-calculated prices, verified
  payments tied to saved registrations, payment recovery/webhooks, and testing.
- For the organizer's final Google account, deploy the receiver under that account
  and update the URL and secret in Vercel. Test data can remain separate.
