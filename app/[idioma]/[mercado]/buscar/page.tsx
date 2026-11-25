import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { EsqueletoResultados } from '@/components/resultados/Esqueleto'
import { Resultados } from '@/components/resultados/Resultados'
import { conParametro, leerFiltros, valorDe } from '@/lib/busqueda'
import { contexto, ruta } from '@/lib/contexto'
import { buscar } from '@/lib/datos/consultas'

export async function generateMetadata(): Promise<Metadata> {
  const { idioma } = await contexto()
  const t = await getTranslations({ locale: idioma, namespace: 'meta' })
  // los resultados de búsqueda no se indexan (las categorías sí)
  return { title: t('buscar'), robots: { index: false, follow: true } }
}

export default function Buscar({ searchParams }: PageProps<'/[idioma]/[mercado]/buscar'>) {
  return (
    <main id="contenido" className="contenedor">
      <Suspense fallback={<EsqueletoResultados />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function Contenido({ searchParams }: { searchParams: PageProps<'/[idioma]/[mercado]/buscar'>['searchParams'] }) {
  const [ctx, params] = await Promise.all([contexto(), searchParams])
  const [t, datos] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'buscar' }),
    buscar(leerFiltros(params, ctx.moneda, ctx.tasas), ctx.idioma),
  ])
  const base = ruta(ctx.idioma, '/buscar')
  const q = valorDe(params.q)
  const titulo = q ? t('titulo')
    : valorDe(params.ofertas) === '1' ? t('ofertas')
    : valorDe(params.orden) === 'vendidos' ? t('masVendidosTitulo')
    : t('todo')
  return (
    <Resultados ctx={ctx} datos={datos} base={base} params={params} titulo={titulo}
      enlaceCategoria={(slug) => conParametro(base, params, 'categoria', valorDe(params.categoria) === slug ? null : slug)} />
  )
}
