import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // la base se arma una vez por archivo (migraciones + seed en PGlite): ~10 s
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
