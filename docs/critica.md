# Crítica de las maquetas (fase 0)

Comparación contra Amazon y Mercado Libre, mirando las mismas pantallas en 1440 px y en 390 px. Dos rondas de corrección; abajo, lo que cambié y lo que todavía falta.

## En qué Tríplice ya es mejor

| Pantalla | Amazon / Mercado Libre | Tríplice |
| --- | --- | --- |
| Tarjeta de producto | Amazon apila 8 a 10 datos con el mismo peso (sellos, "Climate Pledge", patrocinado). ML muestra precio y envío, pero no quién vende ni su reputación. | Siete datos en tres niveles (qué es → cuánto → cuándo y quién). El vendedor y su reputación siempre visibles, en el gris más chico. |
| Precio | Amazon muestra precios sin impuestos en EE. UU. y los suma recién en el pago. | Precio final con el impuesto de tu país desde la grilla, y desglose por tasa en el pago (IVA 10 % y 5 % separados). |
| Comparar países | No existe: hay que abrir otra tienda y convertir a mano. | **Etiqueta de frontera**: un toque y ves el mismo producto en los otros dos países; en la ficha, con la equivalencia en tu moneda. |
| Entrega | "Llega gratis mañana" en verde en ML; Amazon, fecha exacta. | Fecha concreta **y** retiro en CDE cuando se puede ("Retiralo hoy en CDE"), que en la frontera es lo más útil. |
| Varios vendedores | Amazon esconde "Otros vendedores" en un panel lateral. | Tabla visible debajo de la ficha con precio final, entrega y reputación de cada uno. |
| Checkout | Amazon tiene muchos pasos y ofertas cruzadas. | Tres bloques en una página, sin buscador ni categorías que distraigan, y el botón dice el monto: "Pagar ₲ 801.000". El error de tarjeta explica qué hacer. |
| Búsqueda | ML corrige errores, pero sin avisar. | Corrige ("cosina" → cocina) y lo dice, con un enlace para buscar lo que escribiste. |

## Rondas de crítica

**Ronda 1 (primeras capturas)**
1. Las filas del inicio dejaban un producto huérfano (5 columnas y 6 productos). Ahora son filas de 6 justas, 4 en tableta y 2 × 2 en el celular.
2. El mapa de la portada pisaba el título. Lo corrí a la derecha y achiqué el ancho del título.
3. Los íconos de categorías no correspondían (Electrónica con un gráfico, Moda con un corazón). Dibujé canasta, pantalla, casa, llave, remera, pelota y libro.
4. La búsqueda de "pava" mostraba taladros y relojes: no era creíble. Pasó a "cosina" → Cocina y hogar, con facetas coherentes (material, categoría).
5. Desborde horizontal en el celular en tres páginas: la tabla de ofertas (pasó a tarjetas), los campos del checkout (grillas con `minmax(0, 1fr)`) y la barra del panel.
6. La tabla de frontera comparaba ₲ con R$ sin equivalencia: no servía para decidir. Ahora dice "≈ ₲ 258.000" debajo de cada país.
7. "Agregar al carrito" se partía en dos líneas en la caja de compra: va a lo ancho, debajo de la cantidad.
8. Las cifras salían con el cero con barra de Atkinson ("₲ 8Ø1.ØØØ"). Todos los importes pasan a Schibsted.

**Ronda 2**
1. La etiqueta "Paraguay" del mapa quedó encima del párrafo. La subí al costado del río.
2. En el celular, el nombre de la tienda quedaba oscuro sobre la portada oscura. La cabecera de la tienda baja debajo de la portada.
3. El panel del vendedor no tenía margen lateral en el celular.
4. Sin desborde horizontal en ninguna de las 7 páginas (medido con `scrollWidth` en 390 px).
5. En el celular, el total del carrito quedaba al final de todo. Ahora hay una barra fija con el total y "Ir a pagar", como la de la ficha.
6. El gráfico del panel en el celular tenía 30 barras ilegibles: ahora muestra los últimos 14 días, más alto.

