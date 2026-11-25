// Árbol de categorías y atributos tipados por categoría (lo que hace distinta una heladera de una remera).
// Los atributos `filtrable` aparecen como facetas en la búsqueda.

export type Texto = { es: string; pt: string; en: string }
export type Atributo = {
  clave: string
  nombre: Texto
  tipo: 'texto' | 'numero' | 'booleano' | 'opcion'
  unidad?: string
  filtrable?: boolean
}
export type Categoria = { slug: string; nombre: Texto; icono: string; hijas: { slug: string; nombre: Texto }[]; atributos: Atributo[] }

const t = (es: string, pt: string, en: string): Texto => ({ es, pt, en })

// atributos que se repiten
const MATERIAL: Atributo = { clave: 'material', nombre: t('Material', 'Material', 'Material'), tipo: 'opcion', filtrable: true }
const POTENCIA: Atributo = { clave: 'potencia_w', nombre: t('Potencia', 'Potência', 'Power'), tipo: 'numero', unidad: 'W' }
const TENSION: Atributo = { clave: 'tension_v', nombre: t('Tensión', 'Tensão', 'Voltage'), tipo: 'opcion', unidad: 'V', filtrable: true }
const CAPACIDAD: Atributo = { clave: 'capacidad_l', nombre: t('Capacidad', 'Capacidade', 'Capacity'), tipo: 'numero', unidad: 'L' }
const ESTILO: Atributo = { clave: 'estilo', nombre: t('Estilo', 'Estilo', 'Style'), tipo: 'opcion', filtrable: true }
const ORIGEN_HECHO: Atributo = { clave: 'hecho_a_mano', nombre: t('Hecho a mano', 'Feito à mão', 'Handmade'), tipo: 'booleano', filtrable: true }
const USO: Atributo = { clave: 'uso', nombre: t('Uso', 'Uso', 'Use'), tipo: 'opcion', filtrable: true }

