'use client'
// "Comparar": suma o saca el producto del comparador (una cookie que también lee el servidor). No mezcla categorías:
// si ya estás comparando heladeras y tocás una remera, ofrece empezar otra comparación. Sin JavaScript es un formulario.
import { useState } from 'react'
import Link from 'next/link'
import { compararAccion } from '@/app/[idioma]/[mercado]/descubrir/acciones'
import { alternarComparar, MAX_COMPARAR } from '@/lib/descubrir/cookies'
import { guardarComparar, useComparar } from '@/lib/descubrir/estado'
import { useTextos } from '@/lib/i18n/textos'
import { Icono } from '../Icono'
import s from './Descubrir.module.css'

type Props = { slug: string; familia: string; idioma: string; titulo: string; enFicha?: boolean }

export function BotonComparar({ slug, familia, idioma, titulo, enFicha = false }: Props) {
  const t = useTextos('descubrir')
  const items = useComparar()
  const marcado = items.some((x) => x.slug === slug)
  const [problema, setProblema] = useState<'otra_familia' | 'lleno' | null>(null)

  function tocar(e: React.FormEvent<HTMLFormElement>, reemplazar = false) {
    e.preventDefault()
    const r = alternarComparar(items, { slug, familia }, reemplazar)
    setProblema(r.error)
    if (!r.error) guardarComparar(r.items)
  }

  const enlace = `/${idioma}/comparar?p=${items.map((x) => x.slug).join(',')}`
  return (
    <>
      <form action={compararAccion} onSubmit={(e) => tocar(e)} style={{ display: 'contents' }}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="familia" value={familia} />
        <input type="hidden" name="idioma" value={idioma} />
        <button type="submit" aria-pressed={marcado} className={`${s.comparar} ${enFicha ? s.compararFicha : ''}`}
          aria-label={enFicha ? undefined : t('compararDe', { titulo })}>
          {enFicha ? <Icono nombre="comparar" tam={18} /> : <span className={s.casilla} aria-hidden="true">{marcado && <Icono nombre="check" tam={12} />}</span>}
          {t('comparar')}
          {marcado && <span className="sr-only">{t('enComparacion', { n: items.length, max: MAX_COMPARAR })}</span>}
        </button>
      </form>
      <div className={s.aviso} role="status">
        {problema === 'otra_familia' && (
          <>
            <span>{t('otraFamilia')}</span>
            <form onSubmit={(e) => { tocar(e, true); setProblema(null) }}><button type="submit">{t('empezarOtra')}</button></form>
          </>
        )}
        {problema === 'lleno' && (
          <>
            <span>{t('lleno', { max: MAX_COMPARAR })}</span>
            <Link href={enlace}>{t('verComparacion')}</Link>
          </>
        )}
      </div>
    </>
  )
}
