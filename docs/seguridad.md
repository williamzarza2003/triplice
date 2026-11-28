# Revisión de seguridad de la fase 4 (27/11/2026)

El panel del vendedor lo escribió un subagente. Antes de conectar Supabase leí, una por una, las funciones
`security definer` y las políticas RLS de `supabase/migrations/20261128000100_vendedor.sql`, y las de fases
anteriores de las que dependen. La pregunta en cada una: **¿qué puede hacer alguien con la clave pública de Supabase
y su propia sesión, escribiendo directo en las tablas, sin pasar por el servidor de la web?**

Las pruebas de cada arreglo están en `tests/vendedor.test.ts` → «revisión de seguridad» y en `tests/cuentas.test.ts`.

## Lo que encontré y cambié

| # | Gravedad | Problema | Arreglo |
| --- | --- | --- | --- |
| 1 | Alta | **Los permisos por columna no limitaban nada en Supabase.** Supabase da todos los permisos de cada tabla nueva a `anon` y `authenticated`; PGlite no, así que las pruebas pasaban. Con la clave pública, una tienda podía subir `ventas_30d` de su producto para aparecer primero, o mudar una oferta a otra variante. | Al final de la migración se quita toda escritura y se vuelve a dar solo lo necesario, columna por columna. `supabase/pglite/00_supabase.sql` ahora imita los permisos por defecto de Supabase, para que las pruebas corran con los mismos. |
| 2 | Alta | **Una tienda leía la clave de invitado de los pedidos donde participa.** Con número y clave, `pedido_publico` devuelve el comprobante entero: lo comprado en otras tiendas, el email y la dirección. | `pedidos.clave` y `referencia_pago` dejan de ser legibles para las sesiones; `vendedor_pedidos` pide sus columnas a mano. |
| 3 | Media | **Fotos ajenas.** `guardar_producto` aceptaba cualquier foto que tuviera la variante cuyo id mandaba el formulario, aunque fuera de otro producto y de otra tienda. Escribiendo directo en `variantes`, ni eso. | La función acepta solo fotos de la carpeta de la tienda o que ya estaban en ese mismo producto. Un disparador nuevo (`variantes_validar`) exige lo mismo en cualquier escritura. |
| 4 | Media | **Rol.** `mi_tienda()` exigía perfil de vendedor, pero las políticas de escritura miraban solo quién era el dueño de la tienda. Un dueño con perfil de comprador escribía directo en productos, ofertas, eventos y Storage. | `es_mi_tienda(tienda, para)` reúne la regla (dueño, perfil de vendedor o admin y, para el catálogo, tienda no suspendida) y la usan todas las políticas de escritura, también la de ofertas de la fase 1 y las de Storage. |
| 5 | Media | **Dos tiendas despachando a la vez** dejaban el pedido en «preparando» para siempre: cada transacción veía solo su propio evento. | `evento_tienda_validar` bloquea el pedido (`for update`) hasta el final de la transacción. |
| 6 | Media | **Validaciones solo en el servidor.** Escribiendo directo se podía guardar un título vacío o una descripción de varios megas. | `productos_validar` corre en toda escritura y valida lo mismo que `lib/vender/producto.ts`. |
| 7 | Baja | Un plazo de preparación de 0 o de 1000 horas en una oferta hacía fallar la compra (el ítem del pedido exige entre 1 y 720). | `check` en `ofertas.preparacion_h` y tope de stock. |
| 8 | Baja | Una tienda pendiente o suspendida respondía preguntas con el sello de «la tienda». | El sello pide tienda aprobada y perfil de vendedor. |
| 9 | Baja | Una tienda suspendida seguía publicando. | Puede cambiar precio y stock y pausar; no publica, no edita fichas ni sube fotos (`error: 'suspendida'`, con mensaje en los tres idiomas). |
| 10 | Mínima | `guardar_stock` devolvía la dirección del producto de una oferta ajena si venía primera en la lista. | Filtra por la tienda. |

