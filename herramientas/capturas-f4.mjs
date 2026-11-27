// Capturas de la fase 4 (panel del vendedor) en 1440 y 390 px, con el vendedor de prueba (Casa Nubla). Necesita el
// build corriendo:   npx next start -p 3300   y después   node herramientas/capturas-f4.mjs <carpeta>
// Saca PNG; para el repo se pasan a WebP con sharp (último paso del script).
import { chromium } from '@playwright/test'
import { readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const BASE = process.env.BASE ?? 'http://localhost:3300'
const salida = process.argv[2] ?? 'docs/capturas'
const PANTALLAS = [
  ['resumen', '/es/vender', null],
  ['pedidos', '/es/vender/pedidos', null],
  ['productos', '/es/vender/productos', null],
  ['producto-nuevo', '/es/vender/productos/nuevo', async (p) => {
    await p.locator('#campo-categoria').selectOption('smartphones')
    await p.locator('#campo-v0-precio').fill('189,90')
  }],
  ['preguntas', '/es/vender/preguntas', null],
]

const navegador = await chromium.launch({ channel: 'chrome' })
for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: ancho < 500 ? 2 : 1, locale: 'es-PY' })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/es/entrar`)
  await p.getByRole('button', { name: 'Entrar al panel de Casa Nubla' }).click()
  await p.waitForURL(/\/es\/vender$/)
  for (const [nombre, url, antes] of PANTALLAS) {
    await p.goto(`${BASE}${url}`)
    await p.waitForLoadState('networkidle')
    if (antes) await antes(p)
    // en una captura de página entera lo pegajoso (encabezado, barra de guardar) aparece repetido en el medio
    await p.addStyleTag({ content: 'header, form > div:last-child { position: static !important; }' })
    // las fotos se piden al acercarse: se recorre la página para que estén todas
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) } scrollTo(0, 0) })
    await p.waitForTimeout(600)
    await p.screenshot({ path: path.join(salida, `vender-${nombre}-${ancho}.png`), fullPage: true })
  }
  await ctx.close()
}
await navegador.close()
if (process.env.WEBP !== '0') {
  for (const f of (await readdir(salida)).filter((x) => /^vender-.*\.png$/.test(x))) {
    const png = path.join(salida, f)
    await sharp(png).resize({ width: 1440, withoutEnlargement: true }).webp({ quality: 74 }).toFile(png.replace(/\.png$/, '.webp'))
    await unlink(png)
  }
}
console.log('listo')