export const CATEGORIAS: Categoria[] = [
  {
    slug: 'electronica', icono: 'pantalla', nombre: t('Electrónica', 'Eletrônicos', 'Electronics'),
    hijas: [
      { slug: 'tv-y-video', nombre: t('TV y video', 'TV e vídeo', 'TV & video') },
      { slug: 'audio', nombre: t('Audio', 'Áudio', 'Audio') },
      { slug: 'computacion', nombre: t('Computación', 'Informática', 'Computers') },
      { slug: 'videojuegos', nombre: t('Videojuegos', 'Videogames', 'Video games') },
      { slug: 'camaras', nombre: t('Cámaras', 'Câmeras', 'Cameras') },
      { slug: 'seguridad', nombre: t('Seguridad y radios', 'Segurança e rádios', 'Security & radios') },
    ],
    atributos: [
      { clave: 'pantalla_pulgadas', nombre: t('Pantalla', 'Tela', 'Screen'), tipo: 'numero', unidad: '"', filtrable: true },
      { clave: 'conectividad', nombre: t('Conectividad', 'Conectividade', 'Connectivity'), tipo: 'opcion', filtrable: true },
      { clave: 'bateria_h', nombre: t('Batería', 'Bateria', 'Battery'), tipo: 'numero', unidad: 'h' },
      POTENCIA, TENSION, ESTILO,
    ],
  },
  {
    slug: 'electrodomesticos', icono: 'enchufe', nombre: t('Electrodomésticos', 'Eletrodomésticos', 'Appliances'),
    hijas: [
      { slug: 'pequenos-de-cocina', nombre: t('Pequeños de cocina', 'Portáteis de cozinha', 'Small kitchen appliances') },
      { slug: 'climatizacion', nombre: t('Climatización', 'Climatização', 'Heating & cooling') },
      { slug: 'energia', nombre: t('Energía', 'Energia', 'Power') },
    ],
    atributos: [POTENCIA, TENSION, CAPACIDAD, { clave: 'frigorias', nombre: t('Frigorías', 'BTU', 'BTU'), tipo: 'numero' }, ESTILO],
  },
  {
    slug: 'cocina', icono: 'olla', nombre: t('Cocina y mesa', 'Cozinha e mesa', 'Kitchen & dining'),
    hijas: [
      { slug: 'ollas-y-sartenes', nombre: t('Ollas y sartenes', 'Panelas e frigideiras', 'Pots & pans') },
      { slug: 'vajilla', nombre: t('Vajilla', 'Louça', 'Tableware') },
      { slug: 'utensilios', nombre: t('Utensilios', 'Utensílios', 'Utensils') },
      { slug: 'termos-y-jarras', nombre: t('Termos y jarras', 'Garrafas térmicas e jarras', 'Flasks & jugs') },
    ],
    atributos: [MATERIAL, CAPACIDAD, { clave: 'diametro_cm', nombre: t('Diámetro', 'Diâmetro', 'Diameter'), tipo: 'numero', unidad: 'cm' },
      { clave: 'apto_induccion', nombre: t('Apto inducción', 'Indução', 'Induction-ready'), tipo: 'booleano', filtrable: true }, ORIGEN_HECHO],
  },
  {
    slug: 'muebles', icono: 'sillon', nombre: t('Muebles', 'Móveis', 'Furniture'),
    hijas: [
      { slug: 'living', nombre: t('Living', 'Sala de estar', 'Living room') },
      { slug: 'comedor', nombre: t('Comedor', 'Sala de jantar', 'Dining room') },
      { slug: 'dormitorio', nombre: t('Dormitorio', 'Quarto', 'Bedroom') },
      { slug: 'oficina', nombre: t('Oficina', 'Escritório', 'Office') },
      { slug: 'guardado', nombre: t('Estantes y guardado', 'Estantes e armazenamento', 'Shelves & storage') },
    ],
    atributos: [MATERIAL, ESTILO, { clave: 'tapizado', nombre: t('Tapizado', 'Estofado', 'Upholstery'), tipo: 'opcion', filtrable: true },
      { clave: 'armado', nombre: t('Viene armado', 'Vem montado', 'Comes assembled'), tipo: 'booleano', filtrable: true },
      { clave: 'carga_kg', nombre: t('Carga máxima', 'Carga máxima', 'Max load'), tipo: 'numero', unidad: 'kg' }],
  },
  {
    slug: 'decoracion', icono: 'florero', nombre: t('Decoración', 'Decoração', 'Home decor'),
    hijas: [
      { slug: 'floreros', nombre: t('Floreros', 'Vasos decorativos', 'Vases') },
      { slug: 'cuadros-y-espejos', nombre: t('Cuadros y espejos', 'Quadros e espelhos', 'Frames & mirrors') },
      { slug: 'relojes', nombre: t('Relojes', 'Relógios', 'Clocks') },
      { slug: 'objetos', nombre: t('Objetos y esculturas', 'Objetos e esculturas', 'Objects & sculptures') },
      { slug: 'textiles-y-cestos', nombre: t('Textiles y cestos', 'Têxteis e cestos', 'Textiles & baskets') },
    ],
    atributos: [MATERIAL, ESTILO, ORIGEN_HECHO, { clave: 'alto_cm', nombre: t('Alto', 'Altura', 'Height'), tipo: 'numero', unidad: 'cm' }],
  },
  {
    slug: 'iluminacion', icono: 'lampara', nombre: t('Iluminación', 'Iluminação', 'Lighting'),
    hijas: [
      { slug: 'colgantes', nombre: t('Colgantes y arañas', 'Pendentes e lustres', 'Pendants & chandeliers') },
      { slug: 'de-mesa-y-pared', nombre: t('De mesa y de pared', 'De mesa e de parede', 'Table & wall lamps') },
      { slug: 'faroles-y-linternas', nombre: t('Faroles y linternas', 'Lanternas', 'Lanterns & flashlights') },
      { slug: 'focos', nombre: t('Focos', 'Lâmpadas', 'Bulbs') },
    ],
    atributos: [{ clave: 'luz', nombre: t('Luz', 'Luz', 'Light'), tipo: 'opcion', filtrable: true },
      { clave: 'rosca', nombre: t('Rosca', 'Rosca', 'Socket'), tipo: 'opcion', filtrable: true }, POTENCIA, MATERIAL, ESTILO,
      { clave: 'bateria_h', nombre: t('Autonomía', 'Autonomia', 'Runtime'), tipo: 'numero', unidad: 'h' }],
  },
  {
    slug: 'herramientas', icono: 'llave', nombre: t('Herramientas', 'Ferramentas', 'Tools'),
    hijas: [
      { slug: 'electricas', nombre: t('Eléctricas', 'Elétricas', 'Power tools') },
      { slug: 'manuales', nombre: t('Manuales', 'Manuais', 'Hand tools') },
      { slug: 'medicion', nombre: t('Medición', 'Medição', 'Measuring') },
      { slug: 'cajas-y-escaleras', nombre: t('Cajas, carros y escaleras', 'Caixas, carrinhos e escadas', 'Boxes, carts & ladders') },
    ],
    atributos: [POTENCIA, TENSION, MATERIAL, { clave: 'largo_cm', nombre: t('Largo', 'Comprimento', 'Length'), tipo: 'numero', unidad: 'cm' },
      { clave: 'uso_profesional', nombre: t('Uso profesional', 'Uso profissional', 'Pro grade'), tipo: 'booleano', filtrable: true }],
  },
  {
    slug: 'jardin', icono: 'hoja', nombre: t('Jardín y exterior', 'Jardim e área externa', 'Garden & outdoor'),
    hijas: [
      { slug: 'macetas-y-plantas', nombre: t('Macetas y plantas', 'Vasos e plantas', 'Planters & plants') },
      { slug: 'riego', nombre: t('Riego', 'Irrigação', 'Watering') },
      { slug: 'herramientas-de-jardin', nombre: t('Herramientas de jardín', 'Ferramentas de jardim', 'Garden tools') },
      { slug: 'muebles-de-exterior', nombre: t('Muebles de exterior', 'Móveis de área externa', 'Outdoor furniture') },
    ],
    atributos: [MATERIAL, { clave: 'exterior', nombre: t('Apto exterior', 'Para área externa', 'Outdoor-rated'), tipo: 'booleano', filtrable: true },
      CAPACIDAD, ESTILO],
  },
  {
    slug: 'supermercado', icono: 'canasta', nombre: t('Supermercado', 'Supermercado', 'Groceries'),
    hijas: [
      { slug: 'panaderia', nombre: t('Panadería y repostería', 'Padaria e confeitaria', 'Bakery') },
      { slug: 'frutas-y-verduras', nombre: t('Frutas y verduras', 'Hortifrúti', 'Fruit & vegetables') },
      { slug: 'almacen', nombre: t('Almacén y bebidas', 'Mercearia e bebidas', 'Pantry & drinks') },
    ],
    atributos: [{ clave: 'contenido', nombre: t('Contenido', 'Conteúdo', 'Contents'), tipo: 'texto' },
      { clave: 'origen', nombre: t('Origen', 'Origem', 'Origin'), tipo: 'opcion', filtrable: true },
      { clave: 'sin_tacc', nombre: t('Sin TACC', 'Sem glúten', 'Gluten-free'), tipo: 'booleano', filtrable: true }],
  },
  {
    slug: 'limpieza', icono: 'gota', nombre: t('Limpieza y orden', 'Limpeza e organização', 'Cleaning & storage'),
    hijas: [
      { slug: 'limpiadores', nombre: t('Limpiadores', 'Produtos de limpeza', 'Cleaners') },
      { slug: 'escobas-y-baldes', nombre: t('Escobas y baldes', 'Vassouras e baldes', 'Brooms & buckets') },
      { slug: 'organizacion', nombre: t('Cajas y organización', 'Caixas e organização', 'Boxes & organizers') },
    ],
    atributos: [CAPACIDAD, MATERIAL, USO],
  },
  {
    slug: 'deportes', icono: 'pelota', nombre: t('Deportes y aire libre', 'Esportes e aventura', 'Sports & outdoors'),
    hijas: [
      { slug: 'pelotas', nombre: t('Pelotas y bates', 'Bolas e tacos', 'Balls & bats') },
      { slug: 'aire-libre', nombre: t('Aire libre y pesca', 'Aventura e pesca', 'Outdoors & fishing') },
    ],
    atributos: [USO, MATERIAL, { clave: 'talle', nombre: t('Tamaño', 'Tamanho', 'Size'), tipo: 'opcion', filtrable: true }],
  },
  {
    slug: 'juegos', icono: 'dado', nombre: t('Juguetes, juegos y música', 'Brinquedos, jogos e música', 'Toys, games & music'),
    hijas: [
      { slug: 'juegos-de-mesa', nombre: t('Juegos de mesa', 'Jogos de tabuleiro', 'Board games') },
      { slug: 'juguetes', nombre: t('Juguetes', 'Brinquedos', 'Toys') },
      { slug: 'instrumentos', nombre: t('Instrumentos', 'Instrumentos', 'Instruments') },
    ],
    atributos: [{ clave: 'edad', nombre: t('Edad', 'Idade', 'Age'), tipo: 'opcion', filtrable: true },
      { clave: 'jugadores', nombre: t('Jugadores', 'Jogadores', 'Players'), tipo: 'texto' }, MATERIAL],
  },
  {
    slug: 'libreria', icono: 'lapiz', nombre: t('Librería y oficina', 'Papelaria e escritório', 'Stationery & office'),
    hijas: [
      { slug: 'papeleria', nombre: t('Papelería y útiles', 'Papelaria', 'Stationery') },
      { slug: 'libros', nombre: t('Libros', 'Livros', 'Books') },
      { slug: 'equipamiento', nombre: t('Equipamiento de oficina', 'Equipamento de escritório', 'Office equipment') },
    ],
    atributos: [{ clave: 'hojas', nombre: t('Hojas', 'Folhas', 'Sheets'), tipo: 'numero' },
      { clave: 'formato', nombre: t('Formato', 'Formato', 'Size'), tipo: 'opcion', filtrable: true }, MATERIAL],
  },
  {
    slug: 'moda', icono: 'reloj', nombre: t('Moda y accesorios', 'Moda e acessórios', 'Fashion & accessories'),
    hijas: [
      { slug: 'relojes-de-mano', nombre: t('Relojes', 'Relógios', 'Watches') },
      { slug: 'anteojos-y-sombreros', nombre: t('Anteojos y sombreros', 'Óculos e chapéus', 'Glasses & hats') },
      { slug: 'calzado', nombre: t('Calzado', 'Calçados', 'Footwear') },
      { slug: 'valijas', nombre: t('Valijas y bolsos', 'Malas e bolsas', 'Luggage & bags') },
    ],
    atributos: [MATERIAL, { clave: 'talle', nombre: t('Talle', 'Tamanho', 'Size'), tipo: 'opcion', filtrable: true },
      { clave: 'genero', nombre: t('Para', 'Para', 'For'), tipo: 'opcion', filtrable: true }, ESTILO],
  },
  {
    slug: 'auto', icono: 'auto', nombre: t('Auto y moto', 'Carro e moto', 'Car & motorcycle'),
    hijas: [
      { slug: 'mantenimiento', nombre: t('Mantenimiento', 'Manutenção', 'Maintenance') },
      { slug: 'bidones-y-seguridad', nombre: t('Bidones y seguridad', 'Galões e segurança', 'Cans & safety') },
    ],
    atributos: [CAPACIDAD, MATERIAL, USO],
  },
]
