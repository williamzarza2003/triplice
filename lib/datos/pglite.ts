// Base PostgreSQL embebida (PGlite, Postgres compilado a WebAssembly).
// Corre las MISMAS migraciones que Supabase: se usa en las pruebas y como base de la vista previa
// mientras no haya un proyecto de Supabase configurado (ver docs/supabase.md).
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'

const RAIZ = process.cwd()
export const VOLCADO = path.join(RAIZ, '.datos', 'triplice.tar.gz')

const extensiones = { pg_trgm, unaccent }

/** Crea una base nueva con el esquema y, si se pide, los datos de ejemplo. */
export async function construirBase({ conSeed = true } = {}) {
  const db = await PGlite.create({ extensions: extensiones })
  const leer = (p: string) => readFile(path.join(RAIZ, p), 'utf8')
  await db.exec(await leer('supabase/pglite/00_supabase.sql'))
  const migraciones = (await readdir(path.join(RAIZ, 'supabase', 'migrations'))).filter((f) => f.endsWith('.sql')).sort()
  for (const m of migraciones) await db.exec(await leer(`supabase/migrations/${m}`))
  if (conSeed) await db.exec(await leer('supabase/seed.sql'))
  return db
}

/** Abre la base desde el volcado generado en el build (rápido) o la construye en el momento. */
export async function abrirBase() {
  if (existsSync(VOLCADO)) {
    const volcado = new Blob([await readFile(VOLCADO)])
    return PGlite.create({ loadDataDir: volcado, extensions: extensiones })
  }
  return construirBase()
}
