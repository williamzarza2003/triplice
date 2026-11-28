-- Tríplice · fase 4: panel del vendedor. Corre igual en Supabase y en PGlite.
-- Qué agrega:
--   1. Quién publica cada producto (productos.tienda_id) y el plazo prometido congelado en cada ítem del pedido.
--   2. Escrituras del vendedor con RLS: publicar y editar lo suyo, sus ofertas y su stock, avanzar su parte de un
--      pedido (preparando → enviado / listo para retirar) y responder las preguntas de lo que vende.
--   3. La reputación deja de ser un número cargado a mano: es una vista materializada calculada con pedidos,
--      opiniones, devoluciones y preguntas reales, con cada factor a la vista (el panel muestra de dónde sale).
--   4. Las funciones del panel (resumen con métricas, productos, pedidos y preguntas), todas con un jsonb de entrada
--      y salida. Son security invoker (el RLS decide) salvo las que leen la reputación o refrescan lo calculado,
--      que son security definer y comprueban el dueño antes de hacer nada.

-- ---------------------------------------------------------------------------------------------
-- 1. Datos nuevos
-- ---------------------------------------------------------------------------------------------

-- La tienda que publicó el producto: la única que edita su título, fotos y variantes (otras pueden venderlo
-- con su propia oferta, como hasta ahora). Nulo en productos cargados por el admin.
alter table public.productos add column tienda_id uuid references public.tiendas (id) on delete set null;
create index on public.productos (tienda_id);

-- El plazo de preparación que se prometió al vender (la oferta puede cambiar después: el pedido no)
alter table public.pedido_items add column preparacion_h smallint check (preparacion_h is null or preparacion_h between 1 and 720);

create or replace function public.item_plazo() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.preparacion_h is null then
    new.preparacion_h := coalesce((select preparacion_h from ofertas where id = new.oferta_id), 24);
  end if;
  return new;
end $$;
create trigger item_plazo before insert on public.pedido_items for each row execute function public.item_plazo();

-- Cada tienda avanza su parte del pedido: el evento dice de qué tienda es (nulo = lo escribió el sistema)
alter table public.pedido_eventos add column tienda_id uuid references public.tiendas (id) on delete set null;
create index on public.pedido_eventos (pedido_id, tienda_id);
create index on public.pedidos (creado);
create index on public.preguntas (creado);

-- ---------------------------------------------------------------------------------------------
-- 2. Ayudas
-- ---------------------------------------------------------------------------------------------

-- La tienda de quien llama, si su perfil es de vendedor (o admin). Corre como el usuario: lee su perfil y su tienda.
create or replace function public.mi_tienda() returns uuid
language sql stable
set search_path = public
as $$
  select t.id from tiendas t join perfiles pf on pf.id = t.duenio_id
   where t.duenio_id = auth.uid() and pf.rol in ('vendedor', 'admin')
   order by t.creado, t.id limit 1
$$;

-- ¿La tienda es de quien llama y su perfil es de vendedor (o admin)? La misma regla que mi_tienda(), para todas las
-- políticas de escritura: ser dueño de una tienda no alcanza si el perfil es de comprador.
-- para = 'catalogo': además, que la tienda no esté suspendida. Una suspendida no publica, no edita fichas ni sube
-- fotos, pero sigue despachando lo que ya vendió y puede pausar sus ofertas.
-- security definer: lee el perfil y la tienda sin depender del RLS de quien llama (la usan también las de Storage).
create or replace function public.es_mi_tienda(tid uuid, para text default 'despachar') returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from tiendas t join perfiles pf on pf.id = t.duenio_id
     where t.id = tid and t.duenio_id = auth.uid() and pf.rol in ('vendedor', 'admin')
       and (para <> 'catalogo' or t.estado <> 'suspendida'))
$$;

-- Etapa de un estado en el trayecto (la misma escala que lib/cuenta/pedidos.ts)
create or replace function public.etapa(estado text) returns int
language sql immutable parallel safe
as $$
  select case estado when 'confirmado' then 0 when 'preparando' then 1 when 'enviado' then 2 when 'listo_retiro' then 2
                     when 'entregado' then 3 when 'devolucion' then 3 else -1 end
$$;

-- Dónde está la parte de una tienda en un pedido: lo más avanzado entre el estado del pedido y sus propios eventos
create or replace function public.etapa_tienda(pid uuid, tid uuid) returns int
language sql stable
set search_path = public
as $$
  select greatest(etapa((select estado from pedidos where id = pid)),
                  coalesce((select max(etapa(e.estado)) from pedido_eventos e where e.pedido_id = pid and e.tienda_id = tid), -1))
$$;

create or replace function public.decimales(moneda text) returns int
language sql immutable parallel safe
as $$ select case when moneda in ('BRL', 'USD') then 2 else 0 end $$;

-- Pasa un monto (unidad mínima) de la moneda del pedido, con su cotización congelada, a otra moneda con la cotización
-- de hoy. Si la moneda es la misma no se toca: así las sumas en la moneda del pedido son exactas.
create or replace function public.a_moneda(monto numeric, de text, cot_de numeric, a text, cot_a numeric) returns numeric
language sql immutable parallel safe
as $$
  select case when de = a then monto
              else monto / 10 ^ decimales(de) / (case when de = 'USD' then 1 else cot_de end)
                   * (case when a = 'USD' then 1 else cot_a end) * 10 ^ decimales(a) end
$$;

-- ¿El producto es de mi tienda (lo publiqué o lo vendo)? security definer: tiene que ver ofertas pausadas
create or replace function public.vende_producto(pid uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from productos p join tiendas t on t.id = p.tienda_id where p.id = pid and t.duenio_id = auth.uid())
    or exists (select 1 from variantes v join ofertas o on o.variante_id = v.id join tiendas t on t.id = o.tienda_id
                where v.producto_id = pid and t.duenio_id = auth.uid()))
$$;

-- ¿Lo publicó mi tienda? (solo entonces se editan sus datos y variantes)
create or replace function public.publica_producto(pid uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from productos p where p.id = pid and es_mi_tienda(p.tienda_id, 'catalogo'))
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. RLS: lo que el vendedor puede leer y escribir
-- ---------------------------------------------------------------------------------------------

-- Ve sus productos aunque estén pausados (sin ninguna oferta activa no son públicos)
drop policy "productos visibles" on public.productos;
create policy "productos visibles" on public.productos for select to anon, authenticated
  using (producto_visible(id) or es_admin() or vende_producto(id));
drop policy "variantes visibles" on public.variantes;
create policy "variantes visibles" on public.variantes for select to anon, authenticated
  using (producto_visible(producto_id) or es_admin() or vende_producto(producto_id));

create policy "la tienda publica productos" on public.productos for insert to authenticated
  with check (es_mi_tienda(tienda_id, 'catalogo'));
create policy "la tienda edita lo que publicó" on public.productos for update to authenticated
  using (es_mi_tienda(tienda_id, 'catalogo')) with check (es_mi_tienda(tienda_id, 'catalogo'));
create policy "variantes de lo que publiqué" on public.variantes for all to authenticated
  using (publica_producto(producto_id)) with check (publica_producto(producto_id));

-- Ofertas: la política de la fase 1 miraba solo el dueño de la tienda. Ahora también el rol (como todo lo demás).
-- Se lee con "ofertas activas" (que ya deja ver las propias); acá solo la escritura.
drop policy "dueño gestiona sus ofertas" on public.ofertas;
create policy "la tienda agrega sus ofertas" on public.ofertas for insert to authenticated with check (es_mi_tienda(tienda_id));
create policy "la tienda edita sus ofertas" on public.ofertas for update to authenticated
  using (es_mi_tienda(tienda_id)) with check (es_mi_tienda(tienda_id));
create policy "la tienda borra sus ofertas" on public.ofertas for delete to authenticated using (es_mi_tienda(tienda_id));
-- Un plazo fuera de rango rompía la compra: pedido_items exige entre 1 y 720 horas y lo copia de la oferta
alter table public.ofertas add constraint ofertas_preparacion check (preparacion_h between 1 and 720),
  add constraint ofertas_stock_max check (stock <= 99999);
-- (los permisos por columna de productos, variantes y ofertas están al final, en "Permisos")

