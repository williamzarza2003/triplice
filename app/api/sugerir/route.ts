// Sugerencias del buscador (letra por letra). Valida la entrada y responde solo lo necesario.
import { NextResponse, type NextRequest } from 'next/server'
import { connection } from 'next/server'
import { sugerir } from '@/lib/datos/consultas'
import { esIdioma } from '@/lib/i18n/idiomas'

export async function GET(req: NextRequest) {
  await connection()
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80)
  const idioma = req.nextUrl.searchParams.get('idioma')
  if (!esIdioma(idioma)) {
    return NextResponse.json({ error: 'El parámetro idioma tiene que ser es, pt o en.' }, { status: 400 })
  }
  if (q.length < 2) return NextResponse.json({ corregido: null, productos: [], categorias: [] })
  const datos = await sugerir(q, idioma)
  return NextResponse.json(datos, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } })
}
