// Carrito: agrupado por tienda (cada vendedor despacha lo suyo), con lo guardado para después y el cupón.
// Lee la cookie del carrito, así que se arma en cada visita (dentro de Suspense); los precios, el stock y los
// impuestos salen de la base en ese momento.
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { Cantidad, FormCupon } from '@/components/compra/Controles'
import { Resumen } from '@/components/compra/Resumen'
import s from '@/components/compra/Compra.module.css'
import { Icono } from '@/components/Icono'
import COLORES from '@/lib/catalogo/colores.json'
import { cotizar, leerCookieCarrito, type Renglon } from '@/lib/compra/servidor'
import { contexto, ruta, type Contexto } from '@/lib/contexto'
import { foto } from '@/lib/imagenes'
import { formatear } from '@/lib/precios'
import { aplicarCuponAccion, cambiarCantidadAccion, paraDespuesAccion, quitarAccion, quitarCuponAccion } from './acciones'

// Metadata fija: el título va dentro del contenido dinámico (React lo sube al <head>), así nada se calcula
// antes de leer la cookie del comprador.
export const metadata: Metadata = { robots: { index: false } }

export default function PaginaCarrito() {
  return (
    <main id="contenido" className="contenedor">
      <Suspense fallback={<div className={s.cargando} aria-hidden="true" />}>
        <Carrito />
      </Suspense>
    </main>
  )
}

const NOMBRE_COLOR = COLORES as Record<string, Record<string, string>>

function opcionesTexto(r: Renglon, ctx: Contexto) {
  return Object.entries(r.dato?.variante.opciones ?? {})
    .map(([k, v]) => (k === 'color' ? NOMBRE_COLOR[v]?.[ctx.idioma] ?? v : v)).join(' · ')
}

