'use client'
// Lo personal de la ficha, dentro de la caja de compra: favorito, guardar en una lista, comparar y "Avisame si baja".
// La ficha es estática (igual para todos): esta isla pide en qué listas está el producto y su alerta recién cuando
// el navegador está libre, y solo si hay una sesión. Todo funciona también como formulario sin JavaScript.
import { useActionState, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  alertaAccion, borrarAlertaAccion, crearListaAccion, enListaAccion, fichaPersonalAccion, type AlertaFicha, type EstadoAlerta,
  type ListaFicha, type ResultadoLista,
} from '@/app/[idioma]/[mercado]/descubrir/acciones'
import { formatearMinimo, montoParaCampo, objetivoSugerido } from '@/lib/descubrir/alertas'
import { conSesion, marcarFavorito } from '@/lib/descubrir/estado'
import { REGLAS } from '@/lib/precios'
import type { Moneda } from '@/lib/region'
import { useTextos } from '@/lib/i18n/textos'
import { Icono } from '../Icono'
import { BotonComparar } from './BotonComparar'
import { BotonFavorito } from './BotonFavorito'
import s from './Descubrir.module.css'

type Props = {
  slug: string; titulo: string; familia: string; idioma: string; mercado: string; moneda: Moneda
  /** el precio de hoy (la oferta más barata con stock), en la unidad mínima de la moneda del mercado */
  precioHoy: number | null
}

export function PersonalFicha({ slug, titulo, familia, idioma, mercado, moneda, precioHoy }: Props) {
  const t = useTextos('descubrir')
  const [listas, setListas] = useState<ListaFicha[] | null>(null)
  const [alerta, setAlerta] = useState<AlertaFicha | null>(null)
  const [sesion, setSesion] = useState(false)

  useEffect(() => {
    if (!conSesion()) return
    let vivo = true
    // el saludo del encabezado dice que hay sesión: se muestran las listas mientras llega lo demás
    const ya = requestAnimationFrame(() => setSesion(true))
    const pedir = () => fichaPersonalAccion(slug).then((r) => {
      if (!vivo || !r) return
      setListas(r.listas); setAlerta(r.alerta)
    }).catch(() => {})
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(pedir, { timeout: 3000 }); else setTimeout(pedir, 800)
    return () => { vivo = false; cancelAnimationFrame(ya) }
  }, [slug])

  const ocultos = <><input type="hidden" name="slug" value={slug} /><input type="hidden" name="idioma" value={idioma} /></>
  const volver = `/${idioma}/p/${slug}`

  return (
    <div className={s.personal}>
      <div className={s.acciones}>
        <BotonFavorito slug={slug} idioma={idioma} titulo={titulo} ancho />
        <EnLista slug={slug} idioma={idioma} listas={listas} sesion={sesion} setListas={setListas} ocultos={ocultos} volver={volver} />
        <BotonComparar slug={slug} familia={familia} idioma={idioma} titulo={titulo} enFicha />
      </div>
      {precioHoy !== null && (
        <Alerta slug={slug} idioma={idioma} mercado={mercado} moneda={moneda} precioHoy={precioHoy} alerta={alerta} setAlerta={setAlerta}
          ocultos={ocultos} volver={volver} t={t} />
      )}
    </div>
  )
}

type T = ReturnType<typeof useTextos>

