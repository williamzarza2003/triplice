-- Tríplice · fase 2: impuestos por país y categoría, envío por zona y peso, retiro en el local, cupones,
-- carrito de la cuenta y pedidos. Corre igual en Supabase y en PGlite.
-- Reglas que no se negocian (docs/arquitectura.md): el precio lo calcula el servidor, RLS en todas las tablas,
-- plata en enteros (unidad mínima de cada moneda) y el pedido congela títulos, precios, tasas y cotización.

-- ---------------------------------------------------------------------------------------------
-- Impuestos (simulación aproximada, editable por el admin en la fase 5)
-- ---------------------------------------------------------------------------------------------
create table public.reglas_impuesto (
  id smallint generated always as identity primary key,
  pais char(2) not null check (pais in ('PY', 'BR', 'AR')),
  categoria_id smallint references public.categorias (id) on delete cascade, -- nulo = tasa general del país
  nombre jsonb not null,
  tasa numeric(5, 4) not null check (tasa >= 0 and tasa < 1),
  incluido_en_precio boolean not null default true,
  desde date not null default '2026-01-01',
  hasta date,
  check (hasta is null or hasta > desde)
);
create unique index reglas_impuesto_unica on public.reglas_impuesto (pais, coalesce(categoria_id, 0), desde);

-- ---------------------------------------------------------------------------------------------
-- Envío: costo base + costo por kilo, por país y ámbito (la zona de la frontera o el resto del país)
-- ---------------------------------------------------------------------------------------------
create table public.zonas_envio (
  id smallint generated always as identity primary key,
  pais char(2) not null check (pais in ('PY', 'BR', 'AR', 'XX')),
  ambito text not null check (ambito in ('frontera', 'pais', 'mundo')),
  nombre jsonb not null,
  ciudades text[] not null default '{}', -- ciudades de la frontera, normalizadas (sin tildes, en minúscula)
  costo_base_usd_cent int not null check (costo_base_usd_cent >= 0),
  costo_kg_usd_cent int not null check (costo_kg_usd_cent >= 0),
  dias_min smallint not null,
  dias_max smallint not null check (dias_max >= dias_min),
  unique (pais, ambito)
);

-- Dónde se retira: el local de cada tienda (y los puntos que agreguen en la fase 4)
create table public.puntos_retiro (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas (id) on delete cascade,
  nombre text not null,
  direccion text not null,
  ciudad text not null,
  lat numeric(9, 6) not null,
  lng numeric(9, 6) not null,
  horario jsonb not null default '{}',
  activo boolean not null default true
);
create index on public.puntos_retiro (tienda_id);

-- ---------------------------------------------------------------------------------------------
-- Cupones: no se pueden listar (no hay política de lectura); se validan de a uno con validar_cupon()
-- ---------------------------------------------------------------------------------------------
create table public.cupones (
  codigo text primary key check (codigo ~ '^[A-Z0-9]{3,20}$'),
  tipo text not null check (tipo in ('porcentaje', 'monto')),
  valor int not null check (valor > 0), -- porcentaje (10 = 10 %) o centavos de dólar
  minimo_usd_cent int not null default 0,
  descripcion jsonb not null default '{}',
  vence timestamptz,
  usos_max int,
  usos int not null default 0,
  activo boolean not null default true,
  check (tipo <> 'porcentaje' or valor <= 90)
);

-- ---------------------------------------------------------------------------------------------
-- Carrito de la cuenta (el del invitado vive en una cookie: ver lib/compra/carrito.ts)
-- ---------------------------------------------------------------------------------------------
create table public.carritos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users (id) on delete cascade,
  cupon text,
  actualizado timestamptz not null default now()
);
create table public.carrito_items (
  carrito_id uuid not null references public.carritos (id) on delete cascade,
  oferta_id uuid not null references public.ofertas (id) on delete cascade,
  cantidad smallint not null check (cantidad between 1 and 10),
  para_despues boolean not null default false,
  agregado timestamptz not null default now(),
  primary key (carrito_id, oferta_id)
);

