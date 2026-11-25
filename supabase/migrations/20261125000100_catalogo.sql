-- Tríplice · fase 1: catálogo, tiendas, cotizaciones, reseñas y preguntas.
-- Corre igual en Supabase (PostgreSQL 15+) y en PGlite (pruebas y modo sin base remota).
-- Plata en enteros: centavos de dólar (USD) sin impuestos. La conversión a ₲, R$ y $ la hace lib/precios.ts.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent no es inmutable (depende del diccionario): esta envoltura sí, y permite usarla en índices
create or replace function public.normalizar(t text) returns text
language sql immutable parallel safe
set search_path = public, extensions
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))) $$;

-- ---------------------------------------------------------------------------------------------
-- Usuarios y roles
-- ---------------------------------------------------------------------------------------------
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  rol text not null default 'comprador' check (rol in ('comprador', 'vendedor', 'admin')),
  region char(2) not null default 'PY' check (region in ('PY', 'BR', 'AR', 'XX')),
  idioma text not null default 'es' check (idioma in ('es', 'pt', 'en')),
  moneda char(3) not null default 'PYG' check (moneda in ('PYG', 'BRL', 'ARS', 'USD')),
  creado timestamptz not null default now()
);

create or replace function public.es_admin() returns boolean
language sql stable security definer
set search_path = public
as $$ select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin') $$;

-- ---------------------------------------------------------------------------------------------
-- Tiendas
-- ---------------------------------------------------------------------------------------------
create table public.tiendas (
  id uuid primary key default gen_random_uuid(),
  duenio_id uuid references public.perfiles (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nombre text not null,
  lema jsonb not null default '{}',
  descripcion jsonb not null default '{}',
  color char(7) not null default '#0f3d3e',
  pais char(2) not null check (pais in ('PY', 'BR', 'AR')),
  ciudad text not null,
  direccion text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  horario jsonb not null default '{}',
  desde smallint not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'suspendida')),
  creado timestamptz not null default now()
);

-- En la fase 4 esto pasa a ser una vista materializada calculada con los pedidos reales
create table public.reputacion_tiendas (
  tienda_id uuid primary key references public.tiendas (id) on delete cascade,
  recomendacion numeric(4, 1) not null,   -- % que la recomienda
  opiniones int not null,
  ventas_12m int not null,
  respuesta_min int not null,             -- minutos en responder, en promedio
  a_tiempo numeric(4, 1) not null         -- % de envíos a tiempo
);

-- ---------------------------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------------------------
create table public.categorias (
  id smallint generated always as identity primary key,
  padre_id smallint references public.categorias (id),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nombre jsonb not null,
  icono text,
  orden smallint not null default 0
);
create index on public.categorias (padre_id);

create table public.atributos (
  id smallint generated always as identity primary key,
  categoria_id smallint not null references public.categorias (id) on delete cascade,
  clave text not null,
  nombre jsonb not null,
  tipo text not null check (tipo in ('texto', 'numero', 'booleano', 'opcion')),
  unidad text,
  opciones jsonb,
  filtrable boolean not null default false,
  orden smallint not null default 0,
  unique (categoria_id, clave)
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  categoria_id smallint not null references public.categorias (id),
  marca text not null,
  titulo jsonb not null,
  vinetas jsonb not null default '{}',
  descripcion jsonb not null default '{}',
  atributos jsonb not null default '{}',
  peso_g int,
  medidas_mm int[] check (medidas_mm is null or array_length(medidas_mm, 1) = 3),
  garantia_meses smallint not null default 0,
  condicion text not null default 'nuevo' check (condicion in ('nuevo', 'reacondicionado', 'usado')),
  pais_origen char(2),
  en_caja jsonb not null default '{}',
  ventas_30d int not null default 0,
  creado timestamptz not null default now(),
  -- los mantiene el disparador de abajo (el nombre de la categoría no se puede leer en una columna generada)
  busqueda tsvector,
  texto_busqueda text
);
create index productos_busqueda on public.productos using gin (busqueda);
create index productos_trgm on public.productos using gin (texto_busqueda extensions.gin_trgm_ops);
create index productos_atributos on public.productos using gin (atributos jsonb_path_ops);
create index on public.productos (categoria_id);