async function Carrito() {
  await connection() // se arma en cada visita
  const carrito = await leerCookieCarrito() // primero la cookie: la página se arma en cada visita
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'compra' })
  const cot = await cotizar(ctx, carrito)
  const r = (c: string) => ruta(ctx.idioma, c)
  const f = (n: number) => formatear(n, ctx.moneda)
  const vacio = cot.renglones.length === 0

  // por tienda, en el orden en que se agregaron
  const tiendas = [...new Set(cot.renglones.map((x) => x.dato?.tienda.slug ?? '?'))]
  const comprables = cot.renglones.filter((x) => x.cantidadCobrable > 0)

  const textosCupon = {
    etiqueta: t('cuponEtiqueta'), placeholder: t('cuponPlaceholder'), aplicar: t('cuponAplicar'),
    errores: { no_existe: t('cuponNoExiste'), vencido: t('cuponVencido'), agotado: t('cuponAgotado'), vacio: t('cuponVacio') },
  }

  return (
    <>
      <title>{`${t('carritoTitulo')} · Tríplice`}</title>
      <h1 className={s.titulo}>{t('carritoTitulo')}</h1>
      {vacio ? (
        <section className={`panel ${s.vacio}`} aria-labelledby="t-vacio">
          <Icono nombre="carrito" tam={40} />
          <h2 id="t-vacio">{t('vacioTitulo')}</h2>
          <p>{t('vacioTexto')}</p>
          <Link className="boton boton--marca" href={r('/buscar?orden=vendidos')}>{t('vacioBoton')}</Link>
        </section>
      ) : (
        <div className={s.dosColumnas}>
          <div className={s.columna}>
            {tiendas.map((slug) => {
              const suyos = cot.renglones.filter((x) => (x.dato?.tienda.slug ?? '?') === slug)
              const tienda = suyos[0].dato?.tienda
              return (
                <section key={slug} className="panel" aria-labelledby={`t-${slug}`}>
                  <h2 id={`t-${slug}`} className={s.deTienda}>
                    {tienda ? <>{t('deTienda')} <Link href={r(`/tienda/${tienda.slug}`)}>{tienda.nombre}</Link> · {tienda.ciudad}</> : t('noDisponible')}
                  </h2>
                  {suyos.map((x) => (
                    <article key={x.o} className={s.linea} aria-labelledby={`l-${x.o}`}>
                      {x.dato?.variante.imagen
                        ? <Image src={foto(x.dato.variante.imagen)} alt="" width={112} height={112} sizes="112px" />
                        : <span className={s.sinFoto} />}
                      <div>
                        <h3 id={`l-${x.o}`}>
                          {x.dato ? <Link href={r(`/p/${x.dato.producto.slug}?v=${x.dato.variante.sku}`)}>{x.dato.producto.titulo}</Link> : t('noDisponible')}
                        </h3>
                        <div className={s.meta}>
                          {opcionesTexto(x, ctx) && <span>{opcionesTexto(x, ctx)}</span>}
                          {x.agotado && <span className={s.agotado}>{t('agotado')}</span>}
                          {!x.agotado && x.dato && x.c > x.dato.stock && <span className={s.pocas}>{t('soloHay', { n: x.dato.stock })}</span>}
                          {!x.agotado && x.dato && x.dato.stock <= 3 && x.c <= x.dato.stock && <span className={s.pocas}>{t('quedan', { n: x.dato.stock })}</span>}
                          {x.dato?.envio_gratis && <span className={s.gratis}>{t('envioGratis')}</span>}
                        </div>
                        <div className={s.acciones}>
                          {!x.agotado && x.dato && (
                            <Cantidad oferta={x.o} cantidad={x.cantidadCobrable} maximo={x.dato.stock} accion={cambiarCantidadAccion}
                              etiqueta={t('cantidadDe', { producto: x.dato.producto.titulo })} actualizar={t('actualizar')} />
                          )}
                          <form action={paraDespuesAccion}>
                            <input type="hidden" name="oferta" value={x.o} /><input type="hidden" name="guardar" value="1" />
                            <button className={s.enlace} type="submit">{t('guardarDespues')}</button>
                          </form>
                          <form action={quitarAccion}>
                            <input type="hidden" name="oferta" value={x.o} />
                            <button className={s.enlace} type="submit">{t('quitar')}</button>
                          </form>
                        </div>
                      </div>
                      <p className={`precio ${s.precioLinea}`}>
                        {f(x.unitario * x.cantidadCobrable)}
                        {x.cantidadCobrable > 1 && <small>{t('cadaUno', { precio: f(x.unitario) })}</small>}
                      </p>
                    </article>
                  ))}
                </section>
              )
            })}

            {cot.guardados.length > 0 && (
              <section className="seccion" aria-labelledby="t-despues">
                <div className="seccion__cabeza"><h2 id="t-despues">{t('guardadosTitulo', { n: cot.guardados.length })}</h2></div>
                <ul className={s.guardados}>
                  {cot.guardados.map((x) => (
                    <li key={x.o}>
                      {x.dato?.variante.imagen ? <Image src={foto(x.dato.variante.imagen)} alt="" width={72} height={72} sizes="72px" /> : <span className={s.sinFoto} />}
                      <div>
                        {x.dato ? <Link href={r(`/p/${x.dato.producto.slug}?v=${x.dato.variante.sku}`)}>{x.dato.producto.titulo}</Link> : t('noDisponible')}
                        {x.dato && <b className="precio">{f(x.unitario)}</b>}
                        <div className={s.acciones}>
                          {!x.agotado && (
                            <form action={paraDespuesAccion}>
                              <input type="hidden" name="oferta" value={x.o} /><input type="hidden" name="guardar" value="0" />
                              <button className={s.enlace} type="submit">{t('moverAlCarrito')}</button>
                            </form>
                          )}
                          <form action={quitarAccion}>
                            <input type="hidden" name="oferta" value={x.o} />
                            <button className={s.enlace} type="submit">{t('quitar')}</button>
                          </form>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className={`panel ${s.resumen}`} aria-labelledby="t-resumen">
            <h2 id="t-resumen">{t('resumen')}</h2>
            <Resumen d={cot.desglose} idioma={ctx.idioma} unidades={comprables.reduce((n, x) => n + x.cantidadCobrable, 0)} envioPendiente
              cupon={cot.cupon && !('error' in cot.cupon) ? cot.cupon.codigo : null} sinImpuestos={ctx.region === 'XX'} />
            {cot.cupon && !('error' in cot.cupon) ? (
              <form action={quitarCuponAccion} className={s.cuponAplicado}>
                <Icono nombre="check" tam={18} />
                <span><b>{cot.cupon.codigo}</b><small>{cot.cupon.descripcion}</small></span>
                <button className={s.enlace} type="submit">{t('quitarCupon')}</button>
              </form>
            ) : (
              <>
                {cot.cupon && 'error' in cot.cupon && cot.cupon.error === 'minimo' && (
                  <p className={s.error} role="status"><Icono nombre="info" tam={16} />{t('cuponMinimo', { codigo: cot.cupon.codigo })}</p>
                )}
                <FormCupon accion={aplicarCuponAccion} textos={textosCupon} />
              </>
            )}
            {comprables.length > 0
              ? <Link className="boton boton--accion boton--ancho" href={r('/pagar')}>{t('continuar')}</Link>
              : <p className={s.error}><Icono nombre="info" tam={16} />{t('nadaComprable')}</p>}
            <p className={s.nota}><Icono nombre="escudo" tam={16} />{t('notaMoneda', { moneda: ctx.moneda })}</p>
          </aside>
        </div>
      )}
    </>
  )
}
