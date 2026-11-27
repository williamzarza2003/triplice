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
