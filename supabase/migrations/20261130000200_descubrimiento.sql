-- Tríplice · fase 5 (descubrimiento): comparador, vistos recientemente, "comprados juntos", listas, favoritos y
-- alertas de precio simuladas. Corre igual en Supabase y en PGlite.
--
-- Reglas de esta migración (las mismas de las fases 3 y 4):
-- - RLS en toda tabla nueva: cada uno ve y toca solo lo suyo. La lista compartida se lee solo con su token, por una
--   función security definer que devuelve lo mínimo.
-- - Funciones security invoker salvo que sea imprescindible (están marcadas y explicadas).
-- - Los límites (listas por cuenta, productos por lista, alertas activas, largo de nombres) y los cálculos que el
--   usuario no debe poder elegir (el token, el precio de la alerta, si se cumplió) viven en la base, en disparadores:
--   con la clave pública de Supabase se puede escribir directo en las tablas, sin pasar por las funciones.
-- - Todo lo que llega de una cookie (slugs) se valida acá también: slug con formato y cantidad acotada.
-- - Al final, "Permisos": la fase 4 quitó toda escritura a las sesiones; acá se da columna por columna lo necesario.

-- ---------------------------------------------------------------------------------------------
-- Ayudas
-- ---------------------------------------------------------------------------------------------

-- Un slug de producto bien formado ("pava-electrica-1-7-l"). Lo que viene de una cookie se filtra con esto.
create or replace function public.slug_valido(s text) returns boolean
language sql immutable parallel safe
as $$ select s is not null and length(s) <= 160 and s ~ '^[a-z0-9]+(-[a-z0-9]+)*$' $$;

-- Slugs de una lista jsonb, válidos, sin repetir, en el orden recibido y como mucho `tope`.
create or replace function public.slugs_de(j jsonb, tope int) returns text[]
language sql immutable parallel safe
as $$
  select coalesce(array_agg(s order by o), '{}') from (
    select s, min(o) as o
      from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) with ordinality as e(s, o)
     where slug_valido(s)
     group by s order by min(o) limit greatest(tope, 0)) x
$$;

-- Cotización de hoy de una moneda (unidades por 1 USD). La misma que lee la web (cotizaciones_vigentes).
create or replace function public.cotizacion_hoy(moneda text) returns numeric
language sql stable
set search_path = public
as $$
  select case when moneda = 'USD' then 1
              else (select c.por_usd from cotizaciones c where c.moneda = cotizacion_hoy.moneda order by c.vigente_desde desc limit 1) end
$$;

-- Precio final en la unidad mínima de la moneda (₲, centavos de real, $, centavos de dólar), igual que
-- precioFinal() de lib/compra/impuestos.ts: base USD sin impuestos → con el impuesto → convertido → redondeado al
-- paso de la moneda (₲ 1.000, R$ 0,10, $ 100, US$ 0,01).
create or replace function public.precio_final(base_usd_cent bigint, tasa numeric, moneda text) returns bigint
language sql stable
set search_path = public
as $$
  select (round(base_usd_cent / 100.0 * cotizacion_hoy(moneda) * (1 + tasa) * power(10::numeric, decimales(moneda)) / x.paso) * x.paso)::bigint
    from (select case moneda when 'PYG' then 1000 when 'BRL' then 10 when 'ARS' then 100 else 1 end as paso) x
$$;

-- Precio de hoy de un producto (su oferta más barata con stock, la de la tarjeta) para quien compra en `region` y ve
-- `moneda`. Nulo si hoy no se puede comprar.
create or replace function public.precio_actual(producto uuid, region text, moneda text) returns bigint
language sql stable
set search_path = public
as $$
  select precio_final(t.precio_usd_cent, tasa_impuesto(region, t.categoria_id, t.categoria_padre_id), moneda)
    from tarjetas t where t.id = producto
$$;

