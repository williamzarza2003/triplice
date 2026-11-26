// Comprobante del pedido: confirmado, con la línea de tiempo (confirmado → preparando → listo o en camino →
// entregado), el detalle congelado al pagar y dónde retirar o a dónde llega. Sale de la cookie firmada del
// comprador (sin cuenta hasta la fase 3).
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { MapaRetiro } from '@/components/compra/MapaRetiro'
import s from '@/components/compra/Compra.module.css'
import p from '@/components/compra/Pago.module.css'
import { Icono } from '@/components/Icono'
import { leerPedido } from '@/lib/compra/pedido'
import { contexto, ruta } from '@/lib/contexto'
import { foto } from '@/lib/imagenes'
import { LOCALE } from '@/lib/i18n/idiomas'
import { formatear } from '@/lib/precios'
import type { Moneda } from '@/lib/region'

// Con Cache Components cada segmento dinámico necesita al menos un valor de muestra para el build; el contenido
// (que lee la cookie del comprador) se arma igual en cada visita.
export function generateStaticParams() {
  return [{ numero: 'TR-MUESTR' }]
}

// Metadata fija: el título va dentro del contenido dinámico (React lo sube al <head>), así nada se calcula
// antes de leer la cookie del comprador.
export const metadata: Metadata = { robots: { index: false } }

export default function PaginaPedido(props: PageProps<'/[idioma]/[mercado]/pedido/[numero]'>) {
  return (
    <main id="contenido" className="contenedor">
      <Suspense fallback={<div className={s.cargando} aria-hidden="true" />}><Contenido {...props} /></Suspense>
    </main>
  )
}

