'use client'
// "Entrar" o "Hola, Lorena". El nombre sale de una cookie que el navegador puede leer (sin nada privado): así el
// encabezado se sigue cacheando igual para todos. La sesión real la verifica el servidor en cada página de la cuenta.
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COOKIE_HOLA, leerHola } from '@/lib/cuenta/hola'
import { useDescubrir } from '@/lib/descubrir/estado'
import { Icono } from '../Icono'
import s from './Encabezado.module.css'

const leer = () => leerHola(document.cookie.split('; ').find((x) => x.startsWith(`${COOKIE_HOLA}=`))?.slice(COOKIE_HOLA.length + 1))

function suscribir(aviso: () => void) {
  window.addEventListener('focus', aviso)
  return () => window.removeEventListener('focus', aviso)
}

export function BotonCuenta({ idioma, entrar, hola, tuCuenta, avisosTexto }: { idioma: string; entrar: string; hola: string; tuCuenta: string; avisosTexto: string }) {
  // al entrar o salir se navega: se vuelve a leer (sin el segmento interno /py-pyg que agrega proxy.ts)
  const camino = usePathname().replace(/^\/(es|pt|en)\/[a-z]{2}-[a-z]{3}(?=\/|$)/, '/$1')
  const nombre = useSyncExternalStore(suscribir, leer, () => null)
  // fase 5: avisos de baja de precio sin leer (solo con sesión; se piden cuando el navegador está libre)
  const { avisos } = useDescubrir()
  const n = nombre ? avisos : 0
  const href = nombre ? `/${idioma}/cuenta` : `/${idioma}/entrar${camino && !camino.includes('/entrar') ? `?volver=${encodeURIComponent(camino)}` : ''}`
  return (
    <Link href={n > 0 ? `/${idioma}/cuenta/alertas` : href} className={s.cuenta} prefetch={false} data-avisos={n > 0}
      aria-label={nombre ? `${tuCuenta} (${nombre})${n > 0 ? ` · ${avisosTexto.replace('{n}', String(n))}` : ''}` : entrar}>
      <span className={s.cuentaIcono}>
        <Icono nombre="persona" />
        {n > 0 && <span className={s.contador} aria-hidden="true">{n > 9 ? '9+' : n}</span>}
      </span>
      <span className={s.cuentaTexto} aria-hidden="true">{nombre ? `${hola}, ${nombre}` : entrar}</span>
    </Link>
  )
}