function EnLista({ slug, idioma, listas, sesion, setListas, ocultos, volver }: {
  slug: string; idioma: string; listas: ListaFicha[] | null; sesion: boolean; setListas: (l: ListaFicha[]) => void
  ocultos: React.ReactNode; volver: string
}) {
  const t = useTextos('descubrir')
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [nueva, crear, creando] = useActionState<ResultadoLista | null, FormData>(async (prev, fd) => {
    const r = await crearListaAccion(prev, fd)
    if (r.listas) setListas(r.listas)
    return r
  }, null)

  function alternar(l: ListaFicha) {
    const fd = new FormData()
    fd.set('slug', slug); fd.set('lista', l.id); fd.set('idioma', idioma)
    if (l.tiene) fd.set('quitar', '1')
    setListas((listas ?? []).map((x) => (x.id === l.id ? { ...x, tiene: !x.tiene } : x)))
    if (l.favoritos) marcarFavorito(slug, !l.tiene)
    setError(null)
    empezar(async () => {
      const r = await enListaAccion(fd).catch(() => null)
      if (r?.listas) setListas(r.listas)
      if (!r?.ok) setError(r?.error ?? 'servidor')
    })
  }

  if (!sesion) {
    // sin cuenta: el enlace lleva a entrar y vuelve a esta ficha
    return (
      <Link className={s.corazonAncho} href={`/${idioma}/entrar?volver=${encodeURIComponent(volver)}`} prefetch={false}>
        <Icono nombre="lista" tam={18} />{t('guardarEnLista')}
      </Link>
    )
  }
  const guardadas = (listas ?? []).filter((l) => l.tiene && !l.favoritos).length
  return (
    <details className={s.desplegable}>
      <summary><Icono nombre="lista" tam={18} />{guardadas > 0 ? t('enListas', { n: guardadas }) : t('guardarEnLista')}</summary>
      <div className={s.cajon}>
        {listas === null ? <p className={s.nota}>{t('cargando')}</p> : (
          <ul aria-label={t('tusListas')}>
            {listas.filter((l) => !l.favoritos).map((l) => (
              <li key={l.id}>
                <button type="button" aria-pressed={l.tiene} disabled={pendiente} onClick={() => alternar(l)}>
                  <span className={s.casilla} aria-hidden="true">{l.tiene && <Icono nombre="check" tam={12} />}</span>{l.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form action={crear}>
          {ocultos}
          <label htmlFor={`nueva-${slug}`} className="sr-only">{t('nombreNueva')}</label>
          <input id={`nueva-${slug}`} name="nombre" maxLength={60} required placeholder={t('nombreNuevaEjemplo')} autoComplete="off" />
          <button type="submit" className="boton boton--sec" disabled={creando}>{t('crearYGuardar')}</button>
        </form>
        <p className={s.error} role="alert">{error ? t(`errores.${error}`) : nueva?.error ? t(`errores.${nueva.error}`) : ''}</p>
        <Link href={`/${idioma}/cuenta/listas`} className={s.nota}>{t('verMisListas')}</Link>
      </div>
    </details>
  )
}

function Alerta({ slug, idioma, mercado, moneda, precioHoy, alerta, setAlerta, ocultos, volver, t }: {
  slug: string; idioma: string; mercado: string; moneda: Moneda; precioHoy: number; alerta: AlertaFicha | null
  setAlerta: (a: AlertaFicha | null) => void; ocultos: React.ReactNode; volver: string; t: T
}) {
  const [estado, enviar, enviando] = useActionState<EstadoAlerta, FormData>(async (prev, fd) => {
    const r = await alertaAccion(prev, fd)
    if (r?.ok && r.objetivo) setAlerta({ id: r.id ?? '', objetivo: r.objetivo, moneda, region: '', activa: true, cumplida: null, precio_cumplida: null })
    return r
  }, null)
  const decimales = REGLAS[moneda].decimales

  // una alerta de otra moneda se muestra con su moneda (la que eligió al crearla)
  if (alerta && alerta.activa) {
    return (
      <div className={s.alertaActiva} role="status">
        <span><Icono nombre="campana" tam={16} /> {t('alertaActiva', { objetivo: formatearMinimo(alerta.objetivo, alerta.moneda as Moneda) })}</span>
        {alerta.id && (
          <form action={borrarAlertaAccion}>
            {ocultos}<input type="hidden" name="id" value={alerta.id} /><input type="hidden" name="volver" value={volver} />
            <button type="submit" className={s.enlaceBoton}>{t('alertaBorrar')}</button>
          </form>
        )}
      </div>
    )
  }
  if (alerta && alerta.cumplida && alerta.precio_cumplida) {
    return (
      <div className={`${s.alertaActiva} ${s.alertaCumplida}`} role="status">
        <span>{t('alertaCumplidaFicha', { precio: formatearMinimo(alerta.precio_cumplida, alerta.moneda as Moneda), objetivo: formatearMinimo(alerta.objetivo, alerta.moneda as Moneda) })}</span>
        <Link href={`/${idioma}/cuenta/alertas`}>{t('verAlertas')}</Link>
      </div>
    )
  }
  const error = estado?.error
  return (
    <details className={s.desplegable}>
      <summary><Icono nombre="campana" tam={18} />{t('avisame')}</summary>
      <form action={enviar} className={`${s.cajon} ${s.alerta}`} noValidate>
        {ocultos}
        <input type="hidden" name="mercado" value={mercado} />
        <label htmlFor={`objetivo-${slug}`}>{t('avisameSi')}</label>
        <div className={s.alertaFila}>
          <span className={s.moneda} aria-hidden="true">{REGLAS[moneda].simbolo}</span>
          <input id={`objetivo-${slug}`} name="objetivo" inputMode={decimales ? 'decimal' : 'numeric'} required autoComplete="off"
            defaultValue={montoParaCampo(objetivoSugerido(precioHoy, moneda), moneda)} aria-describedby={`nota-alerta-${slug}`}
            aria-invalid={Boolean(error) || undefined} />
          <button type="submit" className="boton boton--marca" disabled={enviando}>{t('crearAlerta')}</button>
        </div>
        <p id={`nota-alerta-${slug}`} className={s.nota}>{t('alertaNota', { hoy: formatearMinimo(precioHoy, moneda) })}</p>
        <p className={s.error} role="alert">
          {error ? t(`errores.${error}`, { hoy: formatearMinimo(estado?.precio ?? precioHoy, moneda) }) : ''}
        </p>
      </form>
    </details>
  )
}
