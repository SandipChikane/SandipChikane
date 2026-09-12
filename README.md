# Gradflow portal

A responsive, frontend-only course portal concept for final-year students and Training & Placement Officers.

## Included

- Course discovery with path filters and payment-gated course access
- Portfolio and student-success storytelling
- Free, privacy-first TPO workspace with college-scoped enrollment and student progress
- FAQ, mobile navigation, accessible dialogs, and responsive layouts
- Student enrollment stored in `localStorage` (`gradflowEnrollments`), with no payment details in TPO views

## Run locally

Open `index.html` directly, or serve this folder with any static web server. No build step is required.

## Production integrations still needed

The current forms are polished prototype interactions. To process actual purchases, enrollment, and TPO reporting, connect:

1. Authentication and student/TPO roles
2. A payment provider such as Razorpay or Stripe
3. A database for courses, cohorts, lessons, projects and enrolments
4. An admin upload area for your lesson and project content
5. TPO reporting with consent-aware, aggregate student progress data
