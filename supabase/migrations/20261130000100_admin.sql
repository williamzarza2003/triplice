-- Tríplice · fase 5: administración. Corre igual en Supabase y en PGlite.
-- Qué agrega:
--   1. Tiendas: aprobar, suspender (con un motivo que la tienda ve en su panel) y reactivar; dar de alta a un vendedor
--      (una cuenta por email + una tienda existente o nueva). Lo que antes eran dos `update` a mano (docs/supabase.md §5).
--   2. Moderación: reseñas, preguntas y respuestas se ocultan o se vuelven a publicar con motivo; los compradores
--      denuncian (una denuncia por cuenta y por contenido, 10 por hora). Ocultar una reseña la saca de la ficha y del
--      promedio (las funciones públicas ya filtran estado = 'publicada'; las tarjetas se refrescan).
--   3. Categorías y atributos: alta, edición, orden y baja, sin poder borrar ni romper lo que está en uso.
--   4. Reglas de impuesto por país y categoría, editables.
--   5. Cotizaciones cargadas a mano o traídas de Cambio CDE (el servidor las lee y las convierte: lib/admin/).
--   6. Registro de auditoría (`moderacion`): quién hizo qué, cuándo y por qué. Lo escriben disparadores, no las
--      sesiones: ni un admin puede borrar o inventar un renglón.
--
-- Reglas de esta migración (docs/seguridad.md):
--   - Toda función de admin empieza con es_admin() y devuelve {error: 'no_admin'} si no lo es.
--   - security invoker con políticas RLS de admin; security definer solo donde hace falta leer algo que ninguna sesión
--     lee (auth.users, reputacion_calculo), refrescar vistas materializadas o escribir el registro. Cada una dice por qué.
--   - Lo que una sesión escribe tiene su grant por columna (la fase 4 quitó toda escritura y la volvió a dar de a una).
--   - Lo que se valida en el servidor se valida también acá, con disparadores: con la clave pública de Supabase se
--     puede escribir directo en las tablas sin pasar por la web.

-- ---------------------------------------------------------------------------------------------
-- 1. Datos nuevos
-- ---------------------------------------------------------------------------------------------

-- Tiendas: por qué está suspendida (lo ve el dueño en su panel) y desde cuándo está en ese estado
alter table public.tiendas add column estado_motivo text check (estado_motivo is null or length(estado_motivo) <= 400),
  add column estado_desde timestamptz not null default now();
create index on public.tiendas (estado);

-- Moderación de contenido: 'oculta' es lo que decide un admin (las de antes, pendiente y rechazada, quedan por compatibilidad)
alter table public.resenas drop constraint resenas_estado_check;
alter table public.resenas add constraint resenas_estado_check check (estado in ('pendiente', 'publicada', 'rechazada', 'oculta')),
  add column moderacion_motivo text check (moderacion_motivo is null or length(moderacion_motivo) <= 400);
alter table public.preguntas drop constraint preguntas_estado_check;
alter table public.preguntas add constraint preguntas_estado_check check (estado in ('pendiente', 'publicada', 'rechazada', 'oculta')),
  add column moderacion_motivo text check (moderacion_motivo is null or length(moderacion_motivo) <= 400);
alter table public.respuestas add column estado text not null default 'publicada' check (estado in ('publicada', 'oculta')),
  add column moderacion_motivo text check (moderacion_motivo is null or length(moderacion_motivo) <= 400);
create index on public.resenas (creado desc);
create index on public.respuestas (creado desc);

-- Denuncias de los compradores. Una por cuenta y por contenido; se resuelven al moderar.
create table public.denuncias (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('resena', 'pregunta', 'respuesta')),
  objeto_id uuid not null,
  autor_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  motivo text not null check (motivo in ('ofensiva', 'spam', 'datos_personales', 'no_es_del_producto', 'otro')),
  detalle text check (detalle is null or length(detalle) <= 300),
  creado timestamptz not null default now(),
  resuelta_el timestamptz,
  resolucion text check (resolucion is null or resolucion in ('oculta', 'sin_cambios')),
  unique (tipo, objeto_id, autor_id)
);
create index denuncias_abiertas on public.denuncias (tipo, objeto_id) where resuelta_el is null;
create index on public.denuncias (autor_id, creado desc);

-- Registro de auditoría. Solo lo leen los admins y solo lo escriben los disparadores de abajo (auditar()).
create table public.moderacion (
  id bigint generated always as identity primary key,
  admin_id uuid references public.perfiles (id) on delete set null,
  admin_nombre text not null,
  accion text not null,
  objeto_tipo text not null,
  objeto_id text not null,
  objeto_nombre text,
  motivo text,
  antes jsonb,
  despues jsonb,
  creado timestamptz not null default now()
);
create index on public.moderacion (creado desc);
create index on public.moderacion (objeto_tipo, objeto_id);

alter table public.denuncias enable row level security;
alter table public.moderacion enable row level security;

-- ---------------------------------------------------------------------------------------------
-- 2. Validaciones en la base (disparadores). Solo para lo que escribe una sesión: el seed y las migraciones cargan
--    datos ya revisados. Los mensajes van en la pista (hint), en español; la web muestra el suyo en cada idioma.
-- ---------------------------------------------------------------------------------------------

-- ¿Es un jsonb {es, pt, en} con los tres textos de largo razonable?
create or replace function public.nombre_tres_idiomas(j jsonb, minimo int, maximo int) returns boolean
language sql immutable parallel safe
as $$
  select jsonb_typeof(j) = 'object'
     and (select bool_and(jsonb_typeof(j->i) = 'string' and length(btrim(j->>i)) between minimo and maximo)
            from unnest(array['es', 'pt', 'en']) i)
     and (select count(*) from jsonb_object_keys(j)) = 3
$$;

-- Tiendas: solo un admin cambia el estado, el motivo o el dueño (el dueño edita el resto de sus datos con la política
-- de la fase 1). Suspender pide un motivo que la tienda pueda entender. El dueño nuevo tiene que tener perfil de vendedor.
create or replace function public.tiendas_admin_validar() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.estado is distinct from old.estado or new.estado_motivo is distinct from old.estado_motivo
     or new.duenio_id is distinct from old.duenio_id then
    if not es_admin() then
      raise exception 'solo_admin' using hint = 'Solo un admin cambia el estado o el dueño de una tienda.';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(new.slug) not between 3 and 60 then
      raise exception 'slug' using hint = 'La dirección de la tienda va en minúsculas, sin tildes ni espacios (por ejemplo, casa-nubla).';
    end if;
    if new.desde not between 1950 and extract(year from now())::int then
      raise exception 'desde' using hint = 'El año de apertura tiene que estar entre 1950 y este año.';
    end if;
  end if;
  if length(btrim(new.nombre)) not between 2 and 60 or length(btrim(new.ciudad)) not between 2 and 60 then
    raise exception 'nombre' using hint = 'El nombre y la ciudad de la tienda tienen que tener entre 2 y 60 caracteres.';
  end if;
  if new.estado = 'suspendida' and (tg_op = 'INSERT' or old.estado <> 'suspendida')
     and length(btrim(coalesce(new.estado_motivo, ''))) < 10 then
    raise exception 'motivo' using hint = 'Para suspender una tienda escribí el motivo (al menos 10 caracteres): la tienda lo ve en su panel.';
  end if;
  if new.duenio_id is not null and (tg_op = 'INSERT' or new.duenio_id is distinct from old.duenio_id)
     and not exists (select 1 from perfiles where id = new.duenio_id and rol in ('vendedor', 'admin')) then
    raise exception 'duenio_rol' using hint = 'La cuenta nueva dueña de la tienda tiene que tener perfil de vendedor.';
  end if;
  if tg_op = 'INSERT' or new.estado is distinct from old.estado then
    new.estado_desde := now();
  end if;
  return new;
end $$;
create trigger tiendas_admin_validar before insert or update on public.tiendas for each row
  when (current_user = 'authenticated') execute function public.tiendas_admin_validar();

-- Perfiles: el rol lo cambia solo un admin, nunca el suyo propio (así nadie se saca el rol a sí mismo), y nunca de
-- forma que el sitio quede sin admins. Un admin cambia el rol de otra cuenta, no sus datos personales.
create or replace function public.perfiles_rol_validar() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> auth.uid() and (new.nombre, new.telefono, new.region, new.idioma, new.moneda)
                              is distinct from (old.nombre, old.telefono, old.region, old.idioma, old.moneda) then
    raise exception 'solo_rol' using hint = 'Un admin cambia el rol de otra cuenta, no sus datos personales.';
  end if;
  if new.rol is distinct from old.rol then
    if not es_admin() then
      raise exception 'solo_admin' using hint = 'Solo un admin cambia el rol de una cuenta.';
    end if;
    if new.id = auth.uid() then
      raise exception 'rol_propio' using hint = 'No podés cambiar tu propio rol: pedíselo a otro admin.';
    end if;
    if old.rol = 'admin' then
      -- bloquea a los admins mientras se cuenta: si dos admins se sacan el rol a la vez, el segundo espera y ve al primero
      perform 1 from perfiles where rol = 'admin' for update;
      if not exists (select 1 from perfiles where rol = 'admin' and id <> new.id) then
        raise exception 'ultimo_admin' using hint = 'Es el único admin: el sitio no puede quedar sin admins.';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger perfiles_rol_validar before update on public.perfiles for each row
  when (current_user = 'authenticated') execute function public.perfiles_rol_validar();

