-- Admin de prueba de la vista previa sin Supabase (solo PGlite: este archivo NO se aplica en Supabase).
-- Mirta Giménez, de Ciudad del Este, administra Tríplice. Para que el panel no esté vacío:
--   - dos tiendas esperando aprobación (Mate y Guampa, de Hernandarias, ya con dos productos cargados; Ótica Iguaçu,
--     de Foz, todavía sin productos) y una suspendida con su motivo;
--   - contenido denunciado por compradores: dos reseñas que son publicidad (una en español y otra en portugués), una
--     pregunta con un teléfono y una reseña denunciada sin razón (para dejarla como está);
--   - reseñas y preguntas de los últimos días para la cola de "recientes";
--   - algunas acciones en el registro.
-- Las fechas se corren al día cada vez que el servidor abre la base (demo_admin_al_dia, abajo), igual que las de
-- Lorena y Rubén.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000ad001', 'admin@triplice.example', '{"full_name": "Mirta Giménez"}'),
  ('00000000-0000-4000-8000-0000000ad002', 'mate-y-guampa@triplice.example', '{"full_name": "Celso Riveros"}');
update public.perfiles set rol = 'admin', telefono = '0961 300 742' where id = '00000000-0000-4000-8000-0000000ad001';
update public.perfiles set rol = 'vendedor' where id = '00000000-0000-4000-8000-0000000ad002';

-- Tiendas nuevas (pendientes) y una suspendida
insert into public.tiendas (id, duenio_id, slug, nombre, lema, descripcion, color, pais, ciudad, direccion, lat, lng, horario, desde, estado,
                            estado_desde, creado)
values
  ('00000000-0000-4000-8000-0000000ad101', '00000000-0000-4000-8000-0000000ad002', 'mate-y-guampa', 'Mate y Guampa',
   '{"es":"Termos, guampas y bombillas de la casa.","pt":"Garrafas, cuias e bombas da casa.","en":"Thermoses, gourds and bombillas."}',
   '{"es":"Negocio familiar de Hernandarias: termos, guampas de palo santo y bombillas de alpaca.","pt":"Negócio familiar de Hernandarias: garrafas térmicas, cuias de palo santo e bombas de alpaca.","en":"Family business from Hernandarias: thermoses, palo santo gourds and nickel-silver bombillas."}',
   '#5b4a1f', 'PY', 'Hernandarias', 'Avda. Itaipú 880', -25.4057, -54.6386,
   '{"es":"Lunes a sábado de 8 a 17 h","pt":"Segunda a sábado, das 8h às 17h","en":"Mon–Sat, 8 am to 5 pm"}', 2019, 'pendiente',
   now() - interval '2 days 3 hours', now() - interval '2 days 3 hours'),
  ('00000000-0000-4000-8000-0000000ad102', null, 'otica-iguacu', 'Ótica Iguaçu',
   '{"es":"Anteojos y lentes de sol con receta.","pt":"Óculos e óculos de sol com receita.","en":"Prescription glasses and sunglasses."}',
   '{"es":"Óptica de Foz do Iguaçu con taller propio.","pt":"Ótica de Foz do Iguaçu com laboratório próprio.","en":"Optician in Foz do Iguaçu with its own lab."}',
   '#1f4b6e', 'BR', 'Foz do Iguaçu', 'Av. Brasil 1415', -25.5427, -54.5827,
   '{"es":"Lunes a viernes de 9 a 18 h","pt":"Segunda a sexta, das 9h às 18h","en":"Mon–Fri, 9 am to 6 pm"}', 2011, 'pendiente',
   now() - interval '5 hours', now() - interval '5 hours'),
  ('00000000-0000-4000-8000-0000000ad103', null, 'importadora-parana-sur', 'Importadora Paraná Sur',
   '{"es":"Perfumes importados.","pt":"Perfumes importados.","en":"Imported perfumes."}', '{}',
   '#3d2a4f', 'PY', 'Ciudad del Este', 'Galería Mburucuyá, local 12', -25.5093, -54.6119, '{}', 2023, 'suspendida',
   now() - interval '9 days', now() - interval '40 days');
update public.tiendas set estado_motivo = 'Publicó perfumes como originales con fotos de otra tienda. Le pedimos la factura de importación el 18/11 y todavía no la mandó.'
 where slug = 'importadora-parana-sur';

-- Los dos productos de Mate y Guampa: con las fotos de un termo del catálogo (son ficticios, como todo)
do $$
declare
  tid uuid := '00000000-0000-4000-8000-0000000ad101';
  base productos;
  img text[];
  x record;
  pid uuid;
  vid uuid;
