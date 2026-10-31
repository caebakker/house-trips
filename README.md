# Guidocasa

Italy house-buyer app. Buyers paste listing links, the service locates the house, and buyers get private drive-by routes for houses they have unlocked with credits. Scouting is offered only in Piemonte.

Read `CLAUDE.md` for product rules and `BUILD_BRIEF.md` for the current phase.

## Develop

```sh
cp .env.example .env.local   # fill in Supabase URL and publishable key
npm install
npm run dev
npm test
```

`VITE_MAP_STYLE_URL` is optional. When it is empty the map uses OpenFreeMap Bright, an OpenStreetMap vector street style with no API key. Point it at another street style when you change provider. Do not point it at satellite imagery.

`VITE_ADMIN_IMAGERY_URL` and `VITE_ADMIN_IMAGERY_ATTRIBUTION` are optional. They configure the admin locating map only. When the URL is empty, that map uses Esri World Imagery. Buyers never see it. See Imagery below before production.

## Location checks and credits

A buyer asks to find the exact location of a listing on their trip. That spends one credit. Charlotte works the queue at `/admin/queue`, drops a pin or links a house already found, and marks it found or not found. Not found, or removing the listing while the check is still open, writes the credit back. The balance is the sum of `credit_ledger`. There is no stored balance.

Grant credits by hand at `/admin/credits` (reason `grant`). Stripe is a later milestone.

To make someone an admin, see below. Then open Queue from the header.

RLS checks for this milestone:

```sh
npm run test:rls
```

That needs local PostgreSQL. It does not touch the hosted database.

## Imagery

The admin map defaults to Esri World Imagery:

`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`

The credit line under the map is required. The default is "Powered by Esri. Esri, Maxar, Earthstar Geographics, and the GIS User Community". Keep it visible.

For production, Esri's terms expect an ArcGIS Location Platform or ArcGIS Online account, an API key (or a registered referrer), and pay-as-you-go once you pass the free tier. The tile endpoint above has no key and is for development and for Charlotte locating houses. Before a public launch, set `VITE_ADMIN_IMAGERY_URL` to the keyed imagery tiles and keep the attribution. Do not cache or redistribute the tiles beyond the HTTP cache headers. Do not show this imagery to buyers.

The optional cadastral overlay is the Agenzia delle Entrate WMS (CC BY 4.0). The service has no Web Mercator tiles and no CORS header, so the browser asks `/api/cadastral-wms`, and the Netlify function checks the caller is an admin before forwarding a parcel tile. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on Netlify for that check (the same project URL and publishable key as the Vite variables). In local dev, Vite proxies that path and does not check the role.

Parcel lines appear when you zoom in. They are a guide on top of the imagery, not a survey.

## Email

Found and not found write a row to `notification_outbox`. Nothing is sent.

The stub is `supabase/functions/send-notifications`. It returns immediately unless `EMAIL_ENABLED=true`, and even then it does not call a provider.

To switch it on later:

1. Deploy the function with `verify_jwt` left on.
2. Create a Resend API key and a from-address on your domain.
3. Set secrets `EMAIL_ENABLED=true`, `RESEND_API_KEY`, and `EMAIL_FROM`.
4. Replace the 501 branch so it reads pending rows with the service role and sends them through Resend, then marks each row sent.
5. Run it on a schedule, or from a database webhook when a row is inserted.

The message tells the buyer which trip and comune, and links the listing they pasted. It does not include coordinates, a typed address, or the internal note.

The comune autocomplete uses a derived ISTAT dataset. Source and licence: `src/data/COMUNI.md`.

## Database

Migrations live in `supabase/migrations/`. After each migration, regenerate `src/types/database.ts`.

To make someone an admin (SQL editor, service role):

```sql
update public.profiles set role = 'admin' where email = 'someone@example.com';
```
