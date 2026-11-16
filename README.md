# CAN Kerala AROICON 2027 — GitHub + Vercel + Cashfree Bundle

## 1. Upload to GitHub
1. Create a new repository on GitHub (e.g. `aroicon-kerala-2027`).
2. Upload the contents of this folder (`index.html`, `api/create-order.js`, `api/verify-payment.js`, `README.md`).

## 2. Deploy Free on Vercel
1. Sign up at https://vercel.com with your GitHub account.
2. Click **Add New → Project**, select `aroicon-kerala-2027`, and click **Deploy**.
3. Your site is immediately live on `https://aroicon-kerala-2027.vercel.app` (in demo checkout mode until Cashfree keys are added).

## 3. Connect Cashfree (When KYC is Approved)
In Vercel → **Project Settings → Environment Variables**, add:
- `CASHFREE_APP_ID` = your Cashfree App ID
- `CASHFREE_SECRET_KEY` = your Cashfree Secret Key
- `CASHFREE_ENV` = `sandbox` (for testing) or `production` (for live payments)

Then click **Redeploy** in Vercel.

## 4. Connect Google Sheets Database (Optional, Free)
Paste your Google Apps Script Web App URL into `GOOGLE_SHEETS_WEBHOOK_URL` inside `index.html`.
