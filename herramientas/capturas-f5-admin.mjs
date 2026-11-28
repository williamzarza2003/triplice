// Capturas de la fase 5 (administración) en 1440 y 390 px, con la admin de prueba (Mirta Giménez). Necesita el build
// corriendo:   npx next start -p 3201   y después   node herramientas/capturas-f5-admin.mjs <carpeta>
// Con SOLO=resumen,tiendas saca solo esas. Saca PNG y los pasa a WebP con sharp (último paso).
// No guarda nada en la base: la vista previa del impuesto y la de la cotización no se confirman.
import { chromium } from '@playwright/test'
import { readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const BASE = process.env.BASE ?? 'http://localhost:3201'
const salida = process.argv[2] ?? 'docs/capturas'
const PANTALLAS = [
  ['resumen', '/es/admin', null],
  ['tiendas', '/es/admin/tiendas', null],
  ['moderacion', '/es/admin/moderacion', null],
  ['categorias', '/es/admin/categorias', null],
  ['categoria', '/es/admin/categorias/2', null],
  ['impuestos', '/es/admin/impuestos', async (p) => {
    // la vista previa de subir el IVA general de Paraguay al 12 %
    const regla = p.locator('#pais-PY details').first()
    await regla.locator('summary').click()
    await regla.locator('input[name=tasa]').fill('12')
    await regla.getByRole('button', { name: 'Ver cómo queda el precio' }).click()
    await regla.locator('table').waitFor()
  }],
  ['cotizaciones', '/es/admin/cotizaciones', async (p) => {
    await p.getByLabel('Pesos argentinos por 1 US$').fill('11800')
    await p.getByRole('button', { name: 'Revisar antes de guardar' }).click()
    await p.getByText('más de 5 %').first().waitFor()
  }],
  ['registro', '/es/admin/registro', null],
]

const navegador = await chromium.launch({ channel: 'chrome' })
for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: ancho < 500 ? 2 : 1, locale: 'es-PY' })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/es/entrar`)
  await p.getByRole('button', { name: 'Entrar como admin (Mirta)' }).click()
  await p.waitForURL(/\/es\/admin$/)
  for (const [nombre, url, antes] of PANTALLAS) {
    if (process.env.SOLO && !process.env.SOLO.split(',').includes(nombre)) continue
    await p.goto(`${BASE}${url}`)
    await p.waitForLoadState('networkidle')
    if (antes) await antes(p)
    // en una captura de página entera, el encabezado pegajoso aparece repetido en el medio
    await p.addStyleTag({ content: 'header { position: static !important; }' })
    await p.waitForTimeout(400)
    await p.screenshot({ path: path.join(salida, `admin-${nombre}-${ancho}.png`), fullPage: true })
  }
  await ctx.close()
}
await navegador.close()
if (process.env.WEBP !== '0') {
  for (const f of (await readdir(salida)).filter((x) => /^admin-.*\.png$/.test(x))) {
    const png = path.join(salida, f)
    await sharp(png).resize({ width: 1440, withoutEnlargement: true }).webp({ quality: 74 }).toFile(png.replace(/\.png$/, '.webp'))
    await unlink(png)
  }
}
console.log('listo')
