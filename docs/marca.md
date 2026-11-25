# Marca

> Tríplice es un proyecto de portafolio. Productos, vendedores, reseñas y pagos son ficticios o de prueba, y la interfaz lo dice en el pie de página.

## Nombre

**Tríplice**, por la *Tríplice Fronteira*: el punto donde se tocan Paraguay, Brasil y Argentina. Se entiende igual en español y en portugués, y en inglés suena a "triple" sin traducción.

- El nombre vive en una sola constante: [`tokens/marca.ts`](../tokens/marca.ts) (`MARCA.nombre`). Cambiarlo ahí cambia las maquetas, los metadatos y el logotipo (el SVG se regenera con `py -3.14 herramientas/marca/logotipo.py`).
- Alternativa para que elija William: **Ñemu** ("comercio" en guaraní). Más corto y más propio de Paraguay, pero un brasileño o un argentino no lo lee de entrada.

## Concepto

En la confluencia del Paraná y el Iguazú, dos ríos dibujan una **Y** que divide la tierra en tres países. Desde el Hito de las Tres Fronteras se ven los tres a la vez. Así se piensa la tienda: **un solo lugar desde donde ves los tres mercados**, con el precio en tu moneda, los impuestos de tu país y el envío a tu ciudad.

No es "el shopping de Ciudad del Este en internet": es el lugar donde comparar, entender y comprar es más fácil que en la calle Monseñor Rodríguez a las once de la mañana.

## Logo

| Archivo | Uso |
| --- | --- |
| [`marca/isotipo.svg`](../marca/isotipo.svg) | Isotipo solo: avatar, app, sello en el pie |
| [`marca/logotipo.svg`](../marca/logotipo.svg) | Encabezado sobre fondo claro |
| [`marca/logotipo-claro.svg`](../marca/logotipo-claro.svg) | Sobre Agua o fotos oscuras |
| [`marca/favicon.svg`](../marca/favicon.svg) | Pestaña del navegador (ríos más anchos, para que se lean a 16 px) |

- **El isotipo:** un círculo de tierra que los dos ríos cortan en tres. A la izquierda Paraguay, arriba a la derecha Brasil y abajo Argentina. El punto amarillo es Ciudad del Este, sobre la orilla paraguaya, a pocos kilómetros de la confluencia.
- **El logotipo:** Schibsted Grotesk Bold con un espaciado apenas cerrado (−2 %), convertido a trazos para que se vea igual en cualquier lado.
- **Área de respeto:** la altura del punto amarillo × 3 alrededor. Tamaño mínimo: 20 px de alto el logotipo, 16 px el favicon.
- **No hacer:** poner el isotipo con los colores de las banderas (es un mapa, no una alianza política), girarlo, o usar el amarillo como fondo.

## Tono de voz

**Como un vendedor de confianza de CDE que habla tres idiomas:** directo, concreto, sin apurarte. Dice el precio final, el día de entrega y qué pasa si algo sale mal. Nada de "¡Increíble oferta!" ni de urgencias falsas.

| Principio | Sí | No |
| --- | --- | --- |
| El número primero | "Llega el jueves 4" | "Envío rápido" |
| Precio honesto | "₲ 1.290.000 con IVA incluido" | "Desde ₲ 999.000*" |
| Botones que dicen qué pasa | "Agregar al carrito" · "Pagar ₲ 1.290.000" | "Continuar" · "OK" |
| Errores que ayudan | "Ese CEP no existe. Tiene 8 números, como 85851-000." | "Dato inválido" |
| Cercanía sin exagerar | voseo en Paraguay y Argentina | "¡Hola, amigo! 😊" |

### Un mismo mensaje en los tres idiomas

No se traduce palabra por palabra: cada idioma usa su forma natural de hablarle al cliente.

| | Español (PY/AR) | Português (BR) | English |
| --- | --- | --- | --- |
| Promesa | Los tres mercados de la frontera, en una sola tienda. | Os três mercados da fronteira, numa loja só. | Three border markets, one store. |
| Entrega | Llega el jueves a tu casa en Encarnación. | Chega na quinta na sua casa em Foz. | Arrives Thursday at your door in Posadas. |
| Precio | Precio final, con IVA. Sin sorpresas al pagar. | Preço final, com impostos. Sem surpresa no pagamento. | Final price, tax included. No surprises at checkout. |
| Carrito vacío | Tu carrito está vacío. Mirá lo que guardaste para después. | Seu carrinho está vazio. Veja o que você salvou para depois. | Your cart is empty. See what you saved for later. |
| Error de pago | La tarjeta fue rechazada por el banco. Probá con otra o pagá con Pix. | O cartão foi recusado pelo banco. Tente outro ou pague com Pix. | Your bank declined the card. Try another one. |
| Aviso de demo | Tienda de demostración: los productos y pagos son de prueba. | Loja de demonstração: produtos e pagamentos são de teste. | Demo store: products and payments are not real. |

- **Español:** voseo ("mirá", "pagá") para Paraguay y Argentina. Guaraní solo en guiños puntuales (por ejemplo "Ñemu" si se elige ese nombre), nunca en textos de los que dependa una compra.
- **Português:** "você", tono de app brasileña (Mercado Livre, Nubank): cercano y claro.
- **English:** neutral y breve, para turistas y compradores internacionales.

## Fotografía

- Producto: fondo transparente con sombra de contacto, la misma luz y el mismo ángulo en todo el catálogo. Así la grilla se ve como una tienda curada y no como diez vendedores con diez fondos distintos.
- En la fase 0 las fotos salen de **modelos 3D CC0 de Poly Haven** fotografiados en un estudio de Blender ([`herramientas/fotos/fotografiar.py`](../herramientas/fotos/fotografiar.py)). En la fase 1 se suman fotos con licencia libre (Unsplash, Pexels) con el mismo tratamiento.
- Ambientes (portada, categorías): luz natural de la región. Nada de stock genérico de "familia feliz en el living".