## Lo que revisé y está bien

- `vende_producto`, `publica_producto`, `pedido_compartido`, `mi_reputacion`, `item_plazo`, `pedido_avanzar` y
  `respuesta_completar`: fijan `search_path`, leen `auth.uid()` y no devuelven nada de otra tienda.
- `refrescar_catalogo` no la puede llamar nadie desde una sesión. `reputacion_calculo` (tiene tiendas pendientes) no
  es legible; la vista pública `reputacion_tiendas` filtra las aprobadas.
- Las funciones de lectura del panel son `security invoker`: el RLS decide qué filas ven.
- Todas las tablas del esquema `public` tienen RLS (hay una prueba que lo exige).

## Lo que queda (riesgo aceptado, anotado)

- `vendedor_refrescar` rehace las vistas materializadas del catálogo en cada cambio (~0,8 s) y bloquea su lectura
  mientras tanto. Una tienda que la llame en bucle degrada el sitio. Con tiendas reales conviene pasarlo a pg_cron
  cada minuto o a `refresh … concurrently`.
- Una tienda ve el total de un pedido compartido (incluye lo de las otras tiendas). No ve qué compraron.
- El bucket `productos` confía en el tipo que declara quien sube (`image/webp`). El servidor siempre sube WebP
  rearmado con sharp, pero una subida directa puede no serlo. El bucket es de imágenes y se sirve con ese tipo.

# Fase 5: administración (27/11/2026)

La migración `supabase/migrations/20261130000100_admin.sql` sigue las mismas reglas que la revisión de la fase 4.
Las pruebas están en `tests/admin.test.ts` → «permisos: solo la admin».

## Reglas que respeta

- **Toda función de admin empieza con `es_admin()`** y devuelve `{error: 'no_admin'}` si no. Todas tienen
  `revoke execute … from public, anon` y `grant … to authenticated`: sin sesión ni se pueden llamar.
- **security invoker** con políticas RLS de admin (`using/with check (es_admin())`) en `tiendas` (insert y update),
  `perfiles` (update del rol), `resenas`, `preguntas` y `respuestas` (update), `denuncias` (update), `ofertas` (lectura)
  y las que ya existían de las fases 1 y 2 para `categorias`, `atributos`, `reglas_impuesto` y `cotizaciones`.
- **Permisos por columna**: `tiendas` (insert de slug, nombre, país, ciudad, desde, dueño y estado; update de
  `estado_motivo` y `duenio_id`), `perfiles.rol`, `estado` y `moderacion_motivo` de reseñas, preguntas y respuestas,
  `reglas_impuesto` (insert; update solo de nombre y tasa —país y categoría no cambian—; delete; esta tabla había quedado
  sin escritura después del revoke de la fase 4), `denuncias` (insert de tipo, objeto, motivo y detalle; update de la
  resolución). Las tablas nuevas arrancan con `revoke all`.
- **RLS en las tablas nuevas** (`denuncias`, `moderacion`; `demo_admin_meta` solo existe en PGlite).
- **Validaciones en la base**, con disparadores que corren para las sesiones (`current_user = 'authenticated'`):
  - `tiendas_admin_validar`: solo un admin cambia estado, motivo o dueño (el dueño sigue editando sus datos con la política
    de la fase 1); suspender pide motivo de 10 caracteres; el dueño nuevo tiene perfil de vendedor; slug, nombre, ciudad y año.
  - `perfiles_rol_validar`: el rol lo cambia solo un admin, **nunca el suyo propio** (nadie se saca el rol a sí mismo) y
    nunca dejando el sitio sin admins (bloquea las filas de admins mientras cuenta, por si hay dos cambios a la vez);
    un admin no toca los datos personales de otra cuenta.
  - `moderacion_validar`: solo un admin cambia el estado de una reseña, pregunta o respuesta (el autor edita el texto pero
    no la vuelve a publicar), solo entre publicada y oculta, siempre con motivo.
  - `denuncia_validar`: quién y cuándo los pone la base; 10 por hora; no lo propio ni lo que no está publicado.
  - `categorias_validar`, `atributos_validar`: nombres en tres idiomas, dos niveles, lo que está en uso no se borra ni
    cambia de clave, tipo, dirección o padre.
  - `reglas_impuesto_validar`: tasa de 0 a 60 %, nombres en tres idiomas, la general no se borra.
  - `cotizaciones_validar` (también para `service_role`): rango posible por moneda y `vigente_desde = now()` (el
    historial no se reescribe).

