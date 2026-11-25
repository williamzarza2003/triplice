-- Tríplice · fase 1: funciones que consume la web (vía supabase.rpc o PGlite).
-- Todas reciben un solo jsonb (p) y devuelven jsonb, y son security invoker: respetan el RLS de quien llama.
-- Los textos salen en el idioma pedido (p->>'idioma'), con el español de respaldo.

create or replace function public.txt(j jsonb, idioma text) returns text
language sql immutable parallel safe
as $$ select coalesce(j->>idioma, j->>'es', j->>'pt', j->>'en') $$;

-- Tarjetas de producto en el orden de ids recibido
create or replace function public.tarjetas_json(ids uuid[], idioma text) returns jsonb
language sql stable
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'titulo', txt(t.titulo, idioma), 'marca', t.marca, 'imagen', t.imagen,
    'precio', t.precio_usd_cent, 'precio_lista', t.precio_lista_usd_cent, 'envio_gratis', t.envio_gratis,
    'tienda', jsonb_build_object('slug', t.tienda_slug, 'nombre', t.tienda_nombre, 'pais', t.tienda_pais, 'ciudad', t.tienda_ciudad),
    'ofertas', t.ofertas, 'stock', t.stock, 'promedio', t.promedio, 'resenas', t.resenas,
    'variantes', t.variantes, 'condicion', t.condicion, 'ventas_30d', t.ventas_30d
  ) order by u.orden), '[]'::jsonb)
  from unnest(ids) with ordinality as u(id, orden)
  join tarjetas t on t.id = u.id
$$;

-- Ids de la categoría pedida y de sus hijas
create or replace function public.categoria_y_hijas(slug_cat text) returns smallint[]
language sql stable
set search_path = public
as $$
  select array_agg(c.id) from categorias c
   where c.slug = slug_cat or c.padre_id = (select id from categorias where slug = slug_cat)
$$;

-- Corrige cada palabra de la búsqueda con la más parecida del catálogo ("cosina" → "cocina")
create or replace function public.corregir(q text) returns text
language sql stable
set search_path = public, extensions
as $$
  select string_agg(coalesce(
    case when exists (select 1 from vocabulario v where v.palabra like w || '%') then w end,
    (select v.palabra from vocabulario v where v.palabra % w order by similarity(v.palabra, w) desc, v.ndoc desc limit 1),
    w), ' ' order by n)
  from regexp_split_to_table(q, '[^a-z0-9]+') with ordinality as t(w, n)
  where w <> ''
$$;

create or replace function public.consulta_prefijos(q text) returns tsquery
language sql stable
as $$
  select to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & '))
  from regexp_split_to_table(q, '[^a-z0-9]+') w where w <> ''
$$;

-- ---------------------------------------------------------------------------------------------
-- Búsqueda con facetas
--   p: { q, idioma, categoria, tienda, ofertas, marcas[], precio_min, precio_max (centavos USD), estrellas,
--        envio_gratis, condicion[], atributos {clave: [valores]}, orden, pagina, por_pagina }
-- ---------------------------------------------------------------------------------------------
create or replace function public.buscar(p jsonb) returns jsonb
language plpgsql stable
set search_path = public, extensions
as $$
declare
  idioma text := coalesce(p->>'idioma', 'es');
  q text := normalizar(btrim(coalesce(p->>'q', '')));
  cat_ids smallint[] := case when nullif(p->>'categoria', '') is null then null else categoria_y_hijas(p->>'categoria') end;
  filtro_tienda text := nullif(p->>'tienda', '');
  solo_ofertas boolean := coalesce((p->>'ofertas')::boolean, false);
  marcas text[] := (select array_agg(x) from jsonb_array_elements_text(coalesce(p->'marcas', '[]')) x);
  pmin bigint := (p->>'precio_min')::bigint;
  pmax bigint := (p->>'precio_max')::bigint;
  est numeric := (p->>'estrellas')::numeric;
  envio boolean := coalesce((p->>'envio_gratis')::boolean, false);
  cond text[] := (select array_agg(x) from jsonb_array_elements_text(coalesce(p->'condicion', '[]')) x);
  attrs jsonb := coalesce(p->'atributos', '{}');
  orden text := coalesce(p->>'orden', 'relevancia');
  por_pagina int := least(greatest(coalesce((p->>'por_pagina')::int, 24), 1), 60);
  pagina int := greatest(coalesce((p->>'pagina')::int, 1), 1);
  tq tsquery;
  modo text := 'todo';
  corregido text;
  resultado jsonb;
