'use client'
// Controles del carrito que necesitan el navegador: la cantidad se guarda al elegirla (sin JavaScript, con el
// botón "Actualizar") y el cupón muestra por qué no se aplicó. Los textos llegan del servidor.
import { useActionState, useRef } from 'react'
import { Icono } from '../Icono'
import type { EstadoCupon } from '@/app/[idioma]/[mercado]/carrito/acciones'
import s from './Compra.module.css'

type Accion = (f: FormData) => Promise<void>

export function Cantidad({ oferta, cantidad, maximo, accion, etiqueta, actualizar }: {
  oferta: string; cantidad: number; maximo: number; accion: Accion; etiqueta: string; actualizar: string
}) {
  const form = useRef<HTMLFormElement>(null)
  const opciones = Array.from({ length: Math.max(1, Math.min(10, Math.max(maximo, cantidad))) }, (_, i) => i + 1)
  return (
    <form ref={form} action={accion} className={s.cantidad}>
      <input type="hidden" name="oferta" value={oferta} />
      <label>
        <span className="sr-only">{etiqueta}</span>
        <select name="cantidad" defaultValue={cantidad} onChange={() => form.current?.requestSubmit()}>
          {opciones.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <noscript><button type="submit" className="boton boton--sec">{actualizar}</button></noscript>
    </form>
  )
}

export type TextosCupon = { etiqueta: string; placeholder: string; aplicar: string; errores: Record<'no_existe' | 'vencido' | 'agotado' | 'vacio', string> }

export function FormCupon({ accion, textos }: { accion: (e: EstadoCupon, f: FormData) => Promise<EstadoCupon>; textos: TextosCupon }) {
  const [estado, enviar, pendiente] = useActionState(accion, { error: null, codigo: '' })
  return (
    <form action={enviar} className={s.cupon} aria-busy={pendiente}>
      <label className="sr-only" htmlFor="cupon">{textos.etiqueta}</label>
      <input id="cupon" name="cupon" placeholder={textos.placeholder} defaultValue={estado.codigo} autoComplete="off" autoCapitalize="characters"
        aria-invalid={estado.error ? true : undefined} aria-describedby={estado.error ? 'cupon-error' : undefined} />
      <button className="boton boton--sec" type="submit" disabled={pendiente}>{textos.aplicar}</button>
      {estado.error && (
        <p id="cupon-error" className={s.error} role="alert"><Icono nombre="info" tam={16} />{textos.errores[estado.error]}</p>
      )}
    </form>
  )
}
