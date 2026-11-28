// Fase 5: la administración de punta a punta, con la admin de prueba de la base embebida (Mirta Giménez).
// Entrar → resumen → aprobar una tienda y verla en el sitio → ocultar una reseña y ver que sale de la ficha →
// cotización con vista previa y aviso de más de 5 %. Escritorio y celular comparten el servidor: cada uno aprueba su
// tienda y oculta su reseña (las de supabase/pglite/92_admin_demo.sql). La cotización que se guarda es la del peso
// argentino (ninguna otra prueba mira precios en pesos) y al final se deja como estaba.
import { expect, test, type Page } from '@playwright/test'
import { precioFinal } from '../lib/compra/impuestos'
import { formatear } from '../lib/precios'

async function entrarComoAdmin(page: Page) {
  await page.goto('/es/entrar')
  await page.getByRole('button', { name: 'Entrar como admin (Mirta)' }).click()
  await expect(page).toHaveURL(/\/es\/admin$/)
}

/** "38 opiniones, 30 de compra verificada" → 38 */
async function opiniones(page: Page, slug: string) {
  await page.goto(`/es/p/${slug}`)
  const texto = await page.getByText(/\d+ opiniones?, \d+ de compra verificada/).first().textContent()
  return Number(texto!.match(/(\d+) opini/)![1])
}