begin
  if q <> '' then
    -- 1) coincidencia por prefijo de todas las palabras; 2) si no hay nada, la búsqueda corregida
    -- con el vocabulario del catálogo ("cosina" → "cocina"); 3) si tampoco, parecido por trigramas
    tq := consulta_prefijos(q);
    modo := 'exacto';
    if not exists (select 1 from tarjetas t where t.busqueda @@ tq and (cat_ids is null or t.categoria_id = any(cat_ids))) then
      corregido := corregir(q);
      if corregido <> q and exists (select 1 from tarjetas t where t.busqueda @@ consulta_prefijos(corregido)
                                     and (cat_ids is null or t.categoria_id = any(cat_ids))) then
        modo := 'corregido';
        tq := consulta_prefijos(corregido);
      else
        modo := 'aprox';
        corregido := null;
      end if;
    end if;
  end if;

  with base as (
    select t.*,
      case when q = '' then 0
           when modo = 'aprox' then word_similarity(q, t.texto_busqueda)
           else ts_rank_cd(t.busqueda, tq) + word_similarity(coalesce(corregido, q), t.texto_busqueda) end as rango
      from tarjetas t
     where (cat_ids is null or t.categoria_id = any(cat_ids))
       and (not solo_ofertas or t.precio_lista_usd_cent is not null)
       and (filtro_tienda is null or exists (
             select 1 from ofertas o join variantes v on v.id = o.variante_id join tiendas ti on ti.id = o.tienda_id
              where v.producto_id = t.id and ti.slug = filtro_tienda and o.activa))
       and (q = ''
            or (modo <> 'aprox' and t.busqueda @@ tq)
            or (modo = 'aprox' and word_similarity(q, t.texto_busqueda) > 0.4))
  ), marcada as (
    select b.*,
      (marcas is null or b.marca = any(marcas)) as fm,
      ((pmin is null or b.precio_usd_cent >= pmin) and (pmax is null or b.precio_usd_cent <= pmax)) as fp,
      (est is null or b.promedio >= est) as fe,
      (not envio or b.envio_gratis) as fv,
      (cond is null or b.condicion = any(cond)) as fc,
      (not exists (select 1 from jsonb_each(attrs) a(k, vals)
                    where coalesce(b.atributos->>a.k, '') not in (select jsonb_array_elements_text(a.vals)))) as fa
      from base b
  ), pagina_ids as (
    select id from marcada
     where fm and fp and fe and fv and fc and fa
     order by
       case when orden = 'precio_asc' then precio_usd_cent end asc nulls last,
       case when orden = 'precio_desc' then precio_usd_cent end desc nulls last,
       case when orden = 'novedades' then creado end desc nulls last,
       case when orden = 'vendidos' then ventas_30d end desc nulls last,
       case when orden = 'calificacion' then promedio * ln(resenas + 2) end desc nulls last,
       rango desc, ventas_30d desc, id
     limit por_pagina offset (pagina - 1) * por_pagina
  )
  select jsonb_build_object(
    'total', (select count(*) from marcada where fm and fp and fe and fv and fc and fa),
    'pagina', pagina,
    'por_pagina', por_pagina,
    'modo', modo,
    'corregido', corregido,
    'items', tarjetas_json(array(select id from pagina_ids), idioma),
    'facetas', jsonb_build_object(
      'marcas', coalesce((select jsonb_agg(jsonb_build_object('valor', marca, 'n', n) order by n desc, marca)
                            from (select marca, count(*) n from marcada where fp and fe and fv and fc and fa group by marca) s), '[]'),
      'precio', (select jsonb_build_object('min', min(precio_usd_cent), 'max', max(precio_usd_cent))
                   from marcada where fm and fe and fv and fc and fa),
      'estrellas', jsonb_build_array(
        jsonb_build_object('valor', 4, 'n', (select count(*) from marcada where fm and fp and fv and fc and fa and promedio >= 4)),
        jsonb_build_object('valor', 3, 'n', (select count(*) from marcada where fm and fp and fv and fc and fa and promedio >= 3))),
      'envio_gratis', (select count(*) from marcada where fm and fp and fe and fc and fa and envio_gratis),
      'condicion', coalesce((select jsonb_agg(jsonb_build_object('valor', condicion, 'n', n) order by n desc)
                               from (select condicion, count(*) n from marcada where fm and fp and fe and fv and fa group by condicion) s), '[]'),
      -- sin categoría elegida se agrupa por categoría principal; con categoría, por subcategoría
      'categorias', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'nombre', txt(c.nombre, idioma), 'n', s.n) order by s.n desc)
                                from (select case when cat_ids is null then coalesce(categoria_padre_id, categoria_id) else categoria_id end as cid,
                                             count(*) n
                                        from marcada where fm and fp and fe and fv and fc and fa group by 1) s
                                join categorias c on c.id = s.cid), '[]'),
      'atributos', case when cat_ids is null then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('clave', a.clave, 'nombre', txt(a.nombre, idioma), 'unidad', a.unidad, 'tipo', a.tipo,
                                            'valores', vals) order by a.orden)
          from (select distinct on (clave) * from atributos where categoria_id = any(cat_ids) and filtrable order by clave, orden) a
          cross join lateral (
            select jsonb_agg(jsonb_build_object('valor', v, 'n', n) order by n desc, v) as vals
              from (select m.atributos->>a.clave as v, count(*) n from marcada m
                     where fm and fp and fe and fv and fc and m.atributos ? a.clave
                       and (not exists (select 1 from jsonb_each(attrs - a.clave) f(k, vs)
                                         where coalesce(m.atributos->>f.k, '') not in (select jsonb_array_elements_text(f.vs))))
                     group by 1) z) vv
         where vals is not null), '[]') end
    )
  ) into resultado;
  return resultado;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Autocompletado: productos y categorías que coinciden mientras se escribe
