// Base PostgreSQL embebida (PGlite, Postgres compilado a WebAssembly). Corre las MISMAS migraciones que Supabase.
// La web la abre desde el volcado que arma `npm run db:construir` (se corre en el prebuild): ver docs/supabase.md.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'

export const EXTENSIONES = { pg_trgm, unaccent }
export const VOLCADO = path.join(process.cwd(), '.datos', 'triplice.tar.gz')

export async function abrirBase() {
  let volcado: Buffer
  try {
    volcado = await readFile(VOLCADO)
  } catch {
    throw new Error('No está la base embebida (.datos/triplice.tar.gz). Corré `npm run db:construir` o configurá Supabase (docs/supabase.md).')
  }
  return PGlite.create({ loadDataDir: new Blob([new Uint8Array(volcado)]), extensions: EXTENSIONES })
}
