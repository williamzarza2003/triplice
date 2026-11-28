import { defineConfig, devices } from '@playwright/test'

// El puerto se puede cambiar (PUERTO_E2E=3201) para correr dos suites a la vez sin que una pruebe el build de la otra
const PUERTO = process.env.PUERTO_E2E ?? '3200'

// Pruebas de punta a punta contra el build de producción (npm run build antes).
// Usa el Chrome instalado en la PC (channel: 'chrome'): no hace falta descargar navegadores.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // un solo servidor con la base embebida (una sola conexión: las consultas van en fila). Con dos navegadores a la vez,
  // en esta notebook las acciones que refrescan el catálogo hacían vencer las esperas de 5 s de las otras pruebas.
  // Con uno tarda más (~5 min) pero el resultado no depende de la suerte. Antes de correr: npm run build (la caché de
  // páginas de Next queda en .next y guarda lo que cambió la corrida anterior).
  workers: 1,
  use: { baseURL: `http://localhost:${PUERTO}`, channel: 'chrome', locale: 'es-PY' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'celular', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: { command: `npm run start -- -p ${PUERTO}`, url: `http://localhost:${PUERTO}/es`, reuseExistingServer: true, timeout: 120_000 },
})