create table public.variantes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  sku text not null unique,
  opciones jsonb not null default '{}',
  imagenes text[] not null default '{}',
  orden smallint not null default 0
);
create index on public.variantes (producto_id);

create table public.ofertas (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references public.variantes (id) on delete cascade,
  tienda_id uuid not null references public.tiendas (id) on delete cascade,
  precio_usd_cent bigint not null check (precio_usd_cent > 0),
  precio_lista_usd_cent bigint check (precio_lista_usd_cent is null or precio_lista_usd_cent > precio_usd_cent),
  stock int not null default 0 check (stock >= 0),
  envio_gratis boolean not null default false,
  preparacion_h smallint not null default 24,
  activa boolean not null default true,
  unique (variante_id, tienda_id)
);
create index on public.ofertas (tienda_id);
create index ofertas_disponibles on public.ofertas (variante_id) where activa and stock > 0;

create table public.cotizaciones (
  moneda char(3) not null check (moneda in ('PYG', 'BRL', 'ARS')),
  por_usd numeric(14, 4) not null check (por_usd > 0),
  fuente text not null default 'manual',
  vigente_desde timestamptz not null default now(),
  primary key (moneda, vigente_desde)
);

-- ---------------------------------------------------------------------------------------------
-- Opiniones y preguntas (en la fase 1 se leen; escribirlas llega en la fase 3)
-- ---------------------------------------------------------------------------------------------
create table public.resenas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  autor_id uuid references public.perfiles (id) on delete set null,
  autor_nombre text not null,
  pais char(2) not null,
  compra_verificada boolean not null default false,
  variante text,
  estrellas smallint not null check (estrellas between 1 and 5),
  titulo text not null,
  texto text not null,
  idioma text not null check (idioma in ('es', 'pt', 'en')),
  util_si int not null default 0,
  util_no int not null default 0,
  estado text not null default 'publicada' check (estado in ('pendiente', 'publicada', 'rechazada')),
  creado timestamptz not null default now()
);
create index on public.resenas (producto_id, creado desc);

create table public.preguntas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  autor_id uuid references public.perfiles (id) on delete set null,
  autor_nombre text not null,
  texto text not null,
  idioma text not null check (idioma in ('es', 'pt', 'en')),
  estado text not null default 'publicada' check (estado in ('pendiente', 'publicada', 'rechazada')),
  creado timestamptz not null default now()
);
create index on public.preguntas (producto_id, creado desc);

create table public.respuestas (
  id uuid primary key default gen_random_uuid(),
  pregunta_id uuid not null references public.preguntas (id) on delete cascade,
  autor_id uuid references public.perfiles (id) on delete set null,
  autor_nombre text not null,
  tienda_id uuid references public.tiendas (id) on delete set null,
  es_vendedor boolean not null default false,
  texto text not null,
  creado timestamptz not null default now()
);
create index on public.respuestas (pregunta_id);

-- ---------------------------------------------------------------------------------------------
-- Búsqueda: tsvector con pesos (título A, marca B, viñetas C, categoría D) en los tres idiomas
-- ---------------------------------------------------------------------------------------------
create or replace function public.productos_indexar() returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  cat text;
begin
  select concat_ws(' ', c.nombre->>'es', c.nombre->>'pt', c.nombre->>'en', p.nombre->>'es', p.nombre->>'pt', p.nombre->>'en')
    into cat
    from categorias c left join categorias p on p.id = c.padre_id
   where c.id = new.categoria_id;
  new.texto_busqueda := normalizar(concat_ws(' ', new.titulo->>'es', new.titulo->>'pt', new.titulo->>'en', new.marca));
  new.busqueda :=
       setweight(to_tsvector('simple', normalizar(concat_ws(' ', new.titulo->>'es', new.titulo->>'pt', new.titulo->>'en'))), 'A')
    || setweight(to_tsvector('simple', normalizar(new.marca)), 'B')
    || setweight(to_tsvector('simple', normalizar(concat_ws(' ', new.vinetas->>'es', new.vinetas->>'pt', new.vinetas->>'en'))), 'C')
    || setweight(to_tsvector('simple', normalizar(cat)), 'D');
  return new;
