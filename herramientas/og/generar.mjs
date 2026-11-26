// Fotografía herramientas/og/og.html con el Chrome instalado y la guarda como imagen para redes de todo el sitio.
// Uso: node herramientas/og/generar.mjs
import { chromium } from '@playwright/test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const salida = path.join(aqui, '../../public/og.png')

const navegador = await chromium.launch({ channel: 'chrome' })
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 } })
await pagina.goto(pathToFileURL(path.join(aqui, 'og.html')).href)
await pagina.evaluate(() => document.fonts.ready)
await pagina.screenshot({ path: salida })
await navegador.close()
console.log('Imagen para redes:', salida)