-- Moderación de contenido: solo un admin cambia el estado de una reseña, pregunta o respuesta (el autor edita su
-- texto, no la vuelve a publicar), siempre con motivo, y solo entre publicada y oculta.
create or replace function public.moderacion_validar() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado or new.moderacion_motivo is distinct from old.moderacion_motivo then
    if not es_admin() then
      raise exception 'solo_admin' using hint = 'Solo un admin oculta o vuelve a publicar contenido.';
    end if;
    if new.estado not in ('publicada', 'oculta') then
      raise exception 'estado' using hint = 'El contenido queda publicado u oculto.';
    end if;
    if length(btrim(coalesce(new.moderacion_motivo, ''))) < 3 then
      raise exception 'motivo' using hint = 'Elegí o escribí el motivo: queda en el registro.';
    end if;
  end if;
  return new;
end $$;
create trigger resenas_moderacion_validar before update on public.resenas for each row
  when (current_user = 'authenticated') execute function public.moderacion_validar();
create trigger preguntas_moderacion_validar before update on public.preguntas for each row
  when (current_user = 'authenticated') execute function public.moderacion_validar();
create trigger respuestas_moderacion_validar before update on public.respuestas for each row
  when (current_user = 'authenticated') execute function public.moderacion_validar();

-- Denuncias: las pone la base (quién y cuándo), no el cliente. Hasta 10 por hora; no se denuncia lo propio ni lo que
-- no está publicado (corre como quien denuncia: solo ve lo publicado y lo suyo).
create or replace function public.denuncia_validar() returns trigger
language plpgsql
set search_path = public
as $$
declare
  autor uuid;
begin
  if (select count(*) from denuncias where autor_id = auth.uid() and creado > now() - interval '1 hour') >= 10 then
    raise exception 'limite' using hint = 'Mandaste muchas denuncias seguidas: probá de nuevo en un rato.';
  end if;
  autor := case new.tipo
    when 'resena' then (select autor_id from resenas where id = new.objeto_id and estado = 'publicada')
    when 'pregunta' then (select autor_id from preguntas where id = new.objeto_id and estado = 'publicada')
    else (select a.autor_id from respuestas a where a.id = new.objeto_id and a.estado = 'publicada') end;
  if autor is null and not exists (
       select 1 from resenas where new.tipo = 'resena' and id = new.objeto_id and estado = 'publicada'
       union all select 1 from preguntas where new.tipo = 'pregunta' and id = new.objeto_id and estado = 'publicada'
       union all select 1 from respuestas where new.tipo = 'respuesta' and id = new.objeto_id and estado = 'publicada') then
    raise exception 'no_existe' using hint = 'Ese contenido ya no está publicado.';
  end if;
  if autor = auth.uid() then
    raise exception 'propia' using hint = 'No podés denunciar algo que escribiste vos.';
  end if;
  if new.detalle is not null and length(btrim(new.detalle)) = 0 then new.detalle := null; end if;
  new.autor_id := auth.uid();
  new.creado := now();
  new.resuelta_el := null;
  new.resolucion := null;
  return new;
end $$;
create trigger denuncia_validar before insert on public.denuncias for each row
  when (current_user = 'authenticated') execute function public.denuncia_validar();

-- Categorías: nombre en los tres idiomas, dos niveles como máximo (principal → subcategoría) y la dirección (slug)
-- no cambia si hay productos (sus enlaces dejarían de andar).
create or replace function public.categorias_validar() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from productos where categoria_id = old.id) then
      raise exception 'en_uso' using hint = format('Tiene %s productos: movelos a otra categoría antes de borrarla.',
                                                 (select count(*) from productos where categoria_id = old.id));
    end if;
    if exists (select 1 from categorias where padre_id = old.id) then
      raise exception 'en_uso' using hint = 'Tiene subcategorías: borralas o movelas primero.';
    end if;
    if exists (select 1 from reglas_impuesto where categoria_id = old.id) then
      raise exception 'en_uso' using hint = 'Tiene una regla de impuesto propia: borrala primero en Impuestos.';
    end if;
    return old;
  end if;
  if new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(new.slug) not between 2 and 60 then
    raise exception 'slug' using hint = 'La dirección va en minúsculas, sin tildes ni espacios (por ejemplo, cafeteras).';
  end if;
  if not nombre_tres_idiomas(new.nombre, 2, 60) then
    raise exception 'nombre' using hint = 'El nombre va en español, portugués e inglés, de 2 a 60 caracteres cada uno.';
  end if;
  if new.icono is not null and new.icono !~ '^[a-z]{2,20}$' then
    raise exception 'icono' using hint = 'El ícono es una palabra en minúsculas.';
  end if;
  if new.orden not between 0 and 999 then
    raise exception 'orden' using hint = 'El orden va de 0 a 999.';
  end if;
  if new.padre_id is not null then
    if tg_op = 'UPDATE' and new.padre_id = new.id then
      raise exception 'padre' using hint = 'Una categoría no puede estar dentro de sí misma.';
    end if;
    if (select padre_id from categorias where id = new.padre_id) is not null then
      raise exception 'padre' using hint = 'La categoría padre tiene que ser una principal: el catálogo tiene dos niveles.';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from categorias where padre_id = new.id) then
      raise exception 'padre' using hint = 'Esta categoría tiene subcategorías: no puede pasar a ser subcategoría.';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.slug <> old.slug or new.padre_id is distinct from old.padre_id)
     and exists (select 1 from productos where categoria_id = new.id) then
    raise exception 'en_uso' using hint = 'Tiene productos: su dirección y su categoría padre no cambian (los enlaces y los impuestos dependen de eso).';
  end if;
  return new;
end $$;
create trigger categorias_validar before insert or update or delete on public.categorias for each row
  when (current_user = 'authenticated') execute function public.categorias_validar();

-- ¿Cuántos productos usan este atributo? (los de la categoría y de sus subcategorías que tienen la clave)
create or replace function public.atributo_en_uso(cat smallint, k text) returns int
language sql stable
set search_path = public
as $$
  select count(*)::int from productos p
   where p.categoria_id in (select id from categorias where id = cat or padre_id = cat) and p.atributos ? k
$$;