test('un comprador no entra a la administración: se le explica qué es', async ({ page }) => {
  await page.goto('/es/admin')
  await expect(page).toHaveURL(/\/es\/entrar\?volver=%2Fes%2Fadmin/)
  await page.getByRole('button', { name: 'Entrar como Lorena' }).click()
  await expect(page.getByRole('heading', { name: 'Esta sección es para quienes administran Tríplice' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cotización del día' })).toHaveCount(0)
})

test('aprobar una tienda, ocultar una reseña y ver los cambios en el sitio', async ({ page }, info) => {
  const celular = info.project.name === 'celular'
  const tienda = celular ? { nombre: 'Ótica Iguaçu', slug: 'otica-iguacu' } : { nombre: 'Mate y Guampa', slug: 'mate-y-guampa' }
  const resena = celular ? 'Compre direto comigo' : 'Más barato en mi página'
  const producto = celular ? 'parlante-bluetooth-sumergible-de-20-w-pira-sound' : 'termo-de-acero-1-l-con-manija-tacuru'

  // antes: la tienda pendiente no existe para el público
  await page.goto(`/es/tienda/${tienda.slug}`)
  await expect(page.getByRole('heading', { level: 1, name: 'No encontramos esa página' })).toBeVisible()

  await entrarComoAdmin(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Lo que espera tu decisión' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cotización del día' })).toBeVisible()
  await expect(page.getByText(/tiendas? esperan? aprobación/)).toBeVisible()

  // aprobar
  await page.getByRole('link', { name: 'Revisar tiendas' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tiendas' })).toBeVisible()
  await page.getByRole('button', { name: `Aprobar ${tienda.nombre}` }).click()
  await expect(page.getByText(`Listo: ${tienda.nombre} ya se ve en el sitio.`)).toBeVisible()
  await page.getByRole('link', { name: 'Ver la tienda' }).click()
  await expect(page.getByRole('heading', { level: 1, name: tienda.nombre })).toBeVisible()

  // ocultar la reseña que es publicidad: sale de la ficha (una opinión menos)
  const antes = await opiniones(page, producto)
  await page.goto('/es/admin/moderacion')
  const item = page.getByRole('listitem').filter({ hasText: resena })
  await expect(item.getByText('Publicidad o spam').first()).toBeVisible() // la denuncia
  await item.getByRole('button', { name: 'Ocultar la opinión' }).click()
  await expect(page.getByText('Listo: ya no se ve en la ficha.')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: resena })).toHaveCount(0)
  expect(await opiniones(page, producto)).toBe(antes - 1)
  await expect(page.getByText(resena)).toHaveCount(0)

  // queda en el registro, con quién y por qué
  await page.goto('/es/admin/registro?tipo=resena')
  await expect(page.getByRole('row').filter({ hasText: resena }).filter({ hasText: 'Mirta Giménez' })).toContainText('Publicidad o spam')
})

test('cotización: vista previa, aviso de más de 5 % y el precio nuevo en una ficha', async ({ page, context }, info) => {
  test.setTimeout(240_000)
  await entrarComoAdmin(page)
  await page.goto('/es/admin/cotizaciones')
  const ars = page.getByLabel('Pesos argentinos por 1 US$')
  const original = Number((await ars.inputValue()).replace(/\./g, '').replace(',', '.'))

  if (info.project.name === 'celular') {
    // en el celular: sin las variables de Cambio CDE, el botón explica qué falta y dónde se cargan
    await page.getByRole('button', { name: 'Traer de Cambio CDE' }).click()
    const alerta = page.getByRole('alert').filter({ hasText: 'Cambio CDE' })
    await expect(alerta).toContainText('CAMBIO_CDE_SUPABASE_URL')
    await expect(alerta).toContainText('docs/supabase.md')
    // un cero de más se avisa antes de guardar (y acá no se guarda)
    await ars.fill(String(original * 10))
    await page.getByRole('button', { name: 'Revisar antes de guardar' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'más de 5 %' })).toBeVisible()
    return
  }

  // en el escritorio: +8 % al peso, se confirma y se ve en la ficha del termo de Mate y Guampa (US$ 23,90, IVA 21 %)
  const nuevo = Math.round(original * 1.08)
  await ars.fill(String(nuevo))
  await page.getByRole('button', { name: 'Revisar antes de guardar' }).click()
  await expect(page.getByRole('cell', { name: /^\+[78](,\d+)? %$/ })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'más de 5 %' })).toBeVisible()
  await page.getByRole('button', { name: 'Está bien, guardar igual' }).click()
  await expect(page.getByText('Listo: los precios del sitio ya se calculan con la cotización nueva.')).toBeVisible()

  // la tienda la aprueba la otra prueba del escritorio; si todavía no, se aprueba acá
  await page.goto('/es/admin/tiendas')
  const aprobar = page.getByRole('button', { name: 'Aprobar Mate y Guampa' })
  if (await aprobar.count()) {
    await aprobar.click()
    await expect(page.getByText('Listo: Mate y Guampa ya se ve en el sitio.')).toBeVisible()
  }

  await context.addCookies([
    { name: 'triplice_region', value: 'AR', domain: 'localhost', path: '/' },
    { name: 'triplice_moneda', value: 'ARS', domain: 'localhost', path: '/' },
  ])
  // las fichas que se arman a pedido toman la cotización nueva cuando vence su caché (alrededor de un minuto: ver
  // precioCambio() en app/[idioma]/[mercado]/admin/acciones.ts); se recarga hasta verla
  const esperado = formatear(precioFinal(2390, 0.21, 'ARS', { PYG: 7350, BRL: 5.45, ARS: nuevo }), 'ARS')
  await expect(async () => {
    await page.goto('/es/p/termo-de-acero-1-l-con-pico-cebador-mate-y-guampa')
    await expect(page.getByText(esperado).first()).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 150_000, intervals: [5_000] })

  // se deja como estaba (también con el aviso: vuelve más de 5 %)
  await context.clearCookies({ name: 'triplice_region' })
  await context.clearCookies({ name: 'triplice_moneda' })
  await page.goto('/es/admin/cotizaciones')
  await page.getByLabel('Pesos argentinos por 1 US$').fill(String(original))
  await page.getByRole('button', { name: 'Revisar antes de guardar' }).click()
  await page.getByRole('button', { name: 'Está bien, guardar igual' }).click()
  await expect(page.getByText('Listo: los precios del sitio ya se calculan')).toBeVisible()
})
