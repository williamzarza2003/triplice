'use client'
// "Vistos recientemente": una isla que no bloquea nada. La página (inicio o ficha) sale cacheada igual para todos;
// cuando el navegador está libre, esta parte anota la ficha que estás viendo (sin cuenta, en la cookie; con cuenta,
// en la base) y pide tus últimos vistos. Si no hay nada que mostrar, no ocupa lugar.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { vistosAccion } from '@/app/[idioma]/[mercado]/descubrir/acciones'
import { hayVistos, registrarVistoEnCookie } from '@/lib/descubrir/estado'
import type { Mini } from '@/lib/descubrir/servidor'
import { foto } from '@/lib/imagenes'
import { useTextos } from '@/lib/i18n/textos'
import { Icono } from '../Icono'
import s from './Descubrir.module.css'

type Props = { idioma: string; mercado: string; actual?: string }

export function Vistos({ idioma, mercado, actual }: Props) {
  const t = useTextos('descubrir')
  const [items, setItems] = useState<Mini[]>([])

  useEffect(() => {
    let vivo = true
    const pedir = () => {
      if (actual) registrarVistoEnCookie(actual)
      if (!hayVistos()) return
      vistosAccion({ actual, idioma, mercado }).then((r) => { if (vivo) setItems(r) }).catch(() => {})
    }
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (n: number) => void }
    const id = w.requestIdleCallback ? w.requestIdleCallback(pedir, { timeout: 4000 }) : window.setTimeout(pedir, 1500)
    return () => { vivo = false; if (w.cancelIdleCallback) w.cancelIdleCallback(id); else clearTimeout(id) }
  }, [actual, idioma, mercado])

  if (items.length === 0) return null
  return (
    <section className={s.vistos} aria-labelledby="t-vistos">
      <h2 id="t-vistos"><Icono nombre="historial" tam={22} />{t('vistosTitulo')}</h2>
      <p className={s.vistosNota}>{t('vistosNota')}</p>
      <ul className={s.tira}>
        {items.map((x) => (
          <li key={x.slug} className={s.mini}>
            {x.imagen
              // eslint-disable-next-line @next/next/no-img-element -- fotos del catálogo ya en WebP y en el ancho justo
              ? <img src={`${foto(x.imagen)}-240.webp`} alt="" width={172} height={172} loading="lazy" decoding="async" />
              : <span />}
            <Link href={`/${idioma}/p/${x.slug}`} prefetch={false}>{x.titulo}</Link>
            <p className="precio">{x.precio}{x.antes && <> <s><span className="sr-only">{t('antes')} </span>{x.antes}</s></>}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
