// Arma la base PGlite con las migraciones y el seed, y la guarda comprimida en .datos/ para que la web
// la abra en milisegundos (se corre en el build: ver "prebuild" en package.json).
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { construirBase, VOLCADO } from '../lib/datos/pglite.ts'

const inicio = Date.now()
const db = await construirBase()
const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.productos')
const volcado = await db.dumpDataDir('gzip')
await mkdir(path.dirname(VOLCADO), { recursive: true })
await writeFile(VOLCADO, Buffer.from(await volcado.arrayBuffer()))
await db.close()
console.log(`Base lista: ${rows[0].n} productos · ${(volcado.size / 1e6).toFixed(1)} MB · ${((Date.now() - inicio) / 1000).toFixed(1)} s`)
