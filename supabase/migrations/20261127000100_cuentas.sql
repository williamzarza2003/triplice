-- Tríplice · fase 3: cuentas, direcciones, pedidos del comprador, devoluciones, opiniones con fotos, votos y preguntas.
-- Corre igual en Supabase y en PGlite. Regla de la casa: el navegador nunca escribe directo en una tabla; las
-- escrituras pasan por funciones `security invoker` (el RLS decide) o, cuando tocan tablas de otro dueño (el
-- evento del pedido, el contador de votos), por funciones `security definer` que validan todo antes.

-- ---------------------------------------------------------------------------------------------
-- Perfil: se crea solo al registrarse (email o Google)
-- ---------------------------------------------------------------------------------------------
alter table public.perfiles add column telefono text check (telefono is null or length(telefono) <= 30);
alter table public.perfiles add constraint perfiles_nombre_largo check (length(nombre) between 2 and 80);

create or replace function public.crear_perfil() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  nombre text := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(trim(new.raw_user_meta_data->>'name'), ''),
                          initcap(split_part(coalesce(new.email, 'cliente'), '@', 1)));
begin
  insert into perfiles (id, nombre) values (new.id, left(case when length(nombre) < 2 then 'Cliente' else nombre end, 80))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger crear_perfil after insert on auth.users for each row execute function public.crear_perfil();

-- "Lorena B." : así se firma en opiniones y preguntas (nunca el apellido completo ni el email)
create or replace function public.firma(uid uuid) returns text
language sql stable security definer
set search_path = public
as $$
  select case when position(' ' in trim(nombre)) > 0
              then split_part(trim(nombre), ' ', 1) || ' ' || left(split_part(trim(nombre), ' ', 2), 1) || '.'
              else trim(nombre) end
  from perfiles where id = uid
$$;

-- ---------------------------------------------------------------------------------------------
-- Direcciones guardadas (los campos dependen del país: los valida lib/compra/direccion.ts en el servidor)
-- ---------------------------------------------------------------------------------------------
create table public.direcciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  alias text not null check (length(alias) between 1 and 40),
  region char(2) not null check (region in ('PY', 'BR', 'AR', 'XX')),
  nombre text not null,
  telefono text not null,
  datos jsonb not null default '{}', -- ciudad, zona (barrio, UF o provincia), direccion, codigo, referencia
  predeterminada boolean not null default false,
  creado timestamptz not null default now()
);
create index on public.direcciones (usuario_id);
-- una sola predeterminada por persona
create unique index direcciones_una_predeterminada on public.direcciones (usuario_id) where predeterminada;

alter table public.direcciones enable row level security;
create policy "direcciones propias" on public.direcciones for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- Devoluciones: hasta 7 días después de recibir el producto
-- ---------------------------------------------------------------------------------------------
create table public.devoluciones (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  item_id bigint not null unique references public.pedido_items (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  motivo text not null check (motivo in ('fallado', 'distinto', 'incompleto', 'arrepentido', 'otro')),
  detalle text not null default '' check (length(detalle) <= 600),
  resolucion text not null default 'reembolso' check (resolucion in ('reembolso', 'cambio')),
  estado text not null default 'solicitada' check (estado in ('solicitada', 'aprobada', 'rechazada', 'reembolsada')),
  creado timestamptz not null default now()
);
create index on public.devoluciones (pedido_id);
alter table public.devoluciones enable row level security;
create policy "devoluciones propias o de mi tienda" on public.devoluciones for select to authenticated
  using (usuario_id = auth.uid() or vende_en_pedido(pedido_id) or es_admin());

-- ---------------------------------------------------------------------------------------------
-- Opiniones escritas por compradores: una por producto comprado y entregado, con hasta 4 fotos
-- ---------------------------------------------------------------------------------------------
alter table public.resenas add column pedido_item_id bigint unique references public.pedido_items (id) on delete set null;
alter table public.resenas add column fotos text[] not null default '{}' check (cardinality(fotos) <= 4);
create unique index resenas_una_por_persona on public.resenas (producto_id, autor_id) where autor_id is not null;

-- ¿El usuario compró este ítem, lo recibió y es suyo? (base de la "compra verificada")
create or replace function public.item_entregado(item bigint, uid uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from pedido_items i join pedidos p on p.id = i.pedido_id
                  where i.id = item and p.comprador_id = uid and p.estado = 'entregado')
$$;

-- Lo que el autor no puede elegir lo pone la base: firma, país, sello de compra verificada, variante y contadores.
create or replace function public.resena_completar() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  it pedido_items;
begin
  select * into it from pedido_items where id = new.pedido_item_id;
  new.autor_id := auth.uid();
  new.autor_nombre := coalesce(firma(auth.uid()), 'Cliente');
  new.pais := coalesce((select case when region = 'XX' then 'PY' else region end from perfiles where id = auth.uid()), 'PY');
  new.producto_id := it.producto_id;
  new.compra_verificada := true;
  new.variante := nullif((select string_agg(v, ' · ') from jsonb_each_text(it.opciones) as o(k, v)), '');
  new.util_si := 0;
  new.util_no := 0;
  new.estado := 'publicada';
  new.creado := now();
  return new;
end $$;
create trigger resena_completar before insert on public.resenas for each row
  when (current_user = 'authenticated') execute function public.resena_completar();

create policy "opinar lo que compré" on public.resenas for insert to authenticated
  with check (autor_id = auth.uid() and pedido_item_id is not null and item_entregado(pedido_item_id, auth.uid()));
create policy "editar mi opinión" on public.resenas for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());
grant insert (pedido_item_id, producto_id, autor_nombre, pais, estrellas, titulo, texto, idioma, fotos) on public.resenas to authenticated;
grant update (estrellas, titulo, texto, fotos) on public.resenas to authenticated;

