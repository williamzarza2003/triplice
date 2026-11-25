// Las 15 tiendas ficticias de la triple frontera: qué venden, dónde están y cómo les va.
import type { Texto } from './categorias.ts'

export type Tienda = {
  slug: string
  nombre: string
  pais: 'PY' | 'BR' | 'AR'
  ciudad: string
  direccion: string
  lat: number
  lng: number
  desde: number
  color: string
  lema: Texto
  descripcion: Texto
  /** categorías principales que vende (la primera es la fuerte) */
  rubros: string[]
  /** venden un poco de todo: aparecen como segunda oferta en cualquier rubro */
  generalista?: boolean
  envioGratisDesde: number // USD
  preparacionH: number
  reputacion: { recomendacion: number; opiniones: number; ventas_12m: number; respuesta_min: number; a_tiempo: number }
  horario: Texto
}

const t = (es: string, pt: string, en: string): Texto => ({ es, pt, en })

export const TIENDAS: Tienda[] = [
  {
    slug: 'casa-nubla', nombre: 'Casa Nubla', pais: 'PY', ciudad: 'Ciudad del Este', direccion: 'Av. Monseñor Rodríguez 1180',
    lat: -25.5097, lng: -54.6111, desde: 2014, color: '#0f3d3e', rubros: ['electrodomesticos', 'cocina', 'decoracion', 'iluminacion'], generalista: true,
    envioGratisDesde: 60, preparacionH: 2,
    lema: t('Todo para la casa, a dos cuadras del Puente.', 'Tudo para a casa, a duas quadras da Ponte.', 'Everything for the home, two blocks from the Bridge.'),
    descripcion: t(
      'Casa de electrodomésticos y bazar con 12 años en el microcentro de Ciudad del Este. Probamos cada equipo antes de entregarlo y cambiamos en el acto lo que viene fallado.',
      'Loja de eletrodomésticos e utilidades com 12 anos no centro de Ciudad del Este. Testamos cada aparelho antes da entrega e trocamos na hora o que vier com defeito.',
      'Appliance and homeware store, 12 years in downtown Ciudad del Este. Every unit is tested before delivery and faulty items are swapped on the spot.'),
    horario: t('Lunes a sábado de 7 a 18 h', 'Segunda a sábado, das 7h às 18h', 'Mon–Sat, 7 am to 6 pm'),
    reputacion: { recomendacion: 98, opiniones: 4102, ventas_12m: 12840, respuesta_min: 60, a_tiempo: 97 },
  },
  {
    slug: 'arandu-electronica', nombre: 'Arandu Electrónica', pais: 'PY', ciudad: 'Ciudad del Este', direccion: 'Galería Jebai, local 214',
    lat: -25.5089, lng: -54.6127, desde: 2017, color: '#22345a', rubros: ['electronica', 'libreria', 'juegos'],
    envioGratisDesde: 80, preparacionH: 3,
    lema: t('Electrónica probada y con garantía escrita.', 'Eletrônicos testados e com garantia por escrito.', 'Tested electronics with written warranty.'),
    descripcion: t(
      'Electrónica nueva y reacondicionada. Cada equipo usado pasa por nuestro taller y sale con garantía escrita de 3 a 6 meses.',
      'Eletrônicos novos e recondicionados. Cada aparelho usado passa pela nossa oficina e sai com garantia por escrito de 3 a 6 meses.',
      'New and refurbished electronics. Every used unit goes through our workshop and ships with a 3–6 month written warranty.'),
    horario: t('Lunes a sábado de 7:30 a 17 h', 'Segunda a sábado, das 7h30 às 17h', 'Mon–Sat, 7:30 am to 5 pm'),
    reputacion: { recomendacion: 96, opiniones: 2890, ventas_12m: 8420, respuesta_min: 120, a_tiempo: 95 },
  },
  {
    slug: 'taller-ita', nombre: 'Taller Itá', pais: 'PY', ciudad: 'Itá', direccion: 'Calle Cerámica 45',
    lat: -25.5072, lng: -57.3611, desde: 2020, color: '#b4593b', rubros: ['decoracion', 'cocina'],
    envioGratisDesde: 40, preparacionH: 48,
    lema: t('Cerámica de Itá, hecha a mano pieza por pieza.', 'Cerâmica de Itá, feita à mão peça por peça.', 'Ceramics from Itá, handmade one piece at a time.'),
    descripcion: t(
      'Taller familiar de alfarería en Itá, la capital de la cerámica paraguaya. Como cada pieza es única, puede variar un poco de la foto.',
      'Ateliê familiar de cerâmica em Itá, a capital da cerâmica paraguaia. Cada peça é única e pode variar um pouco da foto.',
      'Family pottery workshop in Itá, the capital of Paraguayan ceramics. Each piece is unique and may differ slightly from the photo.'),
    horario: t('Lunes a viernes de 8 a 16 h', 'Segunda a sexta, das 8h às 16h', 'Mon–Fri, 8 am to 4 pm'),
    reputacion: { recomendacion: 99, opiniones: 312, ventas_12m: 960, respuesta_min: 240, a_tiempo: 99 },
  },
  {
    slug: 'ferreteria-tatu', nombre: 'Ferretería Tatu', pais: 'PY', ciudad: 'Hernandarias', direccion: 'Supercarretera Itaipú km 3',
    lat: -25.4060, lng: -54.6386, desde: 2011, color: '#7a5a00', rubros: ['herramientas', 'auto', 'jardin'],
    envioGratisDesde: 70, preparacionH: 4,
    lema: t('Herramientas que aguantan la obra.', 'Ferramentas que aguentam a obra.', 'Tools that survive the job site.'),
    descripcion: t(
      'Ferretería de obra y taller sobre la Supercarretera. Atendemos a constructoras y a quien arregla su casa el fin de semana.',
      'Loja de ferragens para obra e oficina na Supercarretera. Atendemos construtoras e quem conserta a casa no fim de semana.',
      'Hardware store for builders and weekend DIYers on the Supercarretera highway.'),
    horario: t('Lunes a sábado de 6:30 a 18 h', 'Segunda a sábado, das 6h30 às 18h', 'Mon–Sat, 6:30 am to 6 pm'),
    reputacion: { recomendacion: 95, opiniones: 1980, ventas_12m: 5210, respuesta_min: 180, a_tiempo: 93 },
  },
  {
    slug: 'loja-ponte', nombre: 'Loja Ponte', pais: 'BR', ciudad: 'Foz do Iguaçu', direccion: 'Av. JK 2210, Centro',
    lat: -25.5427, lng: -54.5827, desde: 2019, color: '#3d5a3a', rubros: ['moda', 'deportes', 'electronica'], generalista: true,
    envioGratisDesde: 50, preparacionH: 6,
    lema: t('Del lado brasileño del Puente, con factura en reales.', 'Do lado brasileiro da Ponte, com nota fiscal.', 'On the Brazilian side of the Bridge, with a local invoice.'),
    descripcion: t(
      'Tienda de Foz do Iguaçu con moda, deportes y tecnología. Emitimos nota fiscal y enviamos a todo Brasil.',
      'Loja de Foz do Iguaçu com moda, esportes e tecnologia. Emitimos nota fiscal e enviamos para todo o Brasil.',
      'Foz do Iguaçu store for fashion, sports and tech. We issue Brazilian invoices and ship nationwide.'),
    horario: t('Lunes a sábado de 9 a 19 h', 'Segunda a sábado, das 9h às 19h', 'Mon–Sat, 9 am to 7 pm'),
    reputacion: { recomendacion: 94, opiniones: 1205, ventas_12m: 3100, respuesta_min: 300, a_tiempo: 91 },
  },
  {
    slug: 'almacen-misiones', nombre: 'Almacén Misiones', pais: 'AR', ciudad: 'Puerto Iguazú', direccion: 'Av. Victoria Aguirre 320',
    lat: -25.5991, lng: -54.5736, desde: 2016, color: '#a6215c', rubros: ['supermercado', 'limpieza'],
    envioGratisDesde: 25, preparacionH: 2,
    lema: t('El almacén de barrio, ahora con envío.', 'O armazém do bairro, agora com entrega.', 'The corner store, now with delivery.'),
    descripcion: t(
      'Almacén de Puerto Iguazú: panadería del día, verdura de la zona y limpieza. Pedí antes de las 11 y te llega en el día.',
      'Armazém de Puerto Iguazú: padaria do dia, verduras da região e limpeza. Peça antes das 11h e receba no mesmo dia.',
      'Puerto Iguazú grocery: fresh bakery, local produce and cleaning supplies. Order before 11 am for same-day delivery.'),
    horario: t('Todos los días de 7 a 21 h', 'Todos os dias, das 7h às 21h', 'Daily, 7 am to 9 pm'),
    reputacion: { recomendacion: 97, opiniones: 880, ventas_12m: 2240, respuesta_min: 120, a_tiempo: 96 },
  },
  {
    slug: 'muebleria-yvyra', nombre: 'Mueblería Yvyrá', pais: 'PY', ciudad: 'Minga Guazú', direccion: 'Ruta PY02 km 16',
    lat: -25.4767, lng: -54.7983, desde: 2009, color: '#5c3b23', rubros: ['muebles', 'jardin'],
    envioGratisDesde: 150, preparacionH: 72,
    lema: t('Muebles de madera del Alto Paraná.', 'Móveis de madeira do Alto Paraná.', 'Solid wood furniture from Alto Paraná.'),
    descripcion: t(
      'Fabricamos y restauramos muebles en Minga Guazú. Entregamos armado en Ciudad del Este, Hernandarias y Presidente Franco.',
      'Fabricamos e restauramos móveis em Minga Guazú. Entregamos montado em Ciudad del Este, Hernandarias e Presidente Franco.',
      'We build and restore furniture in Minga Guazú. Assembled delivery in Ciudad del Este, Hernandarias and Presidente Franco.'),
    horario: t('Lunes a viernes de 7 a 17 h, sábados hasta las 12', 'Segunda a sexta, das 7h às 17h; sábado até 12h', 'Mon–Fri 7 am–5 pm, Sat until noon'),
    reputacion: { recomendacion: 97, opiniones: 640, ventas_12m: 1420, respuesta_min: 200, a_tiempo: 92 },
  },
  {
    slug: 'lumen-parana', nombre: 'Lumen Paraná', pais: 'PY', ciudad: 'Presidente Franco', direccion: 'Av. Monday 510',
    lat: -25.5604, lng: -54.6120, desde: 2015, color: '#d9772b', rubros: ['iluminacion', 'decoracion'],
    envioGratisDesde: 60, preparacionH: 24,
    lema: t('Luz para cada rincón.', 'Luz para cada canto.', 'Light for every corner.'),
    descripcion: t(
      'Iluminación decorativa y técnica. Te ayudamos a elegir la luz por WhatsApp con una foto del ambiente.',
      'Iluminação decorativa e técnica. Ajudamos você a escolher a luz pelo WhatsApp com uma foto do ambiente.',
      'Decorative and technical lighting. Send us a photo of the room on WhatsApp and we will help you choose.'),
    horario: t('Lunes a sábado de 8 a 18 h', 'Segunda a sábado, das 8h às 18h', 'Mon–Sat, 8 am to 6 pm'),
    reputacion: { recomendacion: 95, opiniones: 520, ventas_12m: 1730, respuesta_min: 90, a_tiempo: 94 },
  },
  {
    slug: 'vivero-kaaguy', nombre: "Vivero Ka'aguy", pais: 'PY', ciudad: 'Hernandarias', direccion: 'Calle Acaray 1200',
    lat: -25.3960, lng: -54.6420, desde: 2012, color: '#2e6f70', rubros: ['jardin', 'decoracion'],
    envioGratisDesde: 35, preparacionH: 24,
    lema: t('Plantas que se crían en el calor de acá.', 'Plantas criadas no calor daqui.', 'Plants raised in our own heat.'),
    descripcion: t(
      'Vivero y casa de jardín. Todas las plantas se crían acá, así que aguantan el verano de la frontera.',
      'Viveiro e loja de jardinagem. Todas as plantas são cultivadas aqui e aguentam o verão da fronteira.',
      'Plant nursery and garden shop. Everything is grown locally, so it handles the border summer.'),
    horario: t('Lunes a domingo de 7 a 17 h', 'Segunda a domingo, das 7h às 17h', 'Daily, 7 am to 5 pm'),
    reputacion: { recomendacion: 98, opiniones: 410, ventas_12m: 1180, respuesta_min: 150, a_tiempo: 97 },
  },
  {
    slug: 'papelaria-tres-fronteiras', nombre: 'Papelaria Três Fronteiras', pais: 'BR', ciudad: 'Foz do Iguaçu', direccion: 'Rua Almirante Barroso 870',
    lat: -25.5469, lng: -54.5856, desde: 2013, color: '#5b8fb9', rubros: ['libreria', 'juegos'],
    envioGratisDesde: 30, preparacionH: 12,
    lema: t('Útiles, juegos y oficina.', 'Papelaria, jogos e escritório.', 'Stationery, games and office.'),
    descripcion: t(
      'Papelería de Foz con todo para la escuela y la oficina. Armamos la lista escolar completa: mandanos una foto.',
      'Papelaria de Foz com tudo para escola e escritório. Montamos a lista escolar completa: mande uma foto.',
      'Foz stationery shop for school and office. Send a photo of the school list and we pack it all.'),
    horario: t('Lunes a viernes de 8 a 18 h, sábados hasta las 13', 'Segunda a sexta, das 8h às 18h; sábado até 13h', 'Mon–Fri 8 am–6 pm, Sat until 1 pm'),
    reputacion: { recomendacion: 96, opiniones: 730, ventas_12m: 2650, respuesta_min: 240, a_tiempo: 95 },
  },
  {
    slug: 'deportes-iguazu', nombre: 'Deportes Iguazú', pais: 'AR', ciudad: 'Puerto Iguazú', direccion: 'Av. Córdoba 155',
    lat: -25.5975, lng: -54.5752, desde: 2018, color: '#b3302a', rubros: ['deportes', 'juegos', 'moda'],
    envioGratisDesde: 45, preparacionH: 12,
    lema: t('Para el río, la cancha y el monte.', 'Para o rio, o campo e a mata.', 'For the river, the pitch and the forest.'),
    descripcion: t(
      'Deportes y aire libre en Puerto Iguazú. Equipamos a guías de pesca y de las cataratas.',
      'Esportes e aventura em Puerto Iguazú. Equipamos guias de pesca e das cataratas.',
      'Sports and outdoor gear in Puerto Iguazú. We outfit fishing and waterfall guides.'),
    horario: t('Lunes a sábado de 9 a 20 h', 'Segunda a sábado, das 9h às 20h', 'Mon–Sat, 9 am to 8 pm'),
    reputacion: { recomendacion: 93, opiniones: 390, ventas_12m: 980, respuesta_min: 360, a_tiempo: 90 },
  },
  {
    slug: 'bazar-monday', nombre: 'Bazar Monday', pais: 'PY', ciudad: 'Presidente Franco', direccion: 'Calle Saltos del Monday 77',
    lat: -25.5650, lng: -54.6230, desde: 2010, color: '#e3b22c', rubros: ['cocina', 'limpieza', 'decoracion'],
    envioGratisDesde: 40, preparacionH: 6,
    lema: t('Bazar y limpieza al por mayor y menor.', 'Utilidades e limpeza no atacado e varejo.', 'Homeware and cleaning, wholesale and retail.'),
    descripcion: t(
      'Bazar de barrio que creció: vendemos por unidad y por bulto a comercios de toda la zona.',
      'Bazar de bairro que cresceu: vendemos por unidade e por caixa para comércios da região.',
      'A neighborhood bazaar that grew up: we sell by the unit and by the case to local shops.'),
    horario: t('Lunes a sábado de 7 a 19 h', 'Segunda a sábado, das 7h às 19h', 'Mon–Sat, 7 am to 7 pm'),
    reputacion: { recomendacion: 94, opiniones: 1520, ventas_12m: 4380, respuesta_min: 240, a_tiempo: 93 },
  },
  {
    slug: 'antiquario-parana', nombre: 'Antiquário Paraná', pais: 'BR', ciudad: 'Foz do Iguaçu', direccion: 'Rua Marechal Deodoro 430',
    lat: -25.5490, lng: -54.5880, desde: 2008, color: '#87194a', rubros: ['muebles', 'decoracion', 'electronica'],
    envioGratisDesde: 200, preparacionH: 48,
    lema: t('Objetos con historia, restaurados.', 'Objetos com história, restaurados.', 'Restored objects with a story.'),
    descripcion: t(
      'Antigüedades y objetos de colección restaurados en nuestro taller. Cada pieza sale con su ficha de restauración.',
      'Antiguidades e objetos de coleção restaurados na nossa oficina. Cada peça sai com sua ficha de restauro.',
      'Antiques and collectibles restored in our workshop. Each piece ships with its restoration record.'),
    horario: t('Martes a sábado de 10 a 18 h', 'Terça a sábado, das 10h às 18h', 'Tue–Sat, 10 am to 6 pm'),
    reputacion: { recomendacion: 97, opiniones: 260, ventas_12m: 410, respuesta_min: 480, a_tiempo: 96 },
  },
  {
    slug: 'repuestos-ruta-7', nombre: 'Repuestos Ruta 7', pais: 'PY', ciudad: 'Ciudad del Este', direccion: 'Ruta PY02 km 4,5',
    lat: -25.5050, lng: -54.6400, desde: 2006, color: '#4a4f52', rubros: ['auto', 'herramientas'],
    envioGratisDesde: 60, preparacionH: 4,
    lema: t('Repuestos, lubricantes y seguridad para el auto.', 'Peças, lubrificantes e segurança para o carro.', 'Car parts, lubricants and safety gear.'),
    descripcion: t(
      'Casa de repuestos sobre la Ruta 7 (hoy PY02). Te asesoramos por WhatsApp con la marca y el año de tu auto.',
      'Loja de autopeças na Ruta 7 (hoje PY02). Atendemos pelo WhatsApp com a marca e o ano do seu carro.',
      'Car parts store on Route 7 (now PY02). Message us on WhatsApp with your car model and year.'),
    horario: t('Lunes a sábado de 7 a 18 h', 'Segunda a sábado, das 7h às 18h', 'Mon–Sat, 7 am to 6 pm'),
    reputacion: { recomendacion: 92, opiniones: 870, ventas_12m: 2960, respuesta_min: 150, a_tiempo: 91 },
  },
  {
    slug: 'casa-guarani', nombre: 'Casa Guaraní', pais: 'AR', ciudad: 'Puerto Iguazú', direccion: 'Av. Misiones 410',
    lat: -25.6010, lng: -54.5710, desde: 2015, color: '#3d5a3a', rubros: ['decoracion', 'muebles', 'cocina'],
    envioGratisDesde: 70, preparacionH: 24,
    lema: t('Diseño y artesanía de Misiones.', 'Design e artesanato de Misiones.', 'Design and crafts from Misiones.'),
    descripcion: t(
      'Tienda de diseño en Puerto Iguazú con piezas de artesanos de Misiones y de la región.',
      'Loja de design em Puerto Iguazú com peças de artesãos de Misiones e da região.',
      'Design shop in Puerto Iguazú with pieces by artisans from Misiones and the region.'),
    horario: t('Lunes a domingo de 10 a 20 h', 'Segunda a domingo, das 10h às 20h', 'Daily, 10 am to 8 pm'),
    reputacion: { recomendacion: 96, opiniones: 450, ventas_12m: 1050, respuesta_min: 180, a_tiempo: 95 },
  },
]
