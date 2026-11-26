// Fase 2: el flujo de compra completo, con teclado donde se puede. Ficha → carrito → cupón → pago con retiro
// en el local → tarjeta rechazada → tarjeta aprobada → comprobante. Sin claves de Stripe corre contra el
// simulador; con STRIPE_SECRET_KEY de prueba, el pago pasa por Stripe Checkout (ver README).
import { expect, test, type Page } from '@playwright/test'

async function agregarUnCelular(page: Page) {
  await page.goto('/es/c/smartphones')
  await page.getByRole('link', { name: /^Celular 6/ }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Celular')
  await expect(page.getByText(/IVA 10 % incluido/)).toBeVisible()
  await page.getByRole('button', { name: 'Agregar al carrito' }).click()
  await expect(page.getByText('Lo agregamos al carrito.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Carrito: 1 unidades/ })).toBeVisible()
}

test('compra completa con retiro en el local, cupón y una tarjeta rechazada antes de la buena', async ({ page }) => {
  test.skip(!!process.env.STRIPE_SECRET_KEY, 'con Stripe configurado el pago pasa por Stripe Checkout')
  await agregarUnCelular(page)
  await page.getByRole('link', { name: 'Ver el carrito' }).click()
  await expect(page.getByRole('heading', { name: 'Tu carrito' })).toBeVisible()

  // un cupón vencido explica qué hacer; uno válido aparece en el resumen
  const cupon = page.getByRole('textbox', { name: 'Cupón de descuento' })
  await cupon.fill('INVIERNO25')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.locator('#cupon-error')).toContainText('Ese cupón ya venció')
  await cupon.fill('bienvenida10')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByText('Cupón BIENVENIDA10')).toBeVisible()
  const total = await page.locator('dd').last().innerText()
  expect(total).toMatch(/^₲ [\d.]+$/)

  await page.getByRole('link', { name: 'Continuar con la compra' }).click()
  await expect(page.getByRole('heading', { name: 'Pagar', level: 1 })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Dónde retirás' })).toBeVisible()

  // sin datos no avanza, y dice qué falta
  await page.getByRole('button', { name: /^Pagar ₲/ }).click()
  await expect(page.getByText('Completá este dato.').first()).toBeVisible()
  await page.getByRole('textbox', { name: 'Nombre y apellido' }).fill('Lucía Benítez')
  await page.getByRole('textbox', { name: 'Correo' }).fill('lucia@ejemplo.com.py')
  await page.getByRole('textbox', { name: /Teléfono/ }).fill('0981 000 000')
  // el total que se va a cobrar es el mismo del carrito
  await expect(page.getByRole('button', { name: `Pagar ${total}` })).toBeVisible()
  await page.getByRole('button', { name: `Pagar ${total}` }).press('Enter')

  await expect(page.getByRole('heading', { name: 'Simulador de pago' })).toBeVisible()
  await page.getByRole('button', { name: /tarjeta rechazada/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'El banco rechazó' })).toBeVisible()
  await page.getByRole('button', { name: /tarjeta aprobada/ }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¡Listo! Tu pedido está confirmado')
  await expect(page.getByText(/Pedido TR-[A-Z0-9]{6}/).first()).toBeVisible()
  await expect(page.getByText('Listo para retirar')).toBeVisible()
  await expect(page.locator('aside dd').last()).toHaveText(total)
  // lo comprado salió del carrito
  await expect(page.getByRole('link', { name: 'Carrito', exact: true })).toBeVisible()
})

test('envío a domicilio: valida la dirección y cobra el envío de la zona de la frontera', async ({ page }) => {
  test.skip(!!process.env.STRIPE_SECRET_KEY, 'con Stripe configurado el pago pasa por Stripe Checkout')
  await agregarUnCelular(page)
  await page.goto('/es/pagar')
  await page.getByText('Envío a domicilio').click()
  await page.getByRole('combobox', { name: 'Ciudad' }).fill('Ciudad del Este')
  await expect(page.getByRole('status').filter({ hasText: 'Ciudad del Este y alrededores' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Ciudad' }).fill('Encarnación')
  await expect(page.getByRole('status').filter({ hasText: 'Resto de Paraguay' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Nombre y apellido' }).fill('Lucía Benítez')
  await page.getByRole('textbox', { name: 'Correo' }).fill('lucia@')
  await page.getByRole('textbox', { name: /Teléfono/ }).fill('0981 000 000')
  await page.getByRole('button', { name: /^Pagar ₲/ }).click()
  await expect(page.getByText(/le falta la arroba o el dominio/)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Barrio' })).toHaveAttribute('aria-invalid', 'true')
})

test('en Brasil los precios van en reales con los impuestos estimados de Brasil', async ({ page, context }) => {
  await context.addCookies([
    { name: 'triplice_region', value: 'BR', url: 'http://localhost:3200' },
    { name: 'triplice_moneda', value: 'BRL', url: 'http://localhost:3200' },
  ])
  await page.goto('/es/c/smartphones')
  await page.getByRole('link', { name: /^Celular 6/ }).first().click()
  await expect(page.getByText(/Impuestos estimados 35 % incluido/)).toBeVisible()
  await expect(page.locator('aside .precio').first()).toContainText('R$')
})