-- Todo lo que escribe un usuario se valida en la base, igual que en el servidor (lib/vender/producto.ts): con la
-- clave pública de Supabase se puede escribir directo en las tablas, sin pasar por guardar_producto.
-- Los atributos se validan contra los de la categoría (lo que hace distinta una heladera de una remera).
-- Solo para lo que escribe un usuario: el seed y el admin cargan datos ya revisados.
create or replace function public.productos_validar() returns trigger
language plpgsql
set search_path = public
as $$
declare
  k text;
  val jsonb;
  tipo text;
  padre smallint := (select padre_id from categorias where id = new.categoria_id);
begin
  if length(new.slug) > 90 then raise exception 'slug' using hint = 'La dirección del producto es demasiado larga.'; end if;
  if jsonb_typeof(new.titulo) <> 'object' or length(btrim(coalesce(new.titulo->>'es', ''))) not between 8 and 120
     or exists (select 1 from jsonb_each(new.titulo) t where jsonb_typeof(t.value) <> 'string' or length(t.value #>> '{}') > 120) then
    raise exception 'titulo' using hint = 'El título en español tiene que tener entre 8 y 120 caracteres.';
  end if;
  if length(btrim(new.marca)) not between 2 and 40 then
    raise exception 'marca' using hint = 'La marca tiene que tener entre 2 y 40 caracteres.';
  end if;
  if jsonb_typeof(new.descripcion) <> 'object'
     or exists (select 1 from jsonb_each(new.descripcion) d where jsonb_typeof(d.value) <> 'string' or length(d.value #>> '{}') > 2000) then
    raise exception 'descripcion' using hint = 'La descripción puede tener hasta 2000 caracteres por idioma.';
  end if;
  if jsonb_typeof(new.vinetas) <> 'object'
     or exists (select 1 from jsonb_each(new.vinetas) l where jsonb_typeof(l.value) <> 'array' or jsonb_array_length(l.value) > 6
                   or exists (select 1 from jsonb_array_elements(l.value) x where jsonb_typeof(x) <> 'string' or length(x #>> '{}') > 120)) then
    raise exception 'vinetas' using hint = 'Hasta 6 puntos destacados de 120 caracteres cada uno.';
  end if;
  if jsonb_typeof(new.atributos) <> 'object' or (select count(*) from jsonb_object_keys(new.atributos)) > 40
     or jsonb_typeof(new.en_caja) <> 'object' or length(new.en_caja::text) > 2000 then
    raise exception 'atributo' using hint = 'Demasiados datos técnicos.';
  end if;
  if new.peso_g is not null and new.peso_g not between 1 and 1000000 or new.garantia_meses not between 0 and 120 then
    raise exception 'peso' using hint = 'El peso va en gramos (hasta 1000 kg) y la garantía, hasta 120 meses.';
  end if;
  for k, val in select * from jsonb_each(new.atributos) loop
    select a.tipo into tipo from atributos a where a.clave = k and a.categoria_id in (new.categoria_id, padre)
     order by a.categoria_id = new.categoria_id desc limit 1;
    if tipo is null then
      raise exception 'atributo' using hint = format('«%s» no es un dato de esta categoría.', k);
    end if;
    if (tipo = 'numero' and jsonb_typeof(val) <> 'number') or (tipo = 'booleano' and jsonb_typeof(val) <> 'boolean')
       or (tipo in ('texto', 'opcion') and jsonb_typeof(val) <> 'string') then
      raise exception 'atributo' using hint = format('«%s» tiene que ser %s.', k, tipo);
    end if;
    if jsonb_typeof(val) = 'string' and length(val #>> '{}') > 60 then
      raise exception 'atributo' using hint = format('«%s» puede tener hasta 60 caracteres.', k);
    end if;
  end loop;
  return new;
end $$;
create trigger productos_validar before insert or update on public.productos for each row
  when (current_user = 'authenticated') execute function public.productos_validar();

-- Variantes escritas por una tienda: opciones cortas y fotos solo de su carpeta o que ya estaban en este mismo
-- producto (la portada que se copia a una variante nueva). Sin esto, una tienda podía escribir directo en la tabla
-- las fotos de otra y publicarlas como propias.
create or replace function public.variantes_validar() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  tid uuid := (select tienda_id from productos where id = new.producto_id);
  img text;
begin
  if jsonb_typeof(new.opciones) <> 'object' or (select count(*) from jsonb_object_keys(new.opciones)) > 2
     or exists (select 1 from jsonb_each(new.opciones) o where jsonb_typeof(o.value) <> 'string' or length(o.value #>> '{}') not between 1 and 60) then
    raise exception 'opcion' using hint = 'Cada variante tiene hasta dos opciones de hasta 60 caracteres.';
  end if;
  if cardinality(new.imagenes) > 8 then
    raise exception 'foto_muchas' using hint = 'Hasta 8 fotos por variante.';
  end if;
  foreach img in array new.imagenes loop
    if not (img ~ ('^subida:' || tid::text || '/[0-9a-f-]{36}$') or (tg_op = 'UPDATE' and img = any(old.imagenes))
            or exists (select 1 from variantes x where x.producto_id = new.producto_id and x.id <> new.id and img = any(x.imagenes))) then
      raise exception 'foto_ajena' using hint = 'Esa foto no es de tu tienda.';
    end if;
  end loop;
  return new;
end $$;
create trigger variantes_validar before insert or update on public.variantes for each row
  when (current_user = 'authenticated') execute function public.variantes_validar();

-- Las mismas políticas de lectura de la fase 2, con lo que es de mi tienda primero: la condición barata se resuelve
-- antes y no hace falta revisar el pedido entero en cada renglón (el panel lee cientos de pedidos de una vez).
drop policy "ítems de pedidos propios" on public.pedido_items;
create policy "ítems de pedidos propios" on public.pedido_items for select to authenticated
  using (exists (select 1 from tiendas t where t.id = tienda_id and t.duenio_id = auth.uid())
         or exists (select 1 from pedidos p where p.id = pedido_id and (p.comprador_id = auth.uid() or es_admin())));
drop policy "eventos de pedidos propios" on public.pedido_eventos;
create policy "eventos de pedidos propios" on public.pedido_eventos for select to authenticated
  using (exists (select 1 from tiendas t where t.id = tienda_id and t.duenio_id = auth.uid())
         or exists (select 1 from pedidos p where p.id = pedido_id and (p.comprador_id = auth.uid() or vende_en_pedido(p.id) or es_admin())));

-- La tienda avanza SU parte de un pedido: solo a preparando o enviado (listo para retirar si es retiro).
-- El resto de la línea de tiempo (pago, entrega, devolución) la escribe el sistema.
create policy "la tienda avanza su parte" on public.pedido_eventos for insert to authenticated
  with check (estado in ('preparando', 'enviado', 'listo_retiro')
              and es_mi_tienda(tienda_id)
              and exists (select 1 from pedido_items i where i.pedido_id = pedido_eventos.pedido_id and i.tienda_id = pedido_eventos.tienda_id));

-- Antes de guardar el evento: el orden (no se prepara dos veces ni se vuelve atrás) y, si es retiro, "enviado" pasa
-- a "listo para retirar". security definer: mira los eventos de las otras tiendas del pedido.
-- Bloquea el pedido hasta el final de la transacción: si dos tiendas despachan a la vez, la segunda espera y ve el
-- evento de la primera. Sin el bloqueo, cada una veía solo el suyo y el pedido quedaba "preparando" para siempre.
create or replace function public.evento_tienda_validar() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  pe pedidos;
  actual int;
begin
  if not es_mi_tienda(new.tienda_id)
     or not exists (select 1 from pedido_items i where i.pedido_id = new.pedido_id and i.tienda_id = new.tienda_id) then
    raise exception 'no_existe' using hint = 'Ese pedido no tiene productos de tu tienda.';
  end if;
  select * into pe from pedidos where id = new.pedido_id for update;
  if pe.estado not in ('confirmado', 'preparando', 'enviado', 'listo_retiro') then
    raise exception 'cerrado' using hint = 'Este pedido ya no se puede avanzar.';
  end if;
  actual := etapa_tienda(pe.id, new.tienda_id);
  if new.estado = 'preparando' and actual <> 0 then
    raise exception 'orden' using hint = 'Ya empezaste a preparar este pedido.';
  end if;
  if new.estado in ('enviado', 'listo_retiro') and actual not in (0, 1) then
    raise exception 'orden' using hint = 'Este pedido ya salió de tu tienda.';
  end if;
  new.estado := case when new.estado = 'preparando' then 'preparando'
                     when pe.entrega->>'modo' = 'retiro' then 'listo_retiro' else 'enviado' end;
  new.creado := now();
  return new;
end $$;
create trigger evento_tienda_validar before insert on public.pedido_eventos for each row
  when (new.tienda_id is not null and current_user = 'authenticated') execute function public.evento_tienda_validar();

-- Después: el pedido avanza cuando TODAS sus tiendas llegaron a esa etapa (un pedido con dos tiendas está
-- "en camino" cuando salieron los dos paquetes). Nunca retrocede.
create or replace function public.pedido_avanzar() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  pe pedidos;
  minima int;
begin
  select * into pe from pedidos where id = new.pedido_id;
  if pe.estado not in ('confirmado', 'preparando') then return null; end if;
  select min(etapa_tienda(pe.id, x.tienda_id)) into minima
    from (select distinct tienda_id from pedido_items where pedido_id = pe.id and tienda_id is not null) x;
  if minima > etapa(pe.estado) then
    update pedidos set estado = case when minima = 1 then 'preparando'
                                     when entrega->>'modo' = 'retiro' then 'listo_retiro' else 'enviado' end
     where id = pe.id;
  end if;
  return null;
end $$;
create trigger pedido_avanzar after insert on public.pedido_eventos for each row
  when (new.tienda_id is not null and current_user = 'authenticated') execute function public.pedido_avanzar();

-- Responder: la tienda contesta muchas preguntas por día; el límite de 10 por hora es para los compradores.
create or replace function public.respuesta_completar() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  prod uuid := (select producto_id from preguntas where id = new.pregunta_id);
  tid uuid;
begin
  -- responde como tienda si tiene una tienda aprobada (y perfil de vendedor) que vende este producto: una pendiente o
  -- suspendida no lleva el sello de "la tienda" en una ficha pública
  select t.id into tid from tiendas t
   where t.estado = 'aprobada' and es_mi_tienda(t.id)
     and exists (select 1 from ofertas o join variantes v on v.id = o.variante_id where o.tienda_id = t.id and v.producto_id = prod)
   order by t.creado, t.id limit 1;
  if (select count(*) from respuestas where autor_id = auth.uid() and creado > now() - interval '1 hour')
     >= (case when tid is null then 10 else 120 end) then
    raise exception 'limite' using hint = 'Respondiste muchas preguntas seguidas: probá de nuevo en un rato.';
  end if;
  if length(trim(new.texto)) not between 2 and 800 then
    raise exception 'largo' using hint = 'La respuesta tiene que tener entre 2 y 800 caracteres.';
  end if;
  new.autor_id := auth.uid();
  new.tienda_id := tid;
  new.es_vendedor := tid is not null;
  new.autor_nombre := coalesce((select nombre from tiendas where id = tid), firma(auth.uid()), 'Cliente');
  new.compro := exists (select 1 from pedido_items i join pedidos p on p.id = i.pedido_id
                         where i.producto_id = prod and p.comprador_id = auth.uid() and p.estado = 'entregado');
  new.creado := now();
  return new;
end $$;

-- Fotos de los productos (Supabase Storage). Cada tienda sube solo a su carpeta: productos/<tienda_id>/<archivo>.webp
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 2097152, array['image/webp'])
on conflict (id) do nothing;
create policy "la tienda sube a su carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'productos'
              and (storage.foldername(name))[1] in (select t.id::text from public.tiendas t where public.es_mi_tienda(t.id, 'catalogo')));
create policy "la tienda borra de su carpeta" on storage.objects for delete to authenticated
  using (bucket_id = 'productos'
         and (storage.foldername(name))[1] in (select t.id::text from public.tiendas t where public.es_mi_tienda(t.id)));

-- ---------------------------------------------------------------------------------------------
-- 4. Reputación calculada (reemplaza la tabla cargada a mano de la fase 1)
-- ---------------------------------------------------------------------------------------------
-- Cinco factores, cada uno de 0 a 100, con su peso. Si una tienda no tiene datos de un factor (por ejemplo, todavía
-- no le hicieron preguntas), ese factor no cuenta y los demás se reparten su peso.
--   opiniones     35 %  opiniones con 4 o 5 estrellas de lo que publica y de lo que vendió (compra verificada)
--   a tiempo      30 %  pedidos de los últimos 12 meses que llegaron (o quedaron listos para retirar) dentro del
--                       plazo prometido: horas de preparación + días máximos de envío
--   devoluciones  15 %  productos entregados en 12 meses que NO se devolvieron
--   respondidas   10 %  preguntas de los últimos 12 meses (con más de 24 h) sobre lo que publica que respondió
--   respuesta     10 %  mediana del tiempo de respuesta: 100 hasta 1 hora, baja en línea recta hasta 0 a las 48 horas
drop table public.reputacion_tiendas;

create materialized view public.reputacion_calculo as
with partes as ( -- una fila por pedido y tienda
  select i.tienda_id, pe.id as pedido_id, pe.entrega->>'modo' as modo,
         coalesce((pe.entrega->>'diasMax')::int, 0) as dias_max, max(coalesce(i.preparacion_h, 24)) as prep_h
    from pedido_items i join pedidos pe on pe.id = i.pedido_id
   where i.tienda_id is not null and pe.estado not in ('pendiente_pago', 'cancelado') and pe.creado > now() - interval '12 months'
   group by i.tienda_id, pe.id
), plazos as (
  select pa.tienda_id,
         c.creado + make_interval(hours => pa.prep_h + case when pa.modo = 'retiro' then 0 else pa.dias_max * 24 end) as limite,
         case when pa.modo = 'retiro'
              then (select min(e.creado) from pedido_eventos e where e.pedido_id = pa.pedido_id and e.estado = 'listo_retiro'
                       and (e.tienda_id = pa.tienda_id or e.tienda_id is null))
              else (select min(e.creado) from pedido_eventos e where e.pedido_id = pa.pedido_id and e.estado = 'entregado') end as llegada
    from partes pa
    join lateral (select min(e.creado) as creado from pedido_eventos e where e.pedido_id = pa.pedido_id and e.estado = 'confirmado') c on true
   where c.creado is not null
), entregas as (
  -- cuentan los que ya llegaron y los que se pasaron del plazo sin llegar; los que están en camino y en plazo, todavía no
  select tienda_id, count(*) filter (where llegada is not null or limite < now()) as cerradas,
         count(*) filter (where llegada is not null and llegada <= limite) as a_tiempo
    from plazos group by tienda_id
), ventas as (
  select tienda_id, count(*) as pedidos from partes group by tienda_id
), devol as (
  select i.tienda_id, count(*) as entregados, count(d.id) as devueltos
    from pedido_items i join pedidos pe on pe.id = i.pedido_id left join devoluciones d on d.item_id = i.id
   where i.tienda_id is not null and pe.estado in ('entregado', 'devolucion') and pe.creado > now() - interval '12 months'
   group by i.tienda_id
), opin as (
  select x.tienda_id, count(*) as total, count(*) filter (where x.estrellas >= 4) as buenas from (
    select p.tienda_id, r.id, r.estrellas from resenas r join productos p on p.id = r.producto_id
     where r.estado = 'publicada' and p.tienda_id is not null
    union
    select i.tienda_id, r.id, r.estrellas from resenas r join pedido_items i on i.id = r.pedido_item_id
     where r.estado = 'publicada' and i.tienda_id is not null
  ) x group by x.tienda_id
), preg as (
  select p.tienda_id, count(*) as total, count(a.creado) as respondidas,
         percentile_cont(0.5) within group (order by extract(epoch from a.creado - q.creado) / 60) as mediana_min
    from preguntas q join productos p on p.id = q.producto_id
    left join lateral (select min(r.creado) as creado from respuestas r where r.pregunta_id = q.id and r.tienda_id = p.tienda_id) a on true
   where q.estado = 'publicada' and p.tienda_id is not null
     and q.creado > now() - interval '12 months' and q.creado < now() - interval '24 hours'
   group by p.tienda_id
), puntajes as (
  select t.id as tienda_id,
         coalesce(o.total, 0)::int as opiniones_total, coalesce(o.buenas, 0)::int as opiniones_buenas,
         coalesce(en.cerradas, 0)::int as entregas_cerradas, coalesce(en.a_tiempo, 0)::int as entregas_a_tiempo,
         coalesce(d.entregados, 0)::int as items_entregados, coalesce(d.devueltos, 0)::int as items_devueltos,
         coalesce(q.total, 0)::int as preguntas_total, coalesce(q.respondidas, 0)::int as preguntas_respondidas,
         round(q.mediana_min::numeric)::int as respuesta_mediana_min,
         coalesce(v.pedidos, 0)::int as pedidos_12m,
         round(100.0 * o.buenas / nullif(o.total, 0), 1) as p_opiniones,
         round(100.0 * en.a_tiempo / nullif(en.cerradas, 0), 1) as p_a_tiempo,
         round(100.0 * (1 - d.devueltos::numeric / nullif(d.entregados, 0)), 1) as p_devoluciones,
         round(100.0 * q.respondidas / nullif(q.total, 0), 1) as p_respondidas,
         -- greatest/least ignoran los nulos: sin preguntas respondidas daba 100. Sin datos, el factor no cuenta.
         case when q.mediana_min is null then null
              else round(greatest(0, least(100, 100 * (2880 - q.mediana_min) / 2820))::numeric, 1) end as p_respuesta
    from tiendas t
    left join opin o on o.tienda_id = t.id
    left join entregas en on en.tienda_id = t.id
    left join devol d on d.tienda_id = t.id
    left join preg q on q.tienda_id = t.id
    left join ventas v on v.tienda_id = t.id
)
select p.*,
       round((coalesce(0.35 * p.p_opiniones, 0) + coalesce(0.30 * p.p_a_tiempo, 0) + coalesce(0.15 * p.p_devoluciones, 0)
              + coalesce(0.10 * p.p_respondidas, 0) + coalesce(0.10 * p.p_respuesta, 0))
             / nullif((case when p.p_opiniones is null then 0 else 0.35 end) + (case when p.p_a_tiempo is null then 0 else 0.30 end)
                      + (case when p.p_devoluciones is null then 0 else 0.15 end) + (case when p.p_respondidas is null then 0 else 0.10 end)
                      + (case when p.p_respuesta is null then 0 else 0.10 end), 0), 1) as reputacion,
       now() as calculado
  from puntajes p;
create unique index on public.reputacion_calculo (tienda_id);
-- en Supabase lo nuevo del esquema public queda abierto a anon por defecto: esto no (tiene tiendas pendientes)
revoke all on public.reputacion_calculo from public, anon, authenticated;

-- Lo público, con los mismos nombres de columna que la tabla de antes (la ficha, el inicio y la página de la tienda
-- la leen igual): `recomendacion` es ahora la reputación calculada. Solo tiendas aprobadas.
create view public.reputacion_tiendas as
  select r.tienda_id, coalesce(r.reputacion, 0)::numeric(4, 1) as recomendacion, r.opiniones_total as opiniones,
         r.pedidos_12m as ventas_12m, r.respuesta_mediana_min as respuesta_min, r.p_a_tiempo::numeric(4, 1) as a_tiempo
    from public.reputacion_calculo r join public.tiendas t on t.id = r.tienda_id
   where t.estado = 'aprobada';
grant select on public.reputacion_tiendas to anon, authenticated;

create or replace function public.refrescar_catalogo() returns void
language sql security definer
set search_path = public
as $$
  refresh materialized view public.tarjetas;
  refresh materialized view public.vocabulario;
  refresh materialized view public.reputacion_calculo;
$$;
revoke execute on function public.refrescar_catalogo() from public, anon, authenticated;

-- Lo que el vendedor cambió se ve enseguida: refresca las tarjetas (precio, stock, fotos) o la reputación.
-- security definer (las vistas materializadas son del dueño del esquema), con el chequeo de que quien llama tiene tienda.
create or replace function public.vendedor_refrescar(que text) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if mi_tienda() is null then raise exception 'sin_tienda' using hint = 'Hace falta una tienda para esto.'; end if;
  if que = 'catalogo' then
    refresh materialized view public.tarjetas;
    refresh materialized view public.vocabulario;
  elsif que = 'reputacion' then
    refresh materialized view public.reputacion_calculo;
  end if;
end $$;

-- Mi tienda (para el marco del panel y la carpeta de las fotos). Nulo si quien llama no es vendedor.
create or replace function public.mi_tienda_datos(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object('id', t.id, 'slug', t.slug, 'nombre', t.nombre, 'color', t.color, 'pais', t.pais, 'ciudad', t.ciudad, 'estado', t.estado)
    from tiendas t where t.id = mi_tienda()
$$;

-- La reputación de mi tienda, factor por factor (lee la vista materializada, que no es pública)
create or replace function public.mi_reputacion(p jsonb) returns jsonb
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(r) - 'tienda_id' from reputacion_calculo r where r.tienda_id = mi_tienda()
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Funciones del panel (security invoker: el RLS decide)
-- ---------------------------------------------------------------------------------------------

-- Resumen: ventas de los últimos `dias` (y del período anterior, para comparar), ventas por día, lo más vendido,
-- pedidos por preparar, preguntas sin responder, poco stock y la reputación. Los montos salen en `moneda`:
-- cada renglón se pasa de la moneda en que se cobró (con su cotización congelada) a la de hoy.
create or replace function public.vendedor_resumen(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  tid uuid := mi_tienda();
  mon text := case when p->>'moneda' in ('PYG', 'BRL', 'ARS', 'USD') then p->>'moneda' else 'PYG' end;
  cot numeric := case when mon = 'USD' then 1 else (select por_usd from cotizaciones where moneda = mon order by vigente_desde desc limit 1) end;
  dias int := least(greatest(coalesce((p->>'dias')::int, 30), 7), 90);
  hoy date := (now() at time zone 'America/Asuncion')::date;
  desde timestamptz := (hoy - (dias - 1))::timestamp at time zone 'America/Asuncion';
  antes timestamptz := (hoy - (2 * dias - 1))::timestamp at time zone 'America/Asuncion';
  v_idioma text := coalesce(p->>'idioma', 'es');
  r jsonb;
begin
  if tid is null then return jsonb_build_object('error', 'sin_tienda'); end if;
  with lineas as (
    select pe.id as pedido_id, pe.creado, (pe.creado at time zone 'America/Asuncion')::date as dia, i.producto_id, i.oferta_id,
           i.cantidad, a_moneda(i.precio_unitario * i.cantidad, pe.moneda, pe.cotizacion, mon, cot) as monto
      from pedido_items i join pedidos pe on pe.id = i.pedido_id
     where i.tienda_id = tid and pe.estado not in ('pendiente_pago', 'cancelado') and pe.creado >= antes
  ), actual as (select * from lineas where creado >= desde), previo as (select * from lineas where creado < desde)
  select jsonb_build_object(
    'moneda', mon, 'dias', dias, 'desde', hoy - (dias - 1), 'hasta', hoy,
    'ventas', (select jsonb_build_object('monto', coalesce(round(sum(monto)), 0), 'pedidos', count(distinct pedido_id),
                                         'unidades', coalesce(sum(cantidad), 0),
                                         'ticket', coalesce(round(sum(monto) / nullif(count(distinct pedido_id), 0)), 0)) from actual),
    'anterior', (select jsonb_build_object('monto', coalesce(round(sum(monto)), 0), 'pedidos', count(distinct pedido_id)) from previo),
    'serie', (select jsonb_agg(jsonb_build_object('dia', d.dia, 'monto', coalesce(round(s.monto), 0), 'pedidos', coalesce(s.pedidos, 0)) order by d.dia)
                from (select (hoy - g)::date as dia from generate_series(0, dias - 1) g) d
                left join (select dia, sum(monto) as monto, count(distinct pedido_id) as pedidos from actual group by dia) s on s.dia = d.dia),
    'top', coalesce((select jsonb_agg(x order by (x->>'unidades')::int desc, (x->>'monto')::numeric desc) from (
        select jsonb_build_object('slug', pr.slug, 'titulo', txt(pr.titulo, v_idioma), 'unidades', sum(a.cantidad), 'monto', round(sum(a.monto)),
                                  'imagen', (array_agg(foto_item(a.oferta_id)))[1]) as x
          from actual a join productos pr on pr.id = a.producto_id
         group by pr.id order by sum(a.cantidad) desc, sum(a.monto) desc limit 5) z), '[]'),
    'pedidos', (select jsonb_build_object(
        'por_preparar', count(*) filter (where etapa_tienda(pe.id, tid) = 0),
        'preparando', count(*) filter (where etapa_tienda(pe.id, tid) = 1),
        -- el plazo más cercano de lo que falta despachar
        'proximo_limite', min(pe.creado + make_interval(hours => (select max(coalesce(i.preparacion_h, 24)) from pedido_items i
                                                                   where i.pedido_id = pe.id and i.tienda_id = tid)))
                          filter (where etapa_tienda(pe.id, tid) in (0, 1)),
        -- si ya pasó, el saludo no dice "antes de las…" sino que está atrasado (la hora se compara acá, no en la página)
        'atrasado', coalesce(min(pe.creado + make_interval(hours => (select max(coalesce(i.preparacion_h, 24)) from pedido_items i
                                                                     where i.pedido_id = pe.id and i.tienda_id = tid)))
                             filter (where etapa_tienda(pe.id, tid) in (0, 1)) < now(), false))
        from pedidos pe
       where pe.estado in ('confirmado', 'preparando')
         and exists (select 1 from pedido_items i where i.pedido_id = pe.id and i.tienda_id = tid)),
    'preguntas', (select jsonb_build_object('sin_responder', count(*), 'mas_vieja', min(q.creado))
        from preguntas q
       where q.estado = 'publicada' and q.creado > now() - interval '90 days'
         and exists (select 1 from ofertas o join variantes v on v.id = o.variante_id where v.producto_id = q.producto_id and o.tienda_id = tid)
         and not exists (select 1 from respuestas a where a.pregunta_id = q.id and a.es_vendedor)),
    'poco_stock', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', pr.id, 'titulo', txt(pr.titulo, v_idioma), 'opciones', v.opciones, 'stock', o.stock) as x
          from ofertas o join variantes v on v.id = o.variante_id join productos pr on pr.id = v.producto_id
         where o.tienda_id = tid and o.activa and o.stock <= 3
         order by o.stock, pr.ventas_30d desc limit 5) z), '[]'),
    'reputacion', mi_reputacion('{}')
  ) into r;
  return r || jsonb_build_object('tienda', (select jsonb_build_object('slug', slug, 'nombre', nombre, 'color', color, 'ciudad', ciudad,
                                                                       'pais', pais, 'estado', estado) from tiendas where id = tid));
end $$;

-- Mis productos (los que publiqué o vendo), con búsqueda, filtro por estado y páginas de 20
create or replace function public.vendedor_productos(p jsonb) returns jsonb
language plpgsql stable
set search_path = public, extensions
as $$
declare
  tid uuid := mi_tienda();
  v_idioma text := coalesce(p->>'idioma', 'es');
  q text := normalizar(btrim(coalesce(p->>'q', '')));
  filtro text := coalesce(p->>'filtro', 'todos');
  pagina int := greatest(coalesce((p->>'pagina')::int, 1), 1);
  r jsonb;
begin
  if tid is null then return jsonb_build_object('error', 'sin_tienda'); end if;
  with mios as (
    select pr.id, pr.slug, txt(pr.titulo, v_idioma) as titulo, pr.marca, pr.tienda_id = tid as editable, pr.creado,
           bool_or(o.activa) as activa, coalesce(sum(o.stock) filter (where o.activa), 0) as stock, min(o.precio_usd_cent) as precio,
           (array_agg(v.imagenes[1] order by v.orden))[1] as imagen,
           jsonb_agg(jsonb_build_object('oferta', o.id, 'sku', v.sku, 'opciones', v.opciones, 'stock', o.stock, 'activa', o.activa,
                                        'precio', o.precio_usd_cent) order by v.orden) as variantes,
           string_agg(v.sku, ' ') as skus
      from ofertas o join variantes v on v.id = o.variante_id join productos pr on pr.id = v.producto_id
     where o.tienda_id = tid
     group by pr.id
  ), con_estado as (
    select m.*, case when not m.activa then 'pausados' when m.stock = 0 then 'sin_stock' else 'activos' end as estado
      from mios m
     -- cada palabra tiene que estar en el título, la marca o algún SKU (en cualquier orden, sin tildes)
     where not exists (select 1 from regexp_split_to_table(q, '\s+') w
                        where w <> '' and position(w in normalizar(m.titulo || ' ' || m.marca || ' ' || m.skus)) = 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from con_estado where filtro = 'todos' or estado = filtro),
    'pagina', pagina,
    'cuentas', (select jsonb_build_object('todos', count(*), 'activos', count(*) filter (where estado = 'activos'),
                                          'pausados', count(*) filter (where estado = 'pausados'),
                                          'sin_stock', count(*) filter (where estado = 'sin_stock')) from con_estado),
    'items', coalesce((select jsonb_agg(to_jsonb(x) - 'skus' - 'creado') from (
        select * from con_estado where filtro = 'todos' or estado = filtro
         order by estado = 'sin_stock' desc, creado desc, titulo limit 20 offset (pagina - 1) * 20) x), '[]')
  ) into r;
  return r;
end $$;

-- Un producto para editarlo: sus datos, variantes y mi oferta de cada una. `editable`: si lo publiqué yo.
create or replace function public.vendedor_producto(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', pr.id, 'slug', pr.slug, 'editable', pr.tienda_id = mi_tienda(), 'marca', pr.marca, 'titulo', pr.titulo,
    'descripcion', pr.descripcion, 'vinetas', pr.vinetas, 'atributos', pr.atributos, 'garantia_meses', pr.garantia_meses,
    'condicion', pr.condicion, 'peso_g', pr.peso_g, 'categoria', c.slug,
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'sku', v.sku, 'opciones', v.opciones, 'imagenes', to_jsonb(v.imagenes),
        'oferta', (select jsonb_build_object('id', o.id, 'precio', o.precio_usd_cent, 'lista', o.precio_lista_usd_cent, 'stock', o.stock,
                                             'activa', o.activa, 'envio_gratis', o.envio_gratis, 'preparacion_h', o.preparacion_h)
                     from ofertas o where o.variante_id = v.id and o.tienda_id = mi_tienda())) order by v.orden)
      from variantes v where v.producto_id = pr.id), '[]')
  )
  from productos pr join categorias c on c.id = pr.categoria_id
  where pr.id = (p->>'id')::uuid and mi_tienda() is not null and vende_producto(pr.id)
$$;

-- Lo que el formulario necesita: las subcategorías con los atributos que valen para cada una (los de la
-- subcategoría pisan a los de la principal)
create or replace function public.vendedor_categorias(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', h.slug, 'nombre', txt(h.nombre, coalesce(p->>'idioma', 'es')), 'padre', txt(c.nombre, coalesce(p->>'idioma', 'es')),
    'padre_slug', c.slug,
    'atributos', coalesce((select jsonb_agg(jsonb_build_object('clave', a.clave, 'nombre', txt(a.nombre, coalesce(p->>'idioma', 'es')),
                                                               'tipo', a.tipo, 'unidad', a.unidad) order by a.orden)
                            from (select distinct on (clave) * from atributos where categoria_id in (h.id, c.id)
                                   order by clave, categoria_id = h.id desc) a), '[]')
  ) order by c.orden, h.orden), '[]')
  from categorias h join categorias c on c.id = h.padre_id
$$;

-- Alta o edición de un producto con sus variantes y mi oferta de cada una.
--   p: { id?, categoria, marca, titulo {es,pt,en}, descripcion {es,pt,en}, vinetas {es: []}, atributos {}, garantia_meses,
--        condicion, peso_g, envio_gratis, preparacion_h, ejes [clave],
--        variantes: [{ id?, opciones {}, imagenes [], precio, lista, stock, activa }] }   (precios en centavos de dólar, sin impuestos)
-- Si el producto lo publicó otra tienda, solo se guardan mis ofertas (precio, stock, activa) de las variantes que ya existen.
-- Devuelve { id, slug } o { error, campo } con lo que hay que corregir (el servidor ya validó lo mismo antes).
create or replace function public.guardar_producto(p jsonb) returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  tid uuid := mi_tienda();
  pid uuid := nullif(p->>'id', '')::uuid;
  nuevo boolean := pid is null;
  editable boolean := true;
  cat categorias;
  ejes text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'ejes', '[]'))), '{}');
  v jsonb;
  vid uuid;
  n int := 0;
  vistas uuid[] := '{}';
  combinaciones text[] := '{}';
  combo text;
  img text;
  portada text[];
  base text;
  intento int := 0;
  prep int := least(greatest(coalesce((p->>'preparacion_h')::int, 24), 1), 240);
