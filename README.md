# House Trips (working name)

Private trip planner for house hunting in Italy. Read `CLAUDE.md` for product rules and `BUILD_BRIEF.md` for the current phase.

## Develop

```sh
cp .env.example .env.local   # fill in Supabase URL and publishable key
npm install
npm run dev
```

## Database

Migrations live in `supabase/migrations/`. After each migration, regenerate `src/types/database.ts`.

To make someone an admin (SQL editor, service role):

```sql
update public.profiles set role = 'admin' where email = 'someone@example.com';
```
