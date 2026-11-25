// Script clásico (sin módulos): así las maquetas abren con doble clic, sin servidor.
// Datos de ejemplo para las maquetas de la fase 0. Todo es ficticio: marcas, vendedores y precios.
// En la fase 1 esto sale de Supabase (ver docs/arquitectura.md).

const MONEDAS = {
  PYG: { simbolo: '₲', decimales: 0, locale: 'es-PY', redondeo: 1000 },
  BRL: { simbolo: 'R$', decimales: 2, locale: 'pt-BR', redondeo: 0.1 },
  ARS: { simbolo: '$', decimales: 0, locale: 'es-AR', redondeo: 100 },
  USD: { simbolo: 'US$', decimales: 2, locale: 'en-US', redondeo: 0.01 },
}

// Cotizaciones de ejemplo (unidades de cada moneda por 1 USD). En la fase 1 se leen de Cambio CDE.
const COTIZACION = { USD: 1, PYG: 7350, BRL: 5.45, ARS: 1180 }

// Región → moneda, impuesto general y reducido (simulación aproximada, ver docs/arquitectura.md)
const REGIONES = {
  PY: { nombre: 'Paraguay', moneda: 'PYG', iva: 0.10, ivaReducido: 0.05, etiqueta: 'IVA incluido', ciudad: 'Ciudad del Este' },
  BR: { nombre: 'Brasil', moneda: 'BRL', iva: 0.25, ivaReducido: 0.12, etiqueta: 'impostos inclusos (estimado)', ciudad: 'Foz do Iguaçu' },
  AR: { nombre: 'Argentina', moneda: 'ARS', iva: 0.21, ivaReducido: 0.105, etiqueta: 'IVA incluido', ciudad: 'Puerto Iguazú' },
  INT: { nombre: 'Internacional', moneda: 'USD', iva: 0, ivaReducido: 0, etiqueta: 'sin impuestos locales', ciudad: '' },
}

const VENDEDORES = {
  nubla: { nombre: 'Casa Nubla', ciudad: 'Ciudad del Este', reputacion: 98, ventas: 12840, respuesta: '1 h', aTiempo: 97, desde: 2014 },
  arandu: { nombre: 'Arandu Electrónica', ciudad: 'Ciudad del Este', reputacion: 96, ventas: 8420, respuesta: '2 h', aTiempo: 95, desde: 2017 },
  ita: { nombre: 'Taller Itá', ciudad: 'Itá', reputacion: 99, ventas: 960, respuesta: '4 h', aTiempo: 99, desde: 2020 },
  tatu: { nombre: 'Ferretería Tatu', ciudad: 'Hernandarias', reputacion: 95, ventas: 5210, respuesta: '3 h', aTiempo: 93, desde: 2011 },
  foz: { nombre: 'Loja Ponte', ciudad: 'Foz do Iguaçu', reputacion: 94, ventas: 3100, respuesta: '5 h', aTiempo: 91, desde: 2019 },
  misiones: { nombre: 'Almacén Misiones', ciudad: 'Puerto Iguazú', reputacion: 97, ventas: 2240, respuesta: '2 h', aTiempo: 96, desde: 2016 },
}