-- Tarjetas a partir de slugs (lo que guarda la cookie del invitado: vistos recientemente), en ese orden.
create or replace function public.tarjetas_slugs(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select tarjetas_json(array(
    select t.id from unnest(slugs_de(p->'slugs', 12)) with ordinality as s(slug, o) join tarjetas t on t.slug = s.slug
     where t.slug is distinct from p->>'excepto' order by s.o), coalesce(p->>'idioma', 'es'))
$$;

-- ---------------------------------------------------------------------------------------------
-- Comparador: hasta 4 productos de la misma categoría o de categorías hermanas (mismo padre)
-- ---------------------------------------------------------------------------------------------
-- La familia la define el primero; los que no son de la familia vuelven en `fuera` (la página explica por qué).
-- Los atributos son los de las categorías de los productos (subcategoría y su principal), sin repetir la clave.
create or replace function public.comparar(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  idioma text := coalesce(p->>'idioma', 'es');
  pedidos text[] := slugs_de(p->'slugs', 4);
  familia smallint;
  ids uuid[];
  cats smallint[];
begin
  select coalesce(t.categoria_padre_id, t.categoria_id) into familia
    from unnest(pedidos) with ordinality s(slug, o) join tarjetas t on t.slug = s.slug order by s.o limit 1;
  select array_agg(t.id order by s.o), array_agg(distinct t.categoria_id) into ids, cats
    from unnest(pedidos) with ordinality s(slug, o) join tarjetas t on t.slug = s.slug
   where coalesce(t.categoria_padre_id, t.categoria_id) = familia;
  return jsonb_build_object(
    'familia', (select jsonb_build_object('slug', c.slug, 'nombre', txt(c.nombre, idioma)) from categorias c where c.id = familia),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'slug', t.slug, 'titulo', txt(t.titulo, idioma), 'marca', t.marca, 'imagen', t.imagen,
        'precio', t.precio_usd_cent, 'precio_lista', t.precio_lista_usd_cent, 'envio_gratis', t.envio_gratis,
        'stock', t.stock, 'ofertas', t.ofertas, 'promedio', t.promedio, 'resenas', t.resenas, 'condicion', t.condicion,
        'categoria', c.slug, 'categoria_padre', cp.slug, 'categoria_nombre', txt(c.nombre, idioma),
        'garantia_meses', pr.garantia_meses, 'peso_g', pr.peso_g, 'atributos', pr.atributos,
        -- la tienda de la mejor oferta (la más barata con stock) y su reputación
        'tienda', jsonb_build_object('slug', t.tienda_slug, 'nombre', t.tienda_nombre, 'pais', t.tienda_pais, 'ciudad', t.tienda_ciudad,
                                     'recomendacion', r.recomendacion)
      ) order by u.o)
        from unnest(ids) with ordinality u(id, o)
        join tarjetas t on t.id = u.id
        join productos pr on pr.id = t.id
        join categorias c on c.id = t.categoria_id
        left join categorias cp on cp.id = c.padre_id
        left join tiendas ti on ti.slug = t.tienda_slug
        left join reputacion_tiendas r on r.tienda_id = ti.id), '[]'),
    'atributos', coalesce((
      select jsonb_agg(jsonb_build_object('clave', a.clave, 'nombre', txt(a.nombre, idioma), 'unidad', a.unidad, 'tipo', a.tipo)
                       order by a.de_sub desc, a.orden, a.clave)
        from (select distinct on (a.clave) a.clave, a.nombre, a.unidad, a.tipo, a.orden, (a.categoria_id = any(cats)) as de_sub
                from atributos a
               where a.categoria_id = any(cats) or a.categoria_id = familia
               order by a.clave, (a.categoria_id = any(cats)) desc, a.orden) a), '[]'),
    'fuera', coalesce((
      select jsonb_agg(jsonb_build_object('slug', t.slug, 'titulo', txt(t.titulo, idioma)) order by s.o)
        from unnest(pedidos) with ordinality s(slug, o) join tarjetas t on t.slug = s.slug
       where coalesce(t.categoria_padre_id, t.categoria_id) <> familia), '[]'),
    -- pedidos que no existen o que hoy no se pueden comprar
    'no_disponibles', coalesce((
      select jsonb_agg(s.slug order by s.o) from unnest(pedidos) with ordinality s(slug, o)
       where not exists (select 1 from tarjetas t where t.slug = s.slug)), '[]')
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- Vistos recientemente (con cuenta; sin cuenta viven en una cookie: lib/descubrir/vistos.ts)
-- ---------------------------------------------------------------------------------------------
create table public.vistos (
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  producto_id uuid not null references public.productos (id) on delete cascade,
  visto timestamptz not null default now(),
  primary key (usuario_id, producto_id)
);
create index vistos_recientes on public.vistos (usuario_id, visto desc);
alter table public.vistos enable row level security;
create policy "mis vistos" on public.vistos for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Se guardan los últimos 12 por persona: después de cada inserción se borran los más viejos (también si se escribe
-- directo en la tabla). Disparador por sentencia, con las filas nuevas: una inserción de 12 de golpe recorta una vez.
create or replace function public.vistos_recortar() returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from vistos v
   using (select distinct usuario_id from nuevos) u
   where v.usuario_id = u.usuario_id
     and v.producto_id in (select x.producto_id from vistos x where x.usuario_id = u.usuario_id order by x.visto desc, x.producto_id offset 12);
  return null;
end $$;
create trigger vistos_recortar after insert on public.vistos referencing new table as nuevos
  for each statement execute function public.vistos_recortar();

