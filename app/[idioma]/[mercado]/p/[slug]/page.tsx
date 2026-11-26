import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import { EstrellasCompletas } from '@/components/Estrellas'
import { Compra, type VarianteVista } from '@/components/ficha/Compra'
import { Opiniones } from '@/components/ficha/Opiniones'
import { Grilla } from '@/components/grilla/Grilla'
import { Icono } from '@/components/Icono'
import { Migas } from '@/components/Migas'
import { EsqueletoFicha } from '@/components/resultados/Esqueleto'
import { valor } from '@/lib/catalogo/valores'
import { contexto, precio, precioNumero, ruta, type Contexto } from '@/lib/contexto'
import { precioFinal, reglaDe } from '@/lib/compra/impuestos'
import { ficha, slugsProductos } from '@/lib/datos/consultas'
import type { Ficha } from '@/lib/datos/tipos'
import { esIdioma, LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { agregarAlCarrito } from '../../carrito/acciones'
import { masBarata, ordenarOfertas } from '@/lib/ofertas'
import { descuento, formatear, precioEn } from '@/lib/precios'
import { MONEDA_DE, mercadoPredeterminado, MONEDAS, segmentoMercado } from '@/lib/region'
import s from './ficha.module.css'

type Props = PageProps<'/[idioma]/[mercado]/p/[slug]'>

// Se prearman los productos más vendidos en la combinación habitual de cada idioma; el resto, a pedido.
export async function generateStaticParams({ params }: { params: { idioma: string; mercado: string } }) {
  const slugs = await slugsProductos()
  const habitual = esIdioma(params.idioma) && segmentoMercado(mercadoPredeterminado(params.idioma)) === params.mercado
  return slugs.slice(0, habitual ? 24 : 1).map((x) => ({ slug: x.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, ctx] = await Promise.all([params, contexto()])
  const f = await ficha(slug, ctx.idioma)
  if (!f) return {}
  const imagen = f.variantes[0]?.imagenes[0]
  return {
    title: f.titulo,
    description: f.descripcion,
    openGraph: { title: f.titulo, description: f.descripcion, images: imagen ? [`/productos/${imagen}-800.webp`] : [] },
  }
}

export default function Producto(props: Props) {
  return (
    <main id="contenido" className="contenedor">
      <Suspense fallback={<EsqueletoFicha />}>
        <Contenido {...props} />
      </Suspense>
    </main>
  )
}

function tiempoRespuesta(min: number | undefined, idioma: Contexto['idioma']) {
  if (!min) return null
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  return idioma === 'en' ? `${h} h` : `${h} h`
}

/** Precios de cada oferta, con el impuesto de la región, ya convertidos y formateados para el navegador. */
function vistas(f: Ficha, ctx: Contexto): VarianteVista[] {
  const otras = MONEDAS.filter((m) => m !== ctx.moneda)
  const cat = { sub: f.categoria.slug, padre: f.categoria_padre?.slug ?? null }
  const tasa = reglaDe(ctx.impuestos, cat).tasa
  // etiqueta de frontera: el mismo precio base en cada país, con su impuesto y en su moneda, y cuánto es en la tuya
  const paises = (['PY', 'BR', 'AR'] as const).filter((p) => p !== ctx.region)
  return f.variantes.map((v) => {
    // se compara el precio tal como lo ve el comprador (convertido, con impuesto y redondeado en su moneda)
    const comparables = v.ofertas.map((o) => ({ o, precio: precioNumero(ctx, o.precio, cat), stock: o.stock,
      preparacionH: o.preparacion_h, recomendacion: o.tienda.recomendacion !== undefined ? Number(o.tienda.recomendacion) : null }))
    const ordenadas = ordenarOfertas(comparables)
    const barata = masBarata(comparables)
    return {
      id: v.id, sku: v.sku, opciones: v.opciones, imagenes: v.imagenes,
      ofertas: ordenadas.map(({ o }) => ({
        id: o.id,
        masBarato: barata?.o.id === o.id,
        precio: precio(ctx, o.precio, cat),
        lista: o.precio_lista ? precio(ctx, o.precio_lista, cat) : null,
        descuento: descuento(o.precio, o.precio_lista),
        equivalencias: otras.map((m) => formatear(precioFinal(o.precio, tasa, m, ctx.tasas), m)).join(' · '),
        frontera: paises.map((pais) => {
          const regla = reglaDe({ reglas: ctx.impuestosPaises[pais] ?? [] }, cat)
          const local = precioFinal(o.precio, regla.tasa, MONEDA_DE[pais], ctx.tasas)
          // cuánto es ese precio local en la moneda del comprador
          const usd = MONEDA_DE[pais] === 'USD' ? local : local / ctx.tasas[MONEDA_DE[pais] as 'PYG' | 'BRL' | 'ARS']
          return { pais, precio: formatear(local, MONEDA_DE[pais]), impuesto: regla.nombre,
            enTuMoneda: formatear(precioEn(Math.round(usd * 100), ctx.moneda, ctx.tasas), ctx.moneda), masCaro: precioFinal(o.precio, regla.tasa, ctx.moneda, ctx.tasas) > precioFinal(o.precio, tasa, ctx.moneda, ctx.tasas) }
        }),
        stock: o.stock, envioGratis: o.envio_gratis, preparacionH: o.preparacion_h, cerca: o.tienda.pais === ctx.region,
        tienda: {
          slug: o.tienda.slug, nombre: o.tienda.nombre, ciudad: o.tienda.ciudad, color: o.tienda.color,
          recomendacion: o.tienda.recomendacion !== undefined ? Number(o.tienda.recomendacion) : null,
          opiniones: o.tienda.opiniones ?? null, aTiempo: o.tienda.a_tiempo !== undefined ? Number(o.tienda.a_tiempo) : null,
          respuesta: tiempoRespuesta(o.tienda.respuesta_min, ctx.idioma),
        },
      })),
    }
  })
}

async function Contenido({ params }: Props) {
  const [{ slug }, ctx] = await Promise.all([params, contexto()])
  const f = await ficha(slug, ctx.idioma)
  if (!f) notFound()
  const [t, tc, tp, mensajes] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'ficha' }),
    getTranslations({ locale: ctx.idioma, namespace: 'comun' }),
    getTranslations({ locale: ctx.idioma, namespace: 'precio' }),
    getMessages({ locale: ctx.idioma }),
  ])
  // textos de la compra y de las opiniones para el navegador (solo en la ficha)
  const textosFicha = { ficha: mensajes.ficha, precio: mensajes.precio, comun: { paises: mensajes.comun.paises, idiomaDe: mensajes.comun.idiomaDe } }
  const r = (c: string) => ruta(ctx.idioma, c)
  const numero = new Intl.NumberFormat(LOCALE[ctx.idioma])
  const promedio = Number(f.resumen.promedio)
  const paises = Object.fromEntries(['PY', 'BR', 'AR', 'US', 'DE', 'GB'].map((p) => [p, tc(`paises.${p}`)]))

  const info = (
    <>
      <p className={s.marca}><Link href={r(`/buscar?marca=${encodeURIComponent(f.marca)}`)}>{t('marca', { marca: f.marca })}</Link></p>
      <h1 className={s.titulo}>{f.titulo}</h1>
      <div className={s.resumen}>
        {f.resumen.cantidad > 0 && (
          <a href="#opiniones" className={s.estrellas}>
            <EstrellasCompletas valor={promedio} etiqueta={t('promedio', { valor: promedio.toLocaleString(LOCALE[ctx.idioma]) })} />
            <b className="numero">{promedio.toLocaleString(LOCALE[ctx.idioma], { minimumFractionDigits: 1 })}</b>
            <span>{t('opiniones', { n: Number(f.resumen.cantidad) })}</span>
          </a>
        )}
        {f.preguntas_total > 0 && <a href="#preguntas">{t('preguntasN', { n: Number(f.preguntas_total) })}</a>}
        {f.ventas_30d > 0 && <span>{t('vendidos', { n: numero.format(f.ventas_30d) })}</span>}
        {f.condicion !== 'nuevo' && <span className="sello sello--neutro">{tc(`condicion.${f.condicion}`)}</span>}
      </div>
    </>
  )

  const detalles = f.vinetas.length > 0 && (
    <section className={s.vinetas} aria-labelledby="t-saber">
      <h2 id="t-saber">{t('loQueTenesQueSaber')}</h2>
      <ul>{f.vinetas.map((v) => <li key={v}>{v}</li>)}</ul>
    </section>
  )

  const specs: [string, string][] = [
    ...f.atributos.map((a) => [a.nombre,
      a.tipo === 'booleano' ? valor(Boolean(a.valor), ctx.idioma) : `${valor(a.valor, ctx.idioma)}${a.unidad ? ` ${a.unidad}` : ''}`] as [string, string]),
    ...(f.medidas_mm ? [[t('medidas'), f.medidas_mm.map((x) => numero.format(x / 10)).join(' × ') + ' cm'] as [string, string]] : []),
    ...(f.peso_g ? [[t('peso'), f.peso_g >= 1000 ? `${numero.format(Math.round(f.peso_g / 100) / 10)} kg` : `${f.peso_g} g`] as [string, string]] : []),
    [t('garantia'), t('garantiaMeses', { n: f.garantia_meses })],
    [t('condicion'), tc(`condicion.${f.condicion}`)],
    ...(f.pais_origen ? [[t('origen'), tc(`paises.${f.pais_origen}`)] as [string, string]] : []),
    [t('sku'), f.variantes[0]?.sku ?? '—'],
  ]

  return (
    <>
      <Migas etiqueta={t('migas')} items={[
        { texto: tc('inicio'), href: r('') },
        ...(f.categoria_padre ? [{ texto: f.categoria_padre.nombre, href: r(`/c/${f.categoria_padre.slug}`) }] : []),
        { texto: f.categoria.nombre, href: r(`/c/${f.categoria.slug}`) },
        { texto: f.titulo },
      ]} />

      <Textos locale={LOCALE[ctx.idioma]} mensajes={textosFicha}>
        <Compra idioma={ctx.idioma} titulo={f.titulo} variantes={vistas(f, ctx)} info={info} detalles={detalles}
          impuesto={ctx.region === 'XX' ? tp('sinImpuesto') : tp('incluido', { impuesto: reglaDe(ctx.impuestos, { sub: f.categoria.slug, padre: f.categoria_padre?.slug ?? null }).nombre })}
          agregar={agregarAlCarrito} carrito={r('/carrito')} />
      </Textos>

      <div className={s.bloques}>
        <section aria-labelledby="t-specs">
          <h2 id="t-specs">{t('especificaciones')}</h2>
          <table className={s.specs}>
            <tbody>{specs.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
          </table>
        </section>
        <div className={s.columna}>
          <section aria-labelledby="t-descripcion">
            <h2 id="t-descripcion">{t('descripcion')}</h2>
            <p>{f.descripcion}</p>
          </section>
          {f.en_caja.length > 0 && (
            <section aria-labelledby="t-caja">
              <h2 id="t-caja">{t('enCaja')}</h2>
              <ul className={s.caja}>{f.en_caja.map((x) => <li key={x}><Icono nombre="caja" tam={16} />{x}</li>)}</ul>
            </section>
          )}
        </div>
      </div>

      <section id="opiniones" className="seccion fuera-de-pantalla" aria-labelledby="t-opiniones">
        <div className="seccion__cabeza"><h2 id="t-opiniones">{t('opinionesTitulo')}</h2></div>
        <Textos locale={LOCALE[ctx.idioma]} mensajes={textosFicha}>
          <Opiniones idioma={ctx.idioma} resenas={f.resenas} resumen={f.resumen} paises={paises} />
        </Textos>
      </section>

      <section id="preguntas" className="seccion fuera-de-pantalla" aria-labelledby="t-preguntas">
        <div className="seccion__cabeza"><h2 id="t-preguntas">{t('preguntasTitulo')}</h2></div>
        <p className={s.nota}><Icono nombre="info" tam={16} />{t('preguntasLectura')}</p>
        {f.preguntas.length === 0 ? <p className={s.vacio}>{t('sinPreguntas')}</p> : (
          <ul className={s.preguntas}>
            {f.preguntas.map((q) => (
              <li key={q.id}>
                <p lang={q.idioma}><Icono nombre="conversa" tam={18} /><b>{q.texto}</b></p>
                {q.respuestas.length > 0 ? q.respuestas.map((a, i) => (
                  <p key={i} className={s.respuesta} lang={q.idioma}>
                    <span className={s.quien} lang={ctx.idioma}>{a.es_vendedor ? t('respuestaTienda', { tienda: a.autor }) : a.autor}</span>
                    {a.texto}
                  </p>
                )) : <p className={s.respuesta}>{t('sinRespuesta')}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {f.relacionados.length > 0 && (
        <section className="seccion fuera-de-pantalla" aria-labelledby="t-relacionados">
          <div className="seccion__cabeza">
            <h2 id="t-relacionados">{t('relacionados', { categoria: f.categoria.nombre })}</h2>
            <Link href={r(`/c/${f.categoria.slug}`)}>{tc('verTodo')}</Link>
          </div>
          <Grilla items={f.relacionados.slice(0, 6)} ctx={ctx} fila diferirDesde={0} />
        </section>
      )}
    </>
  )
}
