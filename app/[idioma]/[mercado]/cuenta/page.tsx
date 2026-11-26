// Mis pedidos: cada uno con su trayecto (confirmado → preparando → en camino o listo → entregado).
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import s from '@/components/cuenta/Cuenta.module.css'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import { Trayecto } from '@/components/cuenta/Trayecto'
import { conSesion, montoMinimo } from '@/lib/cuenta/pagina'
import { trayecto, type PedidoResumen } from '@/lib/cuenta/pedidos'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { foto } from '@/lib/imagenes'
import { LOCALE } from '@/lib/i18n/idiomas'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  return { title: t('pedidos.titulo'), robots: { index: false } }
}

export default function PaginaPedidos() {
  return <Suspense fallback={<div className="panel" style={{ minHeight: 320 }} aria-hidden="true" />}><Pedidos /></Suspense>
}

async function Pedidos() {
  const ctx = await contexto()
  const { demo } = await conSesion(ctx.idioma, '/cuenta')
  const [t, pedidos] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'cuenta' }),
    rpcCuenta<PedidoResumen[]>('mis_pedidos'),
  ])
  const fecha = new Intl.DateTimeFormat(LOCALE[ctx.idioma], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Asuncion' })
  const lista = pedidos ?? []
  return (
    <>
      <div className={s.cabeza}>
        <h1>{t('pedidos.titulo')}</h1>
        {lista.length > 0 && <p>{t('pedidos.cantidad', { n: lista.length })}</p>}
      </div>
      {demo && <AvisoDemo texto={t('demo')} />}
      {lista.length === 0 ? (
        <section className={`panel ${s.vacio}`}>
          <h2>{t('pedidos.vacio')}</h2>
          <p>{t('pedidos.vacioTexto')}</p>
          <Link className="boton boton--marca" href={ruta(ctx.idioma)}>{t('pedidos.irAComprar')}</Link>
        </section>
      ) : (
        <ul className={s.pedidos}>
          {lista.map((p) => (
            <li key={p.numero} className={`panel ${s.pedido}`}>
              <div className={s.fotos} aria-hidden="true">
                {p.fotos.slice(0, p.fotos.length > 1 ? 4 : 1).map((x, i) => x
                  ? <Image key={i} src={foto(x)} alt="" width={116} height={116} sizes="116px" />
                  : <span key={i} />)}
              </div>
              <div className={s.datos}>
                <h2><Link href={ruta(ctx.idioma, `/cuenta/pedidos/${p.numero}`)}>{t('pedidos.pedido', { numero: p.numero })}</Link></h2>
                <p className={s.meta}>
                  <span>{fecha.format(new Date(p.creado))}</span>
                  <span>{t('pedidos.productos', { n: Number(p.items) })}</span>
                  <span>{p.modo === 'retiro' ? t('pedidos.retiro') : t('pedidos.domicilio')}</span>
                  {p.devolucion && <span className="sello sello--info">{t('pedidos.conDevolucion')}</span>}
                </p>
                <Trayecto paradas={trayecto(p.estado, p.modo)} textos={t.raw('paradas') as Record<string, string>} compacto />
                {(() => {
                  const actual = trayecto(p.estado, p.modo).find((x) => x.actual)
                  return actual && <p className={s.estadoCorto} aria-hidden="true">{t('pedidos.estado', { estado: t(`paradas.${actual.clave}`) })}</p>
                })()}
              </div>
              <p className={s.total}>{montoMinimo(p.total, p.moneda)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