async function Contenido({ params }: PageProps<'/[idioma]/[mercado]/pedido/[numero]'>) {
  await connection() // se arma en cada visita
  const pedido = await leerPedido()
  const [{ numero }, ctx] = await Promise.all([params, contexto()])
  const [t, tc] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'pedido' }),
    getTranslations({ locale: ctx.idioma, namespace: 'comun' }),
  ])
  const r = (c: string) => ruta(ctx.idioma, c)

  const titulo = <title>{`${t('titulo')} · Tríplice`}</title>
  if (!pedido || pedido.numero !== numero) {
    return (
      <>{titulo}<section className={`panel ${s.vacio}`} aria-labelledby="t-no">
        <h1 id="t-no" className={s.titulo}>{t('noEncontrado')}</h1>
        <p>{t('noEncontradoTexto')}</p>
        <Link className="boton boton--marca" href={r('')}>{t('volverInicio')}</Link>
      </section></>
    )
  }

  const m = pedido.moneda as Moneda
  const f = (n: number) => formatear(n, m)
  const confirmado = pedido.estado === 'confirmado'
  const fecha = new Intl.DateTimeFormat(LOCALE[ctx.idioma], { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Asuncion' })
  const e = pedido.entrega
  const pasos = [
    { clave: 'confirmado', hecho: confirmado, detalle: confirmado ? fecha.format(new Date(pedido.creado)) : t('esperandoPago') },
    { clave: 'preparando', hecho: false, detalle: e.modo === 'retiro' ? t('preparandoRetiro', { h: Math.max(...e.puntos.map((x) => x.listoEnH)) }) : t('preparandoEnvio') },
    { clave: e.modo === 'retiro' ? 'listoRetiro' : 'enviado', hecho: false, detalle: e.modo === 'retiro' ? t('listoRetiroDetalle') : t('enviadoDetalle', { min: e.diasMin, max: e.diasMax }) },
    { clave: 'entregado', hecho: false, detalle: '' },
  ]

  return (
    <>
      {titulo}
      <div className={s.confirmacion}>
        <Icono nombre={confirmado ? 'check' : 'reloj'} tam={32} />
        <div>
          <h1 className={s.titulo}>{confirmado ? t('confirmadoTitulo') : t('pendienteTitulo')}</h1>
          <p>{t('numero', { numero: pedido.numero })} · {t('aviso', { email: pedido.email })}</p>
        </div>
      </div>

      <div className={s.dosColumnas}>
        <div className={s.columna}>
          <section className="panel" aria-labelledby="t-linea">
            <h2 id="t-linea" className={s.subtitulo}>{t('lineaTitulo')}</h2>
            <ol className={s.lineaTiempo}>
              {pasos.map((x, i) => (
                <li key={x.clave} data-hecho={x.hecho} aria-current={(confirmado ? i === 1 : i === 0) ? 'step' : undefined}>
                  <b>{t(`estados.${x.clave}`)}</b>{x.detalle && <small>{x.detalle}</small>}
                </li>
              ))}
            </ol>
          </section>

          <section className="panel" aria-labelledby="t-entrega">
            <h2 id="t-entrega" className={s.subtitulo}>{e.modo === 'retiro' ? t('retirarEn') : t('llegaA')}</h2>
            {e.modo === 'retiro' ? (
              <div className={p.retiro}>
                <MapaRetiro puntos={e.puntos.map((x, i) => ({ n: i + 1, lat: x.lat, lng: x.lng, ciudad: x.ciudad }))}
                  paises={{ PY: tc('paises.PY'), BR: tc('paises.BR'), AR: tc('paises.AR') }} puente={t('puente')} />
                <ol className={p.puntos}>
                  {e.puntos.map((x, i) => (
                    <li key={x.tienda}><span aria-hidden="true">{i + 1}</span>
                      <div><b>{x.tienda}</b><small>{x.direccion}, {x.ciudad}</small><small>{x.horario}</small><small>{t('llevaDocumento')}</small></div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : <p>{pedido.nombre} · {e.direccion} · {e.zona}</p>}
          </section>

          <section className="panel" aria-labelledby="t-items">
            <h2 id="t-items" className={s.subtitulo}>{t('detalle')}</h2>
            {pedido.items.map((x) => (
              <article key={x.titulo + x.opciones} className={s.linea}>
                {x.imagen ? <Image src={foto(x.imagen)} alt="" width={112} height={112} sizes="112px" /> : <span className={s.sinFoto} />}
                <div>
                  <h3>{x.titulo}</h3>
                  <div className={s.meta}>{x.opciones && <span>{x.opciones}</span>}<span>{t('vende', { tienda: x.tienda })}</span><span>{t('cantidad', { n: x.cantidad })}</span></div>
                </div>
                <p className={`precio ${s.precioLinea}`}>{f(x.precio * x.cantidad)}</p>
              </article>
            ))}
          </section>
        </div>

        <aside className={`panel ${s.resumen}`} aria-labelledby="t-pagado">
          <h2 id="t-pagado">{confirmado ? t('pagado') : t('aPagar')}</h2>
          <dl className={s.desglose}>
            <dt>{t('productos')}</dt><dd>{f(pedido.desglose.productos)}</dd>
            {pedido.desglose.descuento > 0 && <><dt>{t('cupon', { codigo: pedido.cupon ?? '' })}</dt><dd className={s.ahorro}>− {f(pedido.desglose.descuento)}</dd></>}
            <dt>{t('envio')}</dt><dd>{pedido.desglose.envio === 0 ? <span className={s.gratis}>{t('gratis')}</span> : f(pedido.desglose.envio)}</dd>
            <dt className={s.total}>{t('total')}</dt><dd className={s.total}>{f(pedido.desglose.total)}</dd>
          </dl>
          {pedido.desglose.impuestos.length > 0 && <p className={s.incluye}>{t('incluye', { lista: pedido.desglose.impuestos.map((x) => `${x.nombre}: ${f(x.monto)}`).join(' · ') })}</p>}
          <p className={s.nota}><Icono nombre="info" tam={16} />{pedido.proveedor === 'stripe' ? t('notaStripe') : t('notaSimulado')}</p>
          <Link className="boton boton--sec boton--ancho" href={r('')}>{t('seguirComprando')}</Link>
        </aside>
      </div>
    </>
  )
}
