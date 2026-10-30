# CLAUDE.md

## Product

Guidocasa is an Italy house-buyer app. Buyers paste listing links, the service locates the house, and buyers get private drive-by routes for houses they have unlocked with credits. Scouting is offered only in Piemonte.

We locate each property with an AI pre-check plus a manual check by Charlotte, then the app builds a realistic day-by-day route around daylight, lunch closures, accommodation and agent appointments. If a house looks good from the road, one tap sends the listing agent a structured lead.

- Product works for all of Italy. Marketing starts in Piemonte.
- Separate product from Piemonte Property Partners (PPP), which is the upgrade path for buyers wanting full help.
- Full product plan: see the product plan doc (owner: Charlotte). `BUILD_BRIEF.md` holds the current phase.

## Stack

- Frontend: React + Vite + TypeScript, Tailwind CSS. Mobile-first web app (installable to home screen).
- Backend: Supabase (Postgres, Auth with magic link, Row Level Security, Edge Functions, Storage).
- Hosting: Netlify.
- Maps: MapLibre GL with a commercial-friendly tile provider (MapTiler or Stadia free tier). Never use tile.openstreetmap.org for production traffic.
- Routing and optimisation: OpenRouteService (directions, matrix, optimisation via VROOM), called only from Edge Functions. API keys never reach the client.
- Daylight: `suncalc`.
- Payments: Stripe Checkout + webhook Edge Function.
- Email: Resend (or similar) from Edge Functions.
- Tests: Vitest for logic (scheduler, credits), plus RLS tests against a local Supabase.

## Non-negotiable rules

1. **Verified coordinates are private.** Exact property coordinates never reach a client unless that user has unlocked that property. Enforce in the database (RLS, views or RPCs), not only in the UI. Locked properties expose only their approximate zone (comune centre or portal area plus radius).
2. **No public property data.** No public map, no listing pages, no searchable address database. Everything lives inside a user's own trip.
3. **No Google content in automated processing.** AI pre-checks and stored map data use open sources only (Agenzia delle Entrate cadastral map, national or regional orthophotos such as Geoportale Piemonte). Charlotte's manual check may use Google Maps in her own browser, but the stored pin is dropped by her on our own open map.
4. **No scraping of portals.** Buyers paste URLs. We do not copy listing photos or descriptions. Listing metadata is entered by the buyer or by Charlotte.
5. **No commissions.** Never build anything that charges a fee tied to a sale closing (Italian mediation law 39/1989). Revenue = credits, professional profiles, affiliates.
6. **Agents keep the introduction.** Each stop shows the listing link and agent. The only contact action goes to the listing agent. Never show owner names or cadastral owner data.
7. **Credits are a ledger.** Balance = sum of `credit_ledger` rows. Never store a mutable balance. Every unlock, purchase and refund is a ledger row. A property that cannot be found refunds its credit.

## Conventions

- UI copy in UK English. Write copy in a warm, direct tone. No em-dashes in UI copy: use commas, colons or full stops.
- Metric units (km, metres, minutes). 24-hour time. Euro amounts formatted as `€29`.
- Trip times are stored in UTC and shown in Europe/Rome.
- Prepare for i18n (English first, Dutch and Italian later): keep strings in a messages file, not hard-coded.
- Database changes only via Supabase migrations committed to the repo. Generate TypeScript types after each migration.
- Keep the scheduler a pure, well-tested module (`src/lib/scheduler/`) separate from the API call to OpenRouteService.
- Small, reviewable commits. Explain non-obvious decisions in the PR description or a short comment.

## Roles

- `buyer`: default user.
- `admin`: Charlotte. Sees the verification queue and exact coordinates, drops pins, marks found or not found.
