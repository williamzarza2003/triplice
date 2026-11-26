// Un pedido de la cuenta: trayecto con fechas, dónde retirar o a dónde llega, cada producto con "Opinar" y
// "Pedir devolución" (hasta 7 días después de recibirlo) y el comprobante en PDF.
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import s from '@/components/cuenta/Cuenta.module.css'
import c from '@/components/compra/Compra.module.css'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import { FormDevolucion } from '@/components/cuenta/FormDevolucion'
import { Trayecto } from '@/components/cuenta/Trayecto'
import { Icono } from '@/components/Icono'
import { conSesion, montoMinimo, opcionesTexto } from '@/lib/cuenta/pagina'
import { plazoDevolucion, trayecto, type PedidoCuenta } from '@/lib/cuenta/pedidos'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { foto } from '@/lib/imagenes'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { devolucionAccion } from '../../acciones'

export async function generateMetadata({ params }: PageProps<'/[idioma]/[mercado]/cuenta/pedidos/[numero]'>): Promise<Metadata> {
  const [{ numero }, ctx] = await Promise.all([params, contexto()])
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  return { title: t('pedidos.pedido', { numero }) }
}

// Con Cache Components cada segmento dinámico necesita un valor de muestra para el build
export function generateStaticParams() {
  return [{ numero: 'TR-MUESTR' }]
}

export default function PaginaPedido(props: PageProps<'/[idioma]/[mercado]/cuenta/pedidos/[numero]'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: 480 }} aria-hidden="true" />}><Pedido {...props} /></Suspense>
}

