'use client'
// Lista de opiniones con filtro por estrellas (las barras del resumen son los botones del filtro).
import { useState } from 'react'
import { useTextos } from '@/lib/i18n/textos'
import type { Resena } from '@/lib/datos/tipos'
import type { Idioma } from '@/lib/i18n/idiomas'
import { LOCALE } from '@/lib/i18n/idiomas'
import { EstrellasCompletas } from '../Estrellas'
import { Icono } from '../Icono'
import s from './Opiniones.module.css'

type Props = {
  idioma: Idioma
  resenas: Resena[]
  resumen: { promedio: number; cantidad: number; verificadas: number; distribucion: number[] }
  paises: Record<string, string>
}

export function Opiniones({ idioma, resenas, resumen, paises }: Props) {
  const t = useTextos('ficha')
  const tc = useTextos('comun')
  const [filtro, setFiltro] = useState<number | null>(null)
  const [todas, setTodas] = useState(false)
  const lista = resenas.filter((r) => filtro === null || r.estrellas === filtro)
  const visibles = todas ? lista : lista.slice(0, 6)
  const fecha = new Intl.DateTimeFormat(LOCALE[idioma], { day: 'numeric', month: 'long', year: 'numeric' })
  const promedio = Number(resumen.promedio)

  if (!resumen.cantidad) return <p className={s.vacio}>{t('sinOpiniones')}</p>

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
                  aria-label={`${t('barra', { e, n: Number(n) })}. ${t('filtrarEstrellas', { e })}`}
                  onClick={() => { setFiltro(filtro === e ? null : e); setTodas(false) }}>
                  <span>{e} ★</span>
                  <i style={{ '--p': `${p}%` } as React.CSSProperties} />
                  <span className="numero">{Number(n)}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {filtro !== null && <button type="button" className={s.todas} onClick={() => setFiltro(null)}>{t('todasOpiniones')}</button>}
      </div>

      <ul className={s.lista} aria-live="polite">
        {visibles.map((r) => (
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
            {r.util > 0 && <p className={s.util} lang={idioma}>{t('util', { n: r.util })}</p>}
          </li>
        ))}
      </ul>
      {!todas && lista.length > 6 && (
        <button type="button" className={`boton boton--sec ${s.mas}`} onClick={() => setTodas(true)}>
          {t('todasOpiniones')} ({lista.length})
        </button>
      )}
    </div>
  )
}