-- ---------------------------------------------------------------------------------------------
create or replace function public.sugerir(p jsonb) returns jsonb
language plpgsql stable
set search_path = public, extensions
as $$
declare
  idioma text := coalesce(p->>'idioma', 'es');
  q text := normalizar(btrim(coalesce(p->>'q', '')));
  tq tsquery;
  ids uuid[];
  corregido text;
begin
  if length(q) < 2 then
    return jsonb_build_object('productos', '[]'::jsonb, 'categorias', '[]'::jsonb, 'corregido', null);
  end if;
  tq := consulta_prefijos(q);
  ids := array(select id from tarjetas t where t.busqueda @@ tq
                order by ts_rank_cd(t.busqueda, tq) desc, t.ventas_30d desc limit 6);
  if coalesce(array_length(ids, 1), 0) = 0 then
    corregido := corregir(q);
    if corregido <> q then
      tq := consulta_prefijos(corregido);
      ids := array(select id from tarjetas t where t.busqueda @@ tq
                    order by ts_rank_cd(t.busqueda, tq) desc, t.ventas_30d desc limit 6);
    end if;
    if coalesce(array_length(ids, 1), 0) = 0 then
      ids := array(select id from tarjetas t where word_similarity(q, t.texto_busqueda) > 0.4
                    order by word_similarity(q, t.texto_busqueda) desc, t.ventas_30d desc limit 6);
    end if;
    if corregido = q or coalesce(array_length(ids, 1), 0) = 0 then corregido := null; end if;
  end if;
  return jsonb_build_object(
    'corregido', corregido,
    'productos', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'titulo', txt(t.titulo, idioma), 'imagen', t.imagen,
                                                               'precio', t.precio_usd_cent, 'categoria', txt(c.nombre, idioma)) order by u.n)
                             from unnest(ids) with ordinality u(id, n) join tarjetas t on t.id = u.id join categorias c on c.id = t.categoria_id), '[]'),
    'categorias', coalesce((select jsonb_agg(x order by (x->>'n')::int desc) from (
        select jsonb_build_object('slug', c.slug, 'nombre', txt(c.nombre, idioma), 'n', count(*)) x
          from tarjetas t join categorias c on c.id = t.categoria_id
         where t.busqueda @@ tq
         group by c.id order by count(*) desc limit 3) s), '[]'));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Árbol de categorías con la cantidad de productos visibles
-- ---------------------------------------------------------------------------------------------
create or replace function public.categorias_arbol(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  with cuenta as (select categoria_id, count(*) n from tarjetas group by 1)
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', c.slug, 'nombre', txt(c.nombre, coalesce(p->>'idioma', 'es')), 'icono', c.icono,
    'n', (select coalesce(sum(n), 0) from cuenta where categoria_id = c.id or categoria_id in (select id from categorias h where h.padre_id = c.id)),
    'hijas', coalesce((select jsonb_agg(jsonb_build_object('slug', h.slug, 'nombre', txt(h.nombre, coalesce(p->>'idioma', 'es')),
                                                           'n', coalesce((select n from cuenta where categoria_id = h.id), 0)) order by h.orden)
                         from categorias h where h.padre_id = c.id), '[]')
  ) order by c.orden), '[]')
  from categorias c where c.padre_id is null
$$;

