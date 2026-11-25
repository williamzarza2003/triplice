import Link from 'next/link'
import s from './Migas.module.css'

/** Migas de pan: dónde estoy en el catálogo. El último elemento es la página actual (sin enlace). */
export function Migas({ etiqueta, items }: { etiqueta: string; items: { texto: string; href?: string }[] }) {
  return (
    <nav aria-label={etiqueta}>
      <ol className={s.migas}>
        {items.map((x, i) => (
          <li key={i}>
            {x.href ? <Link href={x.href}>{x.texto}</Link> : <span aria-current="page">{x.texto}</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}
