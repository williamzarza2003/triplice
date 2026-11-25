// Hoja de contactos para revisar fotos: grilla con el nombre de cada archivo debajo.
// Uso: node herramientas/fotos/hoja.mjs <carpeta> <salida.png> [filtro] [columnas] [desde] [cantidad]
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const [carpeta, salida, filtro = '', columnas = '8', desde = '0', cantidad = '64'] = process.argv.slice(2)
const archivos = (await readdir(carpeta)).filter((f) => f.endsWith('.png') && f.includes(filtro)).sort()
  .slice(Number(desde), Number(desde) + Number(cantidad))
const L = 220
const ALTO = L + 22
const cols = Number(columnas)
const filas = Math.ceil(archivos.length / cols)
const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const capas = await Promise.all(archivos.map(async (f, i) => {
  const foto = await sharp(path.join(carpeta, f)).resize(L, L, { fit: 'contain', background: '#00000000' }).png().toBuffer()
  const rotulo = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${ALTO}">
    <rect y="${L}" width="${L}" height="22" fill="#fff"/>
    <text x="4" y="${L + 15}" font-family="Arial" font-size="12" fill="#111">${escapar(f.replace('.png', '')).slice(0, 34)}</text></svg>`)
  const celda = await sharp({ create: { width: L, height: ALTO, channels: 4, background: '#f3f6f5' } })
    .composite([{ input: foto, top: 0, left: 0 }, { input: rotulo, top: 0, left: 0 }]).png().toBuffer()
  return { input: celda, left: (i % cols) * L, top: Math.floor(i / cols) * ALTO }
}))
await sharp({ create: { width: cols * L, height: filas * ALTO, channels: 4, background: '#dfe6e4' } })
  .composite(capas).png().toFile(salida)
console.log(salida, archivos.length)
