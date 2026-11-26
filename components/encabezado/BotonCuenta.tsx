'use client'
// "Entrar" o "Hola, Lorena". El nombre sale de una cookie que el navegador puede leer (sin nada privado): así el
// encabezado se sigue cacheando igual para todos. La sesión real la verifica el servidor en cada página de la cuenta.
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COOKIE_HOLA, leerHola } from '@/lib/cuenta/hola'
import { Icono } from '../Icono'
import s from './Encabezado.module.css'

const leer = () => leerHola(document.cookie.split('; ').find((x) => x.startsWith(`${COOKIE_HOLA}=`))?.slice(COOKIE_HOLA.length + 1))

function suscribir(aviso: () => void) {
  window.addEventListener('focus', aviso)
  return () => window.removeEventListener('focus', aviso)
}

export function BotonCuenta({ idioma, entrar, hola, tuCuenta }: { idioma: string; entrar: string; hola: string; tuCuenta: string }) {
  // al entrar o salir se navega: se vuelve a leer (sin el segmento interno /py-pyg que agrega proxy.ts)
  const camino = usePathname().replace(/^\/(es|pt|en)\/[a-z]{2}-[a-z]{3}(?=\/|$)/, '/$1')
  const nombre = useSyncExternalStore(suscribir, leer, () => null)
  const href = nombre ? `/${idioma}/cuenta` : `/${idioma}/entrar${camino && !camino.includes('/entrar') ? `?volver=${encodeURIComponent(camino)}` : ''}`
  return (
    <Link href={href} className={s.cuenta} aria-label={nombre ? `${tuCuenta} (${nombre})` : entrar} prefetch={false}>
      <Icono nombre="persona" />
      <span className={s.cuentaTexto} aria-hidden="true">{nombre ? `${hola}, ${nombre}` : entrar}</span>
    </Link>
  )
}