-- Registra vistos: uno (al abrir una ficha) o varios (al entrar, lo que había en la cookie, el más reciente primero).
-- Los slugs se validan y se acotan a 12; los que no existen se ignoran.
create or replace function public.registrar_vistos(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then return null; end if;
  insert into vistos (producto_id, visto)
  select pr.id, now() - make_interval(secs => s.o::int) from unnest(slugs_de(p->'slugs', 12)) with ordinality s(slug, o)
    join productos pr on pr.slug = s.slug
  on conflict (usuario_id, producto_id) do update set visto = greatest(vistos.visto, excluded.visto);
  return mis_vistos(p);
end $$;

create or replace function public.mis_vistos(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select tarjetas_json(array(
    select v.producto_id from vistos v join tarjetas t on t.id = v.producto_id
     where v.usuario_id = auth.uid() and t.slug is distinct from p->>'excepto' order by v.visto desc limit 12),
    coalesce(p->>'idioma', 'es'))
$$;

-- ---------------------------------------------------------------------------------------------
-- Listas y favoritos
-- ---------------------------------------------------------------------------------------------
-- Favoritos es una lista más (favoritos = true, una por persona). Una lista se comparte con un token de 64
-- caracteres hexadecimales (244 bits al azar): sin token no se lee. Revocar = token nulo; compartir de nuevo da otro.
create table public.listas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 60 and nombre !~ '[[:cntrl:]]'),
  favoritos boolean not null default false,
  token text unique check (token is null or token ~ '^[0-9a-f]{64}$'),
  compartida_desde timestamptz,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index on public.listas (usuario_id);
create unique index listas_un_favoritos on public.listas (usuario_id) where favoritos;
create unique index listas_nombre_unico on public.listas (usuario_id, lower(btrim(nombre)));

create table public.lista_items (
  lista_id uuid not null references public.listas (id) on delete cascade,
  producto_id uuid not null references public.productos (id) on delete cascade,
  agregado timestamptz not null default now(),
  primary key (lista_id, producto_id)
);
create index on public.lista_items (producto_id);

alter table public.listas enable row level security;
alter table public.lista_items enable row level security;
create policy "mis listas" on public.listas for select to authenticated using (usuario_id = auth.uid());
create policy "crear mis listas" on public.listas for insert to authenticated with check (usuario_id = auth.uid());
create policy "editar mis listas" on public.listas for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
-- favoritos no se borra (se vacía)
create policy "borrar mis listas" on public.listas for delete to authenticated using (usuario_id = auth.uid() and not favoritos);

-- ¿La lista es mía? security definer no hace falta: listas ya filtra por dueño con su propia política.
create policy "productos de mis listas" on public.lista_items for all to authenticated
  using (exists (select 1 from listas l where l.id = lista_items.lista_id and l.usuario_id = auth.uid()))
  with check (exists (select 1 from listas l where l.id = lista_items.lista_id and l.usuario_id = auth.uid()));

-- 244 bits al azar (gen_random_uuid usa el generador fuerte de Postgres: 122 bits por uuid)
create or replace function public.token_nuevo() returns text
language sql volatile
as $$ select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

-- Lo que el usuario no elige: el token (lo genera la base, aunque mande uno), la marca de favoritos y los límites.
create or replace function public.listas_validar() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.nombre := btrim(regexp_replace(new.nombre, '\s+', ' ', 'g'));
  if tg_op = 'INSERT' then
    -- dos pestañas creando listas a la vez no pasan el límite
    perform pg_advisory_xact_lock(hashtext('listas:' || new.usuario_id::text));
    if (select count(*) from listas where usuario_id = new.usuario_id) >= 20 then
      raise exception 'limite_listas' using hint = 'Podés tener hasta 20 listas. Borrá una que ya no uses para crear otra.';
    end if;
    new.token := null; new.compartida_desde := null; new.creado := now();
  else
    if new.favoritos and new.nombre is distinct from old.nombre then
      raise exception 'favoritos' using hint = 'La lista de favoritos no se puede renombrar.';
    end if;
    if new.token is distinct from old.token then
      if new.token is null then new.compartida_desde := null;
      else new.token := token_nuevo(); new.compartida_desde := now();
      end if;
    end if;
  end if;
  new.actualizado := now();
  return new;
end $$;
create trigger listas_validar before insert or update on public.listas for each row execute function public.listas_validar();

create or replace function public.lista_items_validar() returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('lista:' || new.lista_id::text));
  if (tg_op = 'INSERT' or new.lista_id is distinct from old.lista_id)
     and (select count(*) from lista_items where lista_id = new.lista_id) >= 100 then
    raise exception 'limite_items' using hint = 'Una lista guarda hasta 100 productos. Pasá algunos a otra lista.';
  end if;
  if tg_op = 'INSERT' and not producto_visible(new.producto_id) then
    raise exception 'producto' using hint = 'Ese producto ya no está a la venta.';
  end if;
  if tg_op = 'INSERT' then new.agregado := now(); end if;
  -- la lista sube en "Mis listas": listas_validar pone `actualizado` (la sesión no tiene permiso sobre esa columna,
  -- sí sobre el nombre, que no cambia)
  update listas set nombre = nombre where id = new.lista_id;
  return new;
end $$;
create trigger lista_items_validar before insert or update on public.lista_items for each row execute function public.lista_items_validar();

-- La lista de favoritos de quien llama (la crea la primera vez)
create or replace function public.mis_favoritos_id() returns uuid
language plpgsql
set search_path = public
as $$
declare
  lid uuid := (select id from listas where usuario_id = auth.uid() and favoritos);
begin
  if lid is null and auth.uid() is not null then
    insert into listas (nombre, favoritos) values ('Favoritos', true)
    on conflict (usuario_id) where favoritos do nothing returning id into lid;
    lid := coalesce(lid, (select id from listas where usuario_id = auth.uid() and favoritos));
  end if;
  return lid;
end $$;

