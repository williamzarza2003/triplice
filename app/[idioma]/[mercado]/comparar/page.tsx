// Comparador: hasta 4 productos de la misma categoría (o de categorías hermanas), lado a lado. Se arma en el
// servidor con la lista de la URL (?p=slug1,slug2…, compartible) o, si no viene, con la cookie del comparador.
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { CopiarEnlace } from '@/components/descubrir/CopiarEnlace'
import { Icono } from '@/components/Icono'
import { contexto, precio, precioNumero, ruta } from '@/lib/contexto'
import { alinear, cuantasCambian, filaDe, soloLoQueCambia, type Fila, type ProductoComparar } from '@/lib/descubrir/comparar'
import { MAX_COMPARAR, slugsDeTexto } from '@/lib/descubrir/cookies'
import { comparacion, leerCookieComparar } from '@/lib/descubrir/servidor'
import { foto } from '@/lib/imagenes'
import { LOCALE } from '@/lib/i18n/idiomas'
import { descuento } from '@/lib/precios'
import { SITIO } from '@/lib/sitio'
import { quitarComparadoAccion, vaciarComparacionAccion } from '../descubrir/acciones'
import s from './comparar.module.css'

export async function generateMetadata(): Promise<Metadata> {
  const { idioma } = await contexto()
  const t = await getTranslations({ locale: idioma, namespace: 'comparar' })
  return { title: t('titulo'), robots: { index: false, follow: true } }
}

export default function PaginaComparar(props: PageProps<'/[idioma]/[mercado]/comparar'>) {
  return (
    <main id="contenido" className="contenedor">
      <Suspense fallback={<div className="panel" style={{ minHeight: '100vh', marginTop: 24 }} aria-hidden="true" />}>
        <Contenido {...props} />
      </Suspense>
    </main>
  )
}

const valorDe = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x) ?? ''

type Renglon = { fila: Fila; extra?: (React.ReactNode | null)[] }