end $$;

create trigger productos_indexar before insert or update of titulo, marca, vinetas, categoria_id
  on public.productos for each row execute function public.productos_indexar();


-- ---------------------------------------------------------------------------------------------
-- Tarjetas: lo que muestra cada producto en una grilla (sin impuestos ni conversión).
-- Es una vista materializada: calcular precio mínimo, stock y reseñas producto por producto bajo RLS
-- en cada búsqueda costaba ~350 ms; leída de acá, la búsqueda tarda pocos milisegundos.
-- Solo incluye lo público (tiendas aprobadas, ofertas activas con stock), así que no necesita RLS.
-- Se refresca con refrescar_catalogo() después de cada cambio de ofertas (en la fase 4, con un disparador).
-- ---------------------------------------------------------------------------------------------
create materialized view public.tarjetas as
select
  p.id, p.slug, p.marca, p.titulo, p.categoria_id, c.padre_id as categoria_padre_id, p.condicion, p.atributos,
  p.ventas_30d, p.creado, p.busqueda, p.texto_busqueda,
  (select v.imagenes[1] from variantes v where v.producto_id = p.id order by v.orden limit 1) as imagen,
  (select count(*) from variantes v where v.producto_id = p.id)::int as variantes,
  o.precio_usd_cent, o.precio_lista_usd_cent, o.envio_gratis, o.tienda_slug, o.tienda_nombre, o.tienda_pais, o.tienda_ciudad,
  -- cuántas tiendas distintas lo venden (no cuántas ofertas: cada variante tiene la suya)
  (select count(distinct of2.tienda_id) from ofertas of2 join variantes v2 on v2.id = of2.variante_id
     join tiendas t2 on t2.id = of2.tienda_id
    where v2.producto_id = p.id and of2.activa and of2.stock > 0 and t2.estado = 'aprobada')::int as ofertas,
  o.stock::int as stock,
  coalesce(r.promedio, 0)::numeric(2, 1) as promedio, coalesce(r.cantidad, 0)::int as resenas
from productos p
join categorias c on c.id = p.categoria_id
join lateral (
  -- la oferta más barata con stock define el precio de la tarjeta
  select of.precio_usd_cent, of.precio_lista_usd_cent, of.envio_gratis, t.slug as tienda_slug, t.nombre as tienda_nombre,
         t.pais as tienda_pais, t.ciudad as tienda_ciudad, sum(of.stock) over () as stock
    from ofertas of
    join variantes v on v.id = of.variante_id
    join tiendas t on t.id = of.tienda_id
   where v.producto_id = p.id and of.activa and of.stock > 0 and t.estado = 'aprobada'
   order by of.precio_usd_cent
   limit 1
) o on true
left join lateral (
  select round(avg(estrellas), 1) as promedio, count(*) as cantidad
    from resenas where producto_id = p.id and estado = 'publicada'
) r on true;

create unique index tarjetas_id on public.tarjetas (id);
create index tarjetas_busqueda on public.tarjetas using gin (busqueda);
create index tarjetas_trgm on public.tarjetas using gin (texto_busqueda extensions.gin_trgm_ops);
create index on public.tarjetas (categoria_id);

-- Palabras del catálogo público, para corregir errores de tipeo ("cosina" → "cocina").
-- Sale de las tarjetas (solo lo visible): así una palabra de un producto oculto no se filtra en una sugerencia.
create materialized view public.vocabulario as
  select word as palabra, ndoc from ts_stat('select busqueda from public.tarjetas') where length(word) > 2;
create index vocabulario_trgm on public.vocabulario using gin (palabra extensions.gin_trgm_ops);

-- Refresca lo calculado (tarjetas y vocabulario). security definer: corre como dueño, no como quien llama.
create or replace function public.refrescar_catalogo() returns void
language sql security definer
set search_path = public
as $$
  refresh materialized view public.tarjetas;
  refresh materialized view public.vocabulario;
