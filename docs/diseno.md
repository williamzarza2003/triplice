# Sistema de diseño

Fuente única de verdad: [`tokens/tokens.css`](../tokens/tokens.css) (variables CSS). Las maquetas de [`maquetas/`](../maquetas/) lo usan tal cual y en la fase 1 se importa en `app/globals.css` de Next.js. Para ver todo junto, abrí [`maquetas/index.html`](../maquetas/index.html) con doble clic (no necesita servidor).

## Principios

1. **Mucha información, pocos niveles.** Cada pantalla tiene tres niveles de lectura: *qué es* → *cuánto cuesta en tu moneda* → *cuándo llega y quién lo vende*. Lo demás está a un toque.
2. **El número primero.** Precio final con impuestos, día de entrega, porcentaje de reputación. Nada de "envío rápido" ni "gran vendedor".
3. **Una sola idea fuerte por página.** En el inicio, el mapa de la confluencia; en la ficha, la tabla del mismo producto en los tres países. El resto, sobrio.
4. **Celular primero.** La mayoría compra desde el celular. Ahí la tarjeta pasa a dos columnas y la compra queda fija abajo.

## Color

Fondos fríos y una sola tinta de marca. Nada de crema, nada de amarillo-Mercado-Libre en los botones.

| Token | Hex | Rol | Contraste (WCAG) |
| --- | --- | --- | --- |
| `--agua-900` | `#0F3D3E` | Agua del Paraná: marca, encabezado, enlaces, foco | blanco encima 12,0:1 |
| `--agua-700` | `#1F5F60` | Hover de enlaces y secundarios | blanco encima 7,3:1 |
| `--agua-100` | `#E2ECEA` | Selección, chips activos | tinta encima 13,8:1 |
| `--lapacho-700` | `#A6215C` | **Acción principal**: Agregar al carrito, Pagar | blanco encima 7,0:1 |
| `--lapacho-800` | `#87194A` | Hover de la acción | blanco encima 9,3:1 |
| `--ipe-400` | `#F2C230` | **Solo ofertas**: sello de descuento, buscador | tinta encima 9,9:1 |
| `--ipe-900` sobre `--ipe-100` | `#7A5A00` / `#FFF4CC` | "Quedan 2", contador de la oferta | 5,8:1 |
| `--tinta` | `#16201F` | Texto principal | 16,7:1 sobre blanco |
| `--tinta-2` | `#46524F` | Texto secundario | 8,1:1 |
| `--tinta-3` | `#5E6B68` | Metadatos chicos | 5,6:1 sobre blanco, 5,1:1 sobre neblina |
| `--neblina` | `#F3F6F5` | Fondo de página | — |
| `--exito` | `#1A6B4A` | "Llega mañana", reputación alta | 6,5:1 |
| `--error` | `#B3261E` | Errores de formulario | 6,5:1 |

- **Por qué lapacho y no amarillo para comprar:** Mercado Libre es amarillo y Amazon es naranja. El lapacho en flor es de acá, contrasta con el verde agua y no se confunde con una oferta.
- **El ipê amarillo** es el mismo árbol en Brasil y se reserva para lo que dura poco: descuentos y la oferta del día. Si todo es amarillo, nada es oferta.
- Los nombres son del paisaje de la frontera (agua, lapacho, ipê, neblina) para que el equipo hable de colores sin decir "el violeta ese".

## Tipografía

| Familia | Rol | Por qué |
| --- | --- | --- |
| **Schibsted Grotesk** (500, 700, 800) | Títulos, precios, todas las cifras | Grotesca con personalidad sin ser rara. Cifras tabulares (`tabular-nums`): los precios se alinean en columnas. Soporta todos los acentos de es/pt (ã, õ, ç, ñ) y el ₲. |
| **Atkinson Hyperlegible Next** (400, 700) | Texto, datos, formularios | Diseñada para baja visión: cada letra se distingue (I/l/1, rn/m). Ideal para fichas técnicas y formularios largos. |

- **Regla práctica:** las cifras de dinero van siempre en Schibsted. Atkinson tiene el cero con barra, que en un precio se lee como "Ø" (lo detecté en la primera ronda de capturas).
- **Escala** (base 16, razón 1,2): 11 · 13 · 14 · 16 · 19 · 23 · 28 · 33 · 40 px. El 13 es el tamaño de los metadatos de la tarjeta: menos de eso no se lee en el celular a pleno sol.
- Interlineado 1,5 en texto y 1,15 en títulos.