-- "Me fue útil": un voto por persona y opinión, nunca a la propia
create table public.votos_resena (
  resena_id uuid not null references public.resenas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  util boolean not null,
  primary key (resena_id, usuario_id)
);
alter table public.votos_resena enable row level security;
create policy "mis votos" on public.votos_resena for select to authenticated using (usuario_id = auth.uid());
create policy "votar opiniones ajenas" on public.votos_resena for insert to authenticated
  with check (usuario_id = auth.uid() and not exists (select 1 from resenas r where r.id = resena_id and r.autor_id = auth.uid()));
create policy "cambiar mi voto" on public.votos_resena for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "quitar mi voto" on public.votos_resena for delete to authenticated using (usuario_id = auth.uid());
grant select, insert, update, delete on public.votos_resena to authenticated;

create or replace function public.votos_contar() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  -- suma y resta (no recuenta): las opiniones importadas traen sus votos de antes
  si int := (case when tg_op <> 'DELETE' and new.util then 1 else 0 end) - (case when tg_op <> 'INSERT' and old.util then 1 else 0 end);
  no int := (case when tg_op <> 'DELETE' and not new.util then 1 else 0 end) - (case when tg_op <> 'INSERT' and not old.util then 1 else 0 end);
begin
  update resenas set util_si = greatest(0, util_si + si), util_no = greatest(0, util_no + no)
   where id = coalesce(new.resena_id, old.resena_id);
  return null;
end $$;
create trigger votos_contar after insert or update or delete on public.votos_resena for each row execute function public.votos_contar();

-- ---------------------------------------------------------------------------------------------
-- Preguntas y respuestas: cualquiera con cuenta; el sello de vendedor o de comprador lo pone la base
-- ---------------------------------------------------------------------------------------------
alter table public.respuestas add column compro boolean not null default false;

create or replace function public.pregunta_completar() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (select count(*) from preguntas where autor_id = auth.uid() and creado > now() - interval '1 hour') >= 5 then
    raise exception 'limite' using hint = 'Hiciste muchas preguntas seguidas: probá de nuevo en un rato.';
  end if;
  if length(trim(new.texto)) not between 10 and 500 then
    raise exception 'largo' using hint = 'La pregunta tiene que tener entre 10 y 500 caracteres.';
  end if;
  new.autor_id := auth.uid();
  new.autor_nombre := coalesce(firma(auth.uid()), 'Cliente');
  new.estado := 'publicada';
  new.creado := now();
  return new;
end $$;
create trigger pregunta_completar before insert on public.preguntas for each row
  when (current_user = 'authenticated') execute function public.pregunta_completar();

create or replace function public.respuesta_completar() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  prod uuid := (select producto_id from preguntas where id = new.pregunta_id);
  tid uuid;
