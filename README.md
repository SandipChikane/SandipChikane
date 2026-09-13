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

## Admin portal

Open http://127.0.0.1:4173/admin/ and sign in with `ADMIN_EMAIL` plus the password that matches `ADMIN_PASSWORD_HASH`.

From there you can:

- Create, edit, duplicate, publish, unpublish, archive, and delete courses
- Upload cover images, thumbnails, promo videos, lesson videos, and files (drag and drop)
- Edit syllabus modules, lesson copy, resources, SEO, and sort order
- Preview a draft while signed in as admin
- Import or export the full catalog as JSON
- See enrollments with payment ids (admin only) and export them as CSV
- Grant or revoke course access
- Review students, colleges, site settings, and an activity log
- Seed any missing built-in courses

Run `supabase/schema.sql` and `supabase/admin-schema.sql` on the project. The first admin visit can seed the five built-in courses. The announcement setting appears on the public landing page.

Student and TPO pages still never show payment ids.

## What the server does

| Route | Role |
| --- | --- |
| `POST /api/create-order` | Creates a Razorpay order for a known course |
| `POST /api/verify-payment` | Checks the checkout signature, then upserts enrollment |
| `GET /api/enrollments` | Returns the signed-in student’s paid courses, without payment ids |
| `POST /api/tpo-session` | Checks the TPO access code and sets a college-scoped cookie |
| `GET /api/tpo-enrollments` | Returns that college’s cohort after the TPO cookie is set |
| `GET /api/public-config` | Says whether keys are present. Never returns secrets |
| `GET /api/catalog` | Published CMS courses for the public site |
| `/api/admin/*` | Cookie-authenticated admin CMS, media, and enrollment tools |

The browser caches verified enrollments in `localStorage` so a reload still works if the API is briefly down. It does not mark a course paid until Razorpay verification succeeds. `localStorage` never holds a password.

## Where emails and passwords live

Students do not have passwords. Paid access is proven by Razorpay, then an HttpOnly `gf_student` cookie.

| Data | Stored | Not stored |
| --- | --- | --- |
| Admin email | Server env `ADMIN_EMAIL` | Browser, Supabase user table |
| Admin password | `ADMIN_PASSWORD_HASH` (scrypt) in `.env.local` / Vercel env | Git, Supabase, localStorage |
| Student email | Supabase `enrollments.student_email`, plus this browser’s `localStorage` | A password field |
| Student password | Nowhere | Nowhere |
| TPO name / email / college | This browser’s `localStorage` only | Supabase user table |
| TPO workspace code | Server env `TPO_ACCESS_CODE` | Student records |
| Payment ids | Supabase `enrollments`, admin portal only | TPO and student APIs |

`.env.local` is gitignored. Anon Supabase clients cannot read enrollments. Admin and TPO sessions are signed cookies, not JWTs in localStorage.

## Deploy on Vercel

Add the same environment variables in the Vercel project, then deploy this folder. The `/api` routes become Vercel Functions.

## Tests

```bash
npm test
```
