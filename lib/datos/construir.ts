// Arma una base PGlite desde las migraciones (y el seed). Solo para scripts y pruebas: la web no lo importa,
// así la traza del servidor no arrastra archivos del repo.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { EXTENSIONES } from './pglite.ts'

export async function construirBase({ conSeed = true } = {}) {
  const raiz = process.cwd()
  const db = await PGlite.create({ extensions: EXTENSIONES })
  const leer = (p: string) => readFile(path.join(raiz, p), 'utf8')
  await db.exec(await leer('supabase/pglite/00_supabase.sql'))
  const migraciones = (await readdir(path.join(raiz, 'supabase', 'migrations'))).filter((f) => f.endsWith('.sql')).sort()
  for (const m of migraciones) await db.exec(await leer(`supabase/migrations/${m}`))
  if (conSeed) await db.exec(await leer('supabase/seed.sql'))
  return db
}
