// Fase 4: el panel del vendedor de punta a punta, con el vendedor de prueba de la base embebida (Casa Nubla).
// Entrar → métricas → publicar un producto con dos variantes y una foto → la ficha pública con su precio → responder
// una pregunta → preparar y despachar un pedido. Escritorio y celular comparten el servidor: cada uno usa su propio
// pedido y su propia pregunta (las del archivo supabase/pglite/91_vendedor_demo.sql).
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'

const foto = () => sharp({ create: { width: 900, height: 700, channels: 3, background: '#a6215c' } }).jpeg().toBuffer()

async function entrarComoVendedor(page: Page) {
  await page.goto('/es/entrar')
  await page.getByRole('button', { name: 'Entrar al panel de Casa Nubla' }).click()
  await expect(page).toHaveURL(/\/es\/vender$/)
}

test('un comprador no entra al panel: se le explica qué es y cómo probarlo', async ({ page }) => {
  await page.goto('/es/vender')
  await expect(page).toHaveURL(/\/es\/entrar\?volver=%2Fes%2Fvender/)
  await page.getByRole('button', { name: 'Entrar como Lorena' }).click()
  await expect(page.getByRole('heading', { name: 'Esta sección es para las tiendas' })).toBeVisible()
  await expect(page.getByText('Vendiste')).toHaveCount(0)
})

test('métricas, alta de producto con variantes y foto, respuesta y pedido despachado', async ({ page }, info) => {
  const celular = info.project.name === 'celular'
  const numero = celular ? 'TR-CN0002' : 'TR-CN0001'
  const pregunta = celular ? /Vocês entregam em Santa Terezinha/ : /Lo tienen en verde para retirar hoy/
  const titulo = `Celular de prueba para el panel (${info.project.name})`

  await entrarComoVendedor(page)
  await expect(page.getByRole('heading', { level: 1, name: /Casa Nubla/ })).toBeVisible()
  await expect(page.getByText('Vendiste')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tu reputación' })).toBeVisible()
  await expect(page.getByText('Entregas a tiempo')).toBeVisible()

  // publicar un producto con dos variantes, precio en dólares y una foto
  await page.getByRole('link', { name: 'Publicar un producto' }).click()
  await expect(page.getByRole('heading', { name: 'Publicar un producto', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Publicar producto' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'antes de guardar' })).toBeVisible()
  await expect(page.getByText('Elegí en qué categoría va el producto').first()).toBeVisible()

  await page.getByLabel('Categoría', { exact: true }).selectOption('smartphones')
  await page.getByLabel('Marca', { exact: true }).fill('Ondatec')
  await page.getByLabel('Nombre del producto', { exact: true }).fill(titulo)
  await page.getByLabel(/^Memoria RAM/).fill('8')
  await page.locator('#campo-v0-op-color').selectOption('negro')
  await page.locator('#campo-v0-precio').fill('199,90')
  await page.locator('#campo-v0-stock').fill('5')
  await page.locator('input[type=file][data-fotos=v0]').setInputFiles({ name: 'frente.jpg', mimeType: 'image/jpeg', buffer: await foto() })
  await expect(page.getByRole('img', { name: 'Foto 1 de la variante 1' })).toBeVisible()
  // el precio como lo ve el comprador en Paraguay: 199,90 × 1,10 (IVA) × 7.350 = ₲ 1.616.000
  await expect(page.getByText('₲ 1.616.000').first()).toBeVisible()
  await page.getByRole('button', { name: 'Agregar otra variante' }).click()
  await page.locator('#campo-v1-op-color').selectOption('blanco')
  await page.locator('#campo-v1-precio').fill('219,90')
  await page.locator('#campo-v1-stock').fill('3')
  await page.getByRole('button', { name: 'Publicar producto' }).click()
  await expect(page.getByText('Listo: guardamos el producto.')).toBeVisible({ timeout: 20_000 })

  // aparece en la ficha pública, con el precio de la variante más barata y sus dos colores
  await page.getByRole('link', { name: 'Ver la ficha' }).click()
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
  await expect(page.getByText('₲ 1.616.000').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Blanco' })).toBeVisible()

  // responder una pregunta
  await page.goto('/es/vender/preguntas')
  const tarjeta = page.locator('li').filter({ hasText: pregunta })
  await expect(tarjeta.getByRole('heading')).toBeVisible()
  // el formulario de la primera pregunta viene abierto; los demás se abren con su botón
  const abrir = tarjeta.getByText('Responder esta pregunta')
  if (await abrir.isVisible()) await abrir.click()
  await tarjeta.getByRole('textbox', { name: 'Tu respuesta' }).fill('Sí, tenemos stock en el local. Te lo guardamos hasta las 18 h.')
  await tarjeta.getByRole('button', { name: 'Publicar respuesta' }).click()
  await expect(page.getByText('Listo: tu respuesta ya está en la ficha del producto.')).toBeVisible()

  // preparar y despachar un pedido: el comprador lo ve en su línea de tiempo
  await page.goto('/es/vender/pedidos')
  await page.locator(`#pedido-${numero}`).getByRole('button', { name: 'Empezar a preparar' }).click()
  await expect(page).toHaveURL(/filtro=preparando/)
  await expect(page.getByText(`el pedido ${numero} pasó a «En preparación»`)).toBeVisible()
  await page.locator(`#pedido-${numero}`).getByRole('button', { name: 'Marcar como enviado' }).click()
  await expect(page.getByText(`el pedido ${numero} pasó a «En camino»`)).toBeVisible()
  await page.goto('/es/vender/pedidos?filtro=en_camino')
  await expect(page.locator(`#pedido-${numero}`).getByText('En camino')).toBeVisible()
})