-- Atributos: clave, nombre en tres idiomas, tipo y opciones coherentes; la clave, el tipo y la categoría no cambian ni
-- se borra el atributo si hay productos que lo usan.
create or replace function public.atributos_validar() returns trigger
language plpgsql
set search_path = public
as $$
declare
  usos int;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    usos := atributo_en_uso(old.categoria_id, old.clave);
  end if;
  if tg_op = 'DELETE' then
    if usos > 0 then
      raise exception 'en_uso' using hint = format('%s productos tienen cargado este dato: no se puede borrar.', usos);
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and usos > 0 and (new.clave <> old.clave or new.tipo <> old.tipo or new.categoria_id <> old.categoria_id) then
    raise exception 'en_uso' using hint = format('%s productos tienen cargado este dato: la clave, el tipo y la categoría no cambian.', usos);
  end if;
  if new.clave !~ '^[a-z][a-z0-9_]{1,30}$' then
    raise exception 'clave' using hint = 'La clave va en minúsculas, sin espacios ni tildes (por ejemplo, potencia_w).';
  end if;
  if not nombre_tres_idiomas(new.nombre, 2, 40) then
    raise exception 'nombre' using hint = 'El nombre va en español, portugués e inglés, de 2 a 40 caracteres cada uno.';
  end if;
  if new.unidad is not null and length(new.unidad) not between 1 and 12 then
    raise exception 'unidad' using hint = 'La unidad tiene hasta 12 caracteres (W, kg, mAh).';
  end if;
  if new.tipo = 'opcion' then
    if jsonb_typeof(new.opciones) <> 'array' or jsonb_array_length(new.opciones) not between 2 and 40
       or exists (select 1 from jsonb_array_elements(new.opciones) o where jsonb_typeof(o) <> 'string' or length(o #>> '{}') not between 1 and 40)
       or (select count(distinct o #>> '{}') from jsonb_array_elements(new.opciones) o) <> jsonb_array_length(new.opciones) then
      raise exception 'opciones' using hint = 'Un dato de tipo opción necesita entre 2 y 40 opciones distintas, de hasta 40 caracteres.';
    end if;
  else
    new.opciones := null;
  end if;
  if new.orden not between 0 and 999 then
    raise exception 'orden' using hint = 'El orden va de 0 a 999.';
  end if;
  return new;
end $$;
create trigger atributos_validar before insert or update or delete on public.atributos for each row
  when (current_user = 'authenticated') execute function public.atributos_validar();

-- Reglas de impuesto: nombre en tres idiomas, una tasa razonable y la general de cada país no se borra
create or replace function public.reglas_impuesto_validar() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.categoria_id is null then
      raise exception 'general' using hint = 'La tasa general del país no se borra: cambiale el porcentaje.';
    end if;
    return old;
  end if;
  if not nombre_tres_idiomas(new.nombre, 2, 40) then
    raise exception 'nombre' using hint = 'El nombre va en español, portugués e inglés (por ejemplo, «IVA 10 %»).';
  end if;
  if new.tasa < 0 or new.tasa > 0.6 then
    raise exception 'tasa' using hint = 'La tasa va de 0 % a 60 %.';
  end if;
  return new;
end $$;
create trigger reglas_impuesto_validar before insert or update or delete on public.reglas_impuesto for each row
  when (current_user = 'authenticated') execute function public.reglas_impuesto_validar();

-- Cotizaciones: valores dentro de un rango posible para cada moneda (un cero de más se frena acá) y vigentes desde
-- ahora (la sesión no elige la fecha: el historial no se reescribe).
create or replace function public.cotizaciones_validar() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.moneda = 'PYG' and new.por_usd not between 1000 and 100000)
     or (new.moneda = 'BRL' and new.por_usd not between 0.5 and 50)
     or (new.moneda = 'ARS' and new.por_usd not between 10 and 100000) then
    raise exception 'rango' using hint = 'Ese valor no es posible para esa moneda: revisá que no sobre ni falte un cero.';
  end if;
  if new.fuente not in ('manual', 'cambio-cde') then
    raise exception 'fuente' using hint = 'La cotización es manual o de Cambio CDE.';
  end if;
  new.vigente_desde := now();
  return new;
end $$;
create trigger cotizaciones_validar before insert on public.cotizaciones for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.cotizaciones_validar();

-- ---------------------------------------------------------------------------------------------
-- 3. Registro de auditoría
-- ---------------------------------------------------------------------------------------------
-- security definer: escribe en `moderacion`, que ninguna sesión puede escribir (ni los admins). Así el registro no se
-- borra ni se inventa: cada renglón lo pone la base cuando cambia algo, con el id de quien hizo el cambio.
-- Solo registra lo que hace una sesión o el rol de servicio (el seed y las migraciones no cuentan): lo decide el `when`
-- de cada disparador, que se evalúa como quien escribe (adentro de esta función current_user ya es el dueño).
create or replace function public.auditar() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  quien uuid := auth.uid();
  v_accion text;
  v_tipo text := tg_table_name;
  v_oid text;
  v_nombre text;
  v_motivo text;
  v_antes jsonb;
  v_despues jsonb;
  fila jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  vieja jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  v_oid := fila->>'id';
  if tg_table_name = 'tiendas' then
    v_nombre := fila->>'nombre';
    if tg_op = 'INSERT' then v_accion := 'tienda_creada';
    elsif (vieja->>'estado') is distinct from (fila->>'estado') then v_accion := 'tienda_' || (fila->>'estado');
    elsif (vieja->>'duenio_id') is distinct from (fila->>'duenio_id') then v_accion := 'tienda_duenio';
    else return null; end if;
    v_motivo := fila->>'estado_motivo';
    v_antes := case when vieja is null then null else jsonb_build_object('estado', vieja->'estado', 'duenio_id', vieja->'duenio_id') end;
    v_despues := jsonb_build_object('estado', fila->'estado', 'duenio_id', fila->'duenio_id');
  elsif tg_table_name = 'perfiles' then
    if (vieja->>'rol') is not distinct from (fila->>'rol') then return null; end if;
    v_tipo := 'cuenta'; v_accion := 'rol_' || (fila->>'rol'); v_nombre := fila->>'nombre';
    v_antes := jsonb_build_object('rol', vieja->'rol'); v_despues := jsonb_build_object('rol', fila->'rol');
  elsif tg_table_name in ('resenas', 'preguntas', 'respuestas') then
    if (vieja->>'estado') is not distinct from (fila->>'estado') then return null; end if;
    v_tipo := case tg_table_name when 'resenas' then 'resena' when 'preguntas' then 'pregunta' else 'respuesta' end;
    v_accion := case when fila->>'estado' = 'oculta' then 'ocultar' else 'publicar' end;
    v_nombre := left(coalesce(nullif(fila->>'titulo', ''), fila->>'texto'), 90);
    v_motivo := fila->>'moderacion_motivo';
    v_antes := jsonb_build_object('estado', vieja->'estado'); v_despues := jsonb_build_object('estado', fila->'estado');
  elsif tg_table_name = 'denuncias' then
    -- descartar las denuncias de un contenido (queda publicado): un solo renglón por contenido, no uno por denuncia
    if tg_op <> 'UPDATE' or fila->>'resolucion' is distinct from 'sin_cambios' or vieja->>'resolucion' is not null then return null; end if;
    if exists (select 1 from moderacion m where m.objeto_id = fila->>'objeto_id' and m.accion = 'denuncias_descartadas' and m.creado = now()) then
      return null;
    end if;
    v_tipo := fila->>'tipo'; v_oid := fila->>'objeto_id'; v_accion := 'denuncias_descartadas';
    v_nombre := left(coalesce(
      (select coalesce(nullif(titulo, ''), texto) from resenas where id = (fila->>'objeto_id')::uuid),
      (select texto from preguntas where id = (fila->>'objeto_id')::uuid),
      (select texto from respuestas where id = (fila->>'objeto_id')::uuid)), 90);
    v_motivo := nullif(current_setting('triplice.motivo', true), '');
  elsif tg_table_name in ('categorias', 'atributos') then
    v_tipo := case tg_table_name when 'categorias' then 'categoria' else 'atributo' end;
    v_accion := v_tipo || case tg_op when 'INSERT' then '_creada' when 'UPDATE' then '_editada' else '_borrada' end;
    if tg_table_name = 'atributos' then v_accion := replace(v_accion, '_creada', '_creado'); v_accion := replace(v_accion, '_editada', '_editado');
      v_accion := replace(v_accion, '_borrada', '_borrado'); end if;
    v_nombre := coalesce(fila->'nombre'->>'es', fila->>'clave');
    if tg_op = 'UPDATE' and vieja - 'orden' = fila - 'orden' then v_accion := v_tipo || '_ordenada'; end if;
    v_antes := vieja; v_despues := case when tg_op = 'DELETE' then null else fila end;
  elsif tg_table_name = 'reglas_impuesto' then
    v_tipo := 'impuesto';
    v_accion := 'impuesto' || case tg_op when 'INSERT' then '_creado' when 'UPDATE' then '_editado' else '_borrado' end;
    v_nombre := (fila->>'pais') || ' · ' || coalesce((select c.nombre->>'es' from categorias c where c.id = (fila->>'categoria_id')::smallint), 'general');
    v_antes := case when vieja is null then null else jsonb_build_object('tasa', vieja->'tasa', 'nombre', vieja->'nombre') end;
    v_despues := case when tg_op = 'DELETE' then null else jsonb_build_object('tasa', fila->'tasa', 'nombre', fila->'nombre') end;
  elsif tg_table_name = 'cotizaciones' then
    v_tipo := 'cotizacion'; v_accion := 'cotizacion_' || replace(fila->>'fuente', '-', '_'); v_oid := fila->>'moneda'; v_nombre := fila->>'moneda';
    v_antes := (select jsonb_build_object('por_usd', c.por_usd) from cotizaciones c
               where c.moneda = fila->>'moneda' and c.vigente_desde < (fila->>'vigente_desde')::timestamptz
               order by c.vigente_desde desc limit 1);
    v_despues := jsonb_build_object('por_usd', fila->'por_usd');
  else
    return null;
  end if;
  if v_motivo is null then v_motivo := nullif(current_setting('triplice.motivo', true), ''); end if;
  insert into moderacion (admin_id, admin_nombre, accion, objeto_tipo, objeto_id, objeto_nombre, motivo, antes, despues)
  values (quien, coalesce((select pf.nombre from perfiles pf where pf.id = quien), 'Sistema'), v_accion, v_tipo, coalesce(v_oid, ''),
          v_nombre, left(v_motivo, 400), v_antes, v_despues);
  return null;
end $$;

create trigger auditar after insert or update on public.tiendas for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.auditar();
create trigger auditar after update of rol on public.perfiles for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.auditar();
create trigger auditar after update of estado on public.resenas for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.auditar();
create trigger auditar after update of estado on public.preguntas for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.auditar();
create trigger auditar after update of estado on public.respuestas for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.auditar();
create trigger auditar after update on public.denuncias for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.auditar();
create trigger auditar after insert or update or delete on public.categorias for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.auditar();
create trigger auditar after insert or update or delete on public.atributos for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.auditar();
create trigger auditar after insert or update or delete on public.reglas_impuesto for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.auditar();
create trigger auditar after insert on public.cotizaciones for each row
  when (current_user in ('authenticated', 'service_role')) execute function public.auditar();

-- ---------------------------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------------------------

-- Tiendas: el admin crea (alta de un vendedor con tienda nueva). El update de admin ya existe (fase 1).
create policy "admin crea tiendas" on public.tiendas for insert to authenticated with check (es_admin());
drop policy "admin modera tiendas" on public.tiendas;
create policy "admin modera tiendas" on public.tiendas for update to authenticated using (es_admin()) with check (es_admin());

-- El admin ve las ofertas de todas las tiendas (también las de una pendiente o suspendida: para decidir, mira qué vende)
create policy "admin ve ofertas" on public.ofertas for select to authenticated using (es_admin());

-- Perfiles: el admin cambia el rol de otra cuenta (el disparador limita qué y cómo)
create policy "admin cambia roles" on public.perfiles for update to authenticated using (es_admin()) with check (es_admin());

-- Moderación de contenido
create policy "admin modera reseñas" on public.resenas for update to authenticated using (es_admin()) with check (es_admin());
create policy "admin modera preguntas" on public.preguntas for update to authenticated using (es_admin()) with check (es_admin());
create policy "admin modera respuestas" on public.respuestas for update to authenticated using (es_admin()) with check (es_admin());
-- Una respuesta oculta no se ve (antes solo dependía de la pregunta). La ficha lee como anon: el RLS la saca.
drop policy "respuestas públicas" on public.respuestas;
create policy "respuestas públicas" on public.respuestas for select to anon, authenticated
  using ((estado = 'publicada' and exists (select 1 from public.preguntas q where q.id = pregunta_id and q.estado = 'publicada'))
         or autor_id = auth.uid() or es_admin());

-- Denuncias: cada uno ve y crea las suyas; el admin ve todas y las resuelve
create policy "denunciar con cuenta" on public.denuncias for insert to authenticated with check (autor_id = auth.uid());
create policy "mis denuncias" on public.denuncias for select to authenticated using (autor_id = auth.uid() or es_admin());
create policy "admin resuelve denuncias" on public.denuncias for update to authenticated using (es_admin()) with check (es_admin());

-- Registro: solo lectura y solo admins (nadie escribe: lo hace auditar())
create policy "registro para admins" on public.moderacion for select to authenticated using (es_admin());

-- ---------------------------------------------------------------------------------------------
-- 5. Ayudas security definer (cada una explica por qué)
-- ---------------------------------------------------------------------------------------------

-- Refresca lo calculado después de moderar (tarjetas: precio, stock y promedio de reseñas; reputación).
-- security definer: las vistas materializadas son del dueño del esquema. Comprueba que quien llama es admin.
create or replace function public.admin_refrescar(que text) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not es_admin() then raise exception 'no_admin' using hint = 'Hace falta ser admin.'; end if;
  if que in ('catalogo', 'todo') then
    refresh materialized view public.tarjetas;
    refresh materialized view public.vocabulario;
  end if;
  if que in ('reputacion', 'todo') then
    refresh materialized view public.reputacion_calculo;
  end if;
end $$;

-- Reputación y ventas de 12 meses de todas las tiendas, también las pendientes y suspendidas.
-- security definer: reputacion_calculo no es legible para ninguna sesión (la vista pública solo tiene las aprobadas).
create or replace function public.admin_reputaciones() returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when not es_admin() then '{}'::jsonb else coalesce((
    select jsonb_object_agg(r.tienda_id, jsonb_build_object('reputacion', r.reputacion, 'pedidos_12m', r.pedidos_12m,
                                                             'opiniones', r.opiniones_total))
      from reputacion_calculo r), '{}') end
$$;

-- Busca una cuenta por su email exacto (sin listar ni completar: no sirve para adivinar cuentas).
-- security definer: el email está en auth.users, que ninguna sesión lee.
create or replace function public.admin_buscar_cuenta(p jsonb) returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  select jsonb_build_object('id', u.id, 'email', u.email, 'nombre', pf.nombre, 'rol', pf.rol,
           'tiendas', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'nombre', t.nombre, 'estado', t.estado))
                                  from tiendas t where t.duenio_id = u.id), '[]'))
    into r
    from auth.users u join perfiles pf on pf.id = u.id
   where lower(u.email) = lower(btrim(p->>'email'));
  return coalesce(r, jsonb_build_object('error', 'sin_cuenta'));
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6. Funciones del panel (security invoker: el RLS de admin decide; cada una empieza con es_admin())
-- ---------------------------------------------------------------------------------------------

