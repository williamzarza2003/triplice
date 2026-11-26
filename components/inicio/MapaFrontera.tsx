// La idea fuerte de la marca: la confluencia del Paraná y el Iguazú, que divide la tierra en tres países.
// La ciudad de la región elegida se marca en amarillo ipê.
import type { Region } from '@/lib/region'
import s from './MapaFrontera.module.css'

const CIUDADES = [
  { region: 'PY', nombre: 'Ciudad del Este', x: 178, y: 196, tx: 80, ty: 200 },
  { region: 'BR', nombre: 'Foz do Iguaçu', x: 262, y: 196, tx: 272, ty: 200 },
  { region: 'AR', nombre: 'Puerto Iguazú', x: 250, y: 262, tx: 260, ty: 266 },
] as const

export function MapaFrontera({ region, nombres }: { region: Region; nombres: Record<'PY' | 'BR' | 'AR', string> }) {
  return (
    <svg className={s.mapa} viewBox="0 0 460 400" aria-hidden="true">
      <g fill="none" strokeLinecap="round">
        <path d="M210 -10 C240 80 180 150 214 230 S196 360 232 420" stroke="#2e6f70" strokeWidth="30" />
        <path d="M470 170 C390 160 320 220 220 228" stroke="#2e6f70" strokeWidth="24" />
        <path className={s.corriente} d="M210 -10 C240 80 180 150 214 230 S196 360 232 420" stroke="#5fa3a3" strokeWidth="2" strokeDasharray="1 10" />
        <path className={s.corriente} d="M470 170 C390 160 320 220 220 228" stroke="#5fa3a3" strokeWidth="2" strokeDasharray="1 10" />
      </g>
      <g className={s.paises}>
        <text x="112" y="112">{nombres.PY}</text>
        <text x="330" y="90">{nombres.BR}</text>
        <text x="320" y="320">{nombres.AR}</text>
      </g>
      <g className={s.ciudades}>
        {CIUDADES.map((c) => (
          <g key={c.region}>
            <circle cx={c.x} cy={c.y} r={c.region === region ? 7 : 4} fill={c.region === region ? '#F2C230' : '#fff'} />
            <text x={c.tx} y={c.ty} fontWeight={c.region === region ? 700 : 400}>{c.nombre}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}
