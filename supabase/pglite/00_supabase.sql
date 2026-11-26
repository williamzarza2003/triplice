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

-- Fase 3: lo que Supabase Auth guarda del usuario (nombre de Google o del formulario) y lo mínimo de Storage
-- para que las políticas de las fotos de las opiniones se creen igual que en Supabase.
alter table auth.users add column raw_user_meta_data jsonb not null default '{}', add column created_at timestamptz not null default now();
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text not null, owner uuid, created_at timestamptz not null default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated;
