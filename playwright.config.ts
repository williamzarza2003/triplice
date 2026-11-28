import { defineConfig, devices } from '@playwright/test'

// El puerto se puede cambiar (PUERTO_E2E=3201) para correr dos suites a la vez sin que una pruebe el build de la otra
const PUERTO = process.env.PUERTO_E2E ?? '3200'

// Pruebas de punta a punta contra el build de producción (npm run build antes).
// Usa el Chrome instalado en la PC (channel: 'chrome'): no hace falta descargar navegadores.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // un solo servidor con la base embebida para todas las pruebas: con más de 2 a la vez, las más lentas vencen el tiempo
  workers: 2,
  use: { baseURL: `http://localhost:${PUERTO}`, channel: 'chrome', locale: 'es-PY' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'celular', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: { command: `npm run start -- -p ${PUERTO}`, url: `http://localhost:${PUERTO}/es`, reuseExistingServer: true, timeout: 120_000 },
})
