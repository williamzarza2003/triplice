// Cómo se leen los valores de los atributos en cada idioma. La base guarda claves ('acero', 'calida');
// la web y el seed las muestran con este diccionario. Lo que no está acá se muestra tal cual ('220', 'PH2').
import type { Idioma } from '../i18n/idiomas'

type T = Record<Idioma, string>
const t = (es: string, pt: string, en: string): T => ({ es, pt, en })

export const VALORES: Record<string, T> = {
  // materiales
  acero: t('Acero', 'Aço', 'Steel'), madera: t('Madera', 'Madeira', 'Wood'), ceramica: t('Cerámica', 'Cerâmica', 'Ceramic'),
  porcelana: t('Porcelana', 'Porcelana', 'Porcelain'), plastico: t('Plástico', 'Plástico', 'Plastic'), vidrio: t('Vidrio', 'Vidro', 'Glass'),
  cobre: t('Cobre', 'Cobre', 'Copper'), bronce: t('Bronce', 'Bronze', 'Brass'), laton: t('Latón', 'Latão', 'Brass'),
  hierro: t('Hierro', 'Ferro', 'Iron'), aluminio: t('Aluminio', 'Alumínio', 'Aluminum'), mimbre: t('Mimbre', 'Vime', 'Wicker'),
  tela: t('Tela', 'Tecido', 'Fabric'), cuero: t('Cuero', 'Couro', 'Leather'), cuerina: t('Cuerina', 'Couro sintético', 'Faux leather'),
  pana: t('Pana', 'Veludo', 'Velvet'), goma: t('Goma', 'Borracha', 'Rubber'), marmol: t('Mármol', 'Mármore', 'Marble'),
  hormigon: t('Hormigón', 'Concreto', 'Concrete'), resina: t('Resina', 'Resina', 'Resin'),
  // estilos
  retro: t('Retro', 'Retrô', 'Retro'), moderno: t('Moderno', 'Moderno', 'Modern'), clasico: t('Clásico', 'Clássico', 'Classic'),
  industrial: t('Industrial', 'Industrial', 'Industrial'), rustico: t('Rústico', 'Rústico', 'Rustic'), nordico: t('Nórdico', 'Nórdico', 'Nordic'),
  // conectividad y luz
  bluetooth: t('Bluetooth', 'Bluetooth', 'Bluetooth'), wifi: t('Wi-Fi', 'Wi-Fi', 'Wi-Fi'), cable: t('Con cable', 'Com fio', 'Wired'),
  analogico: t('Analógico', 'Analógico', 'Analog'), 'usb-c': t('USB-C', 'USB-C', 'USB-C'), hdmi: t('HDMI', 'HDMI', 'HDMI'),
  inalambrico: t('Inalámbrico', 'Sem fio', 'Wireless'), dual: t('Doble chip', 'Dois chips', 'Dual SIM'),
  // perfumes y relojes
  edp: t('Eau de parfum', 'Eau de parfum', 'Eau de parfum'), edt: t('Eau de toilette', 'Eau de toilette', 'Eau de toilette'),
  amaderada: t('Amaderada', 'Amadeirada', 'Woody'), floral: t('Floral', 'Floral', 'Floral'), citrica: t('Cítrica', 'Cítrica', 'Citrus'),
  oriental: t('Oriental', 'Oriental', 'Oriental'), ambarada: t('Ambarada', 'Ambarada', 'Amber'),
  cuarzo: t('Cuarzo', 'Quartzo', 'Quartz'), automatico: t('Automático', 'Automático', 'Automatic'),
  '8 núcleos': t('8 núcleos', '8 núcleos', '8 cores'), '10 núcleos': t('10 núcleos', '10 núcleos', '10 cores'),
  '14 núcleos': t('14 núcleos', '14 núcleos', '14 cores'),
  calida: t('Cálida', 'Quente', 'Warm'), fria: t('Fría', 'Fria', 'Cool'), neutra: t('Neutra', 'Neutra', 'Neutral'),
  e27: t('E27', 'E27', 'E27'), e14: t('E14', 'E14', 'E14'),
  // usos
  hogar: t('Hogar', 'Casa', 'Home'), profesional: t('Profesional', 'Profissional', 'Professional'),
  recreativo: t('Recreativo', 'Recreativo', 'Recreational'), observacion: t('Observación', 'Observação', 'Birdwatching'),
  navegacion: t('Náutica', 'Náutica', 'Boating'), taller: t('Taller', 'Oficina', 'Workshop'), combustible: t('Combustible', 'Combustível', 'Fuel'),
  seguridad: t('Seguridad', 'Segurança', 'Safety'), 'auto y bici': t('Auto y bici', 'Carro e bike', 'Car and bike'),
  // origen
  py: t('Paraguay', 'Paraguai', 'Paraguay'), br: t('Brasil', 'Brasil', 'Brazil'), ar: t('Argentina', 'Argentina', 'Argentina'),
  importado: t('Importado', 'Importado', 'Imported'),
  // edades, talles, formatos
  bebes: t('Bebés', 'Bebês', 'Babies'), adulto: t('Adulto', 'Adulto', 'Adult'), infantil: t('Infantil', 'Infantil', 'Kids'),
  unico: t('Talle único', 'Tamanho único', 'One size'), unisex: t('Unisex', 'Unissex', 'Unisex'), hombre: t('Hombre', 'Homem', 'Men'),
  mujer: t('Mujer', 'Mulher', 'Women'), a4: t('A4', 'A4', 'A4'), oficio: t('Oficio', 'Ofício', 'Legal'),
  'tapa dura': t('Tapa dura', 'Capa dura', 'Hardcover'),
  // booleanos
  si: t('Sí', 'Sim', 'Yes'), no: t('No', 'Não', 'No'),
  // condición
  nuevo: t('Nuevo', 'Novo', 'New'), reacondicionado: t('Reacondicionado', 'Recondicionado', 'Refurbished'), usado: t('Usado', 'Usado', 'Used'),
}

export function valor(v: unknown, idioma: Idioma): string {
  if (typeof v === 'boolean') return VALORES[v ? 'si' : 'no'][idioma]
  if (typeof v === 'number') return new Intl.NumberFormat(idioma === 'pt' ? 'pt-BR' : idioma === 'en' ? 'en-US' : 'es-PY').format(v)
  const k = String(v)
  return VALORES[k]?.[idioma] ?? k
}
