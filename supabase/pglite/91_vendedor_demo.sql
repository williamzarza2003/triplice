-- Vendedor de prueba de la vista previa sin Supabase (solo PGlite: este archivo NO se aplica en Supabase).
-- Rubén Ayala, dueño de Casa Nubla (Ciudad del Este). Además del historial de 12 meses del seed, la tienda tiene
-- cuatro pedidos recién entrados (dos por preparar, uno en preparación y uno para retirar) y cuatro preguntas de hoy
-- sin responder, para recorrer el panel de punta a punta. Como en la cuenta de Lorena, las fechas se corren al día
-- cada vez que el servidor abre la base (demo_al_dia, más abajo).

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-0000000ce001', 'casa-nubla@triplice.example', '{"full_name": "Rubén Ayala"}');
update public.perfiles set rol = 'vendedor', telefono = '0973 220 118' where id = '00000000-0000-4000-8000-0000000ce001';
update public.tiendas set duenio_id = '00000000-0000-4000-8000-0000000ce001' where slug = 'casa-nubla';

do $$
declare
  tid uuid := (select id from tiendas where slug = 'casa-nubla');
  cot numeric := (select por_usd from cotizaciones where moneda = 'PYG' order by vigente_desde desc limit 1);
  ped record;
  o record;
  c record;
  pid uuid;
  v_precio bigint;
  v_envio bigint;
  v_entrega jsonb;
begin
  for ped in select * from (values
      ('TR-CN0001', interval '40 minutes', 'confirmado', 'domicilio', 0, 1),
      ('TR-CN0002', interval '95 minutes', 'confirmado', 'domicilio', 1, 2),
      ('TR-CN0003', interval '3 hours', 'preparando', 'retiro', 2, 1),
      ('TR-CN0004', interval '5 hours', 'confirmado', 'retiro', 3, 1)
    ) as x(numero, hace, estado, modo, n, cantidad)
  loop
    -- lo más vendido de la tienda con stock (uno distinto por pedido)
    select ho.oferta, ho.producto_id, ho.titulo, ho.opciones, ho.precio_usd_cent, ho.preparacion_h, ho.tasa into o
      from (select of.id as oferta, pr.id as producto_id, txt(pr.titulo, 'es') as titulo, v.opciones, of.precio_usd_cent, of.preparacion_h,
                   tasa_impuesto('PY', ca.id, ca.padre_id) as tasa, row_number() over (order by pr.ventas_30d desc, of.id) - 1 as n
              from ofertas of join variantes v on v.id = of.variante_id join productos pr on pr.id = v.producto_id
              join categorias ca on ca.id = pr.categoria_id
             where of.tienda_id = tid and of.activa and of.stock > 3 and pr.tienda_id = tid) ho
     where ho.n = ped.n;
    select u.id, u.email, u.raw_user_meta_data->>'full_name' as nombre into c
      from auth.users u where u.email = 'cliente-' || lpad((ped.n * 3 + 2)::text, 2, '0') || '@triplice.example';
    pid := gen_random_uuid();
    v_precio := round(o.precio_usd_cent * (1 + o.tasa) * cot / 100 / 1000) * 1000;
    v_envio := case when ped.modo = 'domicilio' then 25000 else 0 end;
    v_entrega := case when ped.modo = 'domicilio'
      then jsonb_build_object('modo', 'domicilio', 'zona', 'Triple frontera', 'diasMin', 1, 'diasMax', 2, 'nombre', c.nombre,
                              'direccion', (array['Calle Curupayty 412, barrio Obrero, Ciudad del Este', 'Avda. Mariscal López 2280, Hernandarias'])[ped.n + 1])
      else jsonb_build_object('modo', 'retiro', 'nombre', c.nombre, 'puntos', jsonb_build_array(jsonb_build_object(
             'tienda', 'Casa Nubla', 'nombre', 'Casa Nubla', 'direccion', 'Av. Monseñor Rodríguez 1180', 'ciudad', 'Ciudad del Este',
             'lat', -25.5097, 'lng', -54.6111, 'horario', 'Lunes a sábado de 7 a 18 h', 'listoEnH', o.preparacion_h))) end;
    insert into pedidos (id, numero, clave, comprador_id, email, region, idioma, moneda, cotizacion, productos, envio, descuento, total,
                         impuestos, entrega, estado, proveedor_pago, referencia_pago, creado)
    values (pid, ped.numero, md5(ped.numero), c.id, c.email, 'PY', 'es', 'PYG', cot, v_precio * ped.cantidad, v_envio, 0,
            v_precio * ped.cantidad + v_envio,
            jsonb_build_array(jsonb_build_object('nombre', 'IVA ' || round(o.tasa * 100) || ' %',
                                                 'monto', round(v_precio * ped.cantidad * o.tasa / (1 + o.tasa)))),
            v_entrega, ped.estado, 'simulado', 'demo-' || ped.numero, now() - ped.hace);
    insert into pedido_items (pedido_id, oferta_id, tienda_id, producto_id, titulo, opciones, cantidad, precio_unitario, tasa_impuesto,
                              impuesto_nombre, preparacion_h)
    values (pid, o.oferta, tid, o.producto_id, o.titulo, o.opciones, ped.cantidad, v_precio, o.tasa, 'IVA ' || round(o.tasa * 100) || ' %',
            greatest(o.preparacion_h, 4));
    insert into pedido_eventos (pedido_id, estado, creado) values
      (pid, 'pendiente_pago', now() - ped.hace), (pid, 'confirmado', now() - ped.hace + interval '2 minutes');
    if ped.estado = 'preparando' then
      insert into pedido_eventos (pedido_id, estado, tienda_id, creado) values (pid, 'preparando', tid, now() - ped.hace + interval '30 minutes');
    end if;
  end loop;
