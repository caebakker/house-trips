# Build brief: Phase 1 (MVP, web)

Product: Guidocasa. Italy house-buyer app. Buyers paste listing links, the service locates the house, and buyers get private drive-by routes for houses they have unlocked with credits. Scouting is offered only in Piemonte.

Goal: prove that buyers will pay to have their shortlist located and turned into a workable trip.

Read `CLAUDE.md` first. Build milestone by milestone; each ends deployed on Netlify and demoable.

## Data model (first draft, adjust as needed)

| Table | Key fields | Notes |
| --- | --- | --- |
| `profiles` | id (auth user), email, display_name, role (`buyer` / `admin`), locale | Created on sign-up |
| `trips` | id, owner_id, name, start_date, end_date, max_drive_minutes_per_day, default_dwell_minutes | One user can have many trips |
| `trip_members` | trip_id, user_id, role (`owner` / `partner`) | Partner sharing is phase 2, table now |
| `stays` | id, trip_id, name, address, lat, lng, check_in, check_out | Fixed start and end points per night |
| `listings` | id, url, canonical_url, portal, agent_name, agent_email, agent_phone, comune, approx_lat, approx_lng, approx_radius_m, given_address, given_lat, given_lng | One row per listing URL |
| `properties` | id, lat, lng, verified_by, verified_at, source (`ai` / `manual` / `agent`) | The physical house. Admin and RLS-protected |
| `listing_properties` | listing_id, property_id | Many listings can point to one house (duplicates across portals) |
| `trip_listings` | id, trip_id, listing_id, status, priority (1 to 3), dwell_minutes, buyer_notes, rating | Status: `approximate`, `address_given`, `check_requested`, `verified`, `not_found` |
| `verification_requests` | id, listing_id, requested_by, trip_listing_id, status, candidates (jsonb), resolved_at, admin_notes | Status: `queued`, `in_review`, `found`, `not_found` |
| `unlocks` | user_id, property_id, created_at | Permanent per user |
| `credit_ledger` | id, user_id, delta, reason, stripe_payment_intent, trip_listing_id, created_at | Reason: `purchase`, `unlock`, `refund`, `grant` |
| `appointments` | id, trip_id, trip_listing_id, starts_at, duration_minutes, notes | Locked stops |
| `schedules` | id, trip_id, version, plan (jsonb), created_at | Output of the scheduler |
| `leads` | id, trip_listing_id, user_id, channel, payload (jsonb), sent_at | Messages to agents |

**Security model**

- Buyers can read only their own trips and related rows (owner or member).
- Buyers never select from `properties` directly. Expose a view or RPC `trip_stops(trip_id)` that returns, per stop, exact coordinates when the user has an unlock for that property, otherwise the approximate zone (or the buyer's own given address).
- Admin can read and write everything.
- Write RLS tests for: a buyer cannot read another buyer's trip; a buyer cannot get exact coordinates without an unlock; a partner sees the trip but not the owner's credit ledger.

## Milestones

### M0: Scaffold
- Vite + React + TypeScript + Tailwind, routing, messages file for strings
- Supabase project, magic-link auth, `profiles` with role
- Netlify deploy with environment variables
- Done when: sign in on the deployed site and see an empty "My trips" page

### M1: Trips and listings
- Create, edit, delete a trip (dates, max driving per day, default drive-by time)
- Add a listing: paste URL, pick comune (autocomplete from the ISTAT list of comuni), optional address, optional agent details
- Detect duplicate URLs (canonicalise: strip tracking params)
- Map of the trip: approximate stops as shaded zones, given addresses as pins
- Done when: a trip with 10 listings shows correctly on the map

### M2: Verification queue (manual first)
- Buyer taps "Find exact location" on a stop, which creates a `verification_request`
- Admin screen: queue sorted by trip date, listing link opens in a new tab, MapLibre map with an orthophoto WMS layer (start with Geoportale Piemonte), drop pin, mark found or not found, link to an existing property if it is a duplicate
- On found: create or link `properties`, mark the request found, email the buyer
- On not found: mark `not_found`, email the buyer
- For now, grant test credits manually (ledger reason `grant`); Stripe comes in M5
- Done when: Charlotte can clear a queue of 10 requests on her laptop in one sitting

### M3: Scheduler
- Pure module `src/lib/scheduler/`: input = days, stays, stops (with coordinates for routing), appointments, dwell times, daylight windows, lunch window, max driving; output = ordered stops per day with arrival and departure times, plus unscheduled stops with a reason
- Daylight per day and location with `suncalc`; default lunch closure 12:30 to 15:00 (configurable)
- Edge Function calls OpenRouteService optimisation with exact coordinates where available, returns times only (no exact coordinates for locked stops)
- Day view: timeline per day, map with the day's stops, drive times between
- "Open day in Google Maps" link (Maps URL with waypoints; exact coordinates only for unlocked stops, otherwise the comune centre)
- Unit tests: daylight cut-off, lunch window, max driving, stay as start and end point, priority-based dropping
- Done when: a 3-day trip with 15 stops produces a sensible plan in under 5 seconds

### M4: Appointments and re-planning
- Add an appointment to a stop (time, duration); the stop is locked
- Re-run the scheduler around locked stops; show what moved
- Conflicts: if a day becomes impossible, suggest moving named stops to another day
- Done when: adding a 10:30 viewing re-plans the day correctly and flags any conflict

### M5: Credits and Stripe
- Packs: 10 for €29, 25 for €59, 50 for €99 (config, not hard-coded)
- Stripe Checkout, webhook Edge Function writes `purchase` ledger rows (idempotent on payment intent)
- Requesting a check reserves 1 credit (`unlock` row, linked to the trip listing); `not_found` writes a `refund` row
- Already unlocked properties cost nothing; a duplicate listing of an unlocked property unlocks for free
- Feature gating: a trip with 1 or more verified, unlocked stops gets appointments, re-planning and lunch suggestions; free trips get the basic plan only
- Done when: buy, use and refund credits end to end in Stripe test mode, and the ledger balances

### M6: Leads to agents
- "I'm interested" on a stop: prefilled message with listing URL, date saved, trip dates, optional budget and codice fiscale status (buyer edits before sending)
- Send by email from our domain with the buyer in reply-to; store in `leads`
- Show the drive-by etiquette note before the first trip day
- Done when: a lead arrives in a test inbox, readable and correct

### M7: Launch polish
- Landing page, pricing page, terms and privacy placeholders (to be reviewed by a lawyer)
- Privacy-friendly analytics
- Empty states, error states, loading states
- Done when: a stranger can sign up, plan a trip and buy credits without help

## Out of scope for phase 1
AI pre-check, GPS check-in, accommodation suggestions, lunch stop suggestions, partner sharing UI, blog, iOS app, professional directory.

## Open questions
- Domain for Guidocasa
- Whether to read basic metadata (title, price) from a pasted URL, given portal terms; default for now is manual entry
- Orthophoto sources and licences outside Piemonte