## Funciones security definer nuevas (y por qué)

| Función | Por qué definer | Qué comprueba |
| --- | --- | --- |
| `auditar()` (disparador) | Escribe en `moderacion`, que ninguna sesión puede escribir (ni los admins): así el registro no se borra ni se inventa. | Se dispara solo para `authenticated` y `service_role` (el `when` de cada disparador, evaluado como quien escribe: adentro de la función `current_user` ya es el dueño); el autor es siempre `auth.uid()`. Nadie la puede llamar (revoke a todos). |
| `admin_refrescar(que)` | Las vistas materializadas (tarjetas, vocabulario, reputación) son del dueño del esquema. | `es_admin()` o error. |
| `admin_reputaciones()` | `reputacion_calculo` no es legible para ninguna sesión (tiene tiendas pendientes). | `es_admin()` o devuelve `{}`. |
| `admin_buscar_cuenta(p)` | El email está en `auth.users`, que ninguna sesión lee. | `es_admin()`; busca el correo exacto (no lista ni completa). |

El resto (`admin_resumen`, `admin_tiendas`, `admin_estado_tienda`, `admin_alta_vendedor`, `admin_moderacion`,
`admin_moderar`, `denunciar`, `admin_categorias`, `admin_categoria`, `admin_guardar_categoria`, `admin_ordenar`,
`admin_borrar_categoria`, `admin_guardar_atributo`, `admin_borrar_atributo`, `admin_impuestos`, `admin_ejemplo`,
`admin_guardar_impuesto`, `admin_borrar_impuesto`, `admin_cotizaciones`, `admin_guardar_cotizacion`, `admin_registro`,
`atributo_en_uso`) son **security invoker**: el RLS de admin decide. Los disparadores de validación también son invoker.

## Cambio CDE

- Las dos variables (`CAMBIO_CDE_SUPABASE_URL`, `CAMBIO_CDE_ANON_KEY`) son solo del servidor y la clave es la **anon**
  de Cambio CDE (la vista que se lee ya es pública). No están en el repo; se documentan en `.env.example` y
  `docs/supabase.md`. No se leyó ni se copió el `.env.local` de Cambio CDE.
- La URL tiene que ser https (o localhost); el pedido tiene 5 s de tiempo de espera, sin caché, y la respuesta se
  valida antes de convertir. Lo que trae no se guarda hasta que la admin ve la vista previa y confirma.

## Lo que queda (riesgo aceptado, anotado)

- Una admin ve y modera todo: no hay roles más finos (moderador sin permiso de impuestos, por ejemplo).
- `admin_moderar` sobre una reseña refresca las tres vistas materializadas (~1 s). Con mucho volumen conviene pg_cron.
- El motivo de "dejar publicada" viaja en una variable de la transacción (`triplice.motivo`) hasta el renglón del
  registro: una sesión podría ponerla a mano, pero solo cambia el motivo de sus propios cambios.
- La reputación de una tienda sin ningún dato da 100 % por un detalle de la fase 4 (`greatest(0, least(100, null))`
  vale 100 en Postgres): el panel de admin muestra "sin datos" si la tienda no tiene ventas ni opiniones. Hay que
  corregir `reputacion_calculo` (y recrear `reputacion_tiendas`) en una migración propia.
