-- Trigger function is never called via the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- RLS policies need signed-in users to evaluate is_admin(); it only
-- reveals whether the caller themselves is an admin. Anon gets nothing.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
