// Recorrido de la fase 1: buscar con un error de tipeo, entrar a la ficha, cambiar de variante,
// comparar vendedores, filtrar una categoría y cambiar región, moneda e idioma.
import { expect, test } from '@playwright/test'

test('la raíz lleva al idioma del navegador', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/es$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Los tres mercados')
})

test('buscar con un error de tipeo, sugerir y abrir la ficha', async ({ page }) => {
  await page.goto('/es')
  const buscador = page.getByRole('combobox', { name: 'Buscar en Tríplice' })
  await buscador.fill('pava electirca')
  const lista = page.getByRole('listbox')
  // la primera sugerencia abre la base embebida en frío (sin Supabase): puede tardar unos segundos
  await expect(lista.getByText('Mostrando resultados para «pava electrica»')).toBeVisible({ timeout: 20_000 })
  await buscador.press('Enter')
  await expect(page).toHaveURL(/\/es\/buscar\?q=pava/)
  await expect(page.getByRole('status')).toContainText('«pava electrica»')

  await page.getByRole('heading', { level: 2 }).filter({ hasText: 'Pava eléctrica' }).first().getByRole('link').click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Pava eléctrica')
  await expect(page.locator('.precio').first()).toContainText('₲')
})

test('la ficha cambia de variante y la deja en la URL', async ({ page }) => {
  await page.goto('/es/buscar?q=silla+monobloc')
  await page.getByRole('heading', { level: 2 }).filter({ hasText: 'Silla monobloc de plástico reforzado' }).first().getByRole('link').click()
  const colores = page.getByRole('group', { name: /Color/ }).getByRole('button')
  await expect(colores).not.toHaveCount(0)
  await colores.nth(1).click()
  await expect(colores.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/\?v=/)
})

test('los filtros de una categoría cuentan y se pueden sacar', async ({ page, isMobile }) => {
  await page.goto('/es/c/muebles')
  const cuenta = page.getByText(/^\d+ resultados$/)
  const total = await cuenta.textContent()
  if (isMobile) await page.getByRole('button', { name: 'Filtrar' }).click()
  await page.getByRole('link', { name: /^Madera\s*\d+$/ }).click()
  await expect(page).toHaveURL(/a\.material=madera/)
  await expect(cuenta).not.toHaveText(total!)
  const filtrado = await cuenta.textContent()
  expect(parseInt(filtrado!)).toBeLessThan(parseInt(total!))
  if (isMobile) await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Quitar filtro: Madera' }).click()
  await expect(page).not.toHaveURL(/a\.material/)
})

test('cambiar a Brasil muestra reales, y el idioma cambia la URL', async ({ page }) => {
  await page.goto('/es')
  await page.getByRole('button', { name: /^Comprás desde Paraguay, precios en PYG/ }).click()
  const dialogo = page.getByRole('dialog', { name: '¿Dónde comprás?' })
  await dialogo.getByRole('radio', { name: /Brasil/ }).check()
  await dialogo.getByRole('button', { name: 'Ver precios en esta región' }).click()
  await expect(page.locator('main .precio').first()).toContainText('R$')

  await page.getByRole('button', { name: /^Comprás desde Brasil, precios en BRL/ }).click()
  await page.getByRole('dialog').getByLabel('Idioma').selectOption('pt')
  await page.getByRole('dialog').getByRole('button', { name: 'Ver precios en esta región' }).click()
  await expect(page).toHaveURL(/\/pt$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Os três mercados')
})

test('un producto que no existe explica qué hacer', async ({ page }) => {
  await page.goto('/es/p/esto-no-existe')
  await expect(page.getByRole('heading', { name: 'No encontramos esa página' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible()
})
