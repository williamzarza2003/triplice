// Mapa de retiro: la triple frontera dibujada con los dos ríos (como el mapa de la portada) y los locales donde
// se retira, numerados igual que la lista. Proyección equirectangular de ~18 km de ancho centrada en el Puente:
// entran Ciudad del Este, Presidente Franco, Foz y Puerto Iguazú; lo que queda afuera se marca en la lista.
// Es decorativo para los lectores de pantalla: la lista de al lado tiene las mismas direcciones y horarios.
import s from './MapaRetiro.module.css'

const ANCHO = 560
const ALTO = 600
const LNG0 = -54.705
const LNG1 = -54.525
const POR_GRADO_X = ANCHO / (LNG1 - LNG0)
const POR_GRADO_Y = POR_GRADO_X * (111 / 100.4) // un grado de latitud es más largo que uno de longitud a 25,5° S
const LAT_CENTRO = -25.53

const x = (lng: number) => (lng - LNG0) * POR_GRADO_X
const y = (lat: number) => ALTO / 2 - (lat - LAT_CENTRO) * POR_GRADO_Y
const dentro = (lat: number, lng: number) => x(lng) >= 0 && x(lng) <= ANCHO && y(lat) >= 0 && y(lat) <= ALTO
const linea = (pts: [number, number][]) => pts.map(([la, lo], i) => `${i ? 'L' : 'M'}${x(lo).toFixed(1)} ${y(la).toFixed(1)}`).join(' ')

const PARANA: [number, number][] = [[-25.37, -54.607], [-25.42, -54.598], [-25.46, -54.594], [-25.5, -54.598], [-25.53, -54.604],
  [-25.56, -54.598], [-25.592, -54.592], [-25.63, -54.6]]
const IGUAZU: [number, number][] = [[-25.62, -54.47], [-25.607, -54.53], [-25.599, -54.566], [-25.594, -54.589]]
const PUENTE: [number, number][] = [[-25.5094, -54.6045], [-25.5094, -54.5925]]
// referencias para ubicarse (los nombres propios de las ciudades no se traducen)
const CIUDADES = [
  { nombre: 'Ciudad del Este', lat: -25.488, lng: -54.635, izquierda: true },
  { nombre: 'Presidente Franco', lat: -25.562, lng: -54.618, izquierda: true },
  { nombre: 'Foz do Iguaçu', lat: -25.53, lng: -54.575, izquierda: false },
  { nombre: 'Puerto Iguazú', lat: -25.603, lng: -54.584, izquierda: true },
]

export type PuntoMapa = { n: number; lat: number; lng: number; ciudad: string }

export function enElMapa(p: { lat: number; lng: number }) {
  return dentro(p.lat, p.lng)
}

export function MapaRetiro({ puntos, paises, puente }: { puntos: PuntoMapa[]; paises: Record<'PY' | 'BR' | 'AR', string>; puente: string }) {
  // los locales del microcentro están a metros: se separan un poco para que se lean los números
  const vistos: { px: number; py: number }[] = []
  const pines = puntos.filter((p) => dentro(p.lat, p.lng)).map((p) => {
    let px = x(p.lng)
    let py = y(p.lat)
    while (vistos.some((v) => Math.hypot(v.px - px, v.py - py) < 28)) { px += 20; py -= 12 }
    vistos.push({ px, py })
    return { ...p, px, py }
  })
  return (
    <svg className={s.mapa} viewBox={`0 0 ${ANCHO} ${ALTO}`} aria-hidden="true">
      <rect width={ANCHO} height={ALTO} className={s.tierra} />
      <path d={linea(PARANA)} className={s.rio} strokeWidth="16" />
      <path d={linea(IGUAZU)} className={s.rio} strokeWidth="12" />
      <path d={linea(PUENTE)} className={s.puente} />
      <text x={x(-54.609)} y={y(-25.5094) + 24} className={s.etiquetaPuente} textAnchor="end">{puente}</text>
      <text x={x(-54.695)} y={y(-25.455)} className={s.pais}>{paises.PY}</text>
      <text x={x(-54.582)} y={y(-25.455)} className={s.pais}>{paises.BR}</text>
      <text x={x(-54.555)} y={y(-25.613)} className={s.pais}>{paises.AR}</text>
      {CIUDADES.map((c) => (
        <g key={c.nombre} className={s.ciudad}>
          <circle cx={x(c.lng)} cy={y(c.lat)} r="3" />
          <text x={x(c.lng) + (c.izquierda ? -9 : 9)} y={y(c.lat) + 6} textAnchor={c.izquierda ? 'end' : 'start'}>{c.nombre}</text>
        </g>
      ))}
      {pines.map((p) => (
        <g key={p.n} className={s.pin}>
          <circle cx={p.px} cy={p.py} r="15" />
          <text x={p.px} y={p.py + 5.5}>{p.n}</text>
        </g>
      ))}
    </svg>
  )
}
