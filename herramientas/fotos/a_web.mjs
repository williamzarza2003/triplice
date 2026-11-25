// Convierte los renders del catálogo (PNG 800 × 800 con transparencia) a WebP en 240, 480 y 800 px,
// solo para las fotos que usa el seed (supabase/seed/imagenes.json).
// "--detalle" no es un render aparte: es un recorte ampliado del mismo PNG (la textura de cerca).
// Uso: npm run fotos:web   (lo ya convertido se saltea; con --todo se rehace)
import { readFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..', '..')
const origen = path.join(aqui, 'renders', 'final')
const destino = path.join(raiz, 'public', 'productos')
const ANCHOS = [240, 480, 800]
const todo = process.argv.includes('--todo')
const FONDO = '#f3f6f5' // --neblina
await mkdir(destino, { recursive: true })

const L = 800
// la sombra de contacto se desvanece en óvalo: si no, termina en un rectángulo gris sobre la tarjeta
const mascara = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${L}">
  <defs><radialGradient id="g" cx="50%" cy="52%" r="50%">
    <stop offset="72%" stop-color="#fff" stop-opacity="1"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>
  </radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`)

const ids = JSON.parse(await readFile(path.join(raiz, 'supabase', 'seed', 'imagenes.json'), 'utf8'))
let hechas = 0
const faltan = []
for (const id of ids) {
  const detalle = id.endsWith('--detalle')
  const base = detalle ? id.slice(0, -'--detalle'.length) : id
  const png = path.join(origen, `${base}.png`)
  if (!existsSync(png)) { faltan.push(base); continue }
  const ultimo = path.join(destino, `${id}-800.webp`)
  if (!todo && existsSync(ultimo) && (await stat(ultimo)).mtimeMs > (await stat(png)).mtimeMs) continue
  let img = sharp(png).resize(L, L).ensureAlpha().composite([{ input: mascara, blend: 'dest-in' }])
  if (detalle) {
    // recorte del centro algo por encima de la mitad (donde suele estar el detalle del producto)
    const recorte = await img.png().toBuffer()
    img = sharp(recorte).extract({ left: 160, top: 130, width: 480, height: 480 }).resize(L, L, { kernel: 'lanczos3' })
  }
  // sobre el mismo gris "neblina" del fondo de las tarjetas: sin canal alfa, el archivo pesa casi la mitad
  const buffer = await img.flatten({ background: FONDO }).png().toBuffer()
  for (const ancho of ANCHOS) {
    await sharp(buffer).resize(ancho, ancho, { kernel: 'lanczos3' }).webp({ quality: ancho > 400 ? 76 : 78, effort: 6 })
      .toFile(path.join(destino, `${id}-${ancho}.webp`))
  }
  hechas++
}
const unicas = [...new Set(faltan)]
console.log(`Listas: ${hechas} fotos nuevas · faltan ${unicas.length} renders${unicas.length ? ` (por ejemplo ${unicas.slice(0, 3).join(', ')})` : ''}`)