async function Contenido({ searchParams }: PageProps<'/[idioma]/[mercado]/comparar'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'comparar' })
  const r = (c: string) => ruta(ctx.idioma, c)
  const pedidos = slugsDeTexto(valorDe(sp.p))
  if (pedidos.length === 0) {
    // sin lista en la URL: la del comparador (cookie), para que la dirección siempre se pueda compartir
    const guardados = await leerCookieComparar()
    if (guardados.length) redirect(r(`/comparar?p=${guardados.map((x) => x.slug).join(',')}`))
    return <Vacio t={t} r={r} />
  }
  const datos = await comparacion(pedidos, ctx.idioma)
  const ps = datos.productos
  const solo = valorDe(sp.solo) === '1'
  const n = ps.length
  const numero = new Intl.NumberFormat(LOCALE[ctx.idioma], { maximumFractionDigits: 1 })
  const cat = (p: ProductoComparar) => ({ sub: p.categoria, padre: p.categoria_padre })

  // --- precio y vendedor
  const precioRenglon: Renglon = {
    fila: filaDe('precio', t('filas.precio'), ps.map((p) => precio(ctx, p.precio, cat(p))), ps.map((p) => precioNumero(ctx, p.precio, cat(p))), 'menor'),
    extra: ps.map((p) => (descuento(p.precio, p.precio_lista) > 0 && p.precio_lista
      ? <s key={p.slug} className={s.antes}><span className="sr-only">{t('antes')} </span>{precio(ctx, p.precio_lista, cat(p))}</s> : null)),
  }
  const rec = ps.map((p) => (p.tienda.recomendacion === null ? null : Number(p.tienda.recomendacion)))
  const reputacion: Renglon = {
    fila: filaDe('reputacion', t('filas.reputacion'), rec.map((x) => (x === null ? null : t('recomienda', { n: numero.format(x) }))), rec, 'mayor'),
    extra: ps.map((p) => <span key={p.slug} className={s.chica}>{t('tiendaDe', { tienda: p.tienda.nombre, ciudad: p.tienda.ciudad })}</span>),
  }
  const opiniones: Renglon = {
    fila: filaDe('opiniones', t('filas.opiniones'),
      ps.map((p) => (p.resenas ? t('estrellas', { valor: numero.format(Number(p.promedio)), n: p.resenas }) : t('sinOpiniones'))),
      ps.map((p) => (p.resenas ? Number(p.promedio) : null)), 'mayor'),
  }
  const entrega: Renglon = {
    fila: filaDe('entrega', t('filas.entrega'), ps.map((p) => (p.envio_gratis ? t('envioGratis')
      : p.tienda.pais === ctx.region ? t('retiro', { ciudad: p.tienda.ciudad }) : t('desde', { ciudad: p.tienda.ciudad })))),
  }
  // --- lo de la categoría y lo demás
  const caracteristicas = alinear(ps, datos.atributos, ctx.idioma).map((fila) => ({ fila }))
  const mas: Renglon[] = [
    { fila: filaDe('marca', t('filas.marca'), ps.map((p) => p.marca)) },
    { fila: filaDe('garantia', t('filas.garantia'), ps.map((p) => t('meses', { n: p.garantia_meses })), ps.map((p) => p.garantia_meses)) },
    { fila: filaDe('peso', t('filas.peso'), ps.map((p) => (p.peso_g ? (p.peso_g >= 1000 ? `${numero.format(p.peso_g / 1000)} kg` : `${p.peso_g} g`) : null)), ps.map((p) => p.peso_g)) },
    { fila: filaDe('condicion', t('filas.condicion'), ps.map((p) => t(`condicion.${p.condicion}`))) },
  ].filter((x) => x.fila.celdas.some((c) => c.texto !== null))

  const grupos = [
    { clave: 'compra', nombre: t('grupos.compra'), renglones: [precioRenglon, reputacion, opiniones, entrega] },
    { clave: 'caracteristicas', nombre: t('grupos.caracteristicas', { familia: datos.familia?.nombre ?? '' }), renglones: caracteristicas },
    { clave: 'mas', nombre: t('grupos.mas'), renglones: mas },
  ]
  const todas = grupos.flatMap((g) => g.renglones.map((x) => x.fila))
  const cambian = cuantasCambian(todas)
  const visibles = (rs: Renglon[]) => (solo ? rs.filter((x) => soloLoQueCambia([x.fila]).length > 0) : rs)
  const lista = ps.map((p) => p.slug).join(',')
  const enlace = (soloCambios: boolean) => r(`/comparar?p=${lista}${soloCambios ? '&solo=1' : ''}`)
  const aviso = valorDe(sp.aviso)
  const quiso = valorDe(sp.quiso)

  return (
    <>
      <div className={s.cabeza}>
        <div>
          <h1>{datos.familia ? t('tituloDe', { familia: datos.familia.nombre }) : t('titulo')}</h1>
          {n > 1 && <p className={s.resumen}>{t.rich('resumen', { n, cambian, total: todas.length, b: (c) => <b>{c}</b> })}</p>}
        </div>
        {n > 1 && (
          <nav className={s.vista} aria-label={t('vistaEtiqueta')}>
            <Link href={enlace(false)} aria-current={!solo ? 'page' : undefined} scroll={false}>{t('todo')}</Link>
            <Link href={enlace(true)} aria-current={solo ? 'page' : undefined} scroll={false}>{t('soloCambios', { n: cambian })}</Link>
          </nav>
        )}
      </div>

      {(aviso === 'otra_familia' || datos.fuera.length > 0) && (
        <p className={s.aviso} role="status"><Icono nombre="info" tam={18} />
          <span>{t('fuera', { titulos: datos.fuera.map((x) => x.titulo).join(', ') || quiso.replace(/-/g, ' '), familia: datos.familia?.nombre ?? '' })}</span>
        </p>
      )}
      {aviso === 'lleno' && <p className={s.aviso} role="status"><Icono nombre="info" tam={18} /><span>{t('lleno', { max: MAX_COMPARAR })}</span></p>}
      {datos.no_disponibles.length > 0 && (
        <p className={s.aviso} role="status"><Icono nombre="info" tam={18} /><span>{t('noDisponibles', { n: datos.no_disponibles.length })}</span></p>
      )}

      {n === 0 ? <Vacio t={t} r={r} /> : (
        <>
          <div className={s.marco} role="region" aria-labelledby="t-tabla" tabIndex={0} style={{ '--n': n } as React.CSSProperties}>
            <table className={s.tabla}>
              <caption id="t-tabla" className="sr-only">{t('caption', { n })}</caption>
              <thead>
                <tr>
                  <td className={s.esquina}>{n < MAX_COMPARAR && <p>{t('podesSumar', { n: MAX_COMPARAR - n })}</p>}</td>
                  {ps.map((p) => (
                    <th key={p.slug} scope="col">
                      <div className={s.producto}>
                        {p.imagen && <Image src={foto(p.imagen)} alt="" width={160} height={160} sizes="(max-width: 640px) 110px, 160px" />}
                        <Link href={r(`/p/${p.slug}`)}>{p.titulo}</Link>
                        <small>{p.categoria_nombre}</small>
                        <form action={quitarComparadoAccion}>
                          <input type="hidden" name="idioma" value={ctx.idioma} />
                          <input type="hidden" name="slug" value={p.slug} />
                          <input type="hidden" name="p" value={lista} />
                          <input type="hidden" name="familia" value={datos.familia?.slug ?? ''} />
                          {solo && <input type="hidden" name="solo" value="1" />}
                          <button type="submit" className={s.quitar}>{t('quitar')}<span className="sr-only">: {p.titulo}</span></button>
                        </form>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              {grupos.map((g) => {
                const rs = visibles(g.renglones)
                if (rs.length === 0) return null
                return (
                  <tbody key={g.clave}>
                    <tr className={s.grupo}><th scope="rowgroup" colSpan={n + 1}>{g.nombre}</th></tr>
                    {rs.map(({ fila, extra }) => <FilaTabla key={fila.clave} fila={fila} extra={extra} n={n} t={t} barras={g.clave === 'caracteristicas'} />)}
                  </tbody>
                )
              })}
            </table>
          </div>
          {n === 1 && (
            <p className={s.aviso} style={{ marginTop: 16 }}><Icono nombre="info" tam={18} />
              <span>{t('unoSolo', { familia: datos.familia?.nombre ?? '' })} {datos.familia && <Link href={r(`/c/${datos.familia.slug}`)}>{t('verFamilia', { familia: datos.familia.nombre })}</Link>}</span>
            </p>
          )}
          <div className={s.pie}>
            <CopiarEnlace id="enlace-comparar" className={s.compartir} base={SITIO} camino={enlace(solo)} etiqueta={t('compartir')} copiar={t('copiar')} copiado={t('copiado')} />
            <form action={vaciarComparacionAccion} className={s.vaciar}>
              <input type="hidden" name="idioma" value={ctx.idioma} />
              <button type="submit">{t('vaciar')}</button>
            </form>
          </div>
        </>
      )}
    </>
  )
}

// barras: solo en las características de la categoría (en precio, opiniones o peso, una barra más larga no dice nada útil)
function FilaTabla({ fila, extra, n, t, barras }: { fila: Fila; extra?: (React.ReactNode | null)[]; n: number; t: Awaited<ReturnType<typeof getTranslations>>; barras: boolean }) {
  if (fila.iguales) {
    return (
      <tr className={s.igual}>
        <th scope="row">{fila.nombre}</th>
        <td colSpan={n}>{fila.celdas[0].texto}<small>{t('igualEnTodos', { n })}</small></td>
      </tr>
    )
  }
  return (
    <tr className={s.cambia}>
      <th scope="row">{fila.nombre}<span className="sr-only"> ({t('cambia')})</span></th>
      {fila.celdas.map((c, i) => (
        <td key={i} className={c.texto === null ? s.vacia : undefined}>
          <span className={fila.clave === 'precio' ? `precio ${s.precio}` : undefined}>{c.texto ?? '—'}</span>
          {fila.mejor === i && <span className={`sello sello--exito ${s.mejor}`}>{fila.clave === 'precio' ? t('masBarato') : t('mejor')}</span>}
          {extra?.[i]}
          {barras && fila.escala && c.numero !== null && (
            <span className={s.barra} aria-hidden="true"><span style={{ width: `${Math.max(4, (c.numero / fila.escala) * 100)}%` }} /></span>
          )}
        </td>
      ))}
    </tr>
  )
}

function Vacio({ t, r }: { t: Awaited<ReturnType<typeof getTranslations>>; r: (c: string) => string }) {
  return (
    <section className={`panel ${s.vacio}`} style={{ marginTop: 24 }} aria-labelledby="t-vacio">
      <h2 id="t-vacio">{t('vacioTitulo')}</h2>
      <ol>
        <li>{t('vacio1')}</li>
        <li>{t('vacio2', { max: MAX_COMPARAR })}</li>
        <li>{t('vacio3')}</li>
      </ol>
      <Link className="boton boton--marca" href={r('/buscar?orden=vendidos')}>{t('vacioBoton')}</Link>
    </section>
  )
}
