-- Tríplice · fase 2: los precios se muestran con el impuesto de la región (incluido, como se acostumbra en
-- Paraguay, Brasil y Argentina; en "Internacional" sin impuestos locales).
-- La web aplica la tasa con lib/compra/impuestos.ts (el mismo número en la tarjeta, el carrito y el pago); para eso
-- las tarjetas traen su categoría. La búsqueda filtra, ordena y arma la faceta de precio con el precio con impuesto,
-- para que "hasta ₲ 500.000" coincida con lo que se ve en las tarjetas.
-- Reemplaza tarjetas_json, buscar y sugerir de 20261125000200_funciones.sql (mismas firmas).

-- Tasa que aplica a una categoría en un país: la de la subcategoría, si no la de la principal, si no la general.
create or replace function public.tasa_impuesto(pais text, cat smallint, padre smallint) returns numeric
language sql stable
set search_path = public
as $$
  select coalesce((
    select r.tasa from reglas_impuesto r
     where r.pais = tasa_impuesto.pais and r.desde <= current_date and (r.hasta is null or r.hasta > current_date)
       and (r.categoria_id = cat or r.categoria_id = padre or r.categoria_id is null)
     order by case when r.categoria_id = cat then 0 when r.categoria_id = padre then 1 else 2 end
     limit 1), 0)
$$;

-- Tarjetas con su categoría (para el impuesto)
create or replace function public.tarjetas_json(ids uuid[], idioma text, tienda text default null) returns jsonb
language sql stable
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'titulo', txt(t.titulo, idioma), 'marca', t.marca, 'imagen', t.imagen,
    'precio', coalesce(pt.precio, t.precio_usd_cent), 'precio_lista', case when pt.precio is null then t.precio_lista_usd_cent else pt.lista end,
    'envio_gratis', coalesce(pt.envio, t.envio_gratis),
    'tienda', case when pt.precio is null
      then jsonb_build_object('slug', t.tienda_slug, 'nombre', t.tienda_nombre, 'pais', t.tienda_pais, 'ciudad', t.tienda_ciudad)
      else jsonb_build_object('slug', pt.slug, 'nombre', pt.nombre, 'pais', pt.pais, 'ciudad', pt.ciudad) end,
    'ofertas', t.ofertas, 'stock', coalesce(pt.stock, t.stock), 'promedio', t.promedio, 'resenas', t.resenas,
    'variantes', t.variantes, 'condicion', t.condicion, 'ventas_30d', t.ventas_30d,
    'categoria', c.slug, 'categoria_padre', cp.slug
  ) order by u.orden), '[]'::jsonb)
  from unnest(ids) with ordinality as u(id, orden)
  join tarjetas t on t.id = u.id
  join categorias c on c.id = t.categoria_id
  left join categorias cp on cp.id = t.categoria_padre_id
  left join lateral (
    select o.precio_usd_cent as precio, o.precio_lista_usd_cent as lista, o.envio_gratis as envio, o.stock,
           ti.slug, ti.nombre, ti.pais, ti.ciudad
      from ofertas o join variantes v on v.id = o.variante_id join tiendas ti on ti.id = o.tienda_id
     where tienda is not null and ti.slug = tienda and v.producto_id = t.id and o.activa
     order by o.stock > 0 desc, o.precio_usd_cent limit 1
  ) pt on true
$$;

-- Búsqueda con facetas, con el precio con impuesto de la región (p.region)
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
  region text := coalesce(nullif(p->>'region', ''), 'XX');
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
    select t.*, round(t.precio_usd_cent * (1 + tasa_impuesto(region, t.categoria_id, t.categoria_padre_id))) as precio_final,
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
      ((pmin is null or b.precio_final >= pmin) and (pmax is null or b.precio_final <= pmax)) as fp,
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
       case when orden = 'precio_asc' then precio_final end asc nulls last,
       case when orden = 'precio_desc' then precio_final end desc nulls last,
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
    'items', tarjetas_json(array(select id from pagina_ids), idioma, filtro_tienda),
    'facetas', jsonb_build_object(
      'marcas', coalesce((select jsonb_agg(jsonb_build_object('valor', marca, 'n', n) order by n desc, marca)
                            from (select marca, count(*) n from marcada where fp and fe and fv and fc and fa group by marca) s), '[]'),
      'precio', (select jsonb_build_object('min', min(precio_final), 'max', max(precio_final))
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

-- Autocompletado: con las categorías del producto (para el impuesto)
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
                                                               'precio', t.precio_usd_cent, 'categoria', txt(c.nombre, idioma),
                                                               'categoria_slug', c.slug, 'categoria_padre', cp.slug) order by u.n)
                             from unnest(ids) with ordinality u(id, n) join tarjetas t on t.id = u.id join categorias c on c.id = t.categoria_id
                             left join categorias cp on cp.id = t.categoria_padre_id), '[]'),
    'categorias', coalesce((select jsonb_agg(x order by (x->>'n')::int desc) from (
        select jsonb_build_object('slug', c.slug, 'nombre', txt(c.nombre, idioma), 'n', count(*)) x
          from tarjetas t join categorias c on c.id = t.categoria_id
         where t.busqueda @@ tq
         group by c.id order by count(*) desc limit 3) s), '[]'));
end $$;

grant execute on function public.tasa_impuesto(text, smallint, smallint) to anon, authenticated;
