// Fase 3: la cuenta de punta a punta, con la cuenta de prueba de la base embebida. Entrar → mis pedidos →
// detalle con trayecto → devolución → opinión con foto (compra verificada) → la opinión en la ficha → "Me fue útil"
// → pregunta → comprobante PDF → salir. Cada proyecto (escritorio y celular) usa un producto distinto, porque
// comparten el servidor y una persona opina una sola vez por producto.
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'

// una foto de verdad (JPEG de 400 × 300) para probar que el servidor la recibe, la achica y la publica en WebP
const foto = () => sharp({ create: { width: 400, height: 300, channels: 3, background: '#1f5f60' } }).jpeg().toBuffer()

async function entrar(page: Page, volver = '') {
  await page.goto(`/es/entrar${volver ? `?volver=${encodeURIComponent(volver)}` : ''}`)
  await expect(page.getByRole('heading', { name: 'Entrá a tu cuenta' })).toBeVisible()
  await page.getByRole('button', { name: 'Entrar como Lorena' }).click()
  await expect(page).toHaveURL(volver ? new RegExp(`${volver}$`) : /\/es\/cuenta$/)
}

test('sin sesión, la cuenta manda a entrar y vuelve a donde estabas', async ({ page }) => {
  await page.goto('/es/cuenta/direcciones')
  await expect(page).toHaveURL(/\/es\/entrar\?volver=%2Fes%2Fcuenta%2Fdirecciones/)
  await page.getByRole('button', { name: 'Entrar como Lorena' }).click()
  await expect(page.getByRole('heading', { name: 'Direcciones', level: 1 })).toBeVisible()
  await expect(page.getByText('La que se usa al pagar')).toBeVisible()
})

test('pedidos, devolución, opinión con foto, voto, pregunta y comprobante', async ({ page }, info) => {
  const enCelular = info.project.name === 'celular'
  // escritorio opina del celular y devuelve los auriculares; el celular, al revés
  const opinar = enCelular ? /Auriculares inalámbricos/ : /^Celular 6/
  const devolver = enCelular ? 0 : 1

  await entrar(page)
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()
  // en el celular, la cuenta está dentro del menú ☰
  if (!enCelular) await expect(page.getByRole('link', { name: /Tu cuenta \(Lorena\)/ })).toBeVisible()

  // el pedido entregado hace 3 días: trayecto completo, devolución y opinión
  await page.getByRole('link', { name: 'Pedido TR-K7M2QA' }).click()
  await expect(page.getByRole('heading', { name: 'Pedido TR-K7M2QA', level: 1 })).toBeVisible()
  await expect(page.getByText('Entregado').first()).toBeVisible()

  const productos = page.locator('article')
  const paraDevolver = productos.nth(devolver)
  await paraDevolver.getByText('Pedir devolución').click()
  await paraDevolver.getByLabel('Llegó fallado o no funciona').check()
  await paraDevolver.getByRole('textbox', { name: /Contale a la tienda/ }).fill('Deja de cargar a la semana.')
  await paraDevolver.getByRole('button', { name: 'Enviar el pedido de devolución' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'mandamos tu pedido de devolución' })).toBeVisible()
  await expect(productos.nth(devolver).getByText(/Devolución pedida el/)).toBeVisible()

  // el comprobante en PDF
  const pdf = await page.request.get('/api/comprobante/TR-K7M2QA?idioma=es')
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toBe('application/pdf')
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')

  // opinar, con una foto
  await page.locator('article').filter({ hasText: opinar }).getByRole('link', { name: 'Opinar' }).click()
  await expect(page.getByRole('heading', { name: 'Tu opinión', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Publicar mi opinión' }).click()
  await expect(page.getByText('Elegí de 1 a 5 estrellas.')).toBeVisible()
  await page.locator('label[for="estrella-4"]').click() // la estrella es la etiqueta del radio
  await expect(page.getByRole('radio', { name: 'Muy bueno' })).toBeChecked()
  await page.getByRole('textbox', { name: 'Título' }).fill('Cumple lo que promete')
  await page.getByRole('textbox', { name: 'Tu opinión' }).fill('Llegó en el día, bien embalado, y funciona como en la descripción.')
  await page.locator('input[type=file][name=fotos]').setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: await foto() })
  await expect(page.getByRole('img', { name: 'Foto 1' })).toBeVisible()
  await page.getByRole('button', { name: 'Publicar mi opinión' }).click()
  await expect(page.getByText('¡Gracias! Tu opinión ya está publicada.')).toBeVisible()
  await expect(page.getByText('Cumple lo que promete').first()).toBeVisible()

  // en la ficha: la opinión con su foto, primera por tener foto, y el aviso de que ya opinaste
  await page.getByRole('link', { name: 'Verla en la ficha' }).click()
  const opiniones = page.locator('#opiniones')
  await expect(opiniones.getByText('Cumple lo que promete')).toBeVisible()
  await expect(opiniones.getByRole('button', { name: /Foto 1 de Lorena B\./ })).toBeVisible()
  await expect(opiniones.getByText('Ya publicaste tu opinión de este producto.')).toBeVisible()

  // "Me fue útil" en otra opinión: el número sube sin recargar
  const otra = opiniones.locator('li').filter({ hasNotText: 'Cumple lo que promete' }).filter({ has: page.getByRole('button', { name: /Me fue útil/ }) }).first()
  const boton = otra.getByRole('button', { name: /Me fue útil/ })
  // textContent: la sección tiene content-visibility y innerText puede venir vacío si todavía no se pintó
  const antes = Number((await boton.textContent() ?? '').replace(/\D/g, '') || 0)
  await boton.click()
  await expect(boton).toHaveAttribute('aria-pressed', 'true')
  await expect(boton).toContainText(String(antes + 1))

  // una pregunta
  const pregunta = `¿Tiene garantía en Paraguay? (${info.project.name})`
  await page.getByRole('textbox', { name: /Preguntale a la tienda/ }).fill(pregunta)
  await page.getByRole('button', { name: 'Preguntar', exact: true }).click()
  await expect(page.getByText('Listo: tu pregunta ya está publicada.')).toBeVisible()
  await expect(page.locator('#preguntas').getByText(pregunta)).toBeVisible()

  // salir
  await page.goto('/es/cuenta/datos')
  await page.getByRole('button', { name: 'Salir de la cuenta' }).filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/\/es$/)
  if (!enCelular) await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible()
})

test('al pagar con sesión, los datos y la dirección guardada ya están, y el pedido aparece en Mis pedidos', async ({ page }) => {
  await entrar(page)
  await page.goto('/es/p/perfume-floral-para-mujer-jasy')
  await page.getByRole('button', { name: 'Agregar al carrito' }).click()
  await expect(page.getByText('Lo agregamos al carrito.')).toBeVisible()
  await page.goto('/es/pagar')
  await page.getByText('Envío a domicilio', { exact: true }).click()
  await expect(page.getByRole('radio', { name: /Casa/ })).toBeChecked()
  await expect(page.getByRole('textbox', { name: 'Nombre y apellido' })).toHaveValue('Lorena Benítez')
  await expect(page.getByRole('textbox', { name: 'Correo' })).toHaveValue('lorena@triplice.example')
  await page.getByRole('button', { name: /^Pagar ₲/ }).click()
  await page.getByRole('button', { name: /tarjeta aprobada/ }).click()
  const numero = (await page.getByText(/Pedido TR-/).first().innerText()).match(/TR-[A-Z0-9]{6}/)![0]
  await page.goto('/es/cuenta')
  await expect(page.getByRole('link', { name: `Pedido ${numero}` })).toBeVisible()
})
