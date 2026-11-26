-- Lo mínimo de Supabase que el esquema necesita, para correrlo en PGlite (pruebas y modo sin base remota).
-- En Supabase esto ya existe: este archivo NO se aplica ahí.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
-- Igual que en Supabase: el id del usuario sale del JWT (acá, de una variable de la sesión)
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         current_setting('request.jwt.claims', true)::jsonb->>'sub'), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