-- Para traducir los errores de los disparadores a un código que la web conoce
create or replace function public.error_conocido(mensaje text) returns text
language sql immutable
as $$
  select case when mensaje in ('limite_listas', 'limite_items', 'favoritos', 'producto', 'limite_alertas', 'objetivo_alto',
                               'objetivo_bajo', 'sin_precio') then mensaje else 'servidor' end
$$;

create or replace function public.mis_listas(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'nombre', l.nombre, 'favoritos', l.favoritos, 'token', l.token, 'actualizado', l.actualizado,
    'n', (select count(*) from lista_items i join tarjetas t on t.id = i.producto_id where i.lista_id = l.id),
    'fotos', coalesce((select jsonb_agg(x.imagen) from (select t.imagen from lista_items i join tarjetas t on t.id = i.producto_id
                        where i.lista_id = l.id order by i.agregado desc limit 4) x), '[]'))
    order by l.favoritos desc, l.actualizado desc), '[]')
  from listas l where l.usuario_id = auth.uid()
$$;

create or replace function public.mi_lista(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object('id', l.id, 'nombre', l.nombre, 'favoritos', l.favoritos, 'token', l.token,
    'compartida_desde', l.compartida_desde,
    'items', tarjetas_json(array(select i.producto_id from lista_items i where i.lista_id = l.id order by i.agregado desc),
                           coalesce(p->>'idioma', 'es')),
    'otras', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nombre', o.nombre) order by o.favoritos desc, o.nombre)
                         from listas o where o.usuario_id = auth.uid() and o.id <> l.id), '[]'))
  from listas l
  where l.usuario_id = auth.uid() and l.id = case when (p->>'id') ~ '^[0-9a-f-]{36}$' then (p->>'id')::uuid end
$$;

