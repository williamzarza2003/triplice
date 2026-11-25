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

## En qué todavía no

- **Fotos:** son modelos 3D de estudio (CC0). Una tienda real necesita fotos de cada vendedor, con fondos distintos; la fase 1 tiene que definir cómo se normalizan (recorte automático y fondo neutro).
- **Contenido escaso:** 20 productos de ejemplo. Amazon y ML se sienten "infinitos"; con el seed de 400 productos de la fase 1 se va a notar si la grilla aguanta.
- **Idiomas:** las maquetas están en español. El selector de idioma existe, pero los textos en portugués e inglés llegan en la fase 1 (con next-intl).
- **Precios fijos en el HTML:** algunos importes de ejemplo (ofertas de otros vendedores, cuotas del checkout) están escritos a mano para Paraguay; si cambiás de región, solo se recalculan las tarjetas, la ficha y el desglose.
- **Accesibilidad sin auditar con lectores de pantalla:** hay foco visible, etiquetas y roles, pero falta probar con NVDA y TalkBack.