$$;
revoke execute on function public.refrescar_catalogo() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS: activado en todas las tablas. En la fase 1 el público solo lee.
-- ---------------------------------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.tiendas enable row level security;
alter table public.reputacion_tiendas enable row level security;
alter table public.categorias enable row level security;
alter table public.atributos enable row level security;
alter table public.productos enable row level security;
alter table public.variantes enable row level security;
alter table public.ofertas enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.resenas enable row level security;
alter table public.preguntas enable row level security;
alter table public.respuestas enable row level security;

-- Perfiles: cada uno ve y edita el suyo (el rol no se cambia desde el cliente: ver la política de update)
create policy "perfil propio" on public.perfiles for select to authenticated using (id = auth.uid() or es_admin());
create policy "editar perfil propio" on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and rol = (select rol from public.perfiles where id = auth.uid()));

-- Tiendas: el público ve las aprobadas; el dueño ve la suya aunque esté pendiente
create policy "tiendas aprobadas" on public.tiendas for select to anon, authenticated
  using (estado = 'aprobada' or duenio_id = auth.uid() or es_admin());
create policy "dueño edita su tienda" on public.tiendas for update to authenticated
  using (duenio_id = auth.uid()) with check (duenio_id = auth.uid() and estado = (select estado from public.tiendas t where t.id = tiendas.id));
create policy "admin modera tiendas" on public.tiendas for update to authenticated using (es_admin());

create policy "reputación pública" on public.reputacion_tiendas for select to anon, authenticated
  using (exists (select 1 from public.tiendas t where t.id = tienda_id and t.estado = 'aprobada'));

create policy "categorías públicas" on public.categorias for select to anon, authenticated using (true);
create policy "atributos públicos" on public.atributos for select to anon, authenticated using (true);
create policy "admin categorías" on public.categorias for all to authenticated using (es_admin()) with check (es_admin());
create policy "admin atributos" on public.atributos for all to authenticated using (es_admin()) with check (es_admin());

-- Un producto se ve si alguna tienda aprobada lo ofrece
create or replace function public.producto_visible(pid uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from variantes v join ofertas o on o.variante_id = v.id join tiendas t on t.id = o.tienda_id
     where v.producto_id = pid and o.activa and t.estado = 'aprobada')
$$;

create policy "productos visibles" on public.productos for select to anon, authenticated using (producto_visible(id) or es_admin());
create policy "variantes visibles" on public.variantes for select to anon, authenticated using (producto_visible(producto_id) or es_admin());

create policy "ofertas activas" on public.ofertas for select to anon, authenticated
  using ((activa and exists (select 1 from public.tiendas t where t.id = tienda_id and t.estado = 'aprobada'))
         or exists (select 1 from public.tiendas t where t.id = tienda_id and t.duenio_id = auth.uid()));
create policy "dueño gestiona sus ofertas" on public.ofertas for all to authenticated
  using (exists (select 1 from public.tiendas t where t.id = tienda_id and t.duenio_id = auth.uid()))
  with check (exists (select 1 from public.tiendas t where t.id = tienda_id and t.duenio_id = auth.uid()));

create policy "cotizaciones públicas" on public.cotizaciones for select to anon, authenticated using (true);
create policy "admin cotizaciones" on public.cotizaciones for insert to authenticated with check (es_admin());

create policy "reseñas publicadas" on public.resenas for select to anon, authenticated
  using (estado = 'publicada' or autor_id = auth.uid() or es_admin());
create policy "preguntas publicadas" on public.preguntas for select to anon, authenticated
  using (estado = 'publicada' or autor_id = auth.uid() or es_admin());
create policy "respuestas públicas" on public.respuestas for select to anon, authenticated
  using (exists (select 1 from public.preguntas q where q.id = pregunta_id and q.estado = 'publicada'));

-- en Supabase estos dos ya vienen dados; en PGlite hay que darlos
grant usage on schema public to anon, authenticated;
grant usage on schema extensions to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant select on public.tarjetas, public.vocabulario to anon, authenticated;
grant update on public.perfiles, public.tiendas to authenticated;
grant insert, update, delete on public.ofertas to authenticated;
grant insert, update, delete on public.categorias, public.atributos to authenticated;
grant insert on public.cotizaciones to authenticated;
