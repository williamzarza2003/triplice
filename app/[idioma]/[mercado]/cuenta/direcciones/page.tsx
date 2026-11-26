// Direcciones guardadas: se eligen al pagar con envío a domicilio. Una es la predeterminada.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import s from '@/components/cuenta/Cuenta.module.css'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import { FormDireccion } from '@/components/cuenta/FormDireccion'
import { Icono } from '@/components/Icono'
import { direccionEnUnaLinea } from '@/lib/compra/direccion'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import type { Region } from '@/lib/region'
import { borrarDireccionAccion, guardarDireccionAccion, predeterminadaAccion } from '../acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  return { title: t('direcciones.titulo'), robots: { index: false } }
}

export type Direccion = { id: string; alias: string; region: Region; nombre: string; telefono: string; datos: Record<string, string>; predeterminada: boolean }

export default function PaginaDirecciones(props: PageProps<'/[idioma]/[mercado]/cuenta/direcciones'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: 320 }} aria-hidden="true" />}><Direcciones {...props} /></Suspense>
}

async function Direcciones({ searchParams }: PageProps<'/[idioma]/[mercado]/cuenta/direcciones'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const { demo } = await conSesion(ctx.idioma, '/cuenta/direcciones')
  const [t, tc, mensajes, lista] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'cuenta' }),
    getTranslations({ locale: ctx.idioma, namespace: 'comun' }),
    getMessages({ locale: ctx.idioma }),
    rpcCuenta<Direccion[]>('mis_direcciones'),
  ])
  const editar = typeof sp.editar === 'string' ? (lista ?? []).find((d) => d.id === sp.editar) : undefined
  const nueva = sp.nueva === '1' || (lista ?? []).length === 0
  const oculto = <input type="hidden" name="idioma" value={ctx.idioma} />
  return (
    <>
      <div className={s.cabeza}>
        <h1>{t('direcciones.titulo')}</h1>
        {!nueva && !editar && (lista ?? []).length < 10 && <Link className="boton boton--sec" href={ruta(ctx.idioma, '/cuenta/direcciones?nueva=1')}>{t('direcciones.agregar')}</Link>}
      </div>
      {demo && <AvisoDemo texto={t('demo')} />}
      {(sp.guardada || sp.borrada) && <p className={s.aviso} role="status"><Icono nombre="check" tam={18} />{sp.guardada ? t('direcciones.guardada') : t('direcciones.borrada')}</p>}

      {(lista ?? []).length > 0 && (
        <ul className={s.direcciones}>
          {lista!.map((d) => (
            <li key={d.id} className={`panel ${s.direccion}`} data-predeterminada={d.predeterminada}>
              <b>{d.alias}</b>
              {d.predeterminada && <p><span className="sello sello--info">{t('direcciones.predeterminada')}</span></p>}
              <p>{d.nombre} · {d.telefono}</p>
              <p>{direccionEnUnaLinea(d.region, d.datos)}</p>
              <p>{tc(`paises.${d.region}`)}</p>
              <div className={s.acciones}>
                <Link href={ruta(ctx.idioma, `/cuenta/direcciones?editar=${d.id}`)}>{t('direcciones.editar')}</Link>
                {!d.predeterminada && <form action={predeterminadaAccion}>{oculto}<input type="hidden" name="id" value={d.id} /><button type="submit">{t('direcciones.hacerPredeterminada')}</button></form>}
                <form action={borrarDireccionAccion}>{oculto}<input type="hidden" name="id" value={d.id} />
                  <button type="submit" aria-label={t('direcciones.borrarAlias', { alias: d.alias })}>{t('direcciones.borrar')}</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(nueva || editar) && (
        <section className="panel" aria-labelledby="t-form">
          <h2 id="t-form" className={s.subtituloForm}>{editar ? t('direcciones.editarAlias', { alias: editar.alias }) : t('direcciones.nueva')}</h2>
          <Textos locale={LOCALE[ctx.idioma]} mensajes={{ cuenta: mensajes.cuenta, pagar: mensajes.pagar, comun: mensajes.comun }}>
            <FormDireccion key={editar?.id ?? 'nueva'} accion={guardarDireccionAccion} idioma={ctx.idioma} region={editar?.region ?? ctx.region}
              inicial={editar ? { id: editar.id, alias: editar.alias, region: editar.region, nombre: editar.nombre, telefono: editar.telefono,
                predeterminada: String(editar.predeterminada), ...editar.datos } : undefined} />
          </Textos>
        </section>
      )}
    </>
  )
}
