'use client'
// Menú del panel. Como el de la cuenta: estático (se cachea igual para todos), con el saludo de la cookie del
// encabezado y la página actual marcada.
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COOKIE_HOLA, leerHola } from '@/lib/cuenta/hola'
import { Icono } from '../Icono'
import s from '../cuenta/Cuenta.module.css'

type Enlace = { href: string; texto: string; icono: string }

const leer = () => leerHola(document.cookie.split('; ').find((x) => x.startsWith(`${COOKIE_HOLA}=`))?.slice(COOKIE_HOLA.length + 1))
const nada = () => () => {}

export function MenuVender({ enlaces, titulo, hola, salir, idioma, salirAccion }: {
  enlaces: Enlace[]; titulo: string; hola: string; salir: string; idioma: string; salirAccion: (f: FormData) => Promise<void>
}) {
  // en una carga completa, usePathname trae el segmento interno que agrega proxy.ts (/es/py-pyg/…): se saca
  const camino = usePathname().replace(/^\/(es|pt|en)\/[a-z]{2}-[a-z]{3}(?=\/|$)/, '/$1')
  const nombre = useSyncExternalStore(nada, leer, () => null)
  const [inicio] = enlaces
  const actual = (href: string) => (href === inicio.href ? camino === href : camino.startsWith(href))
  return (
    <nav className={s.menu} aria-label={titulo}>
      <p className={s.hola}><b>{titulo}</b>{nombre && <small>{`${hola}, ${nombre}`}</small>}</p>
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