-- Lo pendiente: tiendas por aprobar, denuncias abiertas, la cotización (y si tiene más de 24 h) y lo último que se hizo
create or replace function public.admin_resumen(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  return jsonb_build_object(
    'tiendas', (select jsonb_build_object(
        'pendientes', count(*) filter (where estado = 'pendiente'),
        'suspendidas', count(*) filter (where estado = 'suspendida'),
        'aprobadas', count(*) filter (where estado = 'aprobada'),
        'mas_vieja', min(estado_desde) filter (where estado = 'pendiente'),
        'nombres', coalesce((select jsonb_agg(x.nombre order by x.estado_desde) from
                              (select nombre, estado_desde from tiendas where estado = 'pendiente' order by estado_desde limit 3) x), '[]'))
      from tiendas),
    'denuncias', (select jsonb_build_object('contenidos', count(distinct (tipo, objeto_id)), 'total', count(*), 'mas_vieja', min(creado))
                    from denuncias where resuelta_el is null),
    'recientes', (select count(*) from resenas where creado > now() - interval '7 days' and estado = 'publicada')
               + (select count(*) from preguntas where creado > now() - interval '7 days' and estado = 'publicada'),
    'cotizaciones', coalesce((select jsonb_agg(jsonb_build_object('moneda', c.moneda, 'por_usd', c.por_usd, 'fuente', c.fuente,
                                'desde', c.vigente_desde, 'anterior', (select a.por_usd from cotizaciones a where a.moneda = c.moneda
                                   and a.vigente_desde < c.vigente_desde order by a.vigente_desde desc limit 1))
                                order by array_position(array['PYG', 'BRL', 'ARS'], c.moneda::text))
        from (select distinct on (moneda) * from cotizaciones order by moneda, vigente_desde desc) c), '[]'),
    'cotizacion_vieja', coalesce((select min(x.desde) < now() - interval '24 hours'
                                    from (select max(vigente_desde) as desde from cotizaciones group by moneda) x), true),
    'registro', coalesce((select jsonb_agg(to_jsonb(m) - 'antes' - 'despues' order by m.creado desc)
                            from (select * from moderacion order by creado desc limit 6) m), '[]')
  );
end $$;

-- Tiendas por estado, con sus números (reputación, ventas de 12 meses, productos publicados y ofertas activas)
create or replace function public.admin_tiendas(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  filtro text := case when p->>'estado' in ('pendiente', 'aprobada', 'suspendida') then p->>'estado' else 'pendiente' end;
  q text := normalizar(btrim(coalesce(p->>'q', '')));
  rep jsonb := admin_reputaciones();
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  return jsonb_build_object(
    'estado', filtro,
    -- para el alta de un vendedor: las tiendas que todavía no tienen dueño
    'sin_duenio', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'nombre', nombre, 'estado', estado) order by nombre)
                              from tiendas where duenio_id is null and estado <> 'suspendida'), '[]'),
    'cuentas', (select jsonb_build_object('pendiente', count(*) filter (where estado = 'pendiente'),
                                          'aprobada', count(*) filter (where estado = 'aprobada'),
                                          'suspendida', count(*) filter (where estado = 'suspendida')) from tiendas),
    'items', coalesce((select jsonb_agg(x order by x->>'orden') from (
      select jsonb_build_object(
        'id', t.id, 'slug', t.slug, 'nombre', t.nombre, 'color', t.color, 'pais', t.pais, 'ciudad', t.ciudad, 'desde', t.desde,
        'estado', t.estado, 'estado_motivo', t.estado_motivo, 'estado_desde', t.estado_desde, 'creado', t.creado,
        'duenio', (select jsonb_build_object('nombre', pf.nombre, 'rol', pf.rol) from perfiles pf where pf.id = t.duenio_id),
        'reputacion', (rep->(t.id::text))->'reputacion', 'ventas_12m', coalesce(((rep->(t.id::text))->>'pedidos_12m')::int, 0),
        'opiniones', coalesce(((rep->(t.id::text))->>'opiniones')::int, 0),
        'productos', (select count(*) from productos pr where pr.tienda_id = t.id),
        'ofertas', (select count(*) from ofertas o where o.tienda_id = t.id and o.activa),
        -- pendientes: la más vieja primero (espera hace más); el resto, por nombre
        'orden', case when t.estado = 'pendiente' then to_char(t.estado_desde, 'YYYYMMDDHH24MISS') else lower(t.nombre) end
      ) as x
        from tiendas t
       where t.estado = filtro and (q = '' or position(q in normalizar(t.nombre || ' ' || t.slug || ' ' || t.ciudad)) > 0)
       limit 200) z), '[]'));