async function Pedido({ params, searchParams }: PageProps<'/[idioma]/[mercado]/cuenta/pedidos/[numero]'>) {
  const [{ numero }, ctx, sp] = await Promise.all([params, contexto(), searchParams])
  const { demo } = await conSesion(ctx.idioma, `/cuenta/pedidos/${numero}`)
  const [t, tp, mensajes, pedido] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'cuenta' }),
    getTranslations({ locale: ctx.idioma, namespace: 'pedido' }),
    getMessages({ locale: ctx.idioma }),
    rpcCuenta<PedidoCuenta | null>('mi_pedido', { numero }),
  ])
  if (!pedido) notFound()

  const m = pedido.moneda
  const f = (n: number) => montoMinimo(n, m)
  const fecha = new Intl.DateTimeFormat(LOCALE[ctx.idioma], { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Asuncion' })
  const dia = new Intl.DateTimeFormat(LOCALE[ctx.idioma], { day: 'numeric', month: 'long', timeZone: 'America/Asuncion' })
  const e = pedido.entrega
  const plazo = plazoDevolucion(pedido.entregado)
  const r = (x: string) => ruta(ctx.idioma, x)

  return (
    <>
      <div className={s.cabeza}>
        <div>
          <p><Link href={r('/cuenta')}>{t('detalle.volver')}</Link></p>
          <h1>{t('pedidos.pedido', { numero })}</h1>
          <p>{t('detalle.hecho', { fecha: fecha.format(new Date(pedido.creado)) })}</p>
        </div>
        <a className="boton boton--sec" href={`/api/comprobante/${numero}?idioma=${ctx.idioma}`} download>
          <Icono nombre="descarga" tam={18} />{t('detalle.pdf')}
        </a>
      </div>
      {demo && <AvisoDemo texto={t('demo')} />}
      {sp.devolucion === '1' && <p className={s.aviso} role="status"><Icono nombre="check" tam={18} />{t('devolucion.enviada')}</p>}

      <div className={c.dosColumnas}>
        <div className={c.columna}>
          <section className="panel" aria-labelledby="t-trayecto">
            <h2 id="t-trayecto" className={c.subtitulo}>{t('detalle.trayecto')}</h2>
            <Trayecto paradas={trayecto(pedido.estado, e.modo, pedido.eventos)} textos={t.raw('paradas') as Record<string, string>}
              fecha={(x) => fecha.format(new Date(x))}
              detalles={{
                preparando: e.modo === 'retiro' ? tp('preparandoRetiro', { h: Math.max(4, ...e.puntos.map((x) => x.listoEnH)) }) : tp('preparandoEnvio'),
                enviado: e.modo === 'domicilio' ? tp('enviadoDetalle', { min: e.diasMin, max: e.diasMax }) : undefined,
                listoRetiro: tp('listoRetiroDetalle'),
              }} />
          </section>

          <section className="panel" aria-labelledby="t-productos">
            <h2 id="t-productos" className={c.subtitulo}>{tp('detalle')}</h2>
            <Textos locale={LOCALE[ctx.idioma]} mensajes={{ cuenta: mensajes.cuenta }}>
              <div className={s.items}>
                {pedido.items.map((x) => (
                  <article key={x.id} className={s.item}>
                    {x.imagen ? <Image src={foto(x.imagen)} alt="" width={88} height={88} sizes="88px" /> : <span />}
                    <div>
                      <h3>{x.slug ? <Link href={r(`/p/${x.slug}`)}>{x.titulo}</Link> : x.titulo}</h3>
                      <p className={c.meta}>
                        {Object.keys(x.opciones).length > 0 && <span>{opcionesTexto(x.opciones, ctx.idioma)}</span>}
                        {x.tienda && <span>{tp('vende', { tienda: x.tienda })}</span>}
                        <span>{tp('cantidad', { n: x.cantidad })}</span>
                      </p>
                      <div className={s.acciones}>
                        {x.resena ? (
                          <span className="sello sello--exito"><Icono nombre="check" tam={14} />{t('detalle.opinaste', { n: x.resena.estrellas })}</span>
                        ) : pedido.estado === 'entregado' && (
                          <Link className="boton boton--marca" href={r(`/cuenta/opinar/${x.id}`)}><Icono nombre="estrella" tam={18} />{t('detalle.opinar')}</Link>
                        )}
                        {x.devolucion ? (
                          <span className={s.estadoDev}><Icono nombre="devolver" tam={16} />{t(`devolucion.estados.${x.devolucion.estado}`, { fecha: dia.format(new Date(x.devolucion.creado)) })}</span>
                        ) : plazo.abierto && pedido.estado === 'entregado' ? (
                          <FormDevolucion accion={devolucionAccion} item={x.id} numero={numero} idioma={ctx.idioma} hasta={dia.format(plazo.hasta!)} />
                        ) : pedido.estado === 'entregado' && plazo.hasta && (
                          <span className={s.letraChica}>{t('devolucion.vencida', { fecha: dia.format(plazo.hasta) })}</span>
                        )}
                      </div>
                    </div>
                    <p className={`precio ${c.precioLinea}`}>{f(x.precio * x.cantidad)}</p>
                  </article>
                ))}
              </div>
            </Textos>
          </section>
        </div>

        <aside className={c.columna}>
          <section className={`panel ${c.resumen}`} aria-labelledby="t-pagado">
            <h2 id="t-pagado">{tp('pagado')}</h2>
            <dl className={c.desglose}>
              <dt>{tp('productos')}</dt><dd>{f(pedido.productos)}</dd>
              {pedido.descuento > 0 && <><dt>{tp('cupon', { codigo: pedido.cupon ?? '' })}</dt><dd className={c.ahorro}>− {f(pedido.descuento)}</dd></>}
              <dt>{tp('envio')}</dt><dd>{Number(pedido.envio) === 0 ? <span className={c.gratis}>{tp('gratis')}</span> : f(pedido.envio)}</dd>
              <dt className={c.total}>{tp('total')}</dt><dd className={c.total}>{f(pedido.total)}</dd>
            </dl>
            {pedido.impuestos.length > 0 && <p className={c.incluye}>{tp('incluye', { lista: pedido.impuestos.map((x) => `${x.nombre}: ${f(x.monto)}`).join(' · ') })}</p>}
          </section>
          <section className="panel" aria-labelledby="t-entrega">
            <h2 id="t-entrega" className={c.subtitulo}>{e.modo === 'retiro' ? tp('retirarEn') : tp('llegaA')}</h2>
            {e.modo === 'retiro' ? (
              <ul className={s.misResenas}>
                {e.puntos.map((x) => (
                  <li key={x.tienda}><b>{x.tienda}</b><p className={s.letraChica}>{x.direccion}, {x.ciudad} · {x.horario}</p></li>
                ))}
              </ul>
            ) : <p>{e.nombre && <>{e.nombre}<br /></>}{e.direccion}</p>}
            {e.modo === 'retiro' && <p className={s.letraChica}>{tp('llevaDocumento')}</p>}
          </section>
        </aside>
      </div>
    </>
  )
}