**Ronda 3 (con las fotos finales y Lighthouse)**
1. La sombra de cada foto terminaba en un cuadrado gris sobre la tarjeta: ahora se desvanece en óvalo (`npm run fotos:web`).
2. El reloj, la llave, la cámara, los útiles y el juego de té quedaban diminutos (el script normalizaba por la medida mayor): cada uno tiene su zoom.
3. Lighthouse marcaba saltos de diseño (CLS hasta 0,69 en escritorio): el encabezado y las grillas se armaban después de pintar. Los scripts pasaron al final del `body` y arman todo antes del primer pintado; las fuentes se sirven desde el repo con precarga y `font-display: optional`, y `scrollbar-gutter: stable` evita el salto cuando aparece la barra. CLS 0 en las siete páginas.
4. Orden de encabezados: en la búsqueda y la tienda las tarjetas usaban `h3` sin un `h2` antes. Ahora el nivel se elige por grilla.

## En qué todavía no

- **Fotos:** son modelos 3D de estudio (CC0). Una tienda real necesita fotos de cada vendedor, con fondos distintos; la fase 1 tiene que definir cómo se normalizan (recorte automático y fondo neutro).
- **Contenido escaso:** 20 productos de ejemplo. Amazon y ML se sienten "infinitos"; con el seed de 400 productos de la fase 1 se va a notar si la grilla aguanta.
- **Idiomas:** las maquetas están en español. El selector de idioma existe, pero los textos en portugués e inglés llegan en la fase 1 (con next-intl).
- **Precios fijos en el HTML:** algunos importes de ejemplo (ofertas de otros vendedores, cuotas del checkout) están escritos a mano para Paraguay; si cambiás de región, solo se recalculan las tarjetas, la ficha y el desglose.
- **Rendimiento del carrito en el celular:** entre 93 y 95 según la corrida; el elemento más grande es la franja del aviso de demo y la demora viene del servidor de prueba (`http.server` de Python). En un hosting estático debería quedar arriba de 95.
- **Accesibilidad sin auditar con lectores de pantalla:** hay foco visible, etiquetas y roles, pero falta probar con NVDA y TalkBack.

---

## Fase 1: la tienda programada (25/11/2026)

### Rondas de crítica

**Ronda 1 (sin fotos todavía)**
1. En el celular, el precio y el botón de compra quedaban debajo de las viñetas, casi en la segunda pantalla. Ahora van justo después de las opciones (la grilla de la ficha usa áreas distintas en escritorio y celular).
2. El botón **Filtrar** del celular quedaba al final de la página (un `order` de la grilla). Pasó a la barra de resultados, al lado de Ordenar.
3. La portada en el celular ocupaba casi dos pantallas; los botones de país se partían en dos líneas.
4. La barra de categorías no entra entera en 1440 px y se cortaba seca: ahora se desvanece al borde.
5. Las migas repetían el título del producto en el celular.

**Ronda 2 (con las 690 fotos)**
1. En la página de una tienda, las tarjetas mostraban el precio y el nombre de **otro** vendedor (el más barato). Ahora muestran la oferta de esa tienda.
2. El nombre de la tienda quedaba encima de la franja de color, ilegible.
3. Tres productos no coincidían con su foto (marcos vacíos vendidos como "cuadro de paisaje"): renombrados.
4. 19 modelos tenían variantes de color que casi no se distinguían (cuero oscuro, metal, madera): se sacaron. Mejor 337 productos que fotos que no muestran lo que dice el nombre.
5. "La oferta más grande de hoy" mostraba una caja de plástico gris: ahora elige la mayor rebaja entre productos de más de US$ 40 y bien calificados.
6. La ficha arrancaba en una oferta sin stock (la más barata) y con el botón desactivado: ahora arranca en la más barata con stock.
7. El logo de las tiendas con colores claros (amarillo ipê, celeste) tenía texto blanco con contraste 1,96:1: el texto se elige según el contraste.

