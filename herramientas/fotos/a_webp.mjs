// Convierte los renders (PNG 900×900 con transparencia) a WebP de 450 px para las maquetas.
// La sombra de contacto se desvanece en óvalo: si no, termina en un cuadrado gris sobre la tarjeta.
// Uso: npm run fotos:web
import { readdir, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const origen = path.join(aqui, 'renders')
const destino = path.join(aqui, '..', '..', 'maquetas', 'img')
await mkdir(destino, { recursive: true })

const L = 900
const mascara = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${L}">
  <defs><radialGradient id="g" cx="50%" cy="52%" r="50%">
    <stop offset="70%" stop-color="#fff" stop-opacity="1"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>
  </radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`)

for (const archivo of (await readdir(origen)).filter((f) => f.endsWith('.png') && f !== 'hoja.png')) {
  const base = archivo.replace(/\.png$/, '')
  const limpia = await sharp(path.join(origen, archivo)).resize(L, L).ensureAlpha()
    .composite([{ input: mascara, blend: 'dest-in' }]).png().toBuffer()
  await sharp(limpia).resize(450, 450, { kernel: 'lanczos3' }).webp({ quality: 82, alphaQuality: 90, effort: 6 })
    .toFile(path.join(destino, `${base}.webp`))
  console.log(`maquetas/img/${base}.webp`)
}