begin
  select * into base from productos where slug = 'termo-de-acero-1-l-con-manija-tacuru';
  select v.imagenes into img from variantes v where v.producto_id = base.id order by v.orden limit 1;
  for x in select * from (values
      ('termo-de-acero-1-l-con-pico-cebador-mate-y-guampa', 'Termo de acero 1 L con pico cebador', 'Garrafa de aço 1 L com bico dosador',
       'Steel thermos 1 L with pouring spout', 'MYG-TERMO-1L', 2390, 12),
      ('termo-de-acero-1-5-l-para-terere-mate-y-guampa', 'Termo de acero 1,5 L para tereré, con funda', 'Garrafa de aço 1,5 L para tereré, com capa',
       'Steel thermos 1.5 L for tereré, with sleeve', 'MYG-TERMO-15L', 2990, 7)
    ) as t(slug, es, pt, en, sku, precio, stock)
  loop
    pid := gen_random_uuid();
    vid := gen_random_uuid();
    insert into productos (id, slug, categoria_id, marca, titulo, vinetas, descripcion, atributos, peso_g, medidas_mm, garantia_meses,
                           condicion, pais_origen, en_caja, ventas_30d, creado, tienda_id)
    values (pid, x.slug, base.categoria_id, 'Mate y Guampa', jsonb_build_object('es', x.es, 'pt', x.pt, 'en', x.en), base.vinetas,
            jsonb_build_object('es', x.es || ', de Mate y Guampa (Hernandarias).', 'pt', x.pt || ', da Mate y Guampa.', 'en', x.en || ' by Mate y Guampa.'),
            base.atributos, base.peso_g, base.medidas_mm, 6, 'nuevo', 'PY', base.en_caja, 0, now() - interval '2 days', tid);
    insert into variantes (id, producto_id, sku, opciones, imagenes, orden) values (vid, pid, x.sku, '{}', img, 0);
    insert into ofertas (variante_id, tienda_id, precio_usd_cent, stock, preparacion_h) values (vid, tid, x.precio, x.stock, 24);
  end loop;
end $$;

-- El seed fecha unas 2.300 opiniones el mismo día (el día en que se generó). Para que la cola de "nuevas de la semana"
-- de la demo tenga sentido, esas se reparten en los dos meses anteriores (solo en la base embebida; en Supabase el
-- seed queda como está y esas opiniones salen solas de la ventana de 7 días).
with dia as (select creado::date as d from resenas where autor_id is null group by 1 having count(*) > 500 order by count(*) desc limit 1)
update resenas r set creado = r.creado - make_interval(days => 8 + abs(hashtext(r.id::text)) % 60)
  from dia where r.creado::date = dia.d and r.autor_id is null;

-- Contenido para moderar. Las compradoras y compradores del seed (cliente-XX@triplice.example) son los autores.
do $$
declare
  c record;
  p1 uuid := (select id from productos where slug = 'termo-de-acero-1-l-con-manija-tacuru');
  p2 uuid := (select id from productos where slug = 'perfume-floral-para-mujer-jasy');
  p3 uuid := (select id from productos where slug = 'parlante-bluetooth-sumergible-de-20-w-pira-sound');
  p4 uuid := (select id from productos where slug = 'reloj-inteligente-con-gps-kuarepoti');
  u text[] := array(select id::text from auth.users where email like 'cliente-%@triplice.example' order by email limit 12);
