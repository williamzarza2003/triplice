-- Fase 5 (descubrimiento) en la cuenta de prueba de Lorena (solo PGlite: este archivo NO se aplica en Supabase).
-- - Favoritos con 3 productos y dos listas: "Para el viaje a Foz" (compartida) y "Regalos de Navidad".
-- - 6 productos vistos recientemente (aparecen en el inicio apenas entra).
-- - Dos alertas de precio: la de la cámara de acción ya se cumplió (la creó hace 9 días, cuando costaba más; hoy está
--   por debajo de su objetivo, así que al abrir la cuenta aparece el aviso) y la de los auriculares todavía no.

do $$
declare
  uid uuid := '00000000-0000-4000-8000-00000000de30';
  fav uuid;
  viaje uuid;
  regalos uuid;
  s text;
  i int := 0;
begin
  insert into listas (usuario_id, nombre, favoritos) values (uid, 'Favoritos', true) returning id into fav;
  insert into listas (usuario_id, nombre) values (uid, 'Para el viaje a Foz') returning id into viaje;
  insert into listas (usuario_id, nombre) values (uid, 'Regalos de Navidad') returning id into regalos;
  foreach s in array array['termo-de-acero-1-3-l-con-vaso-aregua', 'celular-6-7-de-gama-alta-con-triple-ondatec',
                           'auriculares-de-vincha-con-cancelacion-de-ruido-pira-sound'] loop
    insert into lista_items (lista_id, producto_id) select fav, id from productos where slug = s;
  end loop;
  foreach s in array array['camara-de-accion-4k-sumergible-con-carcasa-yvaga', 'bateria-externa-de-20-000-mah-con-carga-yvaga',
                           'sombrero-de-pescador-impermeable-yvy', 'anteojos-de-sol-redondos-con-marco-metalico-sol-de-foz'] loop
    insert into lista_items (lista_id, producto_id) select viaje, id from productos where slug = s;
  end loop;
  foreach s in array array['binoculares-10-42-a-prueba-de-dorado-outdoor', 'pulsera-inteligente-con-pantalla-amoled-ara'] loop
    insert into lista_items (lista_id, producto_id) select regalos, id from productos where slug = s;
  end loop;
  -- la del viaje ya está compartida (el disparador genera el token)
  update listas set token = 'nuevo' where id = viaje;

  foreach s in array array['celular-6-7-de-gama-alta-con-triple-ondatec', 'celular-6-5-con-bateria-de-6-000-mah-ondatec',
                           'cargador-rapido-gan-de-65-w-con-yvaga', 'auriculares-de-vincha-con-cancelacion-de-ruido-pira-sound',
                           'notebook-ultrafina-14-de-aluminio-kape', 'parlante-de-fiesta-de-120-w-con-kape'] loop
    i := i + 1;
    insert into vistos (usuario_id, producto_id, visto) select uid, id, now() - make_interval(hours => i * 5) from productos where slug = s;
  end loop;

  -- La alerta pendiente pasa por el disparador como cualquier otra: objetivo un 20 % abajo del precio de hoy
  insert into alertas_precio (usuario_id, producto_id, region, moneda, objetivo)
  select uid, t.id, 'PY', 'PYG', (round(precio_actual(t.id, 'PY', 'PYG') * 0.8 / 1000) * 1000)::bigint
    from tarjetas t where t.slug = 'auriculares-de-vincha-con-cancelacion-de-ruido-pira-sound';
end $$;

-- La alerta que ya se cumplió: se creó hace 9 días con un precio 12 % más alto que el de hoy (el disparador no deja
-- crearla con un objetivo por encima del precio actual, así que se carga sin disparadores, como un dato de ayer).
set session_replication_role = replica;
insert into public.alertas_precio (usuario_id, producto_id, region, moneda, objetivo, base_usd_cent, precio_inicial, creado)
select '00000000-0000-4000-8000-00000000de30', t.id, 'PY', 'PYG',
       (ceil(precio_actual(t.id, 'PY', 'PYG') * 1.03 / 10000) * 10000)::bigint,
       round(t.precio_usd_cent * 1.12)::bigint,
       precio_final(round(t.precio_usd_cent * 1.12)::bigint, tasa_impuesto('PY', t.categoria_id, t.categoria_padre_id), 'PYG'),
       now() - interval '9 days'
  from public.tarjetas t where t.slug = 'camara-de-accion-4k-sumergible-con-carcasa-yvaga';
set session_replication_role = origin;

-- Las fechas al día (ver 90_cuenta_demo.sql): también las de listas, vistos y alertas
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
  set local session_replication_role = replica; -- sin disparadores: solo se corren fechas
  update vistos set visto = visto + delta where usuario_id = uid;
  update listas set creado = creado + delta, actualizado = actualizado + delta,
                    compartida_desde = compartida_desde + delta where usuario_id = uid;
  update lista_items i set agregado = agregado + delta from listas l where l.id = i.lista_id and l.usuario_id = uid;
  update alertas_precio set creado = creado + delta where usuario_id = uid;
  set local session_replication_role = origin;
  update demo_meta set armado = now();
end $$;
revoke execute on function public.demo_al_dia() from public, anon, authenticated;