-- ---------------------------------------------------------------------------------------------
-- Inicio: vidrieras armadas con datos reales del catálogo
-- ---------------------------------------------------------------------------------------------
create or replace function public.inicio(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'ofertas', tarjetas_json(array(
        select id from tarjetas where precio_lista_usd_cent is not null
         order by (precio_lista_usd_cent - precio_usd_cent)::numeric / precio_lista_usd_cent desc, ventas_30d desc limit 12), coalesce(p->>'idioma', 'es')),
    'vendidos', tarjetas_json(array(select id from tarjetas order by ventas_30d desc limit 12), coalesce(p->>'idioma', 'es')),
    'novedades', tarjetas_json(array(select id from tarjetas order by creado desc limit 12), coalesce(p->>'idioma', 'es')),
    'cerca', tarjetas_json(array(
        select id from tarjetas where tienda_pais = coalesce(nullif(p->>'region', 'XX'), 'PY')
         order by promedio * ln(resenas + 2) desc limit 12), coalesce(p->>'idioma', 'es')),
    'tiendas', (select coalesce(jsonb_agg(x order by (x->>'ventas_12m')::int desc), '[]') from (
        select jsonb_build_object('slug', t.slug, 'nombre', t.nombre, 'color', t.color, 'pais', t.pais, 'ciudad', t.ciudad,
                                  'lema', txt(t.lema, coalesce(p->>'idioma', 'es')),
                                  'recomendacion', r.recomendacion, 'ventas_12m', r.ventas_12m) x
          from tiendas t join reputacion_tiendas r on r.tienda_id = t.id
         order by r.ventas_12m desc limit 8) s)
  )
$$;

-- ---------------------------------------------------------------------------------------------
-- Ficha de producto completa
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
          ) order by o.precio_usd_cent)
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
        'estrellas', r.estrellas, 'titulo', r.titulo, 'texto', r.texto, 'idioma', r.idioma, 'util', r.util_si, 'fecha', r.creado)
        order by r.util_si desc, r.creado desc)
      from (select * from resenas where producto_id = pr.id and estado = 'publicada' order by util_si desc, creado desc limit 30) r), '[]'),
    'preguntas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'autor', q.autor_nombre, 'texto', q.texto, 'idioma', q.idioma, 'fecha', q.creado,
        'respuestas', coalesce((select jsonb_agg(jsonb_build_object('autor', a.autor_nombre, 'es_vendedor', a.es_vendedor,
                                                                    'texto', a.texto, 'fecha', a.creado) order by a.creado)
                                  from respuestas a where a.pregunta_id = q.id), '[]')) order by q.creado desc)
      from (select * from preguntas where producto_id = pr.id and estado = 'publicada' order by creado desc limit 6) q), '[]'),
    'preguntas_total', (select count(*) from preguntas where producto_id = pr.id and estado = 'publicada'),
    'relacionados', tarjetas_json(array(
        select id from tarjetas where categoria_id = pr.categoria_id and id <> pr.id
         order by ventas_30d desc limit 8), idioma)
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- Página pública de la tienda (los productos salen de buscar con p.tienda)
-- ---------------------------------------------------------------------------------------------
create or replace function public.tienda(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'slug', t.slug, 'nombre', t.nombre, 'color', t.color, 'pais', t.pais, 'ciudad', t.ciudad, 'direccion', t.direccion,
    'lat', t.lat, 'lng', t.lng, 'horario', t.horario, 'desde', t.desde,
    'lema', txt(t.lema, coalesce(p->>'idioma', 'es')), 'descripcion', txt(t.descripcion, coalesce(p->>'idioma', 'es')),
    'reputacion', (select to_jsonb(r) - 'tienda_id' from reputacion_tiendas r where r.tienda_id = t.id),
    'productos', (select count(distinct v.producto_id) from ofertas o join variantes v on v.id = o.variante_id
                   where o.tienda_id = t.id and o.activa),
    'resenas', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('autor', r.autor_nombre, 'pais', r.pais, 'estrellas', r.estrellas, 'texto', r.texto,
                                  'idioma', r.idioma, 'producto', txt(pr.titulo, coalesce(p->>'idioma', 'es')), 'slug', pr.slug) x
          from resenas r join productos pr on pr.id = r.producto_id
         where r.estado = 'publicada' and r.estrellas >= 4 and exists (
               select 1 from ofertas o join variantes v on v.id = o.variante_id where v.producto_id = pr.id and o.tienda_id = t.id)
         order by r.util_si desc, r.creado desc limit 4) s), '[]')
  )
  from tiendas t where t.slug = p->>'slug'
$$;

create or replace function public.tiendas_lista(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$ select coalesce(jsonb_agg(t.slug order by t.slug), '[]') from tiendas t $$;

create or replace function public.productos_slugs(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$ select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'creado', creado) order by ventas_30d desc), '[]') from tarjetas $$;

create or replace function public.cotizaciones_vigentes(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object('tasas', coalesce(jsonb_object_agg(moneda, por_usd), '{}'), 'desde', max(vigente_desde))
  from (select distinct on (moneda) moneda, por_usd, vigente_desde from cotizaciones order by moneda, vigente_desde desc) c
$$;

grant execute on function public.buscar(jsonb), public.sugerir(jsonb), public.categorias_arbol(jsonb), public.inicio(jsonb),
  public.ficha(jsonb), public.tienda(jsonb), public.tiendas_lista(jsonb), public.productos_slugs(jsonb),
  public.cotizaciones_vigentes(jsonb) to anon, authenticated;
grant select on public.vocabulario to anon, authenticated;