end $$;

-- Aprobar, suspender (con motivo) o reactivar. Devuelve el slug para invalidar la caché de la tienda.
create or replace function public.admin_estado_tienda(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  t tiendas;
  nuevo text := p->>'estado';
  v_motivo text := nullif(btrim(coalesce(p->>'motivo', '')), '');
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  select * into t from tiendas where id = (p->>'tienda')::uuid for update;
  if not found then return jsonb_build_object('error', 'no_existe'); end if;
  if nuevo not in ('aprobada', 'suspendida') or nuevo = t.estado then return jsonb_build_object('error', 'estado'); end if;
  if nuevo = 'suspendida' and length(coalesce(v_motivo, '')) < 10 then return jsonb_build_object('error', 'motivo'); end if;
  if length(coalesce(v_motivo, '')) > 400 then return jsonb_build_object('error', 'motivo_largo'); end if;
  update tiendas set estado = nuevo, estado_motivo = v_motivo where id = t.id;
  -- lo que vende aparece o desaparece de las tarjetas; la reputación pública solo muestra aprobadas
  perform admin_refrescar('catalogo');
  return jsonb_build_object('slug', t.slug, 'nombre', t.nombre, 'estado', nuevo,
    'productos', (select coalesce(jsonb_agg(distinct pr.slug), '[]') from ofertas o join variantes v on v.id = o.variante_id
                   join productos pr on pr.id = v.producto_id where o.tienda_id = t.id));
end $$;

-- Alta de un vendedor: la cuenta (por email) pasa a vendedor y queda dueña de una tienda existente sin dueño o de una
-- tienda nueva (que nace aprobada: la crea un admin). Una cuenta tiene una sola tienda.
--   p: { email, tienda?: slug, nueva?: { nombre, slug, pais, ciudad, desde } }
create or replace function public.admin_alta_vendedor(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  cuenta jsonb;
  uid uuid;
  t tiendas;
  n jsonb := p->'nueva';
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  cuenta := admin_buscar_cuenta(jsonb_build_object('email', p->>'email'));
  if cuenta ? 'error' then return jsonb_build_object('error', cuenta->>'error', 'campo', 'email'); end if;
  uid := (cuenta->>'id')::uuid;
  if jsonb_array_length(cuenta->'tiendas') > 0 then
    return jsonb_build_object('error', 'ya_tiene_tienda', 'campo', 'email', 'tienda', cuenta->'tiendas'->0->>'nombre');
  end if;
  if n is null then
    select * into t from tiendas where slug = p->>'tienda' for update;
    if not found then return jsonb_build_object('error', 'no_existe', 'campo', 'tienda'); end if;
    if t.duenio_id is not null then
      return jsonb_build_object('error', 'tienda_con_duenio', 'campo', 'tienda',
                                'duenio', (select nombre from perfiles where id = t.duenio_id));
    end if;
  elsif exists (select 1 from tiendas where slug = n->>'slug') then
    return jsonb_build_object('error', 'slug_usado', 'campo', 'nueva.slug');
  end if;
  if cuenta->>'rol' = 'comprador' then
    update perfiles set rol = 'vendedor' where id = uid;
  end if;
  if n is null then
    update tiendas set duenio_id = uid where id = t.id;
  else
    insert into tiendas (slug, nombre, pais, ciudad, desde, duenio_id, estado)
    values (n->>'slug', btrim(n->>'nombre'), n->>'pais', btrim(n->>'ciudad'), coalesce((n->>'desde')::smallint, extract(year from now())::smallint),
            uid, 'aprobada')
    returning * into t;
  end if;
  return jsonb_build_object('slug', t.slug, 'nombre', t.nombre, 'cuenta', cuenta->>'nombre');
end $$;

-- Cola de moderación: reseñas, preguntas y respuestas. Filtros: denunciadas (con denuncias sin resolver, las más
-- denunciadas primero), recientes (últimos 7 días, publicadas) y ocultas.
create or replace function public.admin_moderacion(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  filtro text := case when p->>'filtro' in ('denunciadas', 'recientes', 'ocultas') then p->>'filtro' else 'denunciadas' end;
  v_idioma text := coalesce(p->>'idioma', 'es');
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  return (with contenido as (
    select 'resena' as tipo, r.id, r.producto_id, r.titulo, r.texto, r.estrellas, r.autor_nombre, r.pais, r.idioma, r.creado, r.estado,
           r.moderacion_motivo, r.compra_verificada as verificada, null::text as pregunta
      from resenas r
     where (filtro = 'denunciadas' and exists (select 1 from denuncias d where d.tipo = 'resena' and d.objeto_id = r.id and d.resuelta_el is null))
        or (filtro = 'recientes' and r.estado = 'publicada' and r.creado > now() - interval '7 days')
        or (filtro = 'ocultas' and r.estado = 'oculta')
    union all
    select 'pregunta', q.id, q.producto_id, null, q.texto, null, q.autor_nombre, null, q.idioma, q.creado, q.estado, q.moderacion_motivo, null, null
      from preguntas q
     where (filtro = 'denunciadas' and exists (select 1 from denuncias d where d.tipo = 'pregunta' and d.objeto_id = q.id and d.resuelta_el is null))
        or (filtro = 'recientes' and q.estado = 'publicada' and q.creado > now() - interval '7 days')
        or (filtro = 'ocultas' and q.estado = 'oculta')
    union all
    select 'respuesta', a.id, q.producto_id, null, a.texto, null, a.autor_nombre, null, q.idioma, a.creado, a.estado, a.moderacion_motivo,
           null, q.texto
      from respuestas a join preguntas q on q.id = a.pregunta_id
     where (filtro = 'denunciadas' and exists (select 1 from denuncias d where d.tipo = 'respuesta' and d.objeto_id = a.id and d.resuelta_el is null))
        or (filtro = 'recientes' and a.estado = 'publicada' and a.creado > now() - interval '7 days')
        or (filtro = 'ocultas' and a.estado = 'oculta')
  ), con_denuncias as (
    select c.*, coalesce((select jsonb_agg(jsonb_build_object('motivo', d.motivo, 'detalle', d.detalle, 'creado', d.creado) order by d.creado)
                            from denuncias d where d.tipo = c.tipo and d.objeto_id = c.id and d.resuelta_el is null), '[]') as denuncias
      from contenido c
  )
  select jsonb_build_object(
    'filtro', filtro,
    'cuentas', jsonb_build_object(
      'denunciadas', (select count(distinct (tipo, objeto_id)) from denuncias where resuelta_el is null),
      'recientes', (select count(*) from resenas where estado = 'publicada' and creado > now() - interval '7 days')
                 + (select count(*) from preguntas where estado = 'publicada' and creado > now() - interval '7 days')
                 + (select count(*) from respuestas where estado = 'publicada' and creado > now() - interval '7 days'),
      'ocultas', (select count(*) from resenas where estado = 'oculta') + (select count(*) from preguntas where estado = 'oculta')
               + (select count(*) from respuestas where estado = 'oculta')),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'tipo', c.tipo, 'id', c.id, 'titulo', c.titulo, 'texto', c.texto, 'estrellas', c.estrellas, 'autor', c.autor_nombre,
        'pais', c.pais, 'idioma', c.idioma, 'creado', c.creado, 'estado', c.estado, 'motivo', c.moderacion_motivo,
        'verificada', c.verificada, 'pregunta', c.pregunta, 'denuncias', c.denuncias,
        'producto', jsonb_build_object('slug', pr.slug, 'titulo', txt(pr.titulo, v_idioma)))
        order by jsonb_array_length(c.denuncias) desc, c.creado desc)
      from (select * from con_denuncias order by jsonb_array_length(denuncias) desc, creado desc limit 60) c
      join productos pr on pr.id = c.producto_id), '[]'))
  );
end $$;

