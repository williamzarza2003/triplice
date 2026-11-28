'use client'
// Lista de opiniones con filtro por estrellas (las barras del resumen son los botones del filtro), fotos de los
// compradores y "Me fue útil". Lo personal (mis votos y si puedo opinar) se pide después de cargar: la ficha
// sigue cacheada igual para todos.
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTextos } from '@/lib/i18n/textos'
import type { Resena } from '@/lib/datos/tipos'
import type { Idioma } from '@/lib/i18n/idiomas'
import { LOCALE } from '@/lib/i18n/idiomas'
import { COOKIE_HOLA, leerHola } from '@/lib/cuenta/hola'
import { urlFotoResena } from '@/lib/cuenta/url-foto'
import type { FichaUsuario, Voto } from '@/app/[idioma]/[mercado]/cuenta/acciones'
import type { EstadoDenuncia } from '@/app/[idioma]/[mercado]/cuenta/denunciar'
import { EstrellasCompletas } from '../Estrellas'
import { Denunciar } from './Denunciar'
import { Icono } from '../Icono'
import s from './Opiniones.module.css'

type Props = {
  idioma: Idioma
  slug: string
  resenas: Resena[]
  resumen: { promedio: number; cantidad: number; verificadas: number; distribucion: number[] }
  paises: Record<string, string>
  votar: (f: FormData) => Promise<Voto>
  personal: (slug: string) => Promise<FichaUsuario>
  /** fase 5: denunciar una opinión (solo con sesión) */
  denunciar?: (e: EstadoDenuncia, f: FormData) => Promise<EstadoDenuncia>
}

const conSesion = () => !!leerHola(document.cookie.split('; ').find((x) => x.startsWith(`${COOKIE_HOLA}=`))?.slice(COOKIE_HOLA.length + 1))

