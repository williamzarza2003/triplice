// Fase 5 (descubrimiento) de punta a punta, en escritorio y celular: comparar 3 celulares y ver solo lo que cambia,
// marcar un favorito sin cuenta (pide entrar y vuelve a la ficha), crear una lista, compartirla y abrirla sin sesión,
// vistos recientemente en el inicio, "comprados juntos" al carrito y la alerta de precio cumplida de Lorena.
import { expect, test, type Page } from '@playwright/test'

const CELULARES = [/^Celular 6,7"/, /^Celular 6,6"/, /^Celular 6,5"/]
const FICHA = '/es/p/celular-6-6-con-8-gb-de-ram-tesai'

async function entrarComoLorena(page: Page) {
  await expect(page.getByRole('heading', { name: 'Entrá a tu cuenta' })).toBeVisible()
  await page.getByRole('button', { name: 'Entrar como Lorena' }).click()
}

test('comparar tres celulares y mostrar solo lo que cambia', async ({ page }) => {
  await page.goto('/es/c/smartphones')
  for (const titulo of CELULARES) {
    const tarjeta = page.locator('article').filter({ has: page.getByRole('heading', { name: titulo }) }).first()
    await tarjeta.getByRole('button', { name: /^Comparar/ }).click()
    await expect(tarjeta.getByRole('button', { name: /^Comparar/ })).toHaveAttribute('aria-pressed', 'true')
  }
  const barra = page.getByRole('complementary', { name: 'Comparador' })
  await expect(barra).toContainText('3 de 4 para comparar')
  await barra.getByRole('link', { name: 'Comparar ahora' }).click()

  await expect(page).toHaveURL(/\/es\/comparar\?p=/)
  await expect(page.getByRole('heading', { name: 'Comparar Celulares y tablets', level: 1 })).toBeVisible()
  const tabla = page.getByRole('table', { name: /Comparación de 3 productos/ })
  await expect(tabla.getByRole('columnheader')).toHaveCount(3)
  // "Chip" es igual en los tres (doble chip): una sola celda que lo dice
  await expect(tabla.getByRole('row', { name: /Chip/ })).toContainText('igual en los 3')
  await expect(tabla.getByRole('row', { name: /Memoria RAM/ })).toContainText('12 GB')
  await expect(tabla.getByText('El más barato')).toHaveCount(1)

  await page.getByRole('link', { name: /^Solo lo que cambia/ }).click()
  await expect(page).toHaveURL(/solo=1/)
  await expect(page.getByRole('link', { name: /^Solo lo que cambia/ })).toHaveAttribute('aria-current', 'page')
  await expect(tabla.getByRole('row', { name: /Chip/ })).toHaveCount(0)
  await expect(tabla.getByRole('row', { name: /Memoria RAM/ })).toBeVisible()

  // quitar uno deja dos, y la dirección sigue siendo compartible
  await tabla.getByRole('button', { name: /^Quitar\s*:\s*Celular 6,5"/ }).click()
  await expect(page.getByRole('table', { name: /Comparación de 2 productos/ })).toBeVisible()
  await expect(page.getByLabel('Enlace para compartir esta comparación')).toHaveValue(/\/es\/comparar\?p=[^,]+,[^,]+&solo=1$/)
})

test('el corazón sin cuenta pide entrar y vuelve a la ficha con el favorito guardado', async ({ page }) => {
  await page.goto('/es/p/termo-de-acero-1-l-con-manija-tacuru')
  const caja = page.getByRole('complementary', { name: 'Vendido por' })
  await caja.getByRole('button', { name: 'Favorito' }).click()
  await expect(page).toHaveURL(/\/es\/entrar\?volver=%2Fes%2Fp%2Ftermo-de-acero-1-l-con-manija-tacuru/)
  await entrarComoLorena(page)
  await expect(page).toHaveURL(/\/es\/p\/termo-de-acero-1-l-con-manija-tacuru$/)
  await expect(page.getByRole('complementary', { name: 'Vendido por' }).getByRole('button', { name: 'Favorito' })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/es/cuenta/listas')
  await page.getByRole('link', { name: 'Favoritos' }).click()
  await expect(page.getByRole('link', { name: /Termo de acero 1 L con manija/ })).toBeVisible()
})

test('crear una lista, compartirla y abrir el enlace sin sesión', async ({ page, browser }, info) => {
  const nombre = `Para el viaje a Encarnación (${info.project.name})`
  await page.goto('/es/cuenta/listas')
  await entrarComoLorena(page)
  await expect(page.getByRole('heading', { name: 'Mis listas', level: 1 })).toBeVisible()
  await page.getByLabel('Nueva lista').fill(nombre)
  await page.getByRole('button', { name: 'Crear lista' }).click()
  await expect(page.getByRole('heading', { name: nombre, level: 1 })).toBeVisible()

  // un producto adentro, desde la ficha
  await page.goto('/es/p/sombrero-de-pescador-impermeable-yvy')
  await page.getByText('Guardar en una lista').click()
  await page.getByRole('button', { name: nombre }).click()
  await expect(page.getByRole('button', { name: nombre })).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/es/cuenta/listas')
  await page.getByRole('link', { name: nombre }).click()
  await expect(page.getByRole('link', { name: /Sombrero de pescador/ })).toBeVisible()
  await page.getByRole('button', { name: 'Crear enlace para compartir' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'cualquiera con el enlace' })).toBeVisible()
  const enlace = await page.getByLabel(/Enlace de solo lectura/).inputValue()
  const camino = new URL(enlace).pathname
  expect(camino).toMatch(/^\/es\/lista\/[0-9a-f]{64}$/)

  const anonimo = await browser.newContext()
  const otra = await anonimo.newPage()
  await otra.goto(camino)
  await expect(otra.getByRole('heading', { name: nombre, level: 1 })).toBeVisible()
  await expect(otra.getByText('Lista de Lorena B.')).toBeVisible()
  await expect(otra.getByText('Solo para mirar')).toBeVisible()
  await expect(otra.getByRole('heading', { name: /Sombrero de pescador/ })).toBeVisible()

  // dejar de compartir: el enlace deja de funcionar
  await page.getByRole('button', { name: 'Dejar de compartir' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'ya no funciona' })).toBeVisible()
  await otra.reload()
  await expect(otra.getByRole('heading', { name: 'Este enlace ya no funciona' })).toBeVisible()
  await anonimo.close()

  // y se borra
  await page.getByText('Borrar esta lista').click()
  await page.getByRole('button', { name: `Sí, borrar «${nombre}»` }).click()
  await expect(page.getByText('Borramos la lista.')).toBeVisible()
})

test('vistos recientemente aparecen en el inicio y al pie de la ficha', async ({ page }) => {
  await page.goto('/es/p/parlante-de-fiesta-de-120-w-con-kape')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // la isla anota la ficha cuando el navegador está libre
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'triplice_vistos')?.value ?? '').toContain('parlante-de-fiesta')
  await page.goto('/es/p/termo-de-acero-1-3-l-con-vaso-aregua')
  const pie = page.getByRole('region', { name: 'Lo que viste hace poco' })
  await pie.scrollIntoViewIfNeeded()
  await expect(pie.getByRole('link', { name: /Parlante de fiesta/ })).toBeVisible()
  await expect(pie.getByRole('link', { name: /Termo de acero 1,3 L/ })).toHaveCount(0) // la que estás viendo no

  await page.goto('/es')
  const inicio = page.getByRole('region', { name: 'Lo que viste hace poco' })
  await inicio.scrollIntoViewIfNeeded()
  await expect(inicio.getByRole('link')).toHaveCount(2)
  await expect(inicio.getByRole('link').first()).toHaveText(/Termo de acero 1,3 L/)
})