-- Ocultar, volver a publicar o dejar como está (descarta las denuncias). Siempre con motivo; las denuncias abiertas del
-- contenido quedan resueltas. Devuelve el slug del producto para invalidar su ficha.
--   p: { tipo: resena|pregunta|respuesta, id, accion: ocultar|publicar|descartar, motivo }
create or replace function public.admin_moderar(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tipo text := p->>'tipo';
  v_id uuid := (p->>'id')::uuid;
  v_accion text := p->>'accion';
  v_motivo text := btrim(coalesce(p->>'motivo', ''));
  v_slug text;
  n int;
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  if v_tipo not in ('resena', 'pregunta', 'respuesta') or v_accion not in ('ocultar', 'publicar', 'descartar') then
    return jsonb_build_object('error', 'no_existe');
  end if;
  if length(v_motivo) not between 3 and 400 then return jsonb_build_object('error', 'motivo'); end if;
  perform set_config('triplice.motivo', v_motivo, true);
  if v_accion <> 'descartar' then
    if v_tipo = 'resena' then
      update resenas set estado = case v_accion when 'ocultar' then 'oculta' else 'publicada' end, moderacion_motivo = v_motivo
       where id = v_id and estado <> case v_accion when 'ocultar' then 'oculta' else 'publicada' end;
    elsif v_tipo = 'pregunta' then
      update preguntas set estado = case v_accion when 'ocultar' then 'oculta' else 'publicada' end, moderacion_motivo = v_motivo
       where id = v_id and estado <> case v_accion when 'ocultar' then 'oculta' else 'publicada' end;
    else
      update respuestas set estado = case v_accion when 'ocultar' then 'oculta' else 'publicada' end, moderacion_motivo = v_motivo
       where id = v_id and estado <> case v_accion when 'ocultar' then 'oculta' else 'publicada' end;
    end if;
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('error', 'no_existe'); end if;
  elsif not exists (select 1 from denuncias where tipo = v_tipo and objeto_id = v_id and resuelta_el is null) then
    return jsonb_build_object('error', 'sin_denuncias');
  end if;
  update denuncias set resuelta_el = now(), resolucion = case v_accion when 'ocultar' then 'oculta' else 'sin_cambios' end
   where tipo = v_tipo and objeto_id = v_id and resuelta_el is null;
  v_slug := case v_tipo
    when 'resena' then (select pr.slug from resenas r join productos pr on pr.id = r.producto_id where r.id = v_id)
    when 'pregunta' then (select pr.slug from preguntas q join productos pr on pr.id = q.producto_id where q.id = v_id)
    else (select pr.slug from respuestas a join preguntas q on q.id = a.pregunta_id join productos pr on pr.id = q.producto_id where a.id = v_id) end;
  -- el promedio de las tarjetas y la reputación de la tienda cuentan solo las reseñas publicadas
  if v_tipo = 'resena' and v_accion <> 'descartar' then perform admin_refrescar('todo'); end if;
  return jsonb_build_object('slug', v_slug);
end $$;

-- Denunciar (del lado del comprador, desde la ficha)
--   p: { tipo, id, motivo, detalle? }  →  { ok } o { error: limite|ya|no_existe|propia|motivo }
create or replace function public.denunciar(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then return jsonb_build_object('error', 'sin_sesion'); end if;
  if p->>'motivo' not in ('ofensiva', 'spam', 'datos_personales', 'no_es_del_producto', 'otro') then
    return jsonb_build_object('error', 'motivo');
  end if;
  if p->>'tipo' not in ('resena', 'pregunta', 'respuesta') or coalesce(p->>'id', '') !~ '^[0-9a-f-]{36}$' then
    return jsonb_build_object('error', 'no_existe');
  end if;
  begin
    insert into denuncias (tipo, objeto_id, motivo, detalle)
    values (p->>'tipo', (p->>'id')::uuid, p->>'motivo', left(nullif(btrim(coalesce(p->>'detalle', '')), ''), 300));
  exception
    when unique_violation then return jsonb_build_object('error', 'ya');
    when raise_exception then return jsonb_build_object('error', sqlerrm);
  end;
  return jsonb_build_object('ok', true);
end $$;

-- Categorías en árbol con lo que las usa (productos, subcategorías, atributos y reglas de impuesto)
create or replace function public.admin_categorias(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_idioma text := coalesce(p->>'idioma', 'es');
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'nombre', c.nombre, 'texto', txt(c.nombre, v_idioma), 'icono', c.icono, 'orden', c.orden,
      'atributos', (select count(*) from atributos a where a.categoria_id = c.id),
      'reglas', (select count(*) from reglas_impuesto r where r.categoria_id = c.id),
      'productos', (select count(*) from productos pr where pr.categoria_id in (select id from categorias h where h.id = c.id or h.padre_id = c.id)),
      'hijas', coalesce((select jsonb_agg(jsonb_build_object(
          'id', h.id, 'slug', h.slug, 'nombre', h.nombre, 'texto', txt(h.nombre, v_idioma), 'orden', h.orden, 'padre', c.id,
          'atributos', (select count(*) from atributos a where a.categoria_id = h.id),
          'reglas', (select count(*) from reglas_impuesto r where r.categoria_id = h.id),
          'productos', (select count(*) from productos pr where pr.categoria_id = h.id)) order by h.orden, h.id)
        from categorias h where h.padre_id = c.id), '[]')
    ) order by c.orden, c.id) from categorias c where c.padre_id is null), '[]');
end $$;

-- Una categoría con sus atributos (los propios y, de solo lectura, los que hereda de la principal) y cuántos
-- productos usa cada uno
create or replace function public.admin_categoria(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  c categorias;
  v_idioma text := coalesce(p->>'idioma', 'es');
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  select * into c from categorias where id = (p->>'id')::smallint;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'nombre', c.nombre, 'texto', txt(c.nombre, v_idioma), 'icono', c.icono, 'padre', c.padre_id,
    'padre_texto', (select txt(x.nombre, v_idioma) from categorias x where x.id = c.padre_id),
    'productos', (select count(*) from productos pr where pr.categoria_id in (select id from categorias h where h.id = c.id or h.padre_id = c.id)),
    'atributos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'clave', a.clave, 'nombre', a.nombre, 'texto', txt(a.nombre, v_idioma),
                                 'tipo', a.tipo, 'unidad', a.unidad, 'opciones', a.opciones, 'filtrable', a.filtrable, 'orden', a.orden,
                                 'usos', atributo_en_uso(a.categoria_id, a.clave)) order by a.orden, a.id)
                             from atributos a where a.categoria_id = c.id), '[]'),
    'heredados', coalesce((select jsonb_agg(jsonb_build_object('clave', a.clave, 'texto', txt(a.nombre, v_idioma), 'tipo', a.tipo, 'unidad', a.unidad)
                                 order by a.orden, a.id)
                             from atributos a where a.categoria_id = c.padre_id), '[]')
  );
end $$;