-- ---------------------------------------------------------------------------------------------
-- Pedidos: los crea el servidor (rol de servicio), nunca el navegador
-- ---------------------------------------------------------------------------------------------
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique check (numero ~ '^TR-[A-Z0-9]{6}$'),
  clave text not null, -- para ver el comprobante sin cuenta (va en la cookie del comprador)
  comprador_id uuid references auth.users (id) on delete set null,
  email text not null,
  region char(2) not null check (region in ('PY', 'BR', 'AR', 'XX')),
  idioma text not null check (idioma in ('es', 'pt', 'en')),
  moneda char(3) not null check (moneda in ('PYG', 'BRL', 'ARS', 'USD')),
  cotizacion numeric(14, 4) not null, -- unidades de la moneda por 1 USD, congelada
  -- montos en la unidad mínima de la moneda (₲, centavos de real, $ y centavos de dólar)
  productos bigint not null check (productos >= 0),
  envio bigint not null check (envio >= 0),
  descuento bigint not null default 0 check (descuento >= 0),
  total bigint not null check (total >= 0),
  impuestos jsonb not null default '[]',
  cupon text,
  entrega jsonb not null,
  estado text not null default 'pendiente_pago'
    check (estado in ('pendiente_pago', 'confirmado', 'preparando', 'enviado', 'listo_retiro', 'entregado', 'cancelado', 'devolucion')),
  proveedor_pago text not null check (proveedor_pago in ('stripe', 'simulado')),
  referencia_pago text unique,
  creado timestamptz not null default now(),
  check (total = productos - descuento + envio)
);
create index on public.pedidos (comprador_id);

create table public.pedido_items (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  oferta_id uuid references public.ofertas (id) on delete set null,
  tienda_id uuid references public.tiendas (id) on delete set null,
  producto_id uuid references public.productos (id) on delete set null,
  titulo text not null,
  opciones jsonb not null default '{}',
  cantidad smallint not null check (cantidad > 0),
  precio_unitario bigint not null check (precio_unitario >= 0), -- con impuestos, en la unidad mínima
  tasa_impuesto numeric(5, 4) not null,
  impuesto_nombre text not null default ''
);
create index on public.pedido_items (pedido_id);
create index on public.pedido_items (tienda_id);

create table public.pedido_eventos (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  estado text not null,
  creado timestamptz not null default now()
);
create index on public.pedido_eventos (pedido_id);

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.reglas_impuesto enable row level security;
alter table public.zonas_envio enable row level security;
alter table public.puntos_retiro enable row level security;
alter table public.cupones enable row level security;
alter table public.carritos enable row level security;
alter table public.carrito_items enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;
alter table public.pedido_eventos enable row level security;

create policy "impuestos públicos" on public.reglas_impuesto for select to anon, authenticated using (true);
create policy "admin impuestos" on public.reglas_impuesto for all to authenticated using (es_admin()) with check (es_admin());
create policy "zonas públicas" on public.zonas_envio for select to anon, authenticated using (true);
create policy "admin zonas" on public.zonas_envio for all to authenticated using (es_admin()) with check (es_admin());
create policy "puntos de tiendas aprobadas" on public.puntos_retiro for select to anon, authenticated
  using (activo and exists (select 1 from tiendas t where t.id = tienda_id and t.estado = 'aprobada'));
create policy "dueño gestiona sus puntos" on public.puntos_retiro for all to authenticated
  using (exists (select 1 from tiendas t where t.id = tienda_id and t.duenio_id = auth.uid()))
  with check (exists (select 1 from tiendas t where t.id = tienda_id and t.duenio_id = auth.uid()));
-- cupones: solo el admin los ve y los edita
create policy "admin cupones" on public.cupones for all to authenticated using (es_admin()) with check (es_admin());

