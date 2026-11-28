// Alertas de precio (simuladas: no mandamos correos). Al abrir la página se revisan contra el precio de hoy, en la
// moneda que eligió cada una y con la cotización de hoy; las que se cumplieron quedan arriba como aviso.
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import c from '@/components/cuenta/Cuenta.module.css'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import { AvisosLeidos } from '@/components/descubrir/AvisosLeidos'
import s from '@/components/descubrir/Listas.module.css'
import { Icono } from '@/components/Icono'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { bajo, formatearMinimo } from '@/lib/descubrir/alertas'
import { conPgCron, revisarMisAlertas } from '@/lib/descubrir/servidor'
import { foto } from '@/lib/imagenes'
import { LOCALE } from '@/lib/i18n/idiomas'
import type { Moneda } from '@/lib/region'
import { borrarAlertaAccion } from '../../descubrir/acciones'

type Alerta = {
  id: string; slug: string; titulo: string; imagen: string | null; region: string; moneda: Moneda; objetivo: number
  precio_inicial: number; base_usd_cent: number; precio_hoy: number | null; activa: boolean; cumplida: string | null
  precio_cumplida: number | null; leida: boolean; creado: string
}

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'alertas' })
  return { title: t('titulo'), robots: { index: false } }
}

export default function PaginaAlertas(props: PageProps<'/[idioma]/[mercado]/cuenta/alertas'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: 320 }} aria-hidden="true" />}><Alertas {...props} /></Suspense>
}

async function Alertas({ searchParams }: PageProps<'/[idioma]/[mercado]/cuenta/alertas'>) {
  const ctx = await contexto()
  const { demo } = await conSesion(ctx.idioma, '/cuenta/alertas')
  // en la vista previa no hay pg_cron: se revisan acá (y al entrar)
  await revisarMisAlertas()
  const [t, tc, alertas, sp] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'alertas' }),
    getTranslations({ locale: ctx.idioma, namespace: 'cuenta' }),
    rpcCuenta<Alerta[]>('mis_alertas', { idioma: ctx.idioma }),
    searchParams,
  ])
  const lista = alertas ?? []
  // se muestran como nuevas esta vez y quedan leídas para la próxima (el número del encabezado se apaga)
  if (lista.some((a) => a.cumplida && !a.leida)) await rpcCuenta('leer_avisos')
  const fecha = new Intl.DateTimeFormat(LOCALE[ctx.idioma], { day: 'numeric', month: 'long', timeZone: 'America/Asuncion' })
  const r = (x: string) => ruta(ctx.idioma, x)
  const m = (n: number | null, moneda: Moneda) => (n === null ? '—' : formatearMinimo(Number(n), moneda))
  const nuevas = lista.filter((a) => a.cumplida && !a.leida).length

  return (
    <>
      <div className={c.cabeza}>
        <h1>{t('titulo')}</h1>
        <p>{t('cantidad', { n: lista.filter((a) => a.activa).length })}</p>
      </div>
      <AvisosLeidos />
      {demo && <AvisoDemo texto={tc('demo')} />}
      <p className={s.simulacion}><Icono nombre="info" tam={18} /><span>{conPgCron ? t('simulacionCron') : t('simulacion')}</span></p>
      {sp.borrada === '1' && <p className={c.aviso} role="status"><Icono nombre="check" tam={18} />{t('borrada')}</p>}
      {nuevas > 0 && <p className={c.aviso} role="status"><Icono nombre="campana" tam={18} />{t('nuevas', { n: nuevas })}</p>}

      {lista.length === 0 ? (
        <section className={`panel ${c.vacio}`}>
          <h2>{t('vacioTitulo')}</h2>
          <p>{t('vacioTexto')}</p>
          <Link className="boton boton--marca" href={r('/buscar?orden=vendidos')}>{t('vacioBoton')}</Link>
        </section>
      ) : (
        <ul className={s.alertas}>
          {lista.map((a) => {
            const cumplida = Boolean(a.cumplida)
            const hoy = a.precio_hoy === null ? null : Number(a.precio_hoy)
            const falta = hoy !== null && a.activa ? hoy - Number(a.objetivo) : null
            return (
              <li key={a.id} className={`panel ${s.alerta} ${cumplida ? s.cumplida : ''} ${!a.activa && !cumplida ? s.vieja : ''}`}>
                {a.imagen ? <Image src={foto(a.imagen)} alt="" width={72} height={72} sizes="72px" /> : <span />}
                <div>
                  {cumplida && <p className={s.bajo}>{t('bajo', { titulo: a.titulo, precio: m(a.precio_cumplida, a.moneda) })}</p>}
                  <h2><Link href={r(`/p/${a.slug}`)}>{a.titulo}</Link></h2>
                  <p className={s.numeros}>
                    <span>{t('objetivo', { precio: m(a.objetivo, a.moneda) })}</span>
                    <span>{t('alCrear', { precio: m(a.precio_inicial, a.moneda), fecha: fecha.format(new Date(a.creado)) })}</span>
                    {hoy !== null && <span>{t('hoy', { precio: m(hoy, a.moneda) })}</span>}
                  </p>
                  {cumplida && a.precio_cumplida !== null && (
                    <p>{t('cumplidaDetalle', { pct: bajo(Number(a.precio_inicial), Number(a.precio_cumplida)), fecha: fecha.format(new Date(a.cumplida!)) })}</p>
                  )}
                  {falta !== null && falta > 0 && (
                    <>
                      <p>{t('falta', { precio: m(falta, a.moneda) })}</p>
                      {/* cuánto recorrió: del precio al crearla (0 %) al objetivo (100 %) */}
                      <span className={s.medidor} aria-hidden="true">
                        <span style={{ width: `${Math.max(3, Math.min(100, ((Number(a.precio_inicial) - hoy!) / (Number(a.precio_inicial) - Number(a.objetivo))) * 100))}%` }} />
                      </span>
                    </>
                  )}
                  {hoy === null && a.activa && <p>{t('sinPrecio')}</p>}
                  {a.moneda !== ctx.moneda && <p className={s.nota}>{t('otraMoneda', { moneda: a.moneda })}</p>}
                </div>
                <form action={borrarAlertaAccion}>
                  <input type="hidden" name="idioma" value={ctx.idioma} />
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className={s.enlaceBoton}>{a.activa ? t('borrar') : t('borrarVieja')}<span className="sr-only">: {a.titulo}</span></button>
                </form>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