begin
  if tid is null then return jsonb_build_object('error', 'sin_tienda'); end if;
  if not nuevo then
    if not exists (select 1 from productos where id = pid) or not vende_producto(pid) then
      return jsonb_build_object('error', 'no_existe');
    end if;
    editable := publica_producto(pid);
  end if;
  -- una tienda suspendida sigue con sus ofertas (precio, stock, pausar), pero no publica ni edita fichas
  if (nuevo or exists (select 1 from productos where id = pid and tienda_id = tid)) and not es_mi_tienda(tid, 'catalogo') then
    return jsonb_build_object('error', 'suspendida');
  end if;

  n := jsonb_array_length(coalesce(p->'variantes', '[]'));
  if n < 1 or n > 20 then return jsonb_build_object('error', 'variantes'); end if;

  if editable then
    select * into cat from categorias where slug = p->>'categoria' and padre_id is not null;
    if not found then return jsonb_build_object('error', 'categoria', 'campo', 'categoria'); end if;
    if length(btrim(coalesce(p->'titulo'->>'es', ''))) not between 8 and 120 then return jsonb_build_object('error', 'titulo', 'campo', 'titulo_es'); end if;
    if length(btrim(coalesce(p->>'marca', ''))) not between 2 and 40 then return jsonb_build_object('error', 'marca', 'campo', 'marca'); end if;
    if cardinality(ejes) > 2 or exists (select 1 from unnest(ejes) e where e !~ '^[a-z_]{2,30}$') then
      return jsonb_build_object('error', 'ejes', 'campo', 'ejes');
    end if;
    -- la primera foto que haya es la portada de las variantes que no tengan
    select array(select jsonb_array_elements_text(x->'imagenes')) into portada
      from jsonb_array_elements(p->'variantes') x where jsonb_array_length(coalesce(x->'imagenes', '[]')) > 0 limit 1;
    if portada is null then return jsonb_build_object('error', 'fotos_faltan', 'campo', 'v0.fotos'); end if;
  end if;

  -- variantes: opciones completas y sin repetir, precio y stock con sentido
  n := 0;
  for v in select * from jsonb_array_elements(p->'variantes') loop
    if coalesce((v->>'precio')::bigint, 0) not between 1 and 10000000 then
      return jsonb_build_object('error', 'precio', 'campo', format('v%s.precio', n));
    end if;
    if v->>'lista' is not null and (v->>'lista')::bigint <= (v->>'precio')::bigint then
      return jsonb_build_object('error', 'lista', 'campo', format('v%s.lista', n));
    end if;
    if coalesce((v->>'stock')::int, -1) not between 0 and 99999 then
      return jsonb_build_object('error', 'stock', 'campo', format('v%s.stock', n));
    end if;
    if editable then
      if exists (select 1 from unnest(ejes) e where length(btrim(coalesce(v->'opciones'->>e, ''))) = 0)
         or exists (select 1 from jsonb_object_keys(coalesce(v->'opciones', '{}')) k where not k = any(ejes)) then
        return jsonb_build_object('error', 'opcion', 'campo', format('v%s.opciones', n));
      end if;
      combo := coalesce((select string_agg(lower(btrim(v->'opciones'->>e)), '|' order by e) from unnest(ejes) e), '');
      if combo = any(combinaciones) then return jsonb_build_object('error', 'repetida', 'campo', format('v%s.opciones', n)); end if;
      combinaciones := combinaciones || combo;
      for img in select jsonb_array_elements_text(coalesce(v->'imagenes', '[]')) loop
        -- fotos subidas a la carpeta de mi tienda, o las que ya tenía este producto (antes alcanzaba con mandar el id
        -- de una variante cualquiera, de otro producto y de otra tienda, para quedarse con sus fotos)
        if not (img ~ ('^subida:' || tid::text || '/[0-9a-f-]{36}$')
                or exists (select 1 from variantes x where x.producto_id = pid and img = any(x.imagenes))) then
          return jsonb_build_object('error', 'foto_ajena', 'campo', format('v%s.fotos', n));
        end if;
      end loop;
    end if;
    n := n + 1;
  end loop;

  if editable then
    if nuevo then
      pid := gen_random_uuid();
      base := left(btrim(regexp_replace(normalizar(btrim(p->'titulo'->>'es') || ' ' || btrim(p->>'marca')), '[^a-z0-9]+', '-', 'g'), '-'), 80);
      loop
        begin
          insert into productos (id, slug, categoria_id, marca, titulo, vinetas, descripcion, atributos, peso_g, garantia_meses,
                                 condicion, pais_origen, tienda_id)
          values (pid, base || case when intento = 0 then '' else '-' || (intento + 1) end, cat.id, btrim(p->>'marca'),
                  jsonb_strip_nulls(p->'titulo'), coalesce(p->'vinetas', '{}'), jsonb_strip_nulls(coalesce(p->'descripcion', '{}')),
                  coalesce(p->'atributos', '{}'), nullif(p->>'peso_g', '')::int, coalesce((p->>'garantia_meses')::smallint, 0),
                  coalesce(p->>'condicion', 'nuevo'), (select pais from tiendas where id = tid), tid);
          exit;
        exception when unique_violation then
          intento := intento + 1;
          if intento > 30 then raise; end if;
        end;
      end loop;
    else
      update productos set categoria_id = cat.id, marca = btrim(p->>'marca'), titulo = jsonb_strip_nulls(p->'titulo'),
             vinetas = coalesce(p->'vinetas', '{}'), descripcion = jsonb_strip_nulls(coalesce(p->'descripcion', '{}')),
             atributos = coalesce(p->'atributos', '{}'), peso_g = nullif(p->>'peso_g', '')::int,
             garantia_meses = coalesce((p->>'garantia_meses')::smallint, 0), condicion = coalesce(p->>'condicion', 'nuevo')
       where id = pid;
    end if;
  end if;

  n := 0;
  for v in select * from jsonb_array_elements(p->'variantes') loop
    vid := nullif(v->>'id', '')::uuid;
    if vid is not null and not exists (select 1 from variantes where id = vid and producto_id = pid) then vid := null; end if;
    if editable then
      if vid is null then
        vid := gen_random_uuid();
        insert into variantes (id, producto_id, sku, opciones, imagenes, orden)
        values (vid, pid, upper(left(regexp_replace(normalizar(p->>'marca'), '[^a-z0-9]', '', 'g') || 'xxxx', 4)) || '-' || upper(left(md5(vid::text), 6)),
                coalesce(v->'opciones', '{}'),
                case when jsonb_array_length(coalesce(v->'imagenes', '[]')) > 0 then array(select jsonb_array_elements_text(v->'imagenes')) else portada end,
                n);
      else
        update variantes set opciones = coalesce(v->'opciones', '{}'), orden = n,
               imagenes = case when jsonb_array_length(coalesce(v->'imagenes', '[]')) > 0 then array(select jsonb_array_elements_text(v->'imagenes')) else portada end
         where id = vid;
      end if;
    elsif vid is null then
      return jsonb_build_object('error', 'variante', 'campo', format('v%s', n));
    end if;
    vistas := vistas || vid;
    insert into ofertas (variante_id, tienda_id, precio_usd_cent, precio_lista_usd_cent, stock, envio_gratis, preparacion_h, activa)
    values (vid, tid, (v->>'precio')::bigint, nullif(v->>'lista', '')::bigint, (v->>'stock')::int,
            coalesce((p->>'envio_gratis')::boolean, false), prep, coalesce((v->>'activa')::boolean, true))
    on conflict (variante_id, tienda_id) do update
      set precio_usd_cent = excluded.precio_usd_cent, precio_lista_usd_cent = excluded.precio_lista_usd_cent, stock = excluded.stock,
          envio_gratis = excluded.envio_gratis, preparacion_h = excluded.preparacion_h, activa = excluded.activa;
    n := n + 1;
  end loop;

  if editable then
    -- las variantes que se sacaron: se borran, salvo que otra tienda las venda (entonces solo se pausa mi oferta)
    update ofertas set activa = false
     where tienda_id = tid and variante_id in (select id from variantes where producto_id = pid and not (id = any(vistas)));
    delete from variantes x where x.producto_id = pid and not (x.id = any(vistas))
       and not exists (select 1 from ofertas o where o.variante_id = x.id and o.tienda_id <> tid);
  end if;

  perform vendedor_refrescar('catalogo');
  return jsonb_build_object('id', pid, 'slug', (select slug from productos where id = pid), 'nuevo', nuevo);