-- Alta o edición de una categoría. p: { id?, slug, nombre {es,pt,en}, padre?, icono? }
create or replace function public.admin_guardar_categoria(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id smallint := nullif(p->>'id', '')::smallint;
  v_padre smallint := nullif(p->>'padre', '')::smallint;
  v_slug text := lower(btrim(coalesce(p->>'slug', '')));
  pista text;
  v_nombre jsonb := jsonb_build_object('es', btrim(coalesce(p->'nombre'->>'es', '')), 'pt', btrim(coalesce(p->'nombre'->>'pt', '')),
                                     'en', btrim(coalesce(p->'nombre'->>'en', '')));
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 2 and 60 then return jsonb_build_object('error', 'slug', 'campo', 'slug'); end if;
  if exists (select 1 from categorias where slug = v_slug and id is distinct from v_id) then return jsonb_build_object('error', 'slug_usado', 'campo', 'slug'); end if;
  if not nombre_tres_idiomas(v_nombre, 2, 60) then return jsonb_build_object('error', 'nombre', 'campo', 'nombre'); end if;
  begin
    if v_id is null then
      insert into categorias (padre_id, slug, nombre, icono, orden)
      values (v_padre, v_slug, v_nombre, nullif(p->>'icono', ''),
              coalesce((select max(orden) + 1 from categorias where padre_id is not distinct from v_padre), 0))
      returning id into v_id;
    else
      update categorias set padre_id = v_padre, slug = v_slug, nombre = v_nombre, icono = coalesce(nullif(p->>'icono', ''), icono),
             orden = case when padre_id is distinct from v_padre
                          then coalesce((select max(orden) + 1 from categorias where padre_id is not distinct from v_padre), 0) else orden end
       where id = v_id;
      if not found then return jsonb_build_object('error', 'no_existe'); end if;
    end if;
  exception when raise_exception then
    get stacked diagnostics pista = pg_exception_hint;
    return jsonb_build_object('error', sqlerrm, 'campo', case when sqlerrm in ('padre', 'en_uso') then 'padre' else sqlerrm end, 'pista', pista);
  end;
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

-- Mover una categoría (o un atributo) un lugar arriba o abajo entre sus hermanas. Renumera de a 1 para que el orden
-- quede limpio aunque viniera con huecos o repetidos.
create or replace function public.admin_ordenar(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id smallint := (p->>'id')::smallint;
  paso int := case p->>'mover' when 'arriba' then -1 when 'abajo' then 1 else 0 end;
  ids smallint[];
  i int;
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  if paso = 0 then return jsonb_build_object('error', 'mover'); end if;
  if p->>'que' = 'atributo' then
    select array_agg(a.id order by a.orden, a.id) into ids from atributos a
     where a.categoria_id = (select categoria_id from atributos where id = v_id);
  else
    select array_agg(c.id order by c.orden, c.id) into ids from categorias c
     where c.padre_id is not distinct from (select padre_id from categorias where id = v_id);
  end if;
  i := array_position(ids, v_id);
  if i is null then return jsonb_build_object('error', 'no_existe'); end if;
  if i + paso < 1 or i + paso > cardinality(ids) then return jsonb_build_object('ok', true); end if;
  ids[i] := ids[i + paso];
  ids[i + paso] := v_id;
  if p->>'que' = 'atributo' then
    update atributos a set orden = x.n - 1 from unnest(ids) with ordinality x(id, n) where a.id = x.id and a.orden <> x.n - 1;
  else
    update categorias c set orden = x.n - 1 from unnest(ids) with ordinality x(id, n) where c.id = x.id and c.orden <> x.n - 1;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Borrar una categoría: antes de intentarlo, dice qué la usa (el disparador frena igual si algo se cuela)
create or replace function public.admin_borrar_categoria(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id smallint := (p->>'id')::smallint;
  prods int := (select count(*) from productos where categoria_id = v_id);
  hijas int := (select count(*) from categorias where padre_id = v_id);
  reglas int := (select count(*) from reglas_impuesto where categoria_id = v_id);
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  if prods + hijas + reglas > 0 then
    return jsonb_build_object('error', 'en_uso', 'productos', prods, 'subcategorias', hijas, 'reglas', reglas);
  end if;
  -- los atributos de una categoría sin productos se van con ella (on delete cascade); el disparador de atributos
  -- vuelve a comprobar que ninguno esté en uso
  delete from atributos where categoria_id = v_id;
  delete from categorias where id = v_id;
  if not found then return jsonb_build_object('error', 'no_existe'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Alta o edición de un atributo. p: { id?, categoria, clave, nombre {es,pt,en}, tipo, unidad?, opciones?: [], filtrable }
create or replace function public.admin_guardar_atributo(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id smallint := nullif(p->>'id', '')::smallint;
  v_cat smallint := (p->>'categoria')::smallint;
  v_clave text := lower(btrim(coalesce(p->>'clave', '')));
  v_tipo text := p->>'tipo';
  v_nombre jsonb := jsonb_build_object('es', btrim(coalesce(p->'nombre'->>'es', '')), 'pt', btrim(coalesce(p->'nombre'->>'pt', '')),
                                     'en', btrim(coalesce(p->'nombre'->>'en', '')));
  v_opciones jsonb := case when v_tipo = 'opcion' then coalesce(p->'opciones', '[]') else null end;
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  if not exists (select 1 from categorias where id = v_cat) then return jsonb_build_object('error', 'no_existe'); end if;
  if v_tipo is null or v_tipo not in ('texto', 'numero', 'booleano', 'opcion') then return jsonb_build_object('error', 'tipo', 'campo', 'tipo'); end if;
  if exists (select 1 from atributos where categoria_id = v_cat and clave = v_clave and id is distinct from v_id) then
    return jsonb_build_object('error', 'clave_usada', 'campo', 'clave');
  end if;
  begin
    if v_id is null then
      insert into atributos (categoria_id, clave, nombre, tipo, unidad, opciones, filtrable, orden)
      values (v_cat, v_clave, v_nombre, v_tipo, nullif(btrim(coalesce(p->>'unidad', '')), ''), v_opciones,
              coalesce((p->>'filtrable')::boolean, false), coalesce((select max(orden) + 1 from atributos where categoria_id = v_cat), 0))
      returning id into v_id;
    else
      update atributos set clave = v_clave, nombre = v_nombre, tipo = v_tipo, unidad = nullif(btrim(coalesce(p->>'unidad', '')), ''),
             opciones = v_opciones, filtrable = coalesce((p->>'filtrable')::boolean, false)
       where id = v_id and categoria_id = v_cat;
      if not found then return jsonb_build_object('error', 'no_existe'); end if;
    end if;
  exception when raise_exception then
    return jsonb_build_object('error', sqlerrm, 'campo', case when sqlerrm = 'en_uso' then 'clave' else sqlerrm end);
  end;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.admin_borrar_atributo(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  a atributos;
  usos int;
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  select * into a from atributos where id = (p->>'id')::smallint;
  if not found then return jsonb_build_object('error', 'no_existe'); end if;
  usos := atributo_en_uso(a.categoria_id, a.clave);
  if usos > 0 then return jsonb_build_object('error', 'en_uso', 'productos', usos); end if;
  delete from atributos where id = a.id;
  return jsonb_build_object('ok', true);
end $$;

-- Reglas de impuesto de los tres países (vigentes) con el nombre de su categoría, y las categorías para agregar una
create or replace function public.admin_impuestos(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_idioma text := coalesce(p->>'idioma', 'es');
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  return jsonb_build_object(
    'reglas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'pais', r.pais, 'nombre', r.nombre, 'tasa', r.tasa, 'categoria_id', r.categoria_id,
        'categoria', c.slug, 'categoria_texto', txt(c.nombre, v_idioma), 'categoria_padre', cp.slug,
        'productos', case when c.id is null then null else
          (select count(*) from productos pr where pr.categoria_id in (select id from categorias h where h.id = c.id or h.padre_id = c.id)) end)
        order by r.pais, r.categoria_id nulls first, c.orden)
      from reglas_impuesto r left join categorias c on c.id = r.categoria_id left join categorias cp on cp.id = c.padre_id
     where r.desde <= current_date and (r.hasta is null or r.hasta > current_date)), '[]'),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'texto', txt(c.nombre, v_idioma),
                                                                'padre', cp.slug, 'padre_texto', txt(cp.nombre, v_idioma))
                                             order by coalesce(cp.orden, c.orden), cp.id nulls first, c.orden)
                              from categorias c left join categorias cp on cp.id = c.padre_id), '[]')
  );
end $$;

