-- Cuenta de prueba de la vista previa sin Supabase (solo PGlite: este archivo NO se aplica en Supabase).
-- Lorena Benítez, de Hernandarias, con cuatro pedidos en distintos estados para recorrer la fase 3:
--   uno entregado hace 3 días (se puede opinar y pedir devolución), uno entregado hace 20 días (ya no se puede
--   devolver; una opinión escrita y otra pendiente), uno en camino y uno recién confirmado.
-- Las fechas se calculan al armar la base (en el build), así que el pedido "de hace 3 días" lo es el día del deploy.

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-00000000de30', 'lorena@triplice.example', '{"full_name": "Lorena Benítez"}');
update public.perfiles set telefono = '0983 412 557' where id = '00000000-0000-4000-8000-00000000de30';

insert into public.direcciones (usuario_id, alias, region, nombre, telefono, datos, predeterminada) values
  ('00000000-0000-4000-8000-00000000de30', 'Casa', 'PY', 'Lorena Benítez', '0983 412 557',
   '{"ciudad": "Hernandarias", "zona": "San Blas", "direccion": "Avda. Itaipú c/ Tte. Rojas Silva 1240", "referencia": "Portón verde, al lado de la despensa"}', true),
  ('00000000-0000-4000-8000-00000000de30', 'Trabajo', 'PY', 'Lorena Benítez', '0983 412 557',
   '{"ciudad": "Ciudad del Este", "zona": "Microcentro", "direccion": "Avda. Monseñor Rodríguez 455, piso 3", "referencia": "Galería Uniamérica, oficina 312"}', false);

do $$
declare
  uid uuid := '00000000-0000-4000-8000-00000000de30';
  cot numeric := (select por_usd from cotizaciones where moneda = 'PYG' order by vigente_desde desc limit 1);
  ped record;
  v_slug text;
  pid uuid;
  o record;
  v_subtotal bigint;
  v_envio bigint;
  v_precio bigint;
  v_imp jsonb;
  v_entrega jsonb;