### Contra Amazon y Mercado Libre

| | Tríplice | Amazon | Mercado Libre |
| --- | --- | --- | --- |
| Tolerancia a errores de tipeo | Corrige y **avisa** qué buscó | Corrige, a veces sin avisar | Corrige |
| Comparar vendedores del mismo producto | En la ficha, con un clic cambia la caja de compra | "Otros vendedores", en otra pantalla | Solo en algunos productos (catálogo) |
| Precio en otra moneda | Equivalencia en las otras tres monedas en la ficha | No | No |
| Opiniones en otro idioma | Se muestran en el original con el idioma marcado | Traducción automática | No aplica |
| Filtros sin JavaScript / URL compartible | Sí | Sí | Sí |
| Volumen y fotos reales de vendedores | 337 productos de ejemplo, fotos de estudio | Millones | Millones |
| Rendimiento en el celular (Lighthouse simulado) | 87 a 98 | Variable, en general menor | Variable |

Todavía no: carrito, impuestos por país, pago, cuentas, escribir opiniones y preguntas (fases 2 y 3), y la etiqueta de frontera con impuestos (fase 2).

### Lighthouse (build de producción, local)

Rendimiento / Accesibilidad / Buenas prácticas / SEO. "Celular" es la configuración por defecto de Lighthouse 12 (simulación de 4G lento y CPU 4× más lenta); "celular real" aplica esa misma limitación de verdad con DevTools.

| Página | Escritorio | Celular | Celular real (LCP) |
| --- | --- | --- | --- |
| Inicio | 99 / 100 / 100 / 100 | 87 / 100 / 100 / 100 | 94 (1,6 s) |
| Categoría | 100 / 100 / 100 / 100 | 90 / 100 / 100 / 100 | 93 (1,9 s) |
| Búsqueda | 100 / 100 / 100 / 63 | 90 / 100 / 100 / 63 | 91 (2,0 s) |
| Ficha | 100 / 100 / 100 / 100 | 88 / 100 / 100 / 100 | 91 (2,0 s) |
| Tienda | 100 / 100 / 100 / 100 | 90 a 98 / 100 / 100 / 100 | 89 (1,5 s) |

- **SEO 63 en la búsqueda es a propósito:** los resultados de búsqueda llevan `noindex` (recomendación de Google para no indexar búsquedas internas). Las categorías, que son el contenido indexable, dan 100.
- **Rendimiento en el celular por debajo de 95:** el LCP *observado* es de 0,3 a 0,8 s, pero la simulación lo estima en 3,5 s por el trabajo de JavaScript de la hidratación (TBT de 250 a 420 ms con la limitación real). Lo que ya se hizo: CSS incrustado, `content-visibility` en lo que está fuera de pantalla, la animación del río limitada a dos vueltas, prioridad de imágenes solo donde el LCP es una foto y fuentes con `display: optional`. Lo que falta: reducir el JavaScript del cliente (ver la autocrítica en INFORME.md).

## Fase 2: compra (25/11/2026)

### Rondas de crítica
- **Ronda 1:** el cupón aplicado quedaba apretado en una columna, con el ícono diminuto; en el resumen se colaba el cero con barra de Atkinson ("IVA 1Ø %"); la línea del total no cruzaba todo el ancho; el pie decía "Fase 1"; el mapa de retiro era casi todo campo vacío, sin ciudades y con "Puente de la Amistad" cortado.
- **Ronda 2:** en el celular los nombres del mapa medían 6 px y se pisaban con el río; faltaban los países y Puerto Iguazú; el botón "Pagar ₲ 5.496.ØØØ" usaba la fuente con el cero tachado.
- **Bugs que encontró la prueba de punta a punta:** el contador del carrito seguía en 1 después de pagar (solo releía la cookie al cargar); el texto "Carrito: {n} unidades" rompía next-intl en el servidor; la carga diferida tocaba el DOM antes de la hidratación.