## Espacios, radios y sombras

- **Espacios** en base 4: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72.
- **Radios con jerarquía** (cuanto más grande el contenedor, más grande el radio):
  - 6 px: controles (botones, campos, sellos).
  - 10 px: tarjetas de producto y ofertas.
  - 16 px: paneles, diálogos y la hoja inferior del celular.
  - 999 px: chips de filtro y el botón de la etiqueta de frontera.
- **Sombras:** la tarjeta va **plana con borde** (no "tarjetas idénticas con sombra gris"). La sombra aparece solo cuando algo flota: autocompletado, diálogos, hoja inferior y la tarjeta bajo el mouse.

## Íconos

Trazo de 1,75 px, esquinas redondeadas, en una grilla de 24 px (estilo Lucide, dibujados en [`maquetas/app.js`](../maquetas/app.js) para no sumar una dependencia en la fase 0). Tamaños: 16 px en metadatos y 22 px en navegación. Siempre con texto al lado o con `aria-label`; nunca un ícono solo para una acción importante.

## Estados

| Estado | Cómo se ve |
| --- | --- |
| Hover | Botones: un tono más oscuro. Tarjeta: sombra suave y la foto crece 3 %. Enlaces: `--agua-700`. |
| Foco (teclado) | Anillo doble de 2 + 2 px (papel + agua) que se ve sobre claro; sobre el encabezado oscuro, agua + ipê. En la tarjeta, el anillo rodea la tarjeta entera. |
| Seleccionado | Borde de 2 px agua y fondo `--agua-50` (envíos, región, variantes). |
| Deshabilitado | Opacidad 45 % y cursor bloqueado; las variantes sin stock van tachadas y dicen cuándo vuelven. |
| Error | Borde de 2 px rojo, ícono y un mensaje que dice **cómo** resolverlo ("Probá con otra tarjeta o elegí transferencia"). |
| Éxito | Verde monte con ícono de check; nunca solo color. |
| Cargando | Esqueletos del tamaño final (fase 1), sin saltos de diseño. |

Movimiento: 120 a 220 ms con una curva suave; todo se apaga con `prefers-reduced-motion`.

## La tarjeta de producto (la pieza clave)

Amazon muestra mucho pero todo pesa lo mismo; Mercado Libre muestra poco. La tarjeta de Tríplice muestra **siete datos en tres niveles**, sin recargarse:

```
┌────────────────────────┐
│ [-17 %]                │  ← ipê: solo si hay oferta
│        (foto)          │    fondo neblina, misma luz en todo el catálogo
├────────────────────────┤
│ Pava eléctrica 1,7 L   │  1. Qué es: 2 líneas como máximo
│ con corte para mate    │
│ ★ 4,7 (2.110)          │
│ ₲ 234.000  ₲ 283.000 ⇄ │  2. Cuánto: precio final en tu moneda, grande y tabular
│ 3 × ₲ 78.000 sin int.  │     cuotas en gris
│ 🚚 Retiralo hoy en CDE  │  3. Cuándo y quién: entrega en verde si es rápida,
│ Casa Nubla · 98 % rec. │     vendedor y reputación en el gris más chico
└────────────────────────┘
```

- **Etiqueta de frontera (⇄):** la idea fuerte de la marca. Un toque muestra el precio final del mismo producto en los otros dos países, cada uno con su impuesto. En la ficha se amplía a una tabla con la equivalencia en tu moneda ("Argentina $ 41.400 ≈ ₲ 258.000").
- Toda la tarjeta es clic (el título se estira por encima), pero la etiqueta de frontera queda arriba y se puede tocar sola.
- En el celular: dos columnas, precio a 16 px y el vendedor se corta con "…" antes que romper la grilla.

## Componentes en las maquetas

Encabezado con buscador y autocompletado (tolera tildes y una letra cambiada), selector de región/moneda/idioma en un diálogo, migas, chips de filtros activos, hoja de filtros en el celular, galería con miniaturas, variantes con stock, caja de compra fija, tabla de ofertas por vendedor, ficha técnica tipada, distribución de estrellas, preguntas, líneas del carrito por vendedor, pasos del checkout, desglose de impuestos, KPIs y gráfico del panel, tabla de pedidos con estados.
