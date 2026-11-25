'use client'
// Enlace al carrito con la cantidad de unidades. La cantidad sale de la cookie del carrito en el navegador:
// así el encabezado sigue siendo estático (se cachea igual para todos) y el número aparece al hidratar.
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COOKIE_CARRITO, leerCarrito, unidades } from '@/lib/compra/carrito'
import { Icono } from '../Icono'
import s from './Encabezado.module.css'

function leer() {
  const c = document.cookie.split('; ').find((x) => x.startsWith(`${COOKIE_CARRITO}=`))
  return unidades(leerCarrito(c?.slice(COOKIE_CARRITO.length + 1)))
}

// avisan los botones que cambian el carrito, y volver a la pestaña (pudo cambiar en otra)
function suscribir(aviso: () => void) {
  window.addEventListener('triplice:carrito', aviso)
  window.addEventListener('focus', aviso)
  return () => {
    window.removeEventListener('triplice:carrito', aviso)
    window.removeEventListener('focus', aviso)
  }
}

export function BotonCarrito({ href, etiqueta, etiquetaCon }: { href: string; etiqueta: string; etiquetaCon: string }) {
  // al cambiar de página se vuelve a leer: pagar vacía el carrito en el servidor y redirige sin recargar
  usePathname()
  const n = useSyncExternalStore(suscribir, leer, () => 0)
  return (
    <Link href={href} className={s.carrito} aria-label={n > 0 ? etiquetaCon.replace('{n}', String(n)) : etiqueta}>
      <Icono nombre="carrito" />
      {n > 0 && <span className={s.contador} aria-hidden="true">{n > 99 ? '99+' : n}</span>}
    </Link>
  )
}
