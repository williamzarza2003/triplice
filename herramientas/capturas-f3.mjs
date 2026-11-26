// Capturas de la fase 3 (cuenta) en 1440 y 390 px, con la cuenta de prueba. Necesita el build corriendo:
//   npx next start -p 3300   y después   node herramientas/capturas-f3.mjs <carpeta>
import { chromium } from '@playwright/test'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://localhost:3300'
const salida = process.argv[2] ?? 'docs/capturas'
const PANTALLAS = [
  ['entrar', '/es/entrar', null],
  ['pedidos', '/es/cuenta', null],
  ['pedido', '/es/cuenta/pedidos/TR-K7M2QA', null],
  ['devolucion', '/es/cuenta/pedidos/TR-K7M2QA', async (p) => { await p.locator('summary').filter({ hasText: 'Pedir devolución' }).nth(1).click(); await p.locator('details[open]').scrollIntoViewIfNeeded() }],
  ['opinar', '/es/cuenta/opinar/2', null],
  ['opiniones', '/es/cuenta/opiniones', null],
  ['direcciones', '/es/cuenta/direcciones', null],
  ['datos', '/es/cuenta/datos', null],
  ['ficha-opiniones', '/es/p/termo-de-acero-1-l-con-manija-tacuru', async (p) => { await p.locator('#opiniones').scrollIntoViewIfNeeded(); await p.waitForTimeout(1500) }],
  ['ficha-preguntas', '/es/p/termo-de-acero-1-l-con-manija-tacuru', async (p) => { await p.locator('#preguntas').scrollIntoViewIfNeeded(); await p.waitForTimeout(800) }],
]

const navegador = await chromium.launch({ channel: 'chrome' })
for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: ancho < 500 ? 2 : 1, locale: 'es-PY' })
  const p = await ctx.newPage()
  for (const [nombre, url, antes] of PANTALLAS) {
    if (nombre === 'pedidos' && !(await ctx.cookies()).some((c) => c.name === 'triplice_sesion')) {
      await p.goto(`${BASE}/es/entrar`)
      await p.getByRole('button', { name: 'Entrar como Lorena' }).click()
      await p.waitForURL(/\/es\/cuenta$/)
    }
    await p.goto(`${BASE}${url}`)
    await p.waitForLoadState('networkidle')
    if (antes) await antes(p)
    await p.waitForTimeout(500)
    await p.screenshot({ path: path.join(salida, `f3-${nombre}-${ancho}.png`), fullPage: !nombre.startsWith('ficha') })
  }
  await ctx.close()
}
await navegador.close()
console.log('listo')