-- El producto de ejemplo para la vista previa: el más vendido de la categoría (o de todo el catálogo). Lee las
-- tarjetas públicas (precio más bajo con stock, sin impuestos).
create or replace function public.admin_ejemplo(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_cat smallint := nullif(p->>'categoria', '')::smallint;
  r jsonb;
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  select jsonb_build_object('slug', t.slug, 'titulo', txt(t.titulo, coalesce(p->>'idioma', 'es')), 'precio', t.precio_usd_cent,
                            'categoria', c.slug, 'categoria_padre', cp.slug, 'imagen', t.imagen)
    into r
    from tarjetas t join categorias c on c.id = t.categoria_id left join categorias cp on cp.id = c.padre_id
   where v_cat is null or t.categoria_id = v_cat or t.categoria_padre_id = v_cat
   order by t.ventas_30d desc, t.id limit 1;
  return r;
end $$;

-- Alta o edición de una regla. p: { id?, pais, categoria?, nombre {es,pt,en}, tasa (0,105 = 10,5 %) }
create or replace function public.admin_guardar_impuesto(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id smallint := nullif(p->>'id', '')::smallint;
  v_tasa numeric := (p->>'tasa')::numeric;
  v_nombre jsonb := jsonb_build_object('es', btrim(coalesce(p->'nombre'->>'es', '')), 'pt', btrim(coalesce(p->'nombre'->>'pt', '')),
                                     'en', btrim(coalesce(p->'nombre'->>'en', '')));
  v_cat smallint := nullif(p->>'categoria', '')::smallint;
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  if v_tasa is null or v_tasa < 0 or v_tasa > 0.6 or v_tasa <> round(v_tasa, 4) then return jsonb_build_object('error', 'tasa', 'campo', 'tasa'); end if;
  if not nombre_tres_idiomas(v_nombre, 2, 40) then return jsonb_build_object('error', 'nombre', 'campo', 'nombre'); end if;
  if v_id is null then
    if p->>'pais' not in ('PY', 'BR', 'AR') then return jsonb_build_object('error', 'pais', 'campo', 'pais'); end if;
    if v_cat is null or not exists (select 1 from categorias where id = v_cat) then return jsonb_build_object('error', 'categoria', 'campo', 'categoria'); end if;
    if exists (select 1 from reglas_impuesto where pais = p->>'pais' and categoria_id = v_cat
                and desde <= current_date and (hasta is null or hasta > current_date)) then
      return jsonb_build_object('error', 'regla_repetida', 'campo', 'categoria');
    end if;
    insert into reglas_impuesto (pais, categoria_id, nombre, tasa, desde) values (p->>'pais', v_cat, v_nombre, v_tasa, current_date)
    returning id into v_id;
  else
    update reglas_impuesto set tasa = v_tasa, nombre = v_nombre where id = v_id;
    if not found then return jsonb_build_object('error', 'no_existe'); end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.admin_borrar_impuesto(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  r reglas_impuesto;
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  select * into r from reglas_impuesto where id = (p->>'id')::smallint;
  if not found then return jsonb_build_object('error', 'no_existe'); end if;
  if r.categoria_id is null then return jsonb_build_object('error', 'general'); end if;
  delete from reglas_impuesto where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- Cotizaciones: la vigente de cada moneda y el historial (las últimas 60 cargas, con la variación contra la anterior)
create or replace function public.admin_cotizaciones(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  return jsonb_build_object(
    'vigentes', coalesce((select jsonb_object_agg(moneda, jsonb_build_object('por_usd', por_usd, 'fuente', fuente, 'desde', vigente_desde))
                            from (select distinct on (moneda) * from cotizaciones order by moneda, vigente_desde desc) c), '{}'),
    'historial', coalesce((select jsonb_agg(jsonb_build_object('moneda', h.moneda, 'por_usd', h.por_usd, 'fuente', h.fuente, 'desde', h.vigente_desde,
                                                               'anterior', h.anterior,
                                                               'quien', (select m.admin_nombre from moderacion m where m.objeto_tipo = 'cotizacion'
                                                                          and m.objeto_id = h.moneda and m.creado = h.vigente_desde limit 1))
                                            order by h.vigente_desde desc, array_position(array['PYG', 'BRL', 'ARS'], h.moneda::text))
                             from (select c.*, lag(c.por_usd) over (partition by c.moneda order by c.vigente_desde) as anterior
                                     from cotizaciones c) h
                            where h.vigente_desde > now() - interval '90 days'
                            limit 60), '[]')
  );
end $$;

-- Guardar cotizaciones (una, dos o las tres). Si alguna cambia más de 5 % contra la vigente, no guarda nada y avisa
-- (probable error de tipeo) hasta que llegue con confirmar = true.
--   p: { tasas: { PYG?, BRL?, ARS? }, fuente: manual|cambio-cde, confirmar? }  →  { ok } | { aviso: 'variacion', variaciones } | { error, moneda }
create or replace function public.admin_guardar_cotizacion(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  m text;
  valor numeric;
  actual numeric;
  variaciones jsonb := '{}';
  grandes boolean := false;
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  if jsonb_typeof(p->'tasas') <> 'object' or not exists (select 1 from jsonb_object_keys(p->'tasas')) then
    return jsonb_build_object('error', 'vacio');
  end if;
  if coalesce(p->>'fuente', 'manual') not in ('manual', 'cambio-cde') then return jsonb_build_object('error', 'fuente'); end if;
  for m in select jsonb_object_keys(p->'tasas') loop
    if m not in ('PYG', 'BRL', 'ARS') then return jsonb_build_object('error', 'moneda', 'moneda', m); end if;
    begin
      valor := round((p->'tasas'->>m)::numeric, 4);
    exception when others then
      return jsonb_build_object('error', 'numero', 'moneda', m);
    end;
    if valor is null or (m = 'PYG' and valor not between 1000 and 100000) or (m = 'BRL' and valor not between 0.5 and 50)
       or (m = 'ARS' and valor not between 10 and 100000) then
      return jsonb_build_object('error', 'rango', 'moneda', m);
    end if;
    actual := (select por_usd from cotizaciones where moneda = m order by vigente_desde desc limit 1);
    if actual is not null then
      variaciones := variaciones || jsonb_build_object(m, round((valor - actual) / actual * 100, 2));
      grandes := grandes or abs(valor - actual) / actual > 0.05;
    end if;
  end loop;
  if grandes and coalesce((p->>'confirmar')::boolean, false) is not true then
    return jsonb_build_object('aviso', 'variacion', 'variaciones', variaciones);
  end if;
  insert into cotizaciones (moneda, por_usd, fuente)
  select k, round((p->'tasas'->>k)::numeric, 4), coalesce(p->>'fuente', 'manual') from jsonb_object_keys(p->'tasas') k;
  return jsonb_build_object('ok', true, 'variaciones', variaciones);
end $$;

-- El registro completo (las últimas 100 acciones, con filtro por tipo)
create or replace function public.admin_registro(p jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
begin
  if not es_admin() then return jsonb_build_object('error', 'no_admin'); end if;
  return coalesce((select jsonb_agg(to_jsonb(m) order by m.creado desc, m.id desc) from (
    select * from moderacion where p->>'tipo' is null or objeto_tipo = p->>'tipo' order by creado desc, id desc limit 100) m), '[]');
end $$;

-- La tienda la ve en su panel: el motivo de la suspensión (mismo nombre y firma que en la fase 4, una clave más)
create or replace function public.mi_tienda_datos(p jsonb) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object('id', t.id, 'slug', t.slug, 'nombre', t.nombre, 'color', t.color, 'pais', t.pais, 'ciudad', t.ciudad,
                            'estado', t.estado, 'estado_motivo', t.estado_motivo, 'estado_desde', t.estado_desde)
    from tiendas t where t.id = mi_tienda()
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------------------------
-- Tablas nuevas: Supabase les da todo a anon y authenticated por defecto. Se quita y se da solo lo necesario.
revoke all on public.denuncias, public.moderacion from anon, authenticated;
grant select, insert (tipo, objeto_id, motivo, detalle), update (resuelta_el, resolucion) on public.denuncias to authenticated;
grant select on public.moderacion to authenticated;
grant all on public.denuncias, public.moderacion to service_role;
-- Tiendas: el admin crea y cambia estado, motivo y dueño (estado ya estaba dado en la fase 4)
grant insert (slug, nombre, pais, ciudad, desde, duenio_id, estado) on public.tiendas to authenticated;
grant update (estado_motivo, duenio_id) on public.tiendas to authenticated;
-- Perfiles: el rol (la política y el disparador deciden quién y cómo)
grant update (rol) on public.perfiles to authenticated;
-- Moderación de contenido
grant update (estado, moderacion_motivo) on public.resenas, public.preguntas, public.respuestas to authenticated;
-- Impuestos: la fase 4 quitó toda escritura y esta tabla no la recuperó. País y categoría no cambian en una regla.
grant insert (pais, categoria_id, nombre, tasa, desde), update (nombre, tasa), delete on public.reglas_impuesto to authenticated;
-- categorias, atributos (insert, update, delete) y cotizaciones (insert) ya tienen su grant de la fase 1/4; las
-- políticas de admin de la fase 1 deciden quién y los disparadores de arriba, qué.

-- Funciones
revoke execute on function public.admin_refrescar(text), public.admin_reputaciones(), public.admin_buscar_cuenta(jsonb),
  public.admin_resumen(jsonb), public.admin_tiendas(jsonb), public.admin_estado_tienda(jsonb), public.admin_alta_vendedor(jsonb),
  public.admin_moderacion(jsonb), public.admin_moderar(jsonb), public.denunciar(jsonb), public.admin_categorias(jsonb),
  public.admin_categoria(jsonb), public.admin_guardar_categoria(jsonb), public.admin_ordenar(jsonb), public.admin_borrar_categoria(jsonb),
  public.admin_guardar_atributo(jsonb), public.admin_borrar_atributo(jsonb), public.admin_impuestos(jsonb), public.admin_ejemplo(jsonb),
  public.admin_guardar_impuesto(jsonb), public.admin_borrar_impuesto(jsonb), public.admin_cotizaciones(jsonb),
  public.admin_guardar_cotizacion(jsonb), public.admin_registro(jsonb), public.atributo_en_uso(smallint, text)
  from public, anon;
grant execute on function public.admin_refrescar(text), public.admin_reputaciones(), public.admin_buscar_cuenta(jsonb),
  public.admin_resumen(jsonb), public.admin_tiendas(jsonb), public.admin_estado_tienda(jsonb), public.admin_alta_vendedor(jsonb),
  public.admin_moderacion(jsonb), public.admin_moderar(jsonb), public.denunciar(jsonb), public.admin_categorias(jsonb),
  public.admin_categoria(jsonb), public.admin_guardar_categoria(jsonb), public.admin_ordenar(jsonb), public.admin_borrar_categoria(jsonb),
  public.admin_guardar_atributo(jsonb), public.admin_borrar_atributo(jsonb), public.admin_impuestos(jsonb), public.admin_ejemplo(jsonb),
  public.admin_guardar_impuesto(jsonb), public.admin_borrar_impuesto(jsonb), public.admin_cotizaciones(jsonb),
  public.admin_guardar_cotizacion(jsonb), public.admin_registro(jsonb), public.atributo_en_uso(smallint, text)
  to authenticated;
-- auditar() es de disparadores: nadie la llama
revoke execute on function public.auditar() from public, anon, authenticated;
grant execute on function public.nombre_tres_idiomas(jsonb, int, int) to anon, authenticated;
