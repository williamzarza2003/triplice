// Calificación compacta: una estrella, el promedio y la cantidad. El lector de pantalla oye la frase completa.
import s from './Estrellas.module.css'

export function Estrellas({ valor, n, etiqueta, coma = true }: { valor: number; n: number; etiqueta: string; coma?: boolean }) {
  if (!n) return <p className={`${s.estrellas} ${s.vacia}`}>{etiqueta}</p>
  return (
    <p className={s.estrellas}>
      <span className="sr-only">{etiqueta}</span>
      <svg className={s.icono} viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
      </svg>
      <b aria-hidden="true">{coma ? valor.toFixed(1).replace('.', ',') : valor.toFixed(1)}</b>
      <span className={s.n} aria-hidden="true">({n})</span>
    </p>
  )
}

/** Cinco estrellas dibujadas (para la ficha y las opiniones). */
export function EstrellasCompletas({ valor, tam = 16, etiqueta }: { valor: number; tam?: number; etiqueta: string }) {
  return (
    <span className={s.fila} role="img" aria-label={etiqueta}>
      {[1, 2, 3, 4, 5].map((i) => {
        const lleno = Math.max(0, Math.min(1, valor - i + 1))
        return (
          <svg key={i} width={tam} height={tam} viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id={`e${i}-${Math.round(lleno * 10)}`}>
                <stop offset={`${lleno * 100}%`} stopColor="var(--ipe-400)" />
                <stop offset={`${lleno * 100}%`} stopColor="var(--linea)" />
              </linearGradient>
            </defs>
            <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"
              fill={`url(#e${i}-${Math.round(lleno * 10)})`} stroke={lleno > 0 ? '#b88a00' : '#a9b8b4'} strokeWidth="1.2" />
          </svg>
        )
      })}
    </span>
  )
}
