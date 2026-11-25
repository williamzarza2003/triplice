// Formateo de mensajes para los componentes del navegador. Es el subconjunto de ICU que usan los textos de
// messages/*.json: variables ({ciudad}) y plurales ({n, plural, =0 {…} one {# …} other {# …}}).
// Reemplaza en el cliente al runtime de next-intl (intl-messageformat pesa ~13 KB comprimido y se descargaba
// en cada página); en el servidor se sigue usando next-intl completo.

export type Valores = Record<string, string | number>

const reglas = new Map<string, Intl.PluralRules>()
const numeros = new Map<string, Intl.NumberFormat>()

function plural(locale: string, n: number) {
  if (!reglas.has(locale)) reglas.set(locale, new Intl.PluralRules(locale))
  return reglas.get(locale)!.select(n)
}

function numero(locale: string, n: number) {
  if (!numeros.has(locale)) numeros.set(locale, new Intl.NumberFormat(locale))
  return numeros.get(locale)!.format(n)
}

/** Índice de la llave que cierra la que abre en `desde` (las llaves pueden anidarse). */
function cierre(texto: string, desde: number) {
  let nivel = 0
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === '{') nivel++
    else if (texto[i] === '}' && --nivel === 0) return i
  }
  throw new Error(`Mensaje con llaves sin cerrar: ${texto}`)
}

/** Opciones de un plural: "=0 {Sin opiniones} one {# opinión} other {# opiniones}" → { '=0': …, one: …, other: … } */
function opciones(texto: string) {
  const r: Record<string, string> = {}
  let i = 0
  while (i < texto.length) {
    const abre = texto.indexOf('{', i)
    if (abre < 0) break
    const clave = texto.slice(i, abre).trim()
    const cierra = cierre(texto, abre)
    r[clave] = texto.slice(abre + 1, cierra)
    i = cierra + 1
  }
  return r
}

export function formatear(mensaje: string, locale: string, valores: Valores = {}, numeral?: number): string {
  let salida = ''
  let i = 0
  while (i < mensaje.length) {
    const c = mensaje[i]
    if (c === '#' && numeral !== undefined) {
      salida += numero(locale, numeral)
      i++
    } else if (c === '{') {
      const fin = cierre(mensaje, i)
      const dentro = mensaje.slice(i + 1, fin)
      const coma = dentro.indexOf(',')
      if (coma < 0) {
        const v = valores[dentro.trim()]
        salida += v === undefined ? `{${dentro}}` : String(v) // como intl-messageformat: solo # y {n, number} se formatean
      } else {
        const nombre = dentro.slice(0, coma).trim()
        const resto = dentro.slice(coma + 1)
        const coma2 = resto.indexOf(',')
        const tipo = resto.slice(0, coma2).trim()
        if (tipo !== 'plural') throw new Error(`Formato no soportado en el navegador: ${tipo}`)
        const n = Number(valores[nombre])
        const ops = opciones(resto.slice(coma2 + 1))
        const elegido = ops[`=${n}`] ?? ops[plural(locale, n)] ?? ops.other ?? ''
        salida += formatear(elegido, locale, valores, n)
      }
      i = fin + 1
    } else {
      salida += c
      i++
    }
  }
  return salida
}