end $$;

-- Pausar o volver a activar todas mis ofertas de un producto
create or replace function public.pausar_producto(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  tid uuid := mi_tienda();
  cambiadas int;
begin
  if tid is null then return jsonb_build_object('error', 'sin_tienda'); end if;
  update ofertas o set activa = coalesce((p->>'activa')::boolean, false)
    from variantes v where v.id = o.variante_id and v.producto_id = (p->>'id')::uuid and o.tienda_id = tid;
  get diagnostics cambiadas = row_count;
  if cambiadas = 0 then return jsonb_build_object('error', 'no_existe'); end if;
  perform vendedor_refrescar('catalogo');
  return jsonb_build_object('slug', (select slug from productos where id = (p->>'id')::uuid), 'ofertas', cambiadas);
end $$;

-- Stock rápido desde la lista: { stocks: [{ oferta, stock }] }. El RLS deja tocar solo mis ofertas.
create or replace function public.guardar_stock(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  tid uuid := mi_tienda();
  x jsonb;
  cambiadas int := 0;
  una int;
begin
  if tid is null then return jsonb_build_object('error', 'sin_tienda'); end if;
  for x in select * from jsonb_array_elements(coalesce(p->'stocks', '[]')) loop
    if coalesce((x->>'stock')::int, -1) not between 0 and 99999 then return jsonb_build_object('error', 'stock'); end if;
    update ofertas set stock = (x->>'stock')::int where id = (x->>'oferta')::uuid and tienda_id = tid;
    get diagnostics una = row_count;
    cambiadas := cambiadas + una;
  end loop;
  if cambiadas = 0 then return jsonb_build_object('error', 'no_existe'); end if;
  perform vendedor_refrescar('catalogo');
  return jsonb_build_object('ofertas', cambiadas,
    'slug', (select pr.slug from ofertas o join variantes v on v.id = o.variante_id join productos pr on pr.id = v.producto_id
              where o.id = (p->'stocks'->0->>'oferta')::uuid and o.tienda_id = tid));
end $$;

-- ¿El pedido tiene productos de otras tiendas? (el vendedor no ve esos renglones: solo sabe que existen, porque el
-- pedido queda "en camino" recién cuando despachan todas). security definer, con el chequeo de que el pedido es mío.
create or replace function public.pedido_compartido(pid uuid, tid uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from tiendas t where t.id = tid and t.duenio_id = auth.uid())
     and exists (select 1 from pedido_items i where i.pedido_id = pid and i.tienda_id = tid)
     and exists (select 1 from pedido_items i where i.pedido_id = pid and i.tienda_id is distinct from tid)
$$;
revoke execute on function public.pedido_compartido(uuid, uuid) from public, anon;
grant execute on function public.pedido_compartido(uuid, uuid) to authenticated;

-- Pedidos con productos de mi tienda, con mi parte de cada uno. filtro: por_preparar | preparando | en_camino | entregados | todos
create or replace function public.vendedor_pedidos(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  tid uuid := mi_tienda();
  filtro text := coalesce(p->>'filtro', 'por_preparar');
  r jsonb;
begin
  if tid is null then return jsonb_build_object('error', 'sin_tienda'); end if;
  -- mi etapa en cada pedido, de una sola pasada (lo mismo que etapa_tienda, pero sin una consulta por pedido)
  with mis_items as (
    select pedido_id, max(coalesce(preparacion_h, 24)) as prep_h from pedido_items where tienda_id = tid group by pedido_id
  ), mis_eventos as (
    select pedido_id, max(etapa(estado)) as etapa from pedido_eventos where tienda_id = tid group by pedido_id
  ), mios as (
    -- columnas a mano: la clave de invitado del pedido no es legible para las tiendas (ver "Permisos")
    select pe.id, pe.numero, pe.creado, pe.moneda, pe.estado, pe.entrega, pe.comprador_id,
           greatest(etapa(pe.estado), coalesce(me.etapa, -1)) as mia, mi.prep_h
      from pedidos pe join mis_items mi on mi.pedido_id = pe.id left join mis_eventos me on me.pedido_id = pe.id
     where pe.estado <> 'pendiente_pago'
  ), clasificados as (
    select m.*, case when m.estado = 'cancelado' then 'cancelados' when m.mia = 0 then 'por_preparar' when m.mia = 1 then 'preparando'
                     when m.mia = 2 then 'en_camino' else 'entregados' end as grupo
      from mios m
  )
  select jsonb_build_object(
    'cuentas', (select jsonb_build_object('todos', count(*), 'por_preparar', count(*) filter (where grupo = 'por_preparar'),
                                          'preparando', count(*) filter (where grupo = 'preparando'),
                                          'en_camino', count(*) filter (where grupo = 'en_camino'),
                                          'entregados', count(*) filter (where grupo = 'entregados')) from clasificados),
    'items', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object(
        'numero', c.numero, 'creado', c.creado, 'moneda', c.moneda, 'grupo', c.grupo, 'estado', c.estado,
        'modo', c.entrega->>'modo', 'comprador', coalesce(firma(c.comprador_id), c.entrega->>'nombre'),
        'destino', case when c.entrega->>'modo' = 'retiro' then null else c.entrega->>'direccion' end,
        'limite', c.creado + make_interval(hours => c.prep_h),
        'atrasado', c.grupo in ('por_preparar', 'preparando') and c.creado + make_interval(hours => c.prep_h) < now(),
        'total', (select sum(i.precio_unitario * i.cantidad) from pedido_items i where i.pedido_id = c.id and i.tienda_id = tid),
        'otras_tiendas', pedido_compartido(c.id, tid),
        'items', (select jsonb_agg(jsonb_build_object('titulo', i.titulo, 'opciones', i.opciones, 'cantidad', i.cantidad,
                                                      'precio', i.precio_unitario, 'imagen', foto_item(i.oferta_id)) order by i.id)
                    from pedido_items i where i.pedido_id = c.id and i.tienda_id = tid),
        'eventos', (select jsonb_agg(jsonb_build_object('estado', e.estado, 'creado', e.creado) order by e.creado, e.id)
                      from pedido_eventos e where e.pedido_id = c.id and (e.tienda_id = tid or e.tienda_id is null))
      ) as x
        from clasificados c
       where filtro = 'todos' or c.grupo = filtro
       order by case when c.grupo in ('por_preparar', 'preparando') then c.creado end asc nulls last, c.creado desc
       limit 60) z), '[]')
  ) into r;
  return r;