begin
  if (select count(*) from respuestas where autor_id = auth.uid() and creado > now() - interval '1 hour') >= 10 then
    raise exception 'limite' using hint = 'Respondiste muchas preguntas seguidas: probá de nuevo en un rato.';
  end if;
  if length(trim(new.texto)) not between 2 and 800 then
    raise exception 'largo' using hint = 'La respuesta tiene que tener entre 2 y 800 caracteres.';
  end if;
  -- es vendedor si tiene una tienda que vende este producto
  select t.id into tid from tiendas t join ofertas o on o.tienda_id = t.id join variantes v on v.id = o.variante_id
   where t.duenio_id = auth.uid() and v.producto_id = prod limit 1;
  new.autor_id := auth.uid();
  new.tienda_id := tid;
  new.es_vendedor := tid is not null;
  new.autor_nombre := coalesce((select nombre from tiendas where id = tid), firma(auth.uid()), 'Cliente');
  new.compro := exists (select 1 from pedido_items i join pedidos p on p.id = i.pedido_id
                         where i.producto_id = prod and p.comprador_id = auth.uid() and p.estado = 'entregado');
  new.creado := now();
  return new;
end $$;
create trigger respuesta_completar before insert on public.respuestas for each row
  when (current_user = 'authenticated') execute function public.respuesta_completar();

create policy "preguntar con cuenta" on public.preguntas for insert to authenticated with check (autor_id = auth.uid());
create policy "responder con cuenta" on public.respuestas for insert to authenticated
  with check (autor_id = auth.uid() and exists (select 1 from preguntas q where q.id = pregunta_id and q.estado = 'publicada'));
grant insert (producto_id, autor_nombre, texto, idioma) on public.preguntas to authenticated;
grant insert (pregunta_id, autor_nombre, texto) on public.respuestas to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Fotos de las opiniones (Supabase Storage). Cada persona sube solo a su carpeta: resenas/<uid>/<archivo>.webp
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resenas', 'resenas', true, 1048576, array['image/webp'])
on conflict (id) do nothing;
create policy "subir fotos a mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'resenas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "borrar mis fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'resenas' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------------------------
-- Funciones de la cuenta. Todas `security invoker`: corren como el usuario y el RLS decide.
-- ---------------------------------------------------------------------------------------------
create or replace function public.mi_cuenta(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object('id', pf.id, 'nombre', pf.nombre, 'telefono', pf.telefono, 'region', pf.region,
    'idioma', pf.idioma, 'moneda', pf.moneda, 'rol', pf.rol, 'firma', firma(pf.id),
    'pedidos', (select count(*) from pedidos where comprador_id = pf.id and estado <> 'pendiente_pago'),
    'direcciones', (select count(*) from direcciones where usuario_id = pf.id))
  from perfiles pf where pf.id = auth.uid()
$$;

create or replace function public.guardar_perfil(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
begin
  update perfiles set nombre = left(trim(p->>'nombre'), 80), telefono = nullif(trim(p->>'telefono'), ''),
    region = p->>'region', idioma = p->>'idioma', moneda = p->>'moneda'
   where id = auth.uid();
  return mi_cuenta('{}');
end $$;

-- La foto de un ítem: la primera de su variante
create or replace function public.foto_item(oferta uuid) returns text
language sql stable
set search_path = public
as $$ select v.imagenes[1] from ofertas o join variantes v on v.id = o.variante_id where o.id = oferta $$;

create or replace function public.mis_pedidos(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x->>'creado' desc), '[]') from (
    select jsonb_build_object('numero', pe.numero, 'estado', pe.estado, 'moneda', pe.moneda, 'total', pe.total, 'creado', pe.creado,
      'modo', pe.entrega->>'modo',
      'items', (select count(*) from pedido_items where pedido_id = pe.id),
      'fotos', (select coalesce(jsonb_agg(f), '[]') from (select foto_item(oferta_id) f from pedido_items where pedido_id = pe.id order by id limit 4) z),
      'devolucion', exists (select 1 from devoluciones d where d.pedido_id = pe.id)) x
    from pedidos pe where pe.comprador_id = auth.uid() and pe.estado <> 'pendiente_pago'
    order by pe.creado desc limit coalesce((p->>'limite')::int, 50)
  ) t
$$;

-- Fecha en la que se entregó (o null): de ahí corre el plazo para devolver
create or replace function public.entregado_el(pid uuid) returns timestamptz
language sql stable
set search_path = public
as $$ select max(creado) from pedido_eventos where pedido_id = pid and estado = 'entregado' $$;

create or replace function public.mi_pedido(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object('numero', pe.numero, 'estado', pe.estado, 'email', pe.email, 'region', pe.region, 'idioma', pe.idioma,
    'moneda', pe.moneda, 'cotizacion', pe.cotizacion, 'productos', pe.productos, 'envio', pe.envio, 'descuento', pe.descuento,
    'total', pe.total, 'impuestos', pe.impuestos, 'cupon', pe.cupon, 'entrega', pe.entrega, 'creado', pe.creado,
    'proveedor', pe.proveedor_pago, 'entregado', entregado_el(pe.id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'titulo', i.titulo, 'opciones', i.opciones, 'cantidad', i.cantidad,
        'precio', i.precio_unitario, 'tasa', i.tasa_impuesto, 'impuesto', i.impuesto_nombre, 'tienda', t.nombre, 'tienda_slug', t.slug,
        'slug', pr.slug, 'imagen', foto_item(i.oferta_id),
        'resena', (select jsonb_build_object('id', r.id, 'estrellas', r.estrellas) from resenas r where r.pedido_item_id = i.id),
        'devolucion', (select jsonb_build_object('estado', d.estado, 'motivo', d.motivo, 'creado', d.creado) from devoluciones d where d.item_id = i.id))
        order by i.id)
      from pedido_items i left join tiendas t on t.id = i.tienda_id left join productos pr on pr.id = i.producto_id
      where i.pedido_id = pe.id), '[]'),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('estado', e.estado, 'creado', e.creado) order by e.creado, e.id)
                           from pedido_eventos e where e.pedido_id = pe.id), '[]'))
  from pedidos pe where pe.numero = p->>'numero' and pe.comprador_id = auth.uid()