create policy "carrito propio" on public.carritos for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "ítems del carrito propio" on public.carrito_items for all to authenticated
  using (exists (select 1 from carritos c where c.id = carrito_id and c.usuario_id = auth.uid()))
  with check (exists (select 1 from carritos c where c.id = carrito_id and c.usuario_id = auth.uid()));

-- el comprador ve sus pedidos; el vendedor, los que tienen ítems de su tienda; el admin, todos.
-- Nadie inserta ni edita desde el navegador: no hay políticas de escritura.
create or replace function public.vende_en_pedido(pid uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from pedido_items i join tiendas t on t.id = i.tienda_id where i.pedido_id = pid and t.duenio_id = auth.uid())
$$;
create policy "pedidos propios" on public.pedidos for select to authenticated
  using (comprador_id = auth.uid() or vende_en_pedido(id) or es_admin());
create policy "ítems de pedidos propios" on public.pedido_items for select to authenticated
  using (exists (select 1 from pedidos p where p.id = pedido_id and (p.comprador_id = auth.uid() or es_admin()))
         or exists (select 1 from tiendas t where t.id = tienda_id and t.duenio_id = auth.uid()));
create policy "eventos de pedidos propios" on public.pedido_eventos for select to authenticated
  using (exists (select 1 from pedidos p where p.id = pedido_id and (p.comprador_id = auth.uid() or vende_en_pedido(p.id) or es_admin())));

-- ---------------------------------------------------------------------------------------------
-- Funciones para la web (lectura, como anon)
-- ---------------------------------------------------------------------------------------------

-- Reglas de impuesto vigentes de los tres países, con el nombre en el idioma pedido
-- (todas juntas: la ficha las usa para la etiqueta de frontera).
create or replace function public.impuestos_vigentes(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(pais, reglas), '{}') from (
    select r.pais, jsonb_agg(jsonb_build_object('categoria', c.slug, 'nombre', txt(r.nombre, coalesce(p->>'idioma', 'es')), 'tasa', r.tasa)
                             order by r.categoria_id nulls first) reglas
      from reglas_impuesto r left join categorias c on c.id = r.categoria_id
     where r.desde <= current_date and (r.hasta is null or r.hasta > current_date)
     group by r.pais) x
$$;

-- Todo lo que el carrito y el pago necesitan de un conjunto de ofertas (precio, stock, peso, categoría,
-- tienda y sus puntos de retiro). Respeta el RLS: una oferta inactiva o de una tienda no aprobada no vuelve.
create or replace function public.compra_datos(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'oferta', o.id, 'precio', o.precio_usd_cent, 'stock', o.stock, 'envio_gratis', o.envio_gratis, 'preparacion_h', o.preparacion_h,
    'variante', jsonb_build_object('sku', v.sku, 'opciones', v.opciones, 'imagen', v.imagenes[1]),
    'producto', jsonb_build_object('id', pr.id, 'slug', pr.slug, 'titulo', txt(pr.titulo, coalesce(p->>'idioma', 'es')),
                                   'peso_g', coalesce(pr.peso_g, 500), 'categoria', c.slug, 'categoria_padre', cp.slug),
    'tienda', jsonb_build_object('id', t.id, 'slug', t.slug, 'nombre', t.nombre, 'color', t.color, 'pais', t.pais, 'ciudad', t.ciudad,
      'puntos', coalesce((select jsonb_agg(jsonb_build_object('nombre', pu.nombre, 'direccion', pu.direccion, 'ciudad', pu.ciudad,
                                                              'lat', pu.lat, 'lng', pu.lng, 'horario', txt(pu.horario, coalesce(p->>'idioma', 'es'))))
                            from puntos_retiro pu where pu.tienda_id = t.id), '[]'))
  )), '[]')
  from ofertas o
  join variantes v on v.id = o.variante_id
  join productos pr on pr.id = v.producto_id
  join categorias c on c.id = pr.categoria_id
  left join categorias cp on cp.id = c.padre_id
  join tiendas t on t.id = o.tienda_id
  where o.id in (select (jsonb_array_elements_text(p->'ofertas'))::uuid) and o.activa
$$;

