import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { Migas } from '@/components/Migas'
import { EsqueletoResultados } from '@/components/resultados/Esqueleto'
import { Resultados } from '@/components/resultados/Resultados'
import { leerFiltros } from '@/lib/busqueda'
import { contexto, ruta } from '@/lib/contexto'
import { buscar, categorias } from '@/lib/datos/consultas'
import { mercadoPredeterminado, segmentoMercado } from '@/lib/region'
import { esIdioma } from '@/lib/i18n/idiomas'
import s from './categoria.module.css'

type Props = PageProps<'/[idioma]/[mercado]/c/[categoria]'>

// Se prearman las categorías principales en la combinación habitual de cada idioma (es + ₲, pt + R$, en + US$);
// el resto se arma la primera vez que alguien la pide y queda en caché.
export async function generateStaticParams({ params }: { params: { idioma: string; mercado: string } }) {
  if (!esIdioma(params.idioma)) return []
  const arbol = await categorias(params.idioma)
  const habitual = segmentoMercado(mercadoPredeterminado(params.idioma)) === params.mercado
  return (habitual ? arbol : arbol.slice(0, 1)).map((c) => ({ categoria: c.slug }))
}

async function buscarCategoria(slug: string, idioma: Parameters<typeof categorias>[0]) {
  const arbol = await categorias(idioma)
  for (const c of arbol) {
    if (c.slug === slug) return { cat: c, padre: null }
    const h = c.hijas.find((x) => x.slug === slug)
    if (h) return { cat: { ...h, icono: c.icono, hijas: [] }, padre: c }
  }
  return null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ categoria }, ctx] = await Promise.all([params, contexto()])
  const encontrada = await buscarCategoria(categoria, ctx.idioma)
  if (!encontrada) return {}
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'meta' })
  return { title: encontrada.cat.nombre, description: t('descripcion') }
}

export default function Categoria(props: Props) {
  return (
    <main id="contenido" className="contenedor">
      <Suspense fallback={<EsqueletoResultados />}>
        <Contenido {...props} />
      </Suspense>
    </main>
  )
}

async function Contenido({ params, searchParams }: Props) {
  const [{ categoria }, sp, ctx] = await Promise.all([params, searchParams, contexto()])
  const encontrada = await buscarCategoria(categoria, ctx.idioma)
  if (!encontrada) notFound()
  const { cat, padre } = encontrada
  const [t, tc, datos] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'ficha' }),
    getTranslations({ locale: ctx.idioma, namespace: 'comun' }),
    buscar({ ...leerFiltros(sp, ctx.moneda, ctx.tasas, { categoria }), region: ctx.region }, ctx.idioma),
  ])
  const base = ruta(ctx.idioma, `/c/${categoria}`)
  const hermanas = padre ? padre.hijas : cat.hijas
  return (
    <>
      <Migas etiqueta={t('migas')} items={[
        { texto: tc('inicio'), href: ruta(ctx.idioma) },
        ...(padre ? [{ texto: padre.nombre, href: ruta(ctx.idioma, `/c/${padre.slug}`) }] : []),
        { texto: cat.nombre },
      ]} />
      <Resultados ctx={ctx} datos={datos} base={base} params={sp} titulo={cat.nombre} ocultar={['categoria']}
        enlaceCategoria={(slug) => ruta(ctx.idioma, `/c/${slug}`)}
        arriba={hermanas.length > 0 && (
          <ul className={s.subcategorias}>
            {padre && <li><Link href={ruta(ctx.idioma, `/c/${padre.slug}`)}>{padre.nombre}</Link></li>}
            {hermanas.filter((h) => h.n > 0).map((h) => (
              <li key={h.slug}>
                <Link href={ruta(ctx.idioma, `/c/${h.slug}`)} aria-current={h.slug === categoria ? 'page' : undefined}>
                  {h.nombre} <span className="numero">{h.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        )} />
    </>
  )
}