begin
  for ped in select * from (values
      ('TR-K7M2QA', now() - interval '6 days', 'entregado', 'retiro', 3, array['celular-6-6-con-8-gb-de-ram-tesai', 'auriculares-inalambricos-con-estuche-de-carga-pira-sound']),
      ('TR-P9X4HD', now() - interval '26 days', 'entregado', 'domicilio', 20, array['perfume-floral-para-mujer-jasy', 'termo-de-acero-1-l-con-manija-tacuru']),
      ('TR-W3N8TB', now() - interval '2 days', 'enviado', 'domicilio', null, array['reloj-inteligente-con-gps-kuarepoti']),
      ('TR-Z5R2JC', now() - interval '3 hours', 'confirmado', 'retiro', null, array['parlante-bluetooth-sumergible-de-20-w-pira-sound'])
    ) as x(numero, creado, estado, modo, dias_entregado, slugs)
  loop
    pid := gen_random_uuid();
    v_subtotal := 0;
    v_imp := '[]';
    v_envio := case when ped.modo = 'domicilio' then 25000 else 0 end;
    v_entrega := case when ped.modo = 'domicilio'
      then jsonb_build_object('modo', 'domicilio', 'zona', 'Triple frontera', 'diasMin', 1, 'diasMax', 2, 'nombre', 'Lorena Benítez', 'telefono', '0983 412 557',
                              'direccion', 'Avda. Itaipú c/ Tte. Rojas Silva 1240, San Blas, Hernandarias, Portón verde, al lado de la despensa')
      else jsonb_build_object('modo', 'retiro', 'nombre', 'Lorena Benítez', 'telefono', '0983 412 557', 'puntos', '[]'::jsonb) end;
    insert into pedidos (id, numero, clave, comprador_id, email, region, idioma, moneda, cotizacion, productos, envio, descuento, total,
                         impuestos, entrega, estado, proveedor_pago, referencia_pago, creado)
    values (pid, ped.numero, md5(random()::text), uid, 'lorena@triplice.example', 'PY', 'es', 'PYG', cot, 0, v_envio, 0, v_envio,
            '[]', v_entrega, ped.estado, 'simulado', 'demo-' || ped.numero, ped.creado);
    foreach v_slug in array ped.slugs loop
      -- la oferta más barata con stock de la primera variante, al v_precio con IVA de Paraguay (redondeado de a mil)
      select o2.id oferta, o2.tienda_id, pr.id producto_id, txt(pr.titulo, 'es') titulo, v.opciones, o2.precio_usd_cent,
             tasa_impuesto('PY', c.id, c.padre_id) tasa, t.nombre tienda, t.id tid,
             (select jsonb_build_object('nombre', pt.nombre, 'direccion', pt.direccion, 'ciudad', pt.ciudad, 'lat', pt.lat, 'lng', pt.lng)
                from puntos_retiro pt where pt.tienda_id = t.id limit 1) punto
        into o
        from productos pr join categorias c on c.id = pr.categoria_id
        join variantes v on v.producto_id = pr.id join ofertas o2 on o2.variante_id = v.id join tiendas t on t.id = o2.tienda_id
       where pr.slug = v_slug order by v.orden, o2.precio_usd_cent limit 1;
      v_precio := round(o.precio_usd_cent * (1 + o.tasa) * cot / 100 / 1000) * 1000;
      v_subtotal := v_subtotal + v_precio;
      insert into pedido_items (pedido_id, oferta_id, tienda_id, producto_id, titulo, opciones, cantidad, precio_unitario, tasa_impuesto, impuesto_nombre)
      values (pid, o.oferta, o.tienda_id, o.producto_id, o.titulo, o.opciones, 1, v_precio, o.tasa, 'IVA ' || round(o.tasa * 100) || ' %');
      if ped.modo = 'retiro' and o.punto is not null then
        v_entrega := jsonb_set(v_entrega, '{puntos}', (v_entrega->'puntos') || jsonb_build_array(o.punto || jsonb_build_object(
          'tienda', o.tienda, 'horario', 'Lunes a sábado, de 8:00 a 18:00', 'listoEnH', 4)));
      end if;
      v_imp := v_imp || jsonb_build_array(jsonb_build_object('nombre', 'IVA ' || round(o.tasa * 100) || ' %',
                                                         'monto', round(v_precio * o.tasa / (1 + o.tasa))));
    end loop;
    -- impuestos agrupados por nombre (como el desglose del checkout)
    select jsonb_agg(jsonb_build_object('nombre', n, 'monto', m)) into v_imp
      from (select x->>'nombre' n, sum((x->>'monto')::bigint) m from jsonb_array_elements(v_imp) x group by 1 order by 1) z;
    update pedidos set productos = v_subtotal, total = v_subtotal + v_envio, impuestos = v_imp, entrega = v_entrega where id = pid;

    insert into pedido_eventos (pedido_id, estado, creado) values
      (pid, 'pendiente_pago', ped.creado), (pid, 'confirmado', ped.creado + interval '2 minutes');
    if ped.estado in ('enviado', 'entregado') then
      insert into pedido_eventos (pedido_id, estado, creado) values (pid, 'preparando', ped.creado + interval '5 hours');
      insert into pedido_eventos (pedido_id, estado, creado)
      values (pid, case when ped.modo = 'retiro' then 'listo_retiro' else 'enviado' end, ped.creado + interval '1 day');
    end if;
    if ped.estado = 'entregado' then
      insert into pedido_eventos (pedido_id, estado, creado) values (pid, 'entregado', now() - make_interval(days => ped.dias_entregado));
    end if;
  end loop;
end $$;

-- Una opinión ya escrita (el termo, del pedido de hace 20 días)
insert into public.resenas (producto_id, autor_id, autor_nombre, pais, compra_verificada, variante, estrellas, titulo, texto, idioma,
                            pedido_item_id, creado)
select i.producto_id, '00000000-0000-4000-8000-00000000de30', 'Lorena B.', 'PY', true, null, 5, 'Aguanta el hielo toda la siesta',
       'Lo cargué a las 11 con hielo y a las 4 de la tarde todavía quedaban cubitos. La manija es firme y no gotea por el pico. Lo retiré en el local en el día.',
       'es', i.id, now() - interval '18 days'
  from pedido_items i join pedidos p on p.id = i.pedido_id join productos pr on pr.id = i.producto_id
 where p.numero = 'TR-P9X4HD' and pr.slug = 'termo-de-acero-1-l-con-manija-tacuru';

-- Las fechas de la cuenta de prueba se corren al día cada vez que el servidor abre la base (lib/datos/fuente.ts):
-- así "entregado hace 3 días" lo sigue siendo aunque el deploy tenga semanas, y la devolución se puede probar.
create table public.demo_meta (armado timestamptz not null);
insert into public.demo_meta values (now());
create or replace function public.demo_al_dia() returns void
language plpgsql
set search_path = public
as $$
declare
  delta interval := now() - (select armado from demo_meta);
  uid uuid := '00000000-0000-4000-8000-00000000de30';
begin
  if delta < interval '1 hour' then return; end if;
  update pedidos set creado = creado + delta where comprador_id = uid;
  update pedido_eventos e set creado = e.creado + delta from pedidos p where p.id = e.pedido_id and p.comprador_id = uid;
  update resenas set creado = creado + delta where autor_id = uid;
  update demo_meta set armado = now();
end $$;
revoke execute on function public.demo_al_dia() from public, anon, authenticated;
