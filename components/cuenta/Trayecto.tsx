// El trayecto del pedido. Compacto (lista de pedidos): cuatro puntos en línea. Completo (detalle): la línea de
// tiempo vertical de la compra, con la fecha de cada parada.
import type { Parada } from '@/lib/cuenta/pedidos'
import c from '../compra/Compra.module.css'
import s from './Cuenta.module.css'

export function Trayecto({ paradas, textos, compacto, fecha, detalles }: {
  paradas: Parada[]; textos: Record<string, string>; compacto?: boolean
  fecha?: (iso: string) => string; detalles?: Partial<Record<Parada['clave'], string>>
}) {
  if (compacto) {
    return (
      <ol className={s.trayecto}>
        {paradas.map((p) => (
          <li key={p.clave} data-hecho={p.hecho} aria-current={p.actual ? 'step' : undefined}>
            {textos[p.clave]}{p.hecho && <span className="sr-only"> ✓</span>}
          </li>
        ))}
      </ol>
    )
  }
  return (
    <ol className={c.lineaTiempo}>
      {paradas.map((p) => (
        <li key={p.clave} data-hecho={p.hecho} aria-current={p.actual ? 'step' : undefined}>
          <b>{textos[p.clave]}</b>
          {p.fecha && fecha ? <small><time dateTime={p.fecha}>{fecha(p.fecha)}</time></small> : detalles?.[p.clave] && <small>{detalles[p.clave]}</small>}
        </li>
      ))}
    </ol>
  )
}
