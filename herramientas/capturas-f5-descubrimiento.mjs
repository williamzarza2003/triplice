// Capturas de la fase 5 (descubrimiento) en 1440 y 390 px: comparador, ficha con lo nuevo, Mis listas, una lista
// compartida, alertas de precio y el inicio con "vistos recientemente". Necesita el build corriendo:
//   npx next start -p 3202   y después   BASE=http://localhost:3202 node herramientas/capturas-f5-descubrimiento.mjs docs/capturas
// Saca PNG y los pasa a WebP con sharp (último paso).
import { chromium } from '@playwright/test'
import { readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const BASE = process.env.BASE ?? 'http://localhost:3202'
const salida = process.argv[2] ?? 'docs/capturas'
const CELUS = ['celular-6-7-de-gama-alta-con-triple-ondatec', 'celular-6-6-con-8-gb-de-ram-tesai', 'celular-6-5-con-bateria-de-6-000-mah-ondatec']
const FICHA = '/es/p/celular-6-6-con-8-gb-de-ram-tesai'

async function preparar(p) {
  await p.waitForLoadState('networkidle')
  // en una captura de página entera lo pegajoso (encabezado, barra del comparador) aparece repetido en el medio
  await p.addStyleTag({ content: 'header { position: static !important; }' })
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)) } scrollTo(0, 0) })
  await p.waitForTimeout(900)
}
const foto = (p, nombre, ancho, entera = true) => p.screenshot({ path: path.join(salida, `descubrimiento-${nombre}-${ancho}.png`), fullPage: entera })

const navegador = await chromium.launch({ channel: 'chrome' })
for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: ancho < 500 ? 2 : 1, locale: 'es-PY' })
  const p = await ctx.newPage()

  // sin cuenta: comparador (cookie) y vistos (cookie)
  for (const s of [...CELUS, 'termo-de-acero-1-3-l-con-vaso-aregua']) { await p.goto(`${BASE}/es/p/${s}`); await p.waitForTimeout(1200) }
  await p.goto(`${BASE}/es/comparar?p=${CELUS.join(',')}`)
  await preparar(p); await foto(p, 'comparar', ancho)
  await p.goto(`${BASE}/es/comparar?p=${CELUS.join(',')}&solo=1`)
  await preparar(p); await foto(p, 'comparar-cambios', ancho)
  await p.goto(`${BASE}/es/comparar`)
  await p.context().clearCookies({ name: 'triplice_comparar' })
  await p.goto(`${BASE}/es/comparar`)
  await preparar(p); await foto(p, 'comparar-vacio', ancho, false)
  // la tarjeta con el corazón y "Comparar", y la barra del comparador
  await p.goto(`${BASE}/es/c/smartphones`)
  await p.waitForLoadState('networkidle')
  for (const b of (await p.getByRole('button', { name: /^Comparar/ }).all()).slice(0, 2)) await b.click()
  await p.waitForTimeout(400)
  await foto(p, 'tarjetas', ancho, false)

  // con la cuenta de Lorena
  await p.goto(`${BASE}/es/entrar`)
  await p.getByRole('button', { name: 'Entrar como Lorena' }).click()
  await p.waitForURL(/\/es\/cuenta$/)
  await preparar(p); await foto(p, 'cuenta-aviso', ancho, false)
  await p.goto(`${BASE}${FICHA}`)
  await preparar(p)
  await p.getByText('Avisame si baja de precio').click()
  await p.waitForTimeout(300)
  await foto(p, 'ficha', ancho)
  await p.goto(`${BASE}/es/cuenta/listas`)
  await preparar(p); await foto(p, 'listas', ancho)
  await p.getByRole('link', { name: 'Para el viaje a Foz' }).click()
  await preparar(p); await foto(p, 'lista', ancho)
  const enlace = new URL(await p.getByLabel(/Enlace de solo lectura/).inputValue()).pathname
  await p.goto(`${BASE}/es/cuenta/alertas`)
  await preparar(p); await foto(p, 'alertas', ancho)
  await p.goto(`${BASE}/es`)
  await preparar(p)
  await p.getByRole('region', { name: 'Lo que viste hace poco' }).screenshot({ path: path.join(salida, `descubrimiento-inicio-vistos-${ancho}.png`) })
  await ctx.close()

  // la lista compartida, sin sesión
  const otro = await navegador.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: ancho < 500 ? 2 : 1, locale: 'es-PY' })
  const q = await otro.newPage()
  await q.goto(`${BASE}${enlace}`)
  await preparar(q); await foto(q, 'lista-compartida', ancho)
  await otro.close()
}
await navegador.close()
if (process.env.WEBP !== '0') {
  for (const f of (await readdir(salida)).filter((x) => /^descubrimiento-.*\.png$/.test(x))) {
    const png = path.join(salida, f)
    // WebP no pasa de 16.383 px de alto: la ficha entera del celular es más larga y se le corta el pie
    const img = sharp(png)
    const { width, height } = await img.metadata()
    const alto = Math.min(height, Math.floor(16000 * width / Math.min(width, 1440)))
    await img.extract({ left: 0, top: 0, width, height: alto }).resize({ width: 1440, withoutEnlargement: true }).webp({ quality: 74 })
      .toFile(png.replace(/\.png$/, '.webp'))
    await unlink(png)
  }
}
console.log('listo')