### Contra Amazon y Mercado Libre
- **Mejor:** el precio de la tarjeta es el que se paga (impuesto incluido y la misma cifra en el carrito); el carrito agrupa por vendedor y dice qué envío cobra cada uno; el retiro en el local muestra en un mapa dónde queda cada tienda y en cuántas horas está listo; los errores del formulario dicen cómo arreglarlos (CEP de 8 números, código postal argentino).
- **Todavía no:** no hay cuotas ni otros medios de pago (transferencia, Pix); el comprobante vive en el navegador hasta que haya cuentas (fase 3); el envío no se puede programar por franja horaria.

## Fase 3: cuentas, pedidos y opiniones (26/11/2026)

### Rondas de crítica (1440 y 390 px)

**Ronda 1**
1. En el celular, el botón de la cuenta mandaba el carrito a una segunda fila del encabezado. La cuenta pasó al menú ☰ y el encabezado quedó como antes.
2. Las cuatro etiquetas del trayecto se pisaban en 390 px. En el celular quedan los puntos (con su texto para lectores de pantalla) y una línea "Estado: En camino".
3. El paso marcado era el próximo que faltaba: "Entregado" aparecía en negrita en un pedido que estaba en camino. Ahora se marca dónde está el pedido.
4. "Pedir devolución" cerrado se veía como una caja gris y estiraba el botón "Opinar". Cerrado es un botón; abierto ocupa todo el ancho.
5. El `<title>` dentro del contenido dinámico no reemplazaba al del layout (pasaba también en el carrito, el pago y el comprobante de la fase 2). Todo pasó a `generateMetadata`.
6. El pie seguía diciendo "Fase 2".

**Ronda 2**
1. La opinión recién publicada no aparecía entre las primeras de la ficha (se ordenaba por votos y se cortaba en 30). Ahora las que tienen fotos van primero.
2. "Me fue útil" guardaba el voto pero la ficha no se actualizaba (el redirect a la misma URL no vuelve a pedir los datos). El botón se actualiza en el lugar con el número nuevo.
3. Votar recalculaba el contador desde cero y borraba los votos del seed. Ahora suma y resta.
4. Con una dirección guardada elegida, el pago repetía todos los campos. Se ocultan y viajan igual; aparecen con "Otra dirección" o si alguno no pasa la validación.
5. El PDF: los números salían con el cero con barra de Atkinson y la hora en "p. m.". Montos y fechas en Schibsted, hora de 24 h y el isotipo real con los dos ríos.
6. El menú de la cuenta no marcaba la página en una carga completa (`usePathname` traía el segmento interno `/py-pyg`).

### Contra Amazon y Mercado Libre
- **Mejor:** el trayecto con la fecha de cada parada y el retiro en el local; la devolución sale del mismo producto del pedido, con el plazo a la vista; las respuestas dicen si las dio la tienda o alguien que lo recibió; el comprobante dice en la cabecera que es simulado.
- **Peor:** no hay seguimiento del envío con mapa ni avisos por correo o WhatsApp; las fotos de las opiniones no tienen galería a pantalla completa; el carrito con sesión sigue en la cookie (no se comparte entre dispositivos).

### Lighthouse (build de producción, local, mediana de 3 corridas)

| Página | Celular | Escritorio |
| --- | --- | --- |
| Entrar | 81 / 100 / 100 / 66 | 100 / 100 / 100 / 66 |
| Mis pedidos (con sesión) | 85 / 100 / 100 / 66 | 99 / 100 / 100 / 66 |
| Pedido (con sesión) | 80 / 100 / 100 / 66 | 99 / 100 / 100 / 66 |
| Opinar (con sesión) | 83 / 100 / 100 / 66 | 99 / 100 / 100 / 66 |
| Ficha (sin sesión) | 91 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |

SEO 66 en la cuenta es a propósito (`noindex`). En el celular, las páginas de la cuenta se arman en cada visita y el CSS de todo el sitio va incrustado (sumó ~27 KB sin comprimir con la cuenta); queda para la fase 6.