begin
  -- dos reseñas que son publicidad (una para cada prueba de Playwright: escritorio y celular)
  insert into resenas (id, producto_id, autor_id, autor_nombre, pais, compra_verificada, estrellas, titulo, texto, idioma, creado) values
    ('00000000-0000-4000-8000-0000000ad201', p1, u[1]::uuid, 'Ofertas C.', 'PY', false, 1, 'Más barato en mi página',
     'No compren acá: el mismo termo está más barato en @ofertas.cde.ya, escribime al WhatsApp 0981 555 123 y te lo llevo.', 'es', now() - interval '20 hours'),
    ('00000000-0000-4000-8000-0000000ad202', p3, u[2]::uuid, 'Promo F.', 'BR', false, 1, 'Compre direto comigo',
     'Vendo o mesmo parlante por metade do preço, chama no Insta @promo.foz.importados que eu entrego em Foz.', 'pt', now() - interval '30 hours'),
    -- una reseña común, denunciada como ofensiva sin razón: se deja publicada
    ('00000000-0000-4000-8000-0000000ad203', p2, u[3]::uuid, 'Nilda R.', 'PY', true, 2, 'Dura poco',
     'El aroma es lindo pero a las tres horas ya no se siente. Para el precio esperaba más.', 'es', now() - interval '3 days'),
    -- recientes, sin denuncias
    ('00000000-0000-4000-8000-0000000ad204', p4, u[4]::uuid, 'Gustavo A.', 'AR', true, 5, 'Excelente el GPS',
     'Lo usé corriendo en la costanera de Puerto Iguazú y marca bien la distancia. La batería me dura cuatro días.', 'es', now() - interval '6 hours'),
    ('00000000-0000-4000-8000-0000000ad205', p3, u[5]::uuid, 'Larissa M.', 'BR', true, 4, 'Som forte',
     'Levei para a piscina e aguentou bem. Só achei o carregamento um pouco lento.', 'pt', now() - interval '1 day 2 hours');
  insert into preguntas (id, producto_id, autor_id, autor_nombre, texto, idioma, creado) values
    ('00000000-0000-4000-8000-0000000ad301', p4, u[6]::uuid, 'Rodrigo V.', 'Vendo uno igual usado, llamame al 0975 210 334 y arreglamos el precio.', 'es', now() - interval '9 hours'),
    ('00000000-0000-4000-8000-0000000ad302', p2, u[7]::uuid, 'Carmen B.', '¿Viene con caja para regalo o solo el frasco?', 'es', now() - interval '4 hours');
  insert into denuncias (tipo, objeto_id, autor_id, motivo, detalle, creado) values
    ('resena', '00000000-0000-4000-8000-0000000ad201', u[8]::uuid, 'spam', 'Publicidad de otra página.', now() - interval '18 hours'),
    ('resena', '00000000-0000-4000-8000-0000000ad201', u[9]::uuid, 'datos_personales', null, now() - interval '12 hours'),
    ('resena', '00000000-0000-4000-8000-0000000ad202', u[10]::uuid, 'spam', 'Está vendendo por fora.', now() - interval '26 hours'),
    ('resena', '00000000-0000-4000-8000-0000000ad203', u[11]::uuid, 'ofensiva', null, now() - interval '2 days'),
    ('pregunta', '00000000-0000-4000-8000-0000000ad301', u[12]::uuid, 'datos_personales', 'Deja su teléfono para vender por fuera.', now() - interval '7 hours');
end $$;

-- Lo que ya pasó por el registro (lo escriben los disparadores cuando el cambio lo hace una sesión; acá se carga
-- directo, como historia)
insert into public.moderacion (admin_id, admin_nombre, accion, objeto_tipo, objeto_id, objeto_nombre, motivo, antes, despues, creado) values
  ('00000000-0000-4000-8000-0000000ad001', 'Mirta Giménez', 'tienda_suspendida', 'tiendas', '00000000-0000-4000-8000-0000000ad103',
   'Importadora Paraná Sur', 'Publicó perfumes como originales con fotos de otra tienda. Le pedimos la factura de importación el 18/11 y todavía no la mandó.',
   '{"estado": "aprobada"}', '{"estado": "suspendida"}', now() - interval '9 days'),
  ('00000000-0000-4000-8000-0000000ad001', 'Mirta Giménez', 'impuesto_editado', 'impuesto', '0', 'BR · Celulares y tablets',
   'Ajuste a la estimación de la Receita para celulares importados.', '{"tasa": 0.3}', '{"tasa": 0.35}', now() - interval '6 days'),
  ('00000000-0000-4000-8000-0000000ad001', 'Mirta Giménez', 'ocultar', 'resena', '00000000-0000-4000-8000-000000000000',
   'Estafadores, no compren', 'Insultos al vendedor sin contar qué pasó con la compra.', '{"estado": "publicada"}', '{"estado": "oculta"}',
   now() - interval '4 days');

-- Las fechas de esta demo se corren al día al abrir la base (lib/datos/fuente.ts), aparte de las de Lorena y Rubén:
-- así "hace 5 horas" lo sigue siendo aunque el deploy tenga semanas.
create table public.demo_admin_meta (armado timestamptz not null);
insert into public.demo_admin_meta values (now());
alter table public.demo_admin_meta enable row level security;
revoke all on public.demo_admin_meta from anon, authenticated;
create or replace function public.demo_admin_al_dia() returns void
language plpgsql
set search_path = public
as $$
declare
  delta interval := now() - (select armado from demo_admin_meta);
begin
  if delta < interval '1 hour' then return; end if;
  update tiendas set estado_desde = estado_desde + delta, creado = creado + delta where id::text like '00000000-0000-4000-8000-0000000ad1%';
  update resenas set creado = creado + delta where id::text like '00000000-0000-4000-8000-0000000ad2%';
  update preguntas set creado = creado + delta where id::text like '00000000-0000-4000-8000-0000000ad3%';
  update denuncias set creado = creado + delta;
  update moderacion set creado = creado + delta;
  update demo_admin_meta set armado = now();
end $$;
revoke execute on function public.demo_admin_al_dia() from public, anon, authenticated;
-- el promedio de las tarjetas cuenta las reseñas nuevas
select public.refrescar_catalogo();
