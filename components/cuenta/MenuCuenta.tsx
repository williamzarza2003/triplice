'use client'
// Menú de la cuenta. El saludo sale de la cookie del encabezado; la página marca dónde estás.
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COOKIE_HOLA, leerHola } from '@/lib/cuenta/hola'
import { Icono } from '../Icono'
import s from './Cuenta.module.css'

type Enlace = { href: string; texto: string; icono: Parameters<typeof Icono>[0]['nombre'] }

const leer = () => leerHola(document.cookie.split('; ').find((x) => x.startsWith(`${COOKIE_HOLA}=`))?.slice(COOKIE_HOLA.length + 1))
const nada = () => () => {}

export function MenuCuenta({ enlaces, hola, salir, idioma, salirAccion }: {
  enlaces: Enlace[]; hola: string; salir: string; idioma: string; salirAccion: (f: FormData) => Promise<void>
}) {
  // en una carga completa, usePathname trae el segmento interno que agrega proxy.ts (/es/py-pyg/…): se saca
  const camino = usePathname().replace(/^\/(es|pt|en)\/[a-z]{2}-[a-z]{3}(?=\/|$)/, '/$1')
  const nombre = useSyncExternalStore(nada, leer, () => null)
  // /es/cuenta es "Pedidos" (y el detalle de un pedido); escribir una opinión cuelga de "Opiniones"
  const actual = (href: string) => href.endsWith('/cuenta') ? camino === href || camino.startsWith(`${href}/pedidos`)
    : href.endsWith('/opiniones') ? camino.startsWith(href) || camino.startsWith(href.replace('/opiniones', '/opinar')) : camino.startsWith(href)
  return (
    <nav className={s.menu} aria-label={hola}>
      <p className={s.hola}><b>{nombre ? `${hola}, ${nombre}` : hola}</b></p>
      <ul>
        {enlaces.map((e) => (
          <li key={e.href}>
            <Link href={e.href} aria-current={actual(e.href) ? 'page' : undefined}><Icono nombre={e.icono} tam={20} />{e.texto}</Link>
          </li>
        ))}
      </ul>
      <form action={salirAccion} className={s.salir}>
        <input type="hidden" name="idioma" value={idioma} />
        <button type="submit">{salir}</button>
      </form>
    </nav>
  )
}