// precio en USD sin impuestos · antes: precio anterior (oferta) · reducido: categoría con IVA reducido
const PRODUCTOS = [
  { id: 'Television_01', nombre: 'Televisor LED 43" Full HD con sintonizador digital', marca: 'Nubla', cat: 'Electrónica', usd: 214, antes: 259, estrellas: 4.6, opiniones: 1203, vendedor: 'nubla', envio: 'manana', cuotas: 12 },
  { id: 'classic_laptop', nombre: 'Notebook 14" Kapé Classic, 8 GB y 256 GB SSD', marca: 'Kapé', cat: 'Computación', usd: 389, estrellas: 4.3, opiniones: 412, vendedor: 'arandu', envio: 'manana', cuotas: 12 },
  { id: 'boombox', nombre: 'Parlante portátil con radio FM y Bluetooth, 30 W', marca: 'Bomba', cat: 'Electrónica', usd: 58, antes: 72, estrellas: 4.7, opiniones: 2380, vendedor: 'arandu', envio: 'hoy', cuotas: 6 },
  { id: 'Camera_01', nombre: 'Cámara de rollo 35 mm Ojo Clásica, con correa de cuero', marca: 'Ojo', cat: 'Fotografía', usd: 129, estrellas: 4.4, opiniones: 188, vendedor: 'foz', envio: 'semana', cuotas: 6 },
  { id: 'gaming_console', nombre: 'Consola retro Arandu 8 bits, 2 joysticks y 400 juegos', marca: 'Arandu', cat: 'Videojuegos', usd: 46, estrellas: 4.1, opiniones: 3310, vendedor: 'arandu', envio: 'hoy', cuotas: 3 },
  { id: 'digital_wrist_watch', nombre: 'Reloj digital Yvy Sport, sumergible 50 m', marca: 'Yvy', cat: 'Moda', usd: 24, antes: 31, estrellas: 4.5, opiniones: 865, vendedor: 'nubla', envio: 'manana', cuotas: 3 },
  { id: 'ArmChair_01', nombre: 'Sillón de pana Siesta, un cuerpo, patas de madera', marca: 'Siesta', cat: 'Hogar', usd: 178, estrellas: 4.8, opiniones: 96, vendedor: 'misiones', envio: 'semana', cuotas: 12 },
  { id: 'Drill_01', nombre: 'Taladro percutor 650 W con maletín y 13 mechas', marca: 'Tatu', cat: 'Herramientas', usd: 52, estrellas: 4.6, opiniones: 1540, vendedor: 'tatu', envio: 'manana', cuotas: 6 },
  { id: 'adjustable_wrench', nombre: 'Llave ajustable 10" de acero forjado', marca: 'Tatu', cat: 'Herramientas', usd: 9, estrellas: 4.7, opiniones: 702, vendedor: 'tatu', envio: 'hoy', cuotas: 1 },
  { id: 'binoculars', nombre: 'Binoculares 10×42 Mirador, a prueba de agua', marca: 'Mirador', cat: 'Deportes', usd: 74, antes: 89, estrellas: 4.5, opiniones: 233, vendedor: 'foz', envio: 'semana', cuotas: 6 },
  { id: 'ceramic_vase_02', nombre: 'Florero de cerámica de Itá, hecho a mano, 28 cm', marca: 'Taller Itá', cat: 'Hogar', usd: 19, estrellas: 4.9, opiniones: 147, vendedor: 'ita', envio: 'semana', cuotas: 1 },
  { id: 'croissant', nombre: 'Medialunas de manteca × 6, horneadas hoy', marca: 'Almacén Misiones', cat: 'Supermercado', usd: 4.2, estrellas: 4.6, opiniones: 520, vendedor: 'misiones', envio: 'hoy', cuotas: 1, reducido: true },
  { id: 'desk_lamp_arm_01', nombre: 'Lámpara de escritorio articulada, luz cálida', marca: 'Nubla', cat: 'Hogar', usd: 27, estrellas: 4.4, opiniones: 391, vendedor: 'nubla', envio: 'manana', cuotas: 3 },
  { id: 'food_avocado_01', nombre: 'Paltas Hass × 1 kg, de Alto Paraná', marca: 'Almacén Misiones', cat: 'Supermercado', usd: 2.9, estrellas: 4.3, opiniones: 88, vendedor: 'misiones', envio: 'hoy', cuotas: 1, reducido: true },
  { id: 'pot_enamel_01', nombre: 'Olla enlozada 24 cm con tapa, 6 L', marca: 'Casa Nubla', cat: 'Cocina', usd: 31, estrellas: 4.7, opiniones: 640, vendedor: 'nubla', envio: 'manana', cuotas: 3 },
  { id: 'potted_plant_02', nombre: 'Sansevieria en maceta de barro, 45 cm', marca: 'Vivero Ka\'aguy', cat: 'Jardín', usd: 12, estrellas: 4.8, opiniones: 210, vendedor: 'ita', envio: 'semana', cuotas: 1 },
  { id: 'stationery_supplies', nombre: 'Set de útiles escolares: 24 piezas con cartuchera', marca: 'Arandu', cat: 'Librería', usd: 15, antes: 19, estrellas: 4.2, opiniones: 970, vendedor: 'arandu', envio: 'hoy', cuotas: 1 },
  { id: 'tea_set_01', nombre: 'Juego de té de porcelana, 6 tazas con tetera', marca: 'Casa Nubla', cat: 'Cocina', usd: 48, estrellas: 4.6, opiniones: 154, vendedor: 'nubla', envio: 'semana', cuotas: 6 },
  { id: 'vintage_electric_kettle', nombre: 'Pava eléctrica 1,7 L con corte para mate', marca: 'Nubla', cat: 'Cocina', usd: 29, antes: 35, estrellas: 4.7, opiniones: 2110, vendedor: 'nubla', envio: 'hoy', cuotas: 3 },
  { id: 'Ukulele_01', nombre: 'Ukelele soprano de caoba con funda', marca: 'Arandu', cat: 'Música', usd: 39, estrellas: 4.5, opiniones: 301, vendedor: 'foz', envio: 'semana', cuotas: 3 },
]

const CATEGORIAS = [
  'Supermercado', 'Electrónica', 'Celulares', 'Computación', 'Hogar', 'Cocina', 'Herramientas',
  'Moda', 'Belleza', 'Deportes', 'Juguetes', 'Bebés', 'Mascotas', 'Librería', 'Música', 'Jardín',
]
