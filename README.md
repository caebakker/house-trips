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

The comune autocomplete uses a derived ISTAT dataset. Source and licence: `src/data/COMUNI.md`.

## Database

Migrations live in `supabase/migrations/`. After each migration, regenerate `src/types/database.ts`.

To make someone an admin (SQL editor, service role):

```sql
update public.profiles set role = 'admin' where email = 'someone@example.com';
```