$$;

-- Lo comprado y recibido que todavía no tiene opinión
create or replace function public.por_opinar(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('item', i.id, 'titulo', i.titulo, 'opciones', i.opciones, 'slug', pr.slug,
           'imagen', foto_item(i.oferta_id), 'numero', pe.numero, 'entregado', entregado_el(pe.id)) order by pe.creado desc), '[]')
  from pedido_items i join pedidos pe on pe.id = i.pedido_id join productos pr on pr.id = i.producto_id
  where pe.comprador_id = auth.uid() and pe.estado = 'entregado'
    and not exists (select 1 from resenas r where r.producto_id = i.producto_id and r.autor_id = auth.uid())
$$;

create or replace function public.mis_resenas(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'slug', pr.slug, 'titulo_producto', txt(pr.titulo, coalesce(p->>'idioma', 'es')),
           'estrellas', r.estrellas, 'titulo', r.titulo, 'texto', r.texto, 'fotos', r.fotos, 'util', r.util_si, 'fecha', r.creado) order by r.creado desc), '[]')
  from resenas r join productos pr on pr.id = r.producto_id where r.autor_id = auth.uid()
$$;

create or replace function public.escribir_resena(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  r resenas;
begin
  if not item_entregado((p->>'item')::bigint, auth.uid()) then
    return jsonb_build_object('error', 'no_verificada');
  end if;
  if exists (select 1 from resenas x join pedido_items i on i.producto_id = x.producto_id
              where i.id = (p->>'item')::bigint and x.autor_id = auth.uid()) then
    return jsonb_build_object('error', 'ya_opinaste');
  end if;
  insert into resenas (pedido_item_id, producto_id, autor_nombre, pais, estrellas, titulo, texto, idioma, fotos)
  values ((p->>'item')::bigint, (select producto_id from pedido_items where id = (p->>'item')::bigint), '', 'PY',
          (p->>'estrellas')::smallint, trim(p->>'titulo'), trim(p->>'texto'), p->>'idioma',
          coalesce(array(select jsonb_array_elements_text(p->'fotos')), '{}'))
  returning * into r;
  return jsonb_build_object('id', r.id, 'slug', (select slug from productos where id = r.producto_id));
end $$;

-- Votar: el mismo botón dos veces quita el voto
create or replace function public.votar_resena(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  rid uuid := (p->>'resena')::uuid;
  es_util boolean := coalesce((p->>'util')::boolean, true);
  previo boolean;
begin
  if exists (select 1 from resenas where id = rid and autor_id = auth.uid()) then return jsonb_build_object('error', 'propia'); end if;
  select v.util into previo from votos_resena v where v.resena_id = rid and v.usuario_id = auth.uid();
  if previo is not distinct from es_util then
    delete from votos_resena where resena_id = rid and usuario_id = auth.uid();
  elsif previo is null then
    insert into votos_resena (resena_id, util) values (rid, es_util);
  else
    update votos_resena set util = es_util where resena_id = rid and usuario_id = auth.uid();
  end if;
  return (select jsonb_build_object('util_si', util_si, 'util_no', util_no,
            'mio', (select v.util from votos_resena v where v.resena_id = rid and v.usuario_id = auth.uid()))
          from resenas where id = rid);
end $$;

-- Mis votos en las opiniones de un producto (para marcar los botones)
create or replace function public.mis_votos(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(v.resena_id, v.util), '{}') from votos_resena v join resenas r on r.id = v.resena_id
  join productos pr on pr.id = r.producto_id where pr.slug = p->>'slug' and v.usuario_id = auth.uid()
$$;

-- Lo que la ficha necesita saber de quien la mira: si puede opinar y qué ítem usar
create or replace function public.ficha_usuario(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'votos', mis_votos(p),
    'item_para_opinar', (select i.id from pedido_items i join pedidos pe on pe.id = i.pedido_id join productos pr on pr.id = i.producto_id
                          where pr.slug = p->>'slug' and pe.comprador_id = auth.uid() and pe.estado = 'entregado'
                            and not exists (select 1 from resenas r where r.producto_id = pr.id and r.autor_id = auth.uid())
                          order by pe.creado desc limit 1),
    'opino', exists (select 1 from resenas r join productos pr on pr.id = r.producto_id where pr.slug = p->>'slug' and r.autor_id = auth.uid()))
$$;

create or replace function public.preguntar(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  q preguntas;
begin
  insert into preguntas (producto_id, autor_nombre, texto, idioma)
  values ((select id from productos where slug = p->>'slug'), '', trim(p->>'texto'), p->>'idioma')
  returning * into q;
  return jsonb_build_object('id', q.id);
end $$;

create or replace function public.responder(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  a respuestas;
begin
  insert into respuestas (pregunta_id, autor_nombre, texto) values ((p->>'pregunta')::uuid, '', trim(p->>'texto')) returning * into a;
  return jsonb_build_object('id', a.id, 'es_vendedor', a.es_vendedor);
end $$;

-- Direcciones
create or replace function public.mis_direcciones(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'alias', alias, 'region', region, 'nombre', nombre, 'telefono', telefono,
           'datos', datos, 'predeterminada', predeterminada) order by predeterminada desc, creado), '[]')
  from direcciones where usuario_id = auth.uid()
$$;

create or replace function public.guardar_direccion(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  did uuid := nullif(p->>'id', '')::uuid;
  pred boolean := coalesce((p->>'predeterminada')::boolean, false)
                  or not exists (select 1 from direcciones where usuario_id = auth.uid() and id is distinct from did);
begin
  if (select count(*) from direcciones where usuario_id = auth.uid()) >= 10 and did is null then
    return jsonb_build_object('error', 'limite');
  end if;
  if pred then update direcciones set predeterminada = false where usuario_id = auth.uid() and predeterminada; end if;
  if did is null then
    insert into direcciones (alias, region, nombre, telefono, datos, predeterminada)
    values (p->>'alias', p->>'region', p->>'nombre', p->>'telefono', p->'datos', pred) returning id into did;
  else
    update direcciones set alias = p->>'alias', region = p->>'region', nombre = p->>'nombre', telefono = p->>'telefono',
      datos = p->'datos', predeterminada = pred where id = did;
    if not found then return jsonb_build_object('error', 'no_existe'); end if;
  end if;
  return jsonb_build_object('id', did);
end $$;

create or replace function public.borrar_direccion(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  era boolean;
begin
  delete from direcciones where id = (p->>'id')::uuid returning predeterminada into era;
  -- si era la predeterminada, pasa a serlo la más vieja que quede
  if era then
    update direcciones set predeterminada = true
     where id = (select id from direcciones where usuario_id = auth.uid() order by creado limit 1);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Devolución: el ítem tiene que ser mío, estar entregado hace 7 días o menos y no tener otra devolución.
-- security definer porque además agrega el evento a la línea de tiempo del pedido (tabla sin escritura para el comprador).
create or replace function public.solicitar_devolucion(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  it pedido_items;
  pe pedidos;
  entregado timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'sin_sesion'); end if;
  select * into it from pedido_items where id = (p->>'item')::bigint;
  select * into pe from pedidos where id = it.pedido_id;
  if pe.id is null or pe.comprador_id is distinct from auth.uid() then return jsonb_build_object('error', 'no_existe'); end if;
  entregado := entregado_el(pe.id);
  if pe.estado <> 'entregado' or entregado is null then return jsonb_build_object('error', 'no_entregado'); end if;
  if entregado < now() - interval '7 days' then return jsonb_build_object('error', 'vencido'); end if;
  if exists (select 1 from devoluciones where item_id = it.id) then return jsonb_build_object('error', 'ya_pedida'); end if;
  if coalesce(p->>'motivo', '') not in ('fallado', 'distinto', 'incompleto', 'arrepentido', 'otro') then
    return jsonb_build_object('error', 'motivo');
  end if;
  insert into devoluciones (pedido_id, item_id, usuario_id, motivo, detalle, resolucion)
  values (pe.id, it.id, auth.uid(), p->>'motivo', left(coalesce(trim(p->>'detalle'), ''), 600),
          case when p->>'resolucion' = 'cambio' then 'cambio' else 'reembolso' end);
  insert into pedido_eventos (pedido_id, estado) values (pe.id, 'devolucion_solicitada');
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.solicitar_devolucion(jsonb), public.mi_cuenta(jsonb), public.guardar_perfil(jsonb),
  public.mis_pedidos(jsonb), public.mi_pedido(jsonb), public.por_opinar(jsonb), public.mis_resenas(jsonb), public.escribir_resena(jsonb),
  public.votar_resena(jsonb), public.mis_votos(jsonb), public.ficha_usuario(jsonb), public.preguntar(jsonb), public.responder(jsonb),
  public.mis_direcciones(jsonb), public.guardar_direccion(jsonb), public.borrar_direccion(jsonb) from public, anon;
grant execute on function public.solicitar_devolucion(jsonb), public.mi_cuenta(jsonb), public.guardar_perfil(jsonb),
  public.mis_pedidos(jsonb), public.mi_pedido(jsonb), public.por_opinar(jsonb), public.mis_resenas(jsonb), public.escribir_resena(jsonb),
  public.votar_resena(jsonb), public.mis_votos(jsonb), public.ficha_usuario(jsonb), public.preguntar(jsonb), public.responder(jsonb),
  public.mis_direcciones(jsonb), public.guardar_direccion(jsonb), public.borrar_direccion(jsonb) to authenticated;
revoke execute on function public.item_entregado(bigint, uuid), public.firma(uuid) from public, anon;
grant execute on function public.item_entregado(bigint, uuid), public.firma(uuid), public.foto_item(uuid), public.entregado_el(uuid) to authenticated;
grant select, insert, update, delete on public.direcciones to authenticated;
grant select on public.devoluciones to authenticated;
grant update (nombre, telefono, region, idioma, moneda) on public.perfiles to authenticated;
grant all on public.devoluciones, public.direcciones, public.votos_resena, public.resenas, public.preguntas, public.respuestas to service_role;

-- ---------------------------------------------------------------------------------------------
-- Ficha de producto completa (fase 3: fotos en las opiniones y sello de comprador en las respuestas)
-- ---------------------------------------------------------------------------------------------
create or replace function public.ficha(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  idioma text := coalesce(p->>'idioma', 'es');
  pr productos;
  cat categorias;
  padre categorias;
begin
  select * into pr from productos where slug = p->>'slug';
  if not found then return null; end if;
  select * into cat from categorias where id = pr.categoria_id;
  select * into padre from categorias where id = cat.padre_id;
  return jsonb_build_object(
    'id', pr.id, 'slug', pr.slug, 'marca', pr.marca, 'titulo', txt(pr.titulo, idioma),
    'vinetas', coalesce(pr.vinetas->idioma, pr.vinetas->'es', '[]'),
    'descripcion', txt(pr.descripcion, idioma),
    'en_caja', coalesce(pr.en_caja->idioma, pr.en_caja->'es', '[]'),
    'peso_g', pr.peso_g, 'medidas_mm', to_jsonb(pr.medidas_mm), 'garantia_meses', pr.garantia_meses,
    'condicion', pr.condicion, 'pais_origen', pr.pais_origen, 'ventas_30d', pr.ventas_30d,
    'categoria', jsonb_build_object('slug', cat.slug, 'nombre', txt(cat.nombre, idioma)),
    'categoria_padre', case when padre.id is null then null else jsonb_build_object('slug', padre.slug, 'nombre', txt(padre.nombre, idioma)) end,
    'atributos', coalesce((
      select jsonb_agg(jsonb_build_object('clave', a.clave, 'nombre', txt(a.nombre, idioma), 'unidad', a.unidad, 'tipo', a.tipo,
                                          'valor', pr.atributos->a.clave) order by a.orden)
        from (select distinct on (clave) * from atributos where categoria_id in (cat.id, padre.id) order by clave, categoria_id = cat.id desc) a
       where pr.atributos ? a.clave), '[]'),
    'variantes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'sku', v.sku, 'opciones', v.opciones, 'imagenes', to_jsonb(v.imagenes),
        'ofertas', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'precio', o.precio_usd_cent, 'precio_lista', o.precio_lista_usd_cent, 'stock', o.stock,
            'envio_gratis', o.envio_gratis, 'preparacion_h', o.preparacion_h,
            'tienda', jsonb_build_object('slug', t.slug, 'nombre', t.nombre, 'color', t.color, 'pais', t.pais, 'ciudad', t.ciudad,
                                         'recomendacion', r.recomendacion, 'opiniones', r.opiniones, 'a_tiempo', r.a_tiempo,
                                         'respuesta_min', r.respuesta_min)
          ) order by o.precio_usd_cent, o.preparacion_h)
            from ofertas o join tiendas t on t.id = o.tienda_id left join reputacion_tiendas r on r.tienda_id = t.id
           where o.variante_id = v.id and o.activa), '[]')
      ) order by v.orden)
        from variantes v where v.producto_id = pr.id), '[]'),
    'resumen', (select jsonb_build_object(
        'promedio', coalesce(round(avg(estrellas), 1), 0), 'cantidad', count(*),
        'verificadas', count(*) filter (where compra_verificada),
        'distribucion', jsonb_build_array(count(*) filter (where estrellas = 5), count(*) filter (where estrellas = 4),
                                          count(*) filter (where estrellas = 3), count(*) filter (where estrellas = 2),
                                          count(*) filter (where estrellas = 1)))
      from resenas where producto_id = pr.id and estado = 'publicada'),
    'resenas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'autor', r.autor_nombre, 'pais', r.pais, 'verificada', r.compra_verificada, 'variante', r.variante,
        'estrellas', r.estrellas, 'titulo', r.titulo, 'texto', r.texto, 'idioma', r.idioma, 'util', r.util_si, 'fecha', r.creado,
        'fotos', to_jsonb(r.fotos))
        order by cardinality(r.fotos) > 0 desc, r.util_si desc, r.creado desc)
      from (select * from resenas where producto_id = pr.id and estado = 'publicada' order by cardinality(fotos) > 0 desc, util_si desc, creado desc limit 30) r), '[]'),
    'preguntas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'autor', q.autor_nombre, 'texto', q.texto, 'idioma', q.idioma, 'fecha', q.creado,
        'respuestas', coalesce((select jsonb_agg(jsonb_build_object('autor', a.autor_nombre, 'es_vendedor', a.es_vendedor, 'compro', a.compro,
                                                                    'texto', a.texto, 'fecha', a.creado) order by a.creado)
                                  from respuestas a where a.pregunta_id = q.id), '[]')) order by q.creado desc)
      from (select * from preguntas where producto_id = pr.id and estado = 'publicada' order by creado desc limit 6) q), '[]'),
    'preguntas_total', (select count(*) from preguntas where producto_id = pr.id and estado = 'publicada'),
    'relacionados', tarjetas_json(array(
        select id from tarjetas where categoria_id = pr.categoria_id and id <> pr.id
         order by ventas_30d desc limit 8), idioma)
  );
end $$;

