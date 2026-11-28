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

# Fase 5: descubrimiento (comparador, vistos, "comprados juntos", listas, favoritos y alertas)

Migración: `supabase/migrations/20261130000200_descubrimiento.sql`. Misma pregunta que en la fase 4: **¿qué puede
hacer alguien con la clave pública y su propia sesión, escribiendo directo en las tablas?** Las pruebas están en
`tests/descubrimiento.test.ts` (corren contra PGlite con los permisos por defecto de Supabase).

## Tablas nuevas

| Tabla | Quién lee | Quién escribe y qué columnas | Lo que pone la base (el usuario no lo elige) |
| --- | --- | --- | --- |
| `vistos` | El dueño | El dueño: `producto_id`, `visto` (insertar), `visto` (actualizar), borrar | Dueño (`auth.uid()` por defecto + política); recorte a los últimos 12 por persona (disparador por sentencia) |
| `listas` | El dueño | El dueño: `nombre`, `favoritos` (insertar), `nombre`, `token` (actualizar), borrar (no favoritos) | Dueño; el **token** (si se manda uno, se reemplaza por 64 hex al azar; nulo = dejar de compartir); límite de 20 listas por cuenta (con bloqueo, para que dos pestañas no lo pasen); 1 a 60 caracteres sin controles; nombre único por persona; favoritos no se renombra |
| `lista_items` | El dueño de la lista | El dueño: `lista_id`, `producto_id` (insertar), `lista_id` (mover), borrar | Límite de 100 por lista; solo productos visibles; la fecha |
| `alertas_precio` | El dueño | El dueño: `producto_id`, `region`, `moneda`, `objetivo` (insertar), `activa`, `cumplida`, `leida` (actualizar), borrar | El precio de hoy y el base en USD (los calcula el disparador); objetivo menor que el precio de hoy y mayor que su décima parte; 20 activas por persona; una activa por producto. **Cumplida** solo si el disparador recalcula el precio y bajó: escribir `cumplida = now()` a mano falla con `no_bajo`; una cumplida no se vuelve a cumplir ni se reactiva; el precio guardado no se cambia |
| `comprados_juntos` (vista materializada) | Todos (solo pares de productos públicos con su cantidad de pedidos, desde 3) | Nadie: la rehace `refrescar_catalogo()` | No tiene compradores ni pedidos: el mínimo de 3 evita que un par raro deje adivinar la compra de una persona |

Toda la escritura de `anon` sobre estas tablas está revocada (`revoke all … from anon, authenticated` y grants por
columna solo para `authenticated`), igual que la sección "Permisos" de la fase 4.

## Funciones nuevas

Todas `set search_path = public`. Las de la cuenta no las puede ejecutar `anon` (`revoke execute … from public, anon`).

| Función | Tipo | Por qué |
| --- | --- | --- |
| `comparar`, `tarjetas_slugs`, `comprados_juntos`, `ofertas_baratas` | invoker (públicas) | Leen el catálogo público como `anon`; el RLS decide. Los slugs se filtran con `slug_valido` y se acotan (4 o 12) en SQL. |
| `registrar_vistos`, `mis_vistos`, `mis_listas`, `mi_lista`, `guardar_lista`, `borrar_lista`, `lista_agregar`, `lista_quitar`, `lista_mover`, `alternar_favorito`, `compartir_lista`, `mis_favoritos_id`, `lista_destino`, `crear_alerta`, `borrar_alerta`, `revisar_alertas`, `mis_alertas`, `leer_avisos`, `ficha_descubrir`, `estado_descubrir` | invoker (con sesión) | Corren como el usuario: el RLS y los disparadores deciden. Una lista ajena "no existe" para quien llama. |
| `lista_compartida` | **definer** | Imprescindible: quien abre el enlace (con o sin cuenta) no puede leer listas ajenas por RLS. Compara el token exacto (formato de 64 hex validado antes) y devuelve lo mínimo: nombre, firma del dueño (`firma()`: "Lorena B."), fecha y productos públicos. Nunca el id ni el email. |
| `refrescar_catalogo` (nueva versión) | **definer** | Las vistas materializadas son del dueño del esquema. La versión anterior se renombró a `refrescar_catalogo_base` (para no pisar lo que le agregue otra migración) y la nueva la llama y rehace `comprados_juntos`. Ninguna de las dos la ejecuta una sesión. |
| `revisar_alertas_todas` | invoker, sin permiso para sesiones | Para pg_cron (corre como el dueño). |
| `slug_valido`, `slugs_de`, `cotizacion_hoy`, `precio_final`, `precio_actual`, `token_nuevo`, `error_conocido` | invoker | Ayudas puras o de lectura pública. |
| Disparadores `listas_validar`, `lista_items_validar`, `alertas_validar`, `vistos_recortar` | invoker | Corren con los permisos de quien escribe; para subir la fecha de la lista (`actualizado`, sin permiso de columna) se reescribe el nombre igual y el disparador pone la fecha. |

## Cookies (lo que el navegador puede cambiar)

- `triplice_comparar` (`slug~familia`, hasta 4), `triplice_vistos` (hasta 12 slugs) y `triplice_pendiente` (el favorito
  que tocó antes de entrar): no son httpOnly porque los escribe el navegador (marcar no recarga la página). No guardan
  nada privado. El servidor las lee con `lib/descubrir/cookies.ts` (formato, cantidad, sin repetidos) y la base vuelve a
  validar cada slug. La familia de la cookie no se usa para decidir nada: el comparador la recalcula en SQL con el
  primer producto y deja afuera los de otra familia.
- La lista compartida va en la URL (`/lista/<token>`): la página es `noindex, nofollow` y `referrer: no-referrer`, para
  que el token no viaje a otros sitios en el encabezado `Referer`.

## Riesgo aceptado (anotado)

- `token_nuevo()` usa dos `gen_random_uuid()` (122 bits al azar cada uno, del generador fuerte de Postgres): 244 bits.
  La comparación del token es una igualdad por índice; no es de tiempo constante, pero con 244 bits no hay forma
  práctica de adivinarlo por tiempos.
- Los vistos de una persona sin cuenta viven en su navegador: quien use la misma computadora los ve. Se dice en la
  interfaz ("Se guarda en este navegador").
- `revisar_alertas` corre al entrar y al abrir la cuenta: cada vez actualiza las alertas propias (barato, acotado a 20).