end $$;

-- Preguntas de hoy sobre lo que publica Casa Nubla, todavía sin responder
insert into public.preguntas (id, producto_id, autor_nombre, texto, idioma, creado)
select x.id::uuid, pr.id, x.autor, x.texto, x.idioma, now() - x.hace
  from (values
    ('00000000-0000-4000-8000-0000000ce101', 0, 'Juan R.', '¿Lo tienen en verde para retirar hoy a la tarde?', 'es', interval '2 hours'),
    ('00000000-0000-4000-8000-0000000ce102', 1, 'Ana P.', 'Vocês entregam em Santa Terezinha de Itaipu? Quanto custa o frete?', 'pt', interval '3 hours'),
    ('00000000-0000-4000-8000-0000000ce103', 2, 'Carlos M.', '¿Viene con enchufe de tres patas o de dos? Es para Encarnación.', 'es', interval '5 hours'),
    ('00000000-0000-4000-8000-0000000ce104', 3, 'Sonia V.', '¿Tiene garantía en el local o hay que mandarlo a la fábrica?', 'es', interval '26 hours')
  ) as x(id, n, autor, texto, idioma, hace)
  join (select p.id, row_number() over (order by p.ventas_30d desc, p.id) - 1 as n
          from productos p where p.tienda_id = (select id from tiendas where slug = 'casa-nubla')) pr on pr.n = x.n;

-- Las fechas de las cuentas de prueba y del historial de pedidos se corren al día cada vez que el servidor abre la
-- base (lib/datos/fuente.ts): así "hace 40 minutos" lo sigue siendo aunque el deploy tenga semanas, el gráfico de
-- ventas muestra los últimos 30 días de verdad y la reputación se calcula sobre los últimos 12 meses.
create or replace function public.demo_al_dia() returns void
language plpgsql
set search_path = public
as $$
declare
  delta interval := now() - (select armado from demo_meta);
begin
  if delta < interval '1 hour' then return; end if;
  update pedidos set creado = creado + delta;
  update pedido_eventos set creado = creado + delta;
  update devoluciones set creado = creado + delta;
  update resenas set creado = creado + delta where autor_id = '00000000-0000-4000-8000-00000000de30';
  update preguntas set creado = creado + delta where id::text like '00000000-0000-4000-8000-0000000ce1%';
  update demo_meta set armado = now();
  refresh materialized view reputacion_calculo;
end $$;
revoke execute on function public.demo_al_dia() from public, anon, authenticated;
-- lo de este archivo también cuenta para la reputación
select public.refrescar_catalogo();
