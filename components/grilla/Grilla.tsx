// Grilla de tarjetas. `fila`: una sola fila de seis (vidrieras del inicio), sin huérfanos en ningún ancho.
import type { Contexto } from '@/lib/contexto'
import type { TarjetaDatos } from '@/lib/datos/tipos'
import { Tarjeta } from '../tarjeta/Tarjeta'
import s from './Grilla.module.css'

type Props = { items: TarjetaDatos[]; ctx: Contexto; nivel?: 2 | 3 | 4; fila?: boolean; prioridad?: number }

export function Grilla({ items, ctx, nivel = 3, fila = false, prioridad = 0 }: Props) {
  return (
    <div className={fila ? `${s.grilla} ${s.fila}` : s.grilla}>
      {items.map((p, i) => <Tarjeta key={p.id} p={p} ctx={ctx} nivel={nivel} prioridad={i < prioridad} />)}
    </div>
  )
}