create or replace function public.zonas_envio_lista(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('pais', pais, 'ambito', ambito, 'nombre', txt(nombre, coalesce(p->>'idioma', 'es')),
    'ciudades', to_jsonb(ciudades), 'base', costo_base_usd_cent, 'kg', costo_kg_usd_cent, 'dias_min', dias_min, 'dias_max', dias_max)
    order by pais, ambito), '[]')
  from zonas_envio
$$;

-- Valida un cupón sin dejar listar los demás (security definer: cupones no tiene lectura pública)
create or replace function public.validar_cupon(p jsonb) returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  c cupones;
begin
  select * into c from cupones where codigo = upper(trim(p->>'codigo'));
  if not found or not c.activo then return jsonb_build_object('error', 'no_existe'); end if;
  if c.vence is not null and c.vence < now() then return jsonb_build_object('error', 'vencido'); end if;
  if c.usos_max is not null and c.usos >= c.usos_max then return jsonb_build_object('error', 'agotado'); end if;
  return jsonb_build_object('codigo', c.codigo, 'tipo', c.tipo, 'valor', c.valor, 'minimo', c.minimo_usd_cent,
                            'descripcion', txt(c.descripcion, coalesce(p->>'idioma', 'es')));
end $$;

-- Al iniciar sesión (fase 3): el carrito del invitado se suma al de la cuenta, con la misma regla que
-- fusionar() de lib/compra/carrito.ts. Corre como el usuario: el RLS garantiza que solo toca el suyo.
create or replace function public.fusionar_carrito(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  cid uuid;
  x jsonb;
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión'; end if;
  insert into carritos (usuario_id) values (auth.uid()) on conflict (usuario_id) do update set actualizado = now() returning id into cid;
  for x in select * from jsonb_array_elements(coalesce(p->'items', '[]')) loop
    insert into carrito_items (carrito_id, oferta_id, cantidad, para_despues)
    values (cid, (x->>'o')::uuid, least(10, greatest(1, (x->>'c')::int)), coalesce((x->>'d')::int = 1, false))
    on conflict (carrito_id, oferta_id) do update
      set cantidad = least(10, carrito_items.cantidad + excluded.cantidad),
          para_despues = carrito_items.para_despues and excluded.para_despues;
  end loop;
  if p->>'cupon' is not null then update carritos set cupon = p->>'cupon' where id = cid; end if;
  return (select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object('o', oferta_id, 'c', cantidad, 'd', case when para_despues then 1 end)
                                                              order by agregado), '[]'), 'cupon', (select cupon from carritos where id = cid))
            from carrito_items where carrito_id = cid);
end $$;

-- Pedido visible con su clave (el comprador invitado la tiene en su cookie). security definer: los pedidos
-- no tienen lectura para anon.
create or replace function public.pedido_publico(p jsonb) returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('numero', pe.numero, 'estado', pe.estado, 'email', pe.email, 'region', pe.region, 'moneda', pe.moneda,
    'productos', pe.productos, 'envio', pe.envio, 'descuento', pe.descuento, 'total', pe.total, 'impuestos', pe.impuestos,
    'cupon', pe.cupon, 'entrega', pe.entrega, 'creado', pe.creado, 'proveedor', pe.proveedor_pago,
    'items', coalesce((select jsonb_agg(jsonb_build_object('titulo', i.titulo, 'opciones', i.opciones, 'cantidad', i.cantidad,
                                                           'precio', i.precio_unitario, 'tienda', t.nombre)) from pedido_items i
                         left join tiendas t on t.id = i.tienda_id where i.pedido_id = pe.id), '[]'),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('estado', e.estado, 'creado', e.creado) order by e.creado)
                           from pedido_eventos e where e.pedido_id = pe.id), '[]'))
  from pedidos pe where pe.numero = p->>'numero' and pe.clave = p->>'clave'
$$;

-- ---------------------------------------------------------------------------------------------
-- Funciones del servidor (solo rol de servicio): registrar y confirmar pedidos
-- ---------------------------------------------------------------------------------------------