export function Opiniones({ idioma, slug, resenas, resumen, paises, votar, personal, denunciar }: Props) {
  const t = useTextos('ficha')
  const tc = useTextos('comun')
  const [filtro, setFiltro] = useState<number | null>(null)
  const [todas, setTodas] = useState(false)
  const [yo, setYo] = useState<FichaUsuario>(null)
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const [votos, setVotos] = useState<Record<string, NonNullable<Voto>>>({})
  const [, empezar] = useTransition()

  // el voto se manda sin recargar y el botón muestra el número nuevo (sin JavaScript, el formulario funciona igual)
  function votarAhora(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)
    empezar(async () => {
      const r = await votar(datos)
      if (r) setVotos((v) => ({ ...v, [id]: r }))
    })
  }

  useEffect(() => {
    if (!conSesion()) return
    let vigente = true
    personal(slug).then((x) => { if (vigente) setYo(x) }).catch(() => {})
    return () => { vigente = false }
  }, [slug, personal])

  const lista = resenas.filter((r) => filtro === null || r.estrellas === filtro)
  const visibles = todas ? lista : lista.slice(0, 6)
  const fecha = new Intl.DateTimeFormat(LOCALE[idioma], { day: 'numeric', month: 'long', year: 'numeric' })
  const promedio = Number(resumen.promedio)

  const invitacion = (
    <div className={s.invitacion}>
      {yo?.item_para_opinar ? (
        <Link className="boton boton--marca" href={`/${idioma}/cuenta/opinar/${yo.item_para_opinar}`}><Icono nombre="estrella" tam={18} />{t('escribirOpinion')}</Link>
      ) : yo?.opino ? (
        <p className={s.nota}><Icono nombre="check" tam={16} />{t('yaOpinaste')}</p>
      ) : (
        <p className={s.nota}><Icono nombre="escudo" tam={16} />{t('soloCompradores')}</p>
      )}
    </div>
  )

  if (!resumen.cantidad) return <>{invitacion}<p className={s.vacio}>{t('sinOpiniones')}</p></>

  return (
    <div className={s.opiniones}>
      <div className={s.resumen}>
        <p className={s.grande}>{promedio.toLocaleString(LOCALE[idioma], { minimumFractionDigits: 1 })}</p>
        <EstrellasCompletas valor={promedio} tam={22} etiqueta={t('promedio', { valor: promedio.toLocaleString(LOCALE[idioma]) })} />
        <p className={s.base}>{t('basado', { n: Number(resumen.cantidad), v: Number(resumen.verificadas) })}</p>
        <ul className={s.barras}>
          {resumen.distribucion.map((n, i) => {
            const e = 5 - i
            const p = resumen.cantidad ? (Number(n) / Number(resumen.cantidad)) * 100 : 0
            return (
              <li key={e}>
                <button type="button" aria-pressed={filtro === e} disabled={!Number(n)}
                  onClick={() => { setFiltro(filtro === e ? null : e); setTodas(false) }}>
                  {/* el nombre accesible incluye el texto visible ("5 ★ 18") y la explicación */}
                  <span>{e} ★</span>
                  <i style={{ '--p': `${p}%` } as React.CSSProperties} />
                  <span className="numero">{Number(n)}</span>
                  <span className="sr-only">{`${t('barra', { e, n: Number(n) })}. ${t('filtrarEstrellas', { e })}`}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {filtro !== null && <button type="button" className={s.todas} onClick={() => setFiltro(null)}>{t('todasOpiniones')}</button>}
        {invitacion}
      </div>

      <ul className={s.lista} aria-live="polite">
        {visibles.map((r) => {
          const mio = votos[r.id] ? votos[r.id].mio : yo?.votos?.[r.id]
          const utiles = votos[r.id]?.util_si ?? r.util
          return (
            <li key={r.id} className={s.opinion} lang={r.idioma}>
              <div className={s.cabeza}>
                <EstrellasCompletas valor={r.estrellas} etiqueta={t('promedio', { valor: r.estrellas })} />
                <b>{r.titulo}</b>
              </div>
              <p className={s.meta}>
                {r.autor} · {paises[r.pais] ?? r.pais} · <time dateTime={r.fecha}>{fecha.format(new Date(r.fecha))}</time>
              </p>
              <p className={s.sellos}>
                {r.verificada && <span className="sello sello--exito"><Icono nombre="check" tam={14} />{t('verificada')}</span>}
                {r.variante && <span className={s.variante}>{t('variante', { v: r.variante })}</span>}
                {r.idioma !== idioma && <span className="sello sello--info" lang={idioma}>{t('enIdioma', { idioma: tc(`idiomaDe.${r.idioma}`) })}</span>}
              </p>
              <p>{r.texto}</p>
              {(r.fotos?.length ?? 0) > 0 && (
                <ul className={s.fotos} lang={idioma}>
                  {r.fotos!.map((f, i) => (
                    <li key={f}>
                      <button type="button" onClick={() => setAmpliada(ampliada === f ? null : f)} aria-expanded={ampliada === f}
                        aria-label={t('fotoDe', { n: i + 1, autor: r.autor })}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- fotos de compradores (Storage), sin optimizador */}
                        <img src={urlFotoResena(f)} alt="" width={72} height={72} loading="lazy" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {ampliada && r.fotos?.includes(ampliada) && (
                // eslint-disable-next-line @next/next/no-img-element -- foto ampliada del comprador
                <img className={s.ampliada} src={urlFotoResena(ampliada)} alt={t('fotoDe', { n: r.fotos.indexOf(ampliada) + 1, autor: r.autor })} loading="lazy" />
              )}
              <form action={votar as unknown as (f: FormData) => Promise<void>} onSubmit={(e) => votarAhora(e, r.id)} className={s.util} lang={idioma}>
                <input type="hidden" name="resena" value={r.id} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="idioma" value={idioma} />
                <input type="hidden" name="util" value="1" />
                <button type="submit" aria-pressed={mio === true}>
                  <Icono nombre="pulgar" tam={16} />{t('meFueUtil')}{utiles > 0 && <span className="numero">{utiles}</span>}
                </button>
              </form>
              {denunciar && <Denunciar accion={denunciar} tipo="resena" id={r.id} slug={slug} idioma={idioma} />}
            </li>
          )
        })}
      </ul>
      {!todas && lista.length > 6 && (
        <button type="button" className={`boton boton--sec ${s.mas}`} onClick={() => setTodas(true)}>
          {t('todasOpiniones')} ({lista.length})
        </button>
      )}
    </div>
  )
}
