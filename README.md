# Gradflow portal

A responsive course portal for final-year students and Training & Placement Officers. Course access unlocks only after Razorpay verifies payment. Enrollment is stored in Supabase. TPO views never include payment ids, amounts, or card details.

## Run locally

```bash
cp .env.example .env.local
# add your Supabase and Razorpay values
npm start
```

Then open http://127.0.0.1:4173

Without keys, the site still renders. Checkout stays locked and the APIs return `503` instead of faking a successful payment.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. Copy these values from **Project Settings → API**:
   - Project URL → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` (server only)
4. The `anon` key is optional. The app talks to Supabase only from the server.

## Connect Razorpay

1. Create an account at [razorpay.com](https://razorpay.com).
2. Open **Account & Settings → API Keys**.
3. Use test keys (`rzp_test_…`) while developing.
4. Copy:
   - Key ID → `RAZORPAY_KEY_ID`
   - Key Secret → `RAZORPAY_KEY_SECRET`
5. Optional webhook: point it at `/api/razorpay-webhook` for `payment.captured` and set `RAZORPAY_WEBHOOK_SECRET`.

## What the server does

| Route | Role |
| --- | --- |
| `POST /api/create-order` | Creates a Razorpay order for a known course |
| `POST /api/verify-payment` | Checks the checkout signature, then upserts enrollment |
| `GET /api/enrollments` | Returns that student’s paid courses, without payment ids |
| `GET /api/tpo-enrollments` | Returns a college cohort for the TPO workspace, without payment ids |
| `GET /api/public-config` | Says whether keys are present. Never returns secrets |

The browser caches verified enrollments in `localStorage` so a reload still works if the API is briefly down. It does not mark a course paid until Razorpay verification succeeds.

## Deploy on Vercel

Add the same environment variables in the Vercel project, then deploy this folder. The `/api` routes become Vercel Functions.

## Tests

```bash
npm test
```