end $$;

-- Avanzar mi parte de un pedido: { numero, estado: 'preparando' | 'enviado' }. El disparador valida el orden y,
-- si es retiro, lo guarda como "listo para retirar". El comprador lo ve en su línea de tiempo.
create or replace function public.avanzar_pedido(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  tid uuid := mi_tienda();
  pid uuid;
begin
  if tid is null then return jsonb_build_object('error', 'sin_tienda'); end if;
  if coalesce(p->>'estado', '') not in ('preparando', 'enviado') then return jsonb_build_object('error', 'estado'); end if;
  select pe.id into pid from pedidos pe where pe.numero = p->>'numero'
     and exists (select 1 from pedido_items i where i.pedido_id = pe.id and i.tienda_id = tid);
  if pid is null then return jsonb_build_object('error', 'no_existe'); end if;
  insert into pedido_eventos (pedido_id, estado, tienda_id) values (pid, p->>'estado', tid);
  perform vendedor_refrescar('reputacion');
  return jsonb_build_object('numero', p->>'numero', 'estado', (select estado from pedidos where id = pid),
                            'mia', etapa_tienda(pid, tid));
end $$;

-- Preguntas de lo que vendo. "Sin responder": las de los últimos 90 días que ninguna tienda respondió todavía (si la
-- tienda que lo publica ya contestó, no se repite), las más viejas arriba. Después, todas.
create or replace function public.vendedor_preguntas(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  tid uuid := mi_tienda();
  v_idioma text := coalesce(p->>'idioma', 'es');
  filtro text := coalesce(p->>'filtro', 'sin_responder');
  r jsonb;
begin
  if tid is null then return jsonb_build_object('error', 'sin_tienda'); end if;
  with mias as (
    select q.*, exists (select 1 from respuestas a where a.pregunta_id = q.id and a.es_vendedor) as respondida,
           q.creado > now() - interval '90 days' as reciente
      from preguntas q
     where q.estado = 'publicada'
       and exists (select 1 from ofertas o join variantes v on v.id = o.variante_id where v.producto_id = q.producto_id and o.tienda_id = tid)
  )
  select jsonb_build_object(
    'cuentas', (select jsonb_build_object('sin_responder', count(*) filter (where not respondida and reciente), 'todas', count(*)) from mias),
    'items', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', m.id, 'texto', m.texto, 'autor', m.autor_nombre, 'idioma', m.idioma, 'creado', m.creado,
        'respondida', m.respondida, 'slug', pr.slug, 'producto', txt(pr.titulo, v_idioma),
        'imagen', (select v.imagenes[1] from variantes v where v.producto_id = pr.id order by v.orden limit 1),
        'respuestas', coalesce((select jsonb_agg(jsonb_build_object('autor', a.autor_nombre, 'texto', a.texto, 'creado', a.creado,
                                                                    'mia', a.tienda_id = tid) order by a.creado)
                                  from respuestas a where a.pregunta_id = m.id), '[]')) as x
        from mias m join productos pr on pr.id = m.producto_id
       where filtro = 'todas' or (not m.respondida and m.reciente)
       order by m.respondida or not m.reciente, case when not m.respondida and m.reciente then m.creado end asc, m.creado desc
       limit 50) z), '[]')
  ) into r;
  return r;
