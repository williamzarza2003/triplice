import { defineConfig, devices } from '@playwright/test'

// Pruebas de punta a punta contra el build de producción (npm run build antes).
// Usa el Chrome instalado en la PC (channel: 'chrome'): no hace falta descargar navegadores.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3200', channel: 'chrome', locale: 'es-PY' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'celular', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: { command: 'npm run start -- -p 3200', url: 'http://localhost:3200/es', reuseExistingServer: true, timeout: 120_000 },
})