test('"comprados juntos" agrega los dos al carrito con el precio del servidor', async ({ page }) => {
  await page.goto(FICHA)
  const juntos = page.getByRole('region', { name: 'Quienes compraron esto también compraron' })
  await juntos.scrollIntoViewIfNeeded()
  await expect(juntos.getByText(/Se compraron juntos en \d+ pedidos/)).toBeVisible()
  // el total del combo (textContent: innerText da vacío mientras la sección está fuera de pantalla)
  const total = ((await juntos.getByText('Los dos, con impuestos').locator('xpath=following-sibling::p[1]').textContent()) ?? '').trim()
  await juntos.getByRole('button', { name: 'Agregar los dos al carrito' }).click()
  await expect(juntos.getByRole('status')).toContainText('Listo, los dos están en tu carrito.')
  await page.goto('/es/carrito')
  await expect(page.getByRole('heading', { name: /Celular 6,6"/ })).toBeVisible()
  expect(total).toMatch(/^₲ [\d.]+$/)
})

test('la alerta de precio cumplida de Lorena aparece en su cuenta, explicada como simulación', async ({ page }) => {
  await page.goto('/es/cuenta/alertas')
  await entrarComoLorena(page)
  await expect(page.getByRole('heading', { name: 'Alertas de precio', level: 1 })).toBeVisible()
  await expect(page.getByText(/Es una simulación: no mandamos correos/)).toBeVisible()
  const camara = page.getByRole('listitem').filter({ hasText: /Cámara de acción 4K/ })
  await expect(camara.getByText(/^Bajó el precio: ahora ₲ [\d.]+$/)).toBeVisible()
  await expect(camara.getByText(/^Esperabas ₲ [\d.]+$/)).toBeVisible()
  const auris = page.getByRole('listitem').filter({ hasText: /Auriculares de vincha/ })
  await expect(auris.getByText(/^Faltan ₲ [\d.]+ para llegar a tu precio\.$/)).toBeVisible()
})