-- Registra el pedido tal como se va a cobrar (todo congelado). Idempotente por número.
create or replace function public.registrar_pedido(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  pid uuid;
  x jsonb;
begin
  select id into pid from pedidos where numero = p->>'numero';
  if found then return jsonb_build_object('numero', p->>'numero', 'nuevo', false); end if;
  insert into pedidos (numero, clave, comprador_id, email, region, idioma, moneda, cotizacion, productos, envio, descuento, total,
                       impuestos, cupon, entrega, proveedor_pago)
  values (p->>'numero', p->>'clave', nullif(p->>'comprador_id', '')::uuid, p->>'email', p->>'region', p->>'idioma', p->>'moneda',
          (p->>'cotizacion')::numeric, (p->>'productos')::bigint, (p->>'envio')::bigint, (p->>'descuento')::bigint, (p->>'total')::bigint,
          coalesce(p->'impuestos', '[]'), nullif(p->>'cupon', ''), p->'entrega', p->>'proveedor')
  returning id into pid;
  for x in select * from jsonb_array_elements(p->'items') loop
    insert into pedido_items (pedido_id, oferta_id, tienda_id, producto_id, titulo, opciones, cantidad, precio_unitario, tasa_impuesto, impuesto_nombre)
    values (pid, (x->>'oferta')::uuid, (x->>'tienda_id')::uuid, (x->>'producto_id')::uuid, x->>'titulo', coalesce(x->'opciones', '{}'),
            (x->>'cantidad')::smallint, (x->>'precio')::bigint, (x->>'tasa')::numeric, coalesce(x->>'impuesto', ''));
  end loop;
  insert into pedido_eventos (pedido_id, estado) values (pid, 'pendiente_pago');
  return jsonb_build_object('numero', p->>'numero', 'nuevo', true);
end $$;

-- El pago se aprobó: el pedido pasa a confirmado, se descuenta el stock y se cuenta el uso del cupón.
-- Idempotente (Stripe puede mandar el mismo evento dos veces).
create or replace function public.confirmar_pago(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  pe pedidos;
begin
  select * into pe from pedidos where numero = p->>'numero' for update;
  if not found then return jsonb_build_object('error', 'no_existe'); end if;
  if pe.estado <> 'pendiente_pago' then return jsonb_build_object('numero', pe.numero, 'estado', pe.estado, 'nuevo', false); end if;
  update pedidos set estado = 'confirmado', referencia_pago = coalesce(p->>'referencia', referencia_pago) where id = pe.id;
  update ofertas o set stock = greatest(0, o.stock - i.cantidad) from pedido_items i where i.pedido_id = pe.id and i.oferta_id = o.id;
  if pe.cupon is not null then update cupones set usos = usos + 1 where codigo = pe.cupon; end if;
  insert into pedido_eventos (pedido_id, estado) values (pe.id, 'confirmado');
  return jsonb_build_object('numero', pe.numero, 'estado', 'confirmado', 'nuevo', true);
end $$;

revoke execute on function public.registrar_pedido(jsonb), public.confirmar_pago(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_pedido(jsonb), public.confirmar_pago(jsonb) to service_role;
revoke execute on function public.fusionar_carrito(jsonb) from public, anon;
grant execute on function public.fusionar_carrito(jsonb) to authenticated;
grant execute on function public.impuestos_vigentes(jsonb), public.compra_datos(jsonb), public.zonas_envio_lista(jsonb),
  public.validar_cupon(jsonb), public.pedido_publico(jsonb) to anon, authenticated;
grant select on public.reglas_impuesto, public.zonas_envio, public.puntos_retiro to anon, authenticated;
grant select, insert, update, delete on public.carritos, public.carrito_items to authenticated;
grant select on public.pedidos, public.pedido_items, public.pedido_eventos to authenticated;
grant all on public.pedidos, public.pedido_items, public.pedido_eventos, public.cupones, public.ofertas to service_role;
