import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMessages, getTranslations } from 'next-intl/server'
import { EstrellasCompletas } from '@/components/Estrellas'
import { Compra, type FronteraPais, type TiendaVista, type VarianteVista } from '@/components/ficha/Compra'
import { Opiniones } from '@/components/ficha/Opiniones'
import { FormPregunta, FormRespuesta } from '@/components/ficha/Preguntar'
import { Grilla } from '@/components/grilla/Grilla'
import { Icono } from '@/components/Icono'
import { Migas } from '@/components/Migas'
import { ComboJuntos } from '@/components/descubrir/ComboJuntos'
import { PersonalFicha } from '@/components/descubrir/PersonalFicha'
import { Vistos } from '@/components/descubrir/Vistos'
import { aMinimo } from '@/lib/descubrir/alertas'
import { compradosJuntos } from '@/lib/descubrir/servidor'
import { valor } from '@/lib/catalogo/valores'
import { foto } from '@/lib/imagenes'
import { contexto, precio, precioNumero, ruta, type Contexto } from '@/lib/contexto'
import { precioFinal, reglaDe } from '@/lib/compra/impuestos'
import { ficha, slugsProductos } from '@/lib/datos/consultas'
import type { Ficha } from '@/lib/datos/tipos'
import { esIdioma, LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { agregarAlCarrito } from '../../carrito/acciones'
import { fichaUsuarioAccion, preguntarAccion, responderAccion, votarAccion } from '../../cuenta/acciones'
import { masBarata, ordenarOfertas } from '@/lib/ofertas'
import { descuento, formatear, precioEn } from '@/lib/precios'
import { MONEDA_DE, mercadoPredeterminado, MONEDAS, segmentoMercado } from '@/lib/region'
import s from './ficha.module.css'

type Props = PageProps<'/[idioma]/[mercado]/p/[slug]'>

// Se prearman todas las fichas en la combinación habitual de cada idioma (idioma + su región y moneda); las otras
// combinaciones, a pedido: la primera visita espera el armado y las siguientes salen de la caché.
export async function generateStaticParams({ params }: { params: { idioma: string; mercado: string } }) {
  const slugs = await slugsProductos()
  const habitual = esIdioma(params.idioma) && segmentoMercado(mercadoPredeterminado(params.idioma)) === params.mercado
  return slugs.slice(0, habitual ? slugs.length : 1).map((x) => ({ slug: x.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, ctx] = await Promise.all([params, contexto()])
  const f = await ficha(slug, ctx.idioma)
  if (!f) return {}
  const imagen = f.variantes[0]?.imagenes[0]
  return {
    title: f.titulo,
    description: f.descripcion,
    openGraph: { title: f.titulo, description: f.descripcion, images: imagen ? [`${foto(imagen)}-800.webp`] : [] },
  }
}

// Sin <Suspense> alrededor de la ficha: con un límite de Suspense, React manda primero el esqueleto y la ficha
// después, oculta (`<div hidden>`), y la revela con un script que espera al menos 300 ms después del primer
// pintado. En el celular eso atrasaba la foto (el LCP) más de 2 s. Como todo sale de la caché, la ficha va
// completa en el HTML inicial. Las fichas que no se prearman se arman en la primera visita y quedan en la
// caché (ISR) para las siguientes.
export default function Producto(props: Props) {
  return (
    <main id="contenido" className="contenedor">
      <Contenido {...props} />
    </main>
  )
}

function tiempoRespuesta(min: number | undefined, idioma: Contexto['idioma']) {
  if (!min) return null
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  return idioma === 'en' ? `${h} h` : `${h} h`
}

/**
 * Precios de cada oferta, con el impuesto de la región, ya convertidos y formateados para el navegador.
 * Lo que se repite (la tienda, los países de la etiqueta de frontera y su impuesto) va una sola vez:
 * todo esto viaja en el payload de React y antes pesaba 22 KB en un celular con nueve variantes.
 */
function vistas(f: Ficha, ctx: Contexto): { variantes: VarianteVista[]; tiendas: Record<string, TiendaVista>; fronteraPaises: FronteraPais[] } {
  const otras = MONEDAS.filter((m) => m !== ctx.moneda)
  const cat = { sub: f.categoria.slug, padre: f.categoria_padre?.slug ?? null }
  const tasa = reglaDe(ctx.impuestos, cat).tasa
  // etiqueta de frontera: el mismo precio base en cada país, con su impuesto y en su moneda, y cuánto es en la tuya
  const paises = (['PY', 'BR', 'AR'] as const).filter((p) => p !== ctx.region)
  const reglas = paises.map((pais) => reglaDe({ reglas: ctx.impuestosPaises[pais] ?? [] }, cat))
  const tiendas: Record<string, TiendaVista> = {}
  const variantes = f.variantes.map((v) => {
    // se compara el precio tal como lo ve el comprador (convertido, con impuesto y redondeado en su moneda)
    const comparables = v.ofertas.map((o) => ({ o, precio: precioNumero(ctx, o.precio, cat), stock: o.stock,
      preparacionH: o.preparacion_h, recomendacion: o.tienda.recomendacion !== undefined ? Number(o.tienda.recomendacion) : null }))
    const ordenadas = ordenarOfertas(comparables)
    const barata = masBarata(comparables)
    return {
      id: v.id, sku: v.sku, opciones: v.opciones, imagenes: v.imagenes,
      ofertas: ordenadas.map(({ o }) => {
        tiendas[o.tienda.slug] ??= {
          slug: o.tienda.slug, nombre: o.tienda.nombre, ciudad: o.tienda.ciudad, color: o.tienda.color,
          recomendacion: o.tienda.recomendacion !== undefined ? Number(o.tienda.recomendacion) : null,
          respuesta: tiempoRespuesta(o.tienda.respuesta_min, ctx.idioma), cerca: o.tienda.pais === ctx.region,
        }
        return {
          id: o.id,
          masBarato: barata?.o.id === o.id,
          precio: precio(ctx, o.precio, cat),
          lista: o.precio_lista ? precio(ctx, o.precio_lista, cat) : null,
          descuento: descuento(o.precio, o.precio_lista),
          equivalencias: otras.map((m) => formatear(precioFinal(o.precio, tasa, m, ctx.tasas), m)).join(' · '),
          frontera: paises.map((pais, i) => {
            const local = precioFinal(o.precio, reglas[i].tasa, MONEDA_DE[pais], ctx.tasas)
            // cuánto es ese precio local en la moneda del comprador
            const usd = MONEDA_DE[pais] === 'USD' ? local : local / ctx.tasas[MONEDA_DE[pais] as 'PYG' | 'BRL' | 'ARS']
            return { precio: formatear(local, MONEDA_DE[pais]), enTuMoneda: formatear(precioEn(Math.round(usd * 100), ctx.moneda, ctx.tasas), ctx.moneda) }
          }),
          stock: o.stock, envioGratis: o.envio_gratis, preparacionH: o.preparacion_h, tienda: o.tienda.slug,
        }
      }),
    }
  })
  return { variantes, tiendas, fronteraPaises: paises.map((pais, i) => ({ pais, impuesto: reglas[i].nombre })) }
}

async function Contenido({ params }: Props) {
  const [{ slug }, ctx] = await Promise.all([params, contexto()])
  const [f, juntos] = await Promise.all([ficha(slug, ctx.idioma), compradosJuntos(slug, ctx.idioma)])
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

  // fase 5: el precio de hoy para la alerta (la oferta más barata con stock, el de la tarjeta) y la familia del comparador
  const cat = { sub: f.categoria.slug, padre: f.categoria_padre?.slug ?? null }
  const precios = f.variantes.flatMap((v) => v.ofertas.filter((o) => o.stock > 0).map((o) => precioNumero(ctx, o.precio, cat)))
  const precioHoy = precios.length ? aMinimo(Math.min(...precios), ctx.moneda) : null
  const mercado = segmentoMercado(ctx)

  return (
    <>
      <Migas etiqueta={t('migas')} items={[
        { texto: tc('inicio'), href: r('') },
        ...(f.categoria_padre ? [{ texto: f.categoria_padre.nombre, href: r(`/c/${f.categoria_padre.slug}`) }] : []),
        { texto: f.categoria.nombre, href: r(`/c/${f.categoria.slug}`) },
        { texto: f.titulo },
      ]} />

      <Textos locale={LOCALE[ctx.idioma]} mensajes={textosFicha}>
        <Compra idioma={ctx.idioma} titulo={f.titulo} {...vistas(f, ctx)} info={info} detalles={detalles}
          impuesto={ctx.region === 'XX' ? tp('sinImpuesto') : tp('incluido', { impuesto: reglaDe(ctx.impuestos, { sub: f.categoria.slug, padre: f.categoria_padre?.slug ?? null }).nombre })}
          agregar={agregarAlCarrito} carrito={r('/carrito')}
          personal={<PersonalFicha slug={slug} titulo={f.titulo} familia={f.categoria_padre?.slug ?? f.categoria.slug} idioma={ctx.idioma}
            mercado={mercado} moneda={ctx.moneda} precioHoy={precioHoy} />} />
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

      {juntos && <ComboJuntos datos={juntos} ctx={ctx} />}

      <section id="opiniones" className="seccion fuera-de-pantalla" aria-labelledby="t-opiniones">
        <div className="seccion__cabeza"><h2 id="t-opiniones">{t('opinionesTitulo')}</h2></div>
        <Textos locale={LOCALE[ctx.idioma]} mensajes={textosFicha}>
          <Opiniones idioma={ctx.idioma} slug={slug} resenas={f.resenas} resumen={f.resumen} paises={paises} votar={votarAccion} personal={fichaUsuarioAccion} />
        </Textos>
      </section>

      <section id="preguntas" className="seccion fuera-de-pantalla" aria-labelledby="t-preguntas">
        <div className="seccion__cabeza"><h2 id="t-preguntas">{t('preguntasTitulo')}</h2></div>
        <Textos locale={LOCALE[ctx.idioma]} mensajes={textosFicha}>
          <FormPregunta accion={preguntarAccion} slug={slug} idioma={ctx.idioma} />
          {f.preguntas.length === 0 ? <p className={s.vacio}>{t('sinPreguntas')}</p> : (
            <ul className={s.preguntas}>
              {f.preguntas.map((q) => (
                <li key={q.id}>
                  <p lang={q.idioma}><Icono nombre="conversa" tam={18} /><b>{q.texto}</b></p>
                  {q.respuestas.length > 0 ? q.respuestas.map((a, i) => (
                    <p key={i} className={s.respuesta} lang={q.idioma}>
                      <span className={s.quien} lang={ctx.idioma}>
                        {a.es_vendedor ? t('respuestaTienda', { tienda: a.autor }) : a.compro ? t('respuestaCompro', { autor: a.autor }) : a.autor}
                      </span>
                      {a.texto}
                    </p>
                  )) : <p className={s.respuesta}>{t('sinRespuesta')}</p>}
                  <FormRespuesta accion={responderAccion} slug={slug} idioma={ctx.idioma} pregunta={q.id} />
                </li>
              ))}
            </ul>
          )}
        </Textos>
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

      {/* fase 5: lo último que viste (isla del navegador: no bloquea la foto ni el prearmado de la ficha) */}
      <Vistos idioma={ctx.idioma} mercado={mercado} actual={slug} />
    </>
  )
}