end $$;

-- Responder como tienda: solo preguntas de lo que vendo (la base pone el sello de vendedor con su disparador)
create or replace function public.vendedor_responder(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  tid uuid := mi_tienda();
  q preguntas;
begin
  if tid is null then return jsonb_build_object('error', 'sin_tienda'); end if;
  select * into q from preguntas where id = (p->>'pregunta')::uuid and estado = 'publicada';
  if not found or not exists (select 1 from ofertas o join variantes v on v.id = o.variante_id
                               where v.producto_id = q.producto_id and o.tienda_id = tid) then
    return jsonb_build_object('error', 'no_existe');
  end if;
  insert into respuestas (pregunta_id, autor_nombre, texto) values (q.id, '', btrim(p->>'texto'));
  perform vendedor_refrescar('reputacion');
  return jsonb_build_object('slug', (select slug from productos where id = q.producto_id));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------------------------

-- Tablas. Supabase da TODOS los permisos de cada tabla nueva del esquema public a anon y authenticated (default
-- privileges), así que los permisos por columna de las fases 3 y 4 no limitaban nada: con la clave pública se podía,
-- por ejemplo, subir ventas_30d de un producto propio para aparecer primero. Se quita toda escritura y se vuelve a
-- dar solo lo que cada política necesita. (supabase/pglite/00_supabase.sql imita esos permisos por defecto, para que
-- las pruebas corran con los mismos que Supabase.)
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
-- La clave de invitado de un pedido abre su comprobante entero (con lo de las otras tiendas y el email): las tiendas
-- que ven el pedido no la leen. Tampoco la referencia del pago.
revoke select on public.pedidos from anon, authenticated;
grant select (id, numero, comprador_id, email, region, idioma, moneda, cotizacion, productos, envio, descuento, total, impuestos,
              cupon, entrega, estado, proveedor_pago, creado) on public.pedidos to authenticated;
-- fase 1 (la política decide quién: dueño o admin)
grant update (nombre, telefono, region, idioma, moneda) on public.perfiles to authenticated;
grant update (nombre, lema, descripcion, color, ciudad, direccion, lat, lng, horario, estado) on public.tiendas to authenticated;
grant insert, update, delete on public.categorias, public.atributos to authenticated;
grant insert on public.cotizaciones to authenticated;
-- fase 2
grant insert, update, delete on public.carritos, public.carrito_items to authenticated;
-- fase 3
grant insert (pedido_item_id, producto_id, autor_nombre, pais, estrellas, titulo, texto, idioma, fotos) on public.resenas to authenticated;
grant update (estrellas, titulo, texto, fotos) on public.resenas to authenticated;
grant insert, update, delete on public.votos_resena, public.direcciones to authenticated;
grant insert (producto_id, autor_nombre, texto, idioma) on public.preguntas to authenticated;
grant insert (pregunta_id, autor_nombre, texto) on public.respuestas to authenticated;
-- fase 4: la tienda publica y edita lo suyo; no toca ventas_30d, creado ni la búsqueda (las mantiene la base)
grant insert (id, slug, categoria_id, marca, titulo, vinetas, descripcion, atributos, peso_g, medidas_mm, garantia_meses,
              condicion, pais_origen, en_caja, tienda_id) on public.productos to authenticated;
grant update (categoria_id, marca, titulo, vinetas, descripcion, atributos, peso_g, medidas_mm, garantia_meses, condicion,
              pais_origen, en_caja) on public.productos to authenticated;
grant insert (id, producto_id, sku, opciones, imagenes, orden), update (opciones, imagenes, orden), delete on public.variantes to authenticated;
-- una oferta no se muda de variante ni de tienda (los pedidos viejos apuntan a ella)
grant insert (variante_id, tienda_id, precio_usd_cent, precio_lista_usd_cent, stock, envio_gratis, preparacion_h, activa),
      update (precio_usd_cent, precio_lista_usd_cent, stock, envio_gratis, preparacion_h, activa), delete on public.ofertas to authenticated;
grant insert (pedido_id, estado, tienda_id) on public.pedido_eventos to authenticated;

-- Funciones
revoke execute on function public.es_mi_tienda(uuid, text) from public, anon;
grant execute on function public.es_mi_tienda(uuid, text) to authenticated;
revoke execute on function public.mi_tienda(), public.vende_producto(uuid), public.publica_producto(uuid), public.vendedor_refrescar(text),
  public.mi_reputacion(jsonb), public.mi_tienda_datos(jsonb), public.vendedor_resumen(jsonb), public.vendedor_productos(jsonb), public.vendedor_producto(jsonb),
  public.vendedor_categorias(jsonb), public.guardar_producto(jsonb), public.pausar_producto(jsonb), public.guardar_stock(jsonb),
  public.vendedor_pedidos(jsonb), public.avanzar_pedido(jsonb), public.vendedor_preguntas(jsonb), public.vendedor_responder(jsonb)
  from public, anon;
grant execute on function public.mi_tienda(), public.vendedor_refrescar(text), public.publica_producto(uuid),
  public.mi_reputacion(jsonb), public.mi_tienda_datos(jsonb), public.vendedor_resumen(jsonb), public.vendedor_productos(jsonb), public.vendedor_producto(jsonb),
  public.vendedor_categorias(jsonb), public.guardar_producto(jsonb), public.pausar_producto(jsonb), public.guardar_stock(jsonb),
  public.vendedor_pedidos(jsonb), public.avanzar_pedido(jsonb), public.vendedor_preguntas(jsonb), public.vendedor_responder(jsonb)
  to authenticated;
-- la usan las políticas de lectura de productos y variantes, que también evalúa el visitante sin cuenta
grant execute on function public.vende_producto(uuid) to anon, authenticated;
grant execute on function public.etapa(text), public.etapa_tienda(uuid, uuid), public.decimales(text),
  public.a_moneda(numeric, text, numeric, text, numeric) to authenticated;
grant all on public.reputacion_calculo to service_role;
