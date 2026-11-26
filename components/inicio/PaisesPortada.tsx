'use client'
// Atajo de la portada para elegir desde qué país se compra (lo mismo que el selector del encabezado).
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { guardarPreferencias } from '@/lib/preferencias'
import { MONEDA_DE, type Region } from '@/lib/region'
import { REGLAS } from '@/lib/precios'
import s from './PaisesPortada.module.css'

const PAISES = ['PY', 'BR', 'AR'] as const

export function PaisesPortada({ region, nombres, textos }: {
  region: Region
  nombres: Record<(typeof PAISES)[number], string>
  textos: { actual: string; otro: string }
}) {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()

  function elegir(r: Region) {
    guardarPreferencias({ region: r, moneda: MONEDA_DE[r] })
    empezar(() => router.refresh())
  }

  return (
    <ul className={s.paises} aria-busy={pendiente}>
      {PAISES.map((p) => {
        const actual = p === region
        const moneda = MONEDA_DE[p]
        return (
          <li key={p}>
            <button type="button" className={actual ? `${s.pais} ${s.actual}` : s.pais} aria-pressed={actual}
              onClick={() => !actual && elegir(p)}>
              <small>{actual ? textos.actual : textos.otro}</small>
              <b>{nombres[p]}<span className={s.simbolo}>{REGLAS[moneda].simbolo}</span></b>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
