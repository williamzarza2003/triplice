// Mientras llegan los resultados: la misma forma que la grilla (sin saltos cuando aparecen).
import s from './Esqueleto.module.css'

export function EsqueletoResultados() {
  return (
    <div className={s.esqueleto} aria-hidden="true">
      <div className={s.lateral}>{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>
      <div>
        <span className={s.titulo} />
        <div className={s.grilla}>{Array.from({ length: 8 }, (_, i) => <span key={i} />)}</div>
      </div>
    </div>
  )
}

export function EsqueletoFicha() {
  return (
    <div className={s.ficha} aria-hidden="true">
      <span className={s.foto} />
      <div className={s.lineas}>{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>
    </div>
  )
}
