'use client'
// La barra que aparece abajo cuando hay algo para comparar: cuántos de cuatro y el enlace a la comparación.
// Sale de la cookie en el navegador (el marco de la página sigue cacheado igual para todos) y no ocupa lugar en la
// página: flota, así no corre nada de lugar al aparecer.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MAX_COMPARAR } from '@/lib/descubrir/cookies'
import { guardarComparar, useComparar } from '@/lib/descubrir/estado'
import { useTextos } from '@/lib/i18n/textos'
import s from './Descubrir.module.css'

export function BarraComparar({ idioma }: { idioma: string }) {
  const t = useTextos('descubrir')
  const items = useComparar()
  const camino = usePathname()
  if (items.length === 0 || /\/comparar$/.test(camino) || /\/(pagar|entrar)(\/|$)/.test(camino)) return null
  return (
    <aside className={s.barra} aria-label={t('barraEtiqueta')}>
      <span className={s.puntos} aria-hidden="true">
        {Array.from({ length: MAX_COMPARAR }, (_, i) => <span key={i} data-lleno={i < items.length} />)}
      </span>
      <p><b>{t('barraCuantos', { n: items.length, max: MAX_COMPARAR })}</b></p>
      <Link href={`/${idioma}/comparar?p=${items.map((x) => x.slug).join(',')}`} prefetch={false}>
        {items.length > 1 ? t('barraVer') : t('barraSumar')}
      </Link>
      <button type="button" onClick={() => guardarComparar([])}>{t('barraVaciar')}</button>
    </aside>
  )
}
