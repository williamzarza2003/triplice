// El formateador liviano del navegador (lib/i18n/formato.ts) tiene que dar exactamente lo mismo que next-intl
// para todos los textos que se mandan al navegador, en los tres idiomas.
import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import es from '@/messages/es.json'
import pt from '@/messages/pt.json'
import en from '@/messages/en.json'
import { formatear } from '@/lib/i18n/formato'

const GRUPOS = ['encabezado', 'sugerencias', 'region', 'error', 'ficha', 'precio', 'comun'] as const
type Arbol = { [k: string]: string | Arbol }

function hojas(arbol: Arbol, prefijo = ''): [string, string][] {
  return Object.entries(arbol).flatMap(([k, v]) => (typeof v === 'string' ? [[prefijo + k, v] as [string, string]] : hojas(v, `${prefijo}${k}.`)))
}

describe('formatear', () => {
  it('variables y plurales', () => {
    expect(formatear('Quedan {n}', 'es', { n: 3 })).toBe('Quedan 3')
    expect(formatear('{n, plural, =0 {Sin opiniones} one {# opinión} other {# opiniones}}', 'es', { n: 0 })).toBe('Sin opiniones')
    expect(formatear('{n, plural, =0 {Sin opiniones} one {# opinión} other {# opiniones}}', 'es', { n: 1 })).toBe('1 opinión')
    expect(formatear('{n, plural, one {# opinión} other {# opiniones}}, {v} de compra verificada', 'es-PY', { n: 1234, v: 'x' }))
      .toBe('1.234 opiniones, x de compra verificada')
  })

  for (const [idioma, mensajes] of [['es', es], ['pt', pt], ['en', en]] as const) {
    it(`da lo mismo que next-intl en ${idioma}`, () => {
      for (const grupo of GRUPOS) {
        const t = createTranslator({ locale: idioma, messages: mensajes as unknown as Record<string, Arbol>, namespace: grupo })
        for (const [clave, texto] of hojas((mensajes as unknown as Record<string, Arbol>)[grupo])) {
          const nombres = [...texto.matchAll(/\{(\w+)/g)].map((m) => m[1])
          for (const n of [0, 1, 2, 7, 1500]) {
            const valores = Object.fromEntries(nombres.map((x) => [x, ['n', 'total', 'horas', 'valor'].includes(x) ? n : `«${x}»`]))
            expect(formatear(texto, idioma, valores), `${grupo}.${clave} con ${n}`).toBe((t as (k: string, v: object) => string)(clave, valores))
          }
        }
      }
    })
  }
})
