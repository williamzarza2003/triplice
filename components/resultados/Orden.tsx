'use client'
// Orden de los resultados: cambia al elegir (con JavaScript) o con el botón (sin JavaScript).
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { conParametro, type Parametros } from '@/lib/busqueda'
import s from './Resultados.module.css'

type Props = { actual: string; etiqueta: string; aplicar: string; opciones: { valor: string; texto: string }[]; base: string; params: Parametros }

export function Orden({ actual, etiqueta, aplicar, opciones, base, params }: Props) {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  return (
    <form className={s.orden} action={base} aria-busy={pendiente}>
      {Object.entries(params).filter(([k]) => !['orden', 'pagina'].includes(k)).flatMap(([k, v]) =>
        [v ?? []].flat().map((x) => <input key={`${k}-${x}`} type="hidden" name={k} value={x} />))}
      <label htmlFor="orden">{etiqueta}</label>
      <select id="orden" name="orden" defaultValue={actual}
        onChange={(e) => empezar(() => router.push(conParametro(base, params, 'orden', e.target.value === 'relevancia' ? null : e.target.value), { scroll: false }))}>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
      <noscript><button type="submit" className="boton boton--sec">{aplicar}</button></noscript>
    </form>
  )
}