-- Crear (sin id) o renombrar (con id)
create or replace function public.guardar_lista(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  lid uuid := case when (p->>'id') ~ '^[0-9a-f-]{36}$' then (p->>'id')::uuid end;
  v_nombre text := btrim(coalesce(p->>'nombre', ''));
begin
  if length(v_nombre) not between 1 and 60 then return jsonb_build_object('error', 'nombre'); end if;
  if lid is null then
    insert into listas (nombre) values (v_nombre) returning id into lid;
  else
    update listas set nombre = v_nombre where id = lid;
    if not found then return jsonb_build_object('error', 'no_existe'); end if;
  end if;
  return jsonb_build_object('id', lid);
exception
  when unique_violation then return jsonb_build_object('error', 'repetido');
  when raise_exception then return jsonb_build_object('error', error_conocido(sqlerrm));
end $$;

create or replace function public.borrar_lista(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
begin
  delete from listas where id = case when (p->>'id') ~ '^[0-9a-f-]{36}$' then (p->>'id')::uuid end and not favoritos;
  return jsonb_build_object('ok', found);
end $$;

-- La lista destino: un id mío o 'favoritos'
create or replace function public.lista_destino(x text) returns uuid
language sql
set search_path = public
as $$
  select case when x = 'favoritos' then mis_favoritos_id()
              when x ~ '^[0-9a-f-]{36}$' then (select id from listas where id = x::uuid and usuario_id = auth.uid()) end
$$;

create or replace function public.lista_agregar(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  lid uuid := lista_destino(p->>'lista');
  pid uuid := (select id from productos where slug_valido(p->>'slug') and slug = p->>'slug');
begin
  if lid is null then return jsonb_build_object('error', 'no_existe'); end if;
  if pid is null then return jsonb_build_object('error', 'producto'); end if;
  insert into lista_items (lista_id, producto_id) values (lid, pid) on conflict do nothing;
  return jsonb_build_object('ok', true, 'lista', lid);
exception
  when raise_exception then return jsonb_build_object('error', error_conocido(sqlerrm));
end $$;

create or replace function public.lista_quitar(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
begin
  delete from lista_items where lista_id = lista_destino(p->>'lista')
     and producto_id = (select id from productos where slug = p->>'slug');
  return jsonb_build_object('ok', found);
end $$;

-- Mover un producto de una lista a otra (si ya estaba en la otra, solo sale de la primera)
create or replace function public.lista_mover(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  de uuid := lista_destino(p->>'de');
  a uuid := lista_destino(p->>'a');
  pid uuid := (select id from productos where slug = p->>'slug');
begin
  if de is null or a is null or pid is null or de = a then return jsonb_build_object('error', 'no_existe'); end if;
  if exists (select 1 from lista_items where lista_id = a and producto_id = pid) then
    delete from lista_items where lista_id = de and producto_id = pid;
  else
    update lista_items set lista_id = a where lista_id = de and producto_id = pid;
  end if;
  return jsonb_build_object('ok', found, 'lista', a);
exception
  when raise_exception then return jsonb_build_object('error', error_conocido(sqlerrm));
end $$;

-- El corazón: agrega o saca de favoritos
create or replace function public.alternar_favorito(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  lid uuid := mis_favoritos_id();
  pid uuid := (select id from productos where slug_valido(p->>'slug') and slug = p->>'slug');
  quiere boolean := coalesce((p->>'favorito')::boolean, not exists (select 1 from lista_items where lista_id = lid and producto_id = pid));
begin
  if lid is null then return jsonb_build_object('error', 'sin_sesion'); end if;
  if pid is null then return jsonb_build_object('error', 'producto'); end if;
  if quiere then
    insert into lista_items (lista_id, producto_id) values (lid, pid) on conflict do nothing;
  else
    delete from lista_items where lista_id = lid and producto_id = pid;
  end if;
  return jsonb_build_object('favorito', quiere);
exception
  when raise_exception then return jsonb_build_object('error', error_conocido(sqlerrm));
end $$;

-- Compartir (da un token nuevo si no tenía) o dejar de compartir
create or replace function public.compartir_lista(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  t text;
begin
  update listas set token = case when coalesce((p->>'compartir')::boolean, true) then coalesce(token, 'nuevo') end
   where id = case when (p->>'id') ~ '^[0-9a-f-]{36}$' then (p->>'id')::uuid end
   returning token into t;
  if not found then return jsonb_build_object('error', 'no_existe'); end if;
  return jsonb_build_object('token', t);
end $$;

-- Lista compartida, de solo lectura, con su token. security definer: quien la abre (con o sin cuenta) no puede leer
-- las listas de otro por el RLS. Compara el token exacto (64 hex: no se adivina) y devuelve lo mínimo: el nombre,
-- la firma del dueño ("Lorena B.", como en las opiniones) y los productos públicos. Nunca el id ni el email del dueño.
create or replace function public.lista_compartida(p jsonb) returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('nombre', l.nombre, 'favoritos', l.favoritos, 'de', firma(l.usuario_id),
    'desde', l.compartida_desde,
    'items', tarjetas_json(array(select i.producto_id from lista_items i where i.lista_id = l.id order by i.agregado desc limit 100),
                           coalesce(p->>'idioma', 'es')))
  from listas l
  where coalesce(p->>'token', '') ~ '^[0-9a-f]{64}$' and l.token = p->>'token'
$$;

-- ---------------------------------------------------------------------------------------------
-- Alertas de precio (simuladas: no se mandan correos; el aviso queda en la cuenta)
-- ---------------------------------------------------------------------------------------------
-- El objetivo se guarda en la moneda que eligió el comprador (unidad mínima) junto con su región (el impuesto) y se
-- compara con el precio final de hoy en esa moneda, con la cotización de hoy: si el dólar sube, un precio en guaraníes
-- puede bajar sin que el vendedor toque nada, y eso también es una baja para quien paga en guaraníes.
-- También se guarda el precio base en USD sin impuestos del momento (para mostrar cuánto bajó de verdad).
create table public.alertas_precio (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  producto_id uuid not null references public.productos (id) on delete cascade,
  region char(2) not null check (region in ('PY', 'BR', 'AR', 'XX')),
  moneda char(3) not null check (moneda in ('PYG', 'BRL', 'ARS', 'USD')),
  objetivo bigint not null check (objetivo > 0),
  base_usd_cent bigint not null check (base_usd_cent > 0),
  precio_inicial bigint not null check (precio_inicial > 0),
  activa boolean not null default true,
  cumplida timestamptz,
  precio_cumplida bigint,
  leida boolean not null default false,
  creado timestamptz not null default now()
);
create index on public.alertas_precio (usuario_id);
create index alertas_pendientes on public.alertas_precio (producto_id) where activa and cumplida is null;
-- una alerta activa por producto y persona (crear otra reemplaza la anterior)
create unique index alertas_una_activa on public.alertas_precio (usuario_id, producto_id) where activa;

alter table public.alertas_precio enable row level security;
create policy "mis alertas" on public.alertas_precio for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- La base pone el precio de hoy, el base en USD y decide si se cumplió: el usuario solo elige producto, región,
-- moneda y objetivo. Una alerta cumplida no se vuelve a cumplir ni se reactiva.
create or replace function public.alertas_validar() returns trigger
language plpgsql
set search_path = public
as $$
declare
  hoy bigint;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('alertas:' || new.usuario_id::text));
    if (select count(*) from alertas_precio where usuario_id = new.usuario_id and activa) >= 20 then
      raise exception 'limite_alertas' using hint = 'Podés tener hasta 20 alertas activas. Borrá alguna para crear otra.';
    end if;
    hoy := precio_actual(new.producto_id, new.region, new.moneda);
    if hoy is null then raise exception 'sin_precio' using hint = 'Hoy ese producto no tiene precio: no se puede crear la alerta.'; end if;
    if new.objetivo >= hoy then
      raise exception 'objetivo_alto' using hint = 'El precio que esperás tiene que ser menor que el de hoy.';
    end if;
    if new.objetivo * 10 < hoy then
      raise exception 'objetivo_bajo' using hint = 'El precio que esperás es menos de la décima parte del de hoy: revisá los ceros.';
    end if;
    new.base_usd_cent := (select precio_usd_cent from tarjetas where id = new.producto_id);
    new.precio_inicial := hoy;
    new.activa := true; new.cumplida := null; new.precio_cumplida := null; new.leida := false; new.creado := now();
    return new;
  end if;
  if new.producto_id <> old.producto_id or new.region <> old.region or new.moneda <> old.moneda or new.objetivo <> old.objetivo
     or new.base_usd_cent <> old.base_usd_cent or new.precio_inicial <> old.precio_inicial or new.usuario_id <> old.usuario_id then
    raise exception 'alerta_fija' using hint = 'Para cambiar el precio que esperás, creá la alerta de nuevo.';
  end if;
  if new.cumplida is distinct from old.cumplida then
    if old.cumplida is not null or new.cumplida is null then raise exception 'ya_cumplida'; end if;
    hoy := precio_actual(old.producto_id, old.region, old.moneda);
    if hoy is null or hoy > old.objetivo then raise exception 'no_bajo' using hint = 'El precio todavía no bajó hasta el objetivo.'; end if;
    new.cumplida := now(); new.precio_cumplida := hoy; new.activa := false; new.leida := false;
  elsif new.precio_cumplida is distinct from old.precio_cumplida then
    raise exception 'alerta_fija';
  end if;
  if new.activa and not old.activa and old.cumplida is not null then raise exception 'ya_cumplida'; end if;
  return new;
end $$;
create trigger alertas_validar before insert or update on public.alertas_precio for each row execute function public.alertas_validar();

-- "Avisame si baja de X": reemplaza la alerta activa del mismo producto
create or replace function public.crear_alerta(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  pid uuid := (select id from productos where slug_valido(p->>'slug') and slug = p->>'slug');
  a alertas_precio;
begin
  if pid is null then return jsonb_build_object('error', 'producto'); end if;
  if coalesce(p->>'objetivo', '') !~ '^[0-9]{1,15}$' then return jsonb_build_object('error', 'objetivo'); end if;
  delete from alertas_precio where usuario_id = auth.uid() and producto_id = pid and activa;
  insert into alertas_precio (producto_id, region, moneda, objetivo)
  values (pid, p->>'region', p->>'moneda', (p->>'objetivo')::bigint) returning * into a;
  return jsonb_build_object('id', a.id, 'objetivo', a.objetivo, 'precio_inicial', a.precio_inicial, 'moneda', a.moneda);
exception
  when raise_exception then return jsonb_build_object('error', error_conocido(sqlerrm), 'precio', precio_actual(pid, p->>'region', p->>'moneda'));
  when check_violation then return jsonb_build_object('error', 'objetivo');
end $$;

create or replace function public.borrar_alerta(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
begin
  delete from alertas_precio where id = case when (p->>'id') ~ '^[0-9a-f-]{36}$' then (p->>'id')::uuid end;
  return jsonb_build_object('ok', found);
end $$;

-- Revisa MIS alertas contra el precio de hoy (en la vista previa, al abrir la cuenta y al entrar). El disparador
-- vuelve a calcular el precio y lo guarda: aunque alguien escriba `cumplida` directo, no se cumple si no bajó.
create or replace function public.revisar_alertas(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  update alertas_precio a set cumplida = now()
   where a.usuario_id = auth.uid() and a.activa and a.cumplida is null
     and precio_actual(a.producto_id, a.region, a.moneda) <= a.objetivo;
  get diagnostics n = row_count;
  return jsonb_build_object('nuevas', n, 'avisos', (select count(*) from alertas_precio where usuario_id = auth.uid() and cumplida is not null and not leida));
end $$;

-- Todas las alertas (para pg_cron en Supabase). No la puede llamar ninguna sesión (ver "Permisos").
create or replace function public.revisar_alertas_todas() returns int
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  update alertas_precio a set cumplida = now()
   where a.activa and a.cumplida is null and precio_actual(a.producto_id, a.region, a.moneda) <= a.objetivo;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.mis_alertas(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'slug', pr.slug, 'titulo', txt(pr.titulo, coalesce(p->>'idioma', 'es')),
    'imagen', (select v.imagenes[1] from variantes v where v.producto_id = pr.id order by v.orden limit 1),
    'region', a.region, 'moneda', a.moneda, 'objetivo', a.objetivo, 'precio_inicial', a.precio_inicial,
    'base_usd_cent', a.base_usd_cent, 'precio_hoy', precio_actual(a.producto_id, a.region, a.moneda),
    'activa', a.activa, 'cumplida', a.cumplida, 'precio_cumplida', a.precio_cumplida, 'leida', a.leida, 'creado', a.creado)
    order by a.cumplida is not null and not a.leida desc, a.activa desc, coalesce(a.cumplida, a.creado) desc), '[]')
  from alertas_precio a join productos pr on pr.id = a.producto_id
  where a.usuario_id = auth.uid()
$$;

create or replace function public.leer_avisos(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
begin
  update alertas_precio set leida = true where usuario_id = auth.uid() and cumplida is not null and not leida;
  return jsonb_build_object('ok', true);
end $$;

-- Lo personal de una ficha (lo pide el navegador después de cargar): en qué listas está, si es favorito y su alerta
create or replace function public.ficha_descubrir(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'listas', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nombre', l.nombre, 'favoritos', l.favoritos,
                         'tiene', exists (select 1 from lista_items i where i.lista_id = l.id and i.producto_id = pr.id))
                         order by l.favoritos desc, l.actualizado desc)
                         from listas l where l.usuario_id = auth.uid()), '[]'),
    'alerta', (select jsonb_build_object('id', a.id, 'objetivo', a.objetivo, 'moneda', a.moneda, 'region', a.region, 'activa', a.activa,
                                         'cumplida', a.cumplida, 'precio_cumplida', a.precio_cumplida)
                 from alertas_precio a where a.usuario_id = auth.uid() and a.producto_id = pr.id
                order by a.activa desc, a.creado desc limit 1))
  from productos pr where slug_valido(p->>'slug') and pr.slug = p->>'slug'
$$;

-- Estado chico para las tarjetas y el encabezado: qué productos son favoritos y cuántos avisos hay sin leer
create or replace function public.estado_descubrir(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'favoritos', coalesce((select jsonb_agg(pr.slug) from listas l join lista_items i on i.lista_id = l.id
                             join productos pr on pr.id = i.producto_id where l.usuario_id = auth.uid() and l.favoritos), '[]'),
    'avisos', (select count(*) from alertas_precio where usuario_id = auth.uid() and cumplida is not null and not leida))
$$;

-- ---------------------------------------------------------------------------------------------
-- "Comprados juntos": pares de productos que aparecen en el mismo pedido
-- ---------------------------------------------------------------------------------------------
-- Cuenta pedidos distintos (no unidades) que no quedaron sin pagar ni se cancelaron, en las dos direcciones, solo
-- entre productos públicos (las tarjetas) y con un mínimo de 3 pedidos: con menos, la recomendación es ruido y
-- podría dejar adivinar la compra de una persona. No tiene datos de compradores; se lee con comprados_juntos().
create materialized view public.comprados_juntos as
select a.producto_id as producto_a, b.producto_id as producto_b, count(distinct a.pedido_id)::int as veces
  from pedido_items a
  join pedido_items b on b.pedido_id = a.pedido_id and b.producto_id <> a.producto_id
  join pedidos pe on pe.id = a.pedido_id
 where pe.estado not in ('pendiente_pago', 'cancelado')
   and exists (select 1 from tarjetas t where t.id = a.producto_id)
   and exists (select 1 from tarjetas t where t.id = b.producto_id)
 group by 1, 2
having count(distinct a.pedido_id) >= 3;
create unique index comprados_juntos_par on public.comprados_juntos (producto_a, producto_b);

-- Lo que la ficha muestra: los más comprados con este (hasta 4) o, si no hay datos, lo más vendido de las categorías
-- hermanas (la misma principal, otra subcategoría: los de la misma subcategoría ya salen en "relacionados").
create or replace function public.comprados_juntos(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  idioma text := coalesce(p->>'idioma', 'es');
  t tarjetas;
  ids uuid[];
  fuente text := 'pedidos';
begin
  select * into t from tarjetas where slug_valido(p->>'slug') and slug = p->>'slug';
  if not found then return null; end if;
  ids := array(select cj.producto_b from comprados_juntos cj join tarjetas x on x.id = cj.producto_b
                where cj.producto_a = t.id order by cj.veces desc, x.ventas_30d desc, x.slug limit 4);
  if cardinality(ids) = 0 then
    fuente := 'categoria';
    ids := array(select x.id from tarjetas x where x.id <> t.id and x.categoria_padre_id is not distinct from t.categoria_padre_id
                   and x.categoria_id <> t.categoria_id order by x.ventas_30d desc, x.slug limit 4);
    if cardinality(ids) = 0 then
      ids := array(select x.id from tarjetas x where x.id <> t.id and x.categoria_id = t.categoria_id order by x.ventas_30d desc, x.slug limit 4);
    end if;
  end if;
  return jsonb_build_object('fuente', fuente, 'producto', tarjetas_json(array[t.id], idioma)->0, 'items', tarjetas_json(ids, idioma),
    'veces', coalesce((select jsonb_object_agg(x.slug, cj.veces) from comprados_juntos cj join tarjetas x on x.id = cj.producto_b
                        where cj.producto_a = t.id and cj.producto_b = any(ids)), '{}'),
    'categoria', (select txt(c.nombre, idioma) from categorias c where c.id = coalesce(t.categoria_padre_id, t.categoria_id)));
end $$;

-- La oferta más barata con stock de cada producto (para "Agregar los dos al carrito"). Respeta el RLS: solo ofertas
-- activas de tiendas aprobadas. El precio no se devuelve: lo calcula el carrito con la base.
create or replace function public.ofertas_baratas(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'oferta', o.id) order by s.o), '[]')
    from unnest(slugs_de(p->'slugs', 4)) with ordinality s(slug, o)
    join productos pr on pr.slug = s.slug
    cross join lateral (select o.id from ofertas o join variantes v on v.id = o.variante_id join tiendas ti on ti.id = o.tienda_id
                         where v.producto_id = pr.id and o.activa and o.stock > 0 and ti.estado = 'aprobada'
                         order by o.precio_usd_cent, o.preparacion_h, o.id limit 1) o
$$;

-- refrescar_catalogo() (de la fase 1, reescrita en la 4 y quizá en otra migración de la fase 5) ahora también rehace
-- "comprados juntos" después de las tarjetas. Para no pisar lo que otra migración le haya agregado, se renombra la
-- versión vigente y la nueva la llama.
alter function public.refrescar_catalogo() rename to refrescar_catalogo_base;
create or replace function public.refrescar_catalogo() returns void
language plpgsql security definer -- las vistas materializadas son del dueño del esquema
set search_path = public
as $$
begin
  perform refrescar_catalogo_base();
  refresh materialized view public.comprados_juntos;
end $$;

-- En Supabase con pg_cron: revisar las alertas cada 30 minutos (en PGlite no hay pg_cron: se revisan al entrar y al
-- abrir la cuenta). refrescar_catalogo ya se programa cada hora (docs/supabase.md).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('revisar-alertas', '*/30 * * * *', 'select public.revisar_alertas_todas()');
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------------------------
-- Supabase da todo a anon y authenticated en cada tabla nueva (y PGlite lo imita: supabase/pglite/00_supabase.sql).
-- Se quita y se da columna por columna lo que cada política necesita. anon no escribe nada de esto.
revoke all on public.vistos, public.listas, public.lista_items, public.alertas_precio from anon, authenticated;
grant select, delete on public.vistos to authenticated;
grant insert (producto_id, visto), update (visto) on public.vistos to authenticated;
-- listas: el dueño lo pone la base (auth.uid() por defecto, y la política lo exige); el token lo genera el disparador
grant select, delete on public.listas to authenticated;
grant insert (nombre, favoritos), update (nombre, token) on public.listas to authenticated;
grant select, delete on public.lista_items to authenticated;
grant insert (lista_id, producto_id), update (lista_id) on public.lista_items to authenticated;
-- alertas: el precio de hoy, el base en USD y la marca de cumplida los pone el disparador
grant select, delete on public.alertas_precio to authenticated;
grant insert (producto_id, region, moneda, objetivo), update (activa, cumplida, leida) on public.alertas_precio to authenticated;
-- la vista materializada solo tiene pares de productos públicos con su cantidad de pedidos (sin compradores)
revoke all on public.comprados_juntos from anon, authenticated;
grant select on public.comprados_juntos to anon, authenticated;
grant all on public.comprados_juntos to service_role;

-- Funciones públicas (las usa el visitante sin cuenta: comparador, vistos de la cookie, combo y lista compartida)
revoke execute on function public.comparar(jsonb), public.tarjetas_slugs(jsonb), public.comprados_juntos(jsonb),
  public.ofertas_baratas(jsonb), public.lista_compartida(jsonb) from public;
grant execute on function public.comparar(jsonb), public.tarjetas_slugs(jsonb), public.comprados_juntos(jsonb),
  public.ofertas_baratas(jsonb), public.lista_compartida(jsonb) to anon, authenticated;
-- Funciones de la cuenta: solo con sesión
revoke execute on function public.registrar_vistos(jsonb), public.mis_vistos(jsonb), public.mis_favoritos_id(), public.mis_listas(jsonb),
  public.mi_lista(jsonb), public.guardar_lista(jsonb), public.borrar_lista(jsonb), public.lista_destino(text), public.lista_agregar(jsonb),
  public.lista_quitar(jsonb), public.lista_mover(jsonb), public.alternar_favorito(jsonb), public.compartir_lista(jsonb),
  public.crear_alerta(jsonb), public.borrar_alerta(jsonb), public.revisar_alertas(jsonb), public.mis_alertas(jsonb),
  public.leer_avisos(jsonb), public.ficha_descubrir(jsonb), public.estado_descubrir(jsonb) from public, anon;
grant execute on function public.registrar_vistos(jsonb), public.mis_vistos(jsonb), public.mis_favoritos_id(), public.mis_listas(jsonb),
  public.mi_lista(jsonb), public.guardar_lista(jsonb), public.borrar_lista(jsonb), public.lista_destino(text), public.lista_agregar(jsonb),
  public.lista_quitar(jsonb), public.lista_mover(jsonb), public.alternar_favorito(jsonb), public.compartir_lista(jsonb),
  public.crear_alerta(jsonb), public.borrar_alerta(jsonb), public.revisar_alertas(jsonb), public.mis_alertas(jsonb),
  public.leer_avisos(jsonb), public.ficha_descubrir(jsonb), public.estado_descubrir(jsonb) to authenticated;
-- Ayudas que usan los disparadores y las funciones anteriores (las sesiones las ejecutan a través de ellas)
grant execute on function public.slug_valido(text), public.slugs_de(jsonb, int), public.cotizacion_hoy(text), public.precio_final(bigint, numeric, text),
  public.precio_actual(uuid, text, text), public.token_nuevo(), public.error_conocido(text) to anon, authenticated;
-- Solo el sistema: refrescar (pg_cron o el rol de servicio) y revisar las alertas de todos
revoke execute on function public.refrescar_catalogo(), public.refrescar_catalogo_base(), public.revisar_alertas_todas()
  from public, anon, authenticated;
grant execute on function public.refrescar_catalogo(), public.revisar_alertas_todas() to service_role;
