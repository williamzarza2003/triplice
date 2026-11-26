'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import type { EstadoSimulador } from '@/app/[idioma]/[mercado]/pagar/acciones'
import { Icono } from '../Icono'
import s from './Pago.module.css'

type Textos = { explicacion: string; pedido: string; total: string; aprobada: string; rechazada: string; rechazo: string; volver: string; volverHref: string }

export function Simulador({ accion, textos }: { accion: (e: EstadoSimulador, f: FormData) => Promise<EstadoSimulador>; textos: Textos }) {
  const [estado, enviar, pendiente] = useActionState(accion, null)
  return (
    <section className={`panel ${s.simulador}`} aria-labelledby="t-sim">
      <p className={s.prueba}>{textos.explicacion}</p>
      <h2 id="t-sim">{textos.pedido}</h2>
      <p className={`precio ${s.simuladorTotal}`}>{textos.total}</p>
      {estado?.rechazada && <p className={s.error} role="alert"><Icono nombre="info" tam={16} />{textos.rechazo}</p>}
      <form action={enviar} className={s.simuladorBotones} aria-busy={pendiente}>
        <button className="boton boton--accion" type="submit" name="resultado" value="aprobada" disabled={pendiente}>{textos.aprobada}</button>
        <button className="boton boton--sec" type="submit" name="resultado" value="rechazada" disabled={pendiente}>{textos.rechazada}</button>
      </form>
      <Link href={textos.volverHref}>{textos.volver}</Link>
    </section>
  )
}
