// Ventas por día, dibujado a mano en SVG (sin librerías): barras de cada día, el mejor día en lapacho con su monto y
// una línea punteada con el promedio diario del período anterior, para leer de un vistazo si se vende más o menos.
// En el celular, los últimos 14 días con barras más anchas (30 barras en 340 px no se leen). Sin JavaScript: el detalle
// de cada barra está en su <title> y la tabla con todos los números, en un <details>.
import { montoMinimo } from '@/lib/cuenta/pagina'
import { LOCALE, type Idioma } from '@/lib/i18n/idiomas'
import { marcasEje, montoCorto } from '@/lib/vender/formato'
import s from './Vender.module.css'

type Punto = { dia: string; monto: number; pedidos: number }
type Textos = { barra: (p: Punto, fecha: string, monto: string) => string; mejor: string; hoy: string }

const fechaDe = (dia: string) => new Date(`${dia}T12:00:00Z`)

function Svg({ puntos, promedio, ancho, alto, moneda, idioma, textos, etiquetas, compacto }: {
  puntos: Punto[]; promedio: number; ancho: number; alto: number; moneda: string; idioma: Idioma; textos: Textos
  etiquetas: number[]; compacto?: boolean
}) {
  const x0 = 50, arriba = 26, abajo = 26
  const maximo = Math.max(promedio, ...puntos.map((p) => p.monto))
  const marcas = marcasEje(maximo * 1.08)
  const tope = marcas.at(-1) || 1
  const alturaUtil = alto - arriba - abajo
  const y = (v: number) => arriba + alturaUtil - (v / tope) * alturaUtil
  const paso = (ancho - x0 - 4) / puntos.length
  const hueco = Math.min(4, paso * 0.22)
  const mejor = puntos.reduce((m, p, i) => (p.monto > (puntos[m]?.monto ?? 0) ? i : m), -1)
  const largo = new Intl.DateTimeFormat(LOCALE[idioma], { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const corto = new Intl.DateTimeFormat(LOCALE[idioma], { day: 'numeric', month: 'numeric', timeZone: 'UTC' })
  const monto = (n: number) => montoMinimo(n, moneda)

  return (
    <svg className={`${s.grafico} ${compacto ? s.soloCelular : s.soloEscritorio}`} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true" focusable="false">
      {marcas.map((m) => (
        <g key={m}>
          <line className={m === 0 ? s.base : s.rejilla} x1={x0} x2={ancho} y1={y(m)} y2={y(m)} />
          <text className={s.texto} x={x0 - 8} y={y(m) + 4} textAnchor="end">{m === 0 ? '0' : montoCorto(m, moneda, idioma)}</text>
        </g>
      ))}
      {puntos.map((p, i) => {
        const h = Math.max(p.monto > 0 ? 2 : 1, y(0) - y(p.monto))
        const cx = x0 + i * paso + paso / 2
        return (
          <g key={p.dia}>
            <title>{textos.barra(p, largo.format(fechaDe(p.dia)), monto(p.monto))}</title>
            {/* zona sensible a todo lo alto: el detalle aparece aunque la barra sea baja */}
            <rect x={x0 + i * paso} y={arriba} width={paso} height={alturaUtil} fill="transparent" />
            <rect className={p.monto === 0 ? s.vacia : i === mejor ? s.mejor : s.barra} x={x0 + i * paso + hueco / 2} y={y(0) - h}
              width={paso - hueco} height={h} rx={Math.min(3, (paso - hueco) / 3)} />
            {i !== mejor && p.monto > 0 && !compacto && (
              <text className={s.valor} x={cx} y={y(p.monto) - 6} textAnchor="middle">{montoCorto(p.monto, moneda, idioma)}</text>
            )}
          </g>
        )
      })}
      {promedio > 0 && <line className={s.promedio} x1={x0} x2={ancho} y1={y(promedio)} y2={y(promedio)} />}
      {mejor >= 0 && (
        <text className={s.etiquetaMejor} x={Math.min(ancho - 30, Math.max(x0 + 30, x0 + mejor * paso + paso / 2))} y={y(puntos[mejor].monto) - 8}
          textAnchor="middle">{montoCorto(puntos[mejor].monto, moneda, idioma)}</text>
      )}
      {etiquetas.map((i) => (
        <text key={i} className={s.texto} x={x0 + i * paso + paso / 2} y={alto - 6} textAnchor="middle">
          {i === puntos.length - 1 ? textos.hoy : corto.format(fechaDe(puntos[i].dia))}
        </text>
      ))}
    </svg>
  )
}

export function GraficoVentas({ serie, promedio, moneda, idioma, textos }: {
  serie: Punto[]; promedio: number; moneda: string; idioma: Idioma; textos: Textos
}) {
  const n = serie.length
  const celular = serie.slice(-14)
  // de atrás para adelante, para que "hoy" siempre tenga etiqueta
  const cada = (largo: number, salto: number) => Array.from({ length: Math.ceil(largo / salto) }, (_, k) => largo - 1 - k * salto).filter((i) => i >= 0).reverse()
  return (
    <>
      <Svg puntos={serie} promedio={promedio} ancho={760} alto={230} moneda={moneda} idioma={idioma} textos={textos} etiquetas={cada(n, 7)} />
      <Svg puntos={celular} promedio={promedio} ancho={360} alto={220} moneda={moneda} idioma={idioma} textos={textos} etiquetas={cada(celular.length, 4)} compacto />
    </>
  )
}
