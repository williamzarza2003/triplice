// Comprobante simulado en PDF (A4), con las fuentes de la marca. Sale de los datos congelados del pedido: lo que se
// cobró, con qué impuesto y a qué cotización. Es un documento de demostración, sin valor fiscal, y lo dice.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { formatear, REGLAS } from '../precios'
import type { Moneda } from '../region'

export type DatosComprobante = {
  numero: string; creado: string; estado: string; locale: string
  comprador: { nombre: string; email: string; telefono: string }
  entrega: { modo: 'retiro' | 'domicilio'; texto: string[] }
  moneda: Moneda; cotizacion: number | null
  /** montos en unidades de la moneda (no en centavos) */
  items: { titulo: string; detalle: string; cantidad: number; precio: number; tasa: number | null }[]
  productos: number; descuento: number; cupon: string | null; envio: number; total: number
  impuestos: { nombre: string; monto: number }[]
}

export type TextosComprobante = Record<
  'titulo' | 'simulado' | 'pedido' | 'fecha' | 'estado' | 'comprador' | 'entrega' | 'retiro' | 'domicilio' | 'producto' | 'cantidad'
  | 'unitario' | 'impuesto' | 'subtotal' | 'productos' | 'cupon' | 'envio' | 'gratis' | 'total' | 'incluye' | 'cotizacion' | 'pie' | 'pagina',
  string>

const AGUA = rgb(0x0f / 255, 0x3d / 255, 0x3e / 255)
const TINTA = rgb(0x16 / 255, 0x20 / 255, 0x1f / 255)
const TINTA2 = rgb(0x46 / 255, 0x52 / 255, 0x4f / 255)
const LINEA = rgb(0xd5 / 255, 0xdf / 255, 0xdc / 255)
const NEBLINA = rgb(0xf3 / 255, 0xf6 / 255, 0xf5 / 255)
const IPE = rgb(0xf2 / 255, 0xc2 / 255, 0x30 / 255)

/** Las fuentes de la marca no tienen el signo ₲: en papel se usa "Gs.", como en las facturas de Paraguay. */
export const montoPdf = (n: number, m: Moneda) => formatear(n, m).replace('₲', 'Gs.').replace(/ /g, ' ')

/** De la unidad mínima que guarda la base (centavos en R$ y US$) a unidades de la moneda. */
export const deMinima = (n: number, m: Moneda) => Number(n) / 10 ** REGLAS[m].decimales

// Instancias estáticas de las fuentes de la marca (herramientas/fuentes-pdf.py): fontkit no recorta fuentes variables
let fuentes: Promise<Buffer[]> | null = null
function leerFuentes() {
  const dir = path.join(process.cwd(), 'tokens', 'fuentes', 'pdf')
  fuentes ??= Promise.all(['atkinson-400.ttf', 'schibsted-400.ttf', 'schibsted-700.ttf'].map((f) => readFile(path.join(dir, f))))
  return fuentes
}

/** Corta un texto en renglones que entran en el ancho dado. */
function renglones(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const salida: string[] = []
  let actual = ''
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho || !actual) actual = prueba
    else { salida.push(actual); actual = palabra }
  }
  if (actual) salida.push(actual)
  return salida
}

export async function armarComprobante(d: DatosComprobante, t: TextosComprobante): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(`${t.titulo} ${d.numero}`)
  doc.setAuthor('Tríplice')
  doc.setSubject(t.simulado)
  doc.setLanguage(d.locale)
  // Atkinson para el texto; Schibsted para títulos y números (Atkinson tiene el cero con barra, como en el sitio)
  const [regular, numeros, schibsted] = await leerFuentes()
  const texto = await doc.embedFont(regular, { subset: true })
  const titulo = await doc.embedFont(schibsted, { subset: true })
  const num = await doc.embedFont(numeros, { subset: true })

  const A4: [number, number] = [595.28, 841.89]
  const M = 48 // margen
  const ANCHO = A4[0] - M * 2
  const f = (n: number) => montoPdf(n, d.moneda)
  const fecha = new Intl.DateTimeFormat(d.locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Asuncion' })

  let pagina: PDFPage = doc.addPage(A4)
  let y = A4[1]
  const paginas: PDFPage[] = [pagina]

  const escribir = (s: string, x: number, yy: number, o: { tam?: number; fuente?: PDFFont; color?: ReturnType<typeof rgb>; derecha?: boolean } = {}) => {
    const tam = o.tam ?? 10
    const fu = o.fuente ?? texto
    const xx = o.derecha ? x - fu.widthOfTextAtSize(s, tam) : x
    pagina.drawText(s, { x: xx, y: yy, size: tam, font: fu, color: o.color ?? TINTA })
  }

  // ---------- Cabecera: franja de agua con la marca y el sello "simulado"
  pagina.drawRectangle({ x: 0, y: A4[1] - 96, width: A4[0], height: 96, color: AGUA })
  // isotipo: el círculo de la marca cortado por el Paraná y el Iguazú (viewBox de 64, escalado a 32 pt)
  const iso = { x: M - 2, y: A4[1] - 32, scale: 0.5 }
  pagina.drawCircle({ x: M + 14, y: A4[1] - 48, size: 15, color: rgb(1, 1, 1) })
  pagina.drawSvgPath('M31 -4 C35 14 27 26 31 37 S28 56 33 68', { ...iso, borderColor: AGUA, borderWidth: 5.2, borderLineCap: 1 })
  pagina.drawSvgPath('M68 27 C54 25 45 35 31.5 37', { ...iso, borderColor: AGUA, borderWidth: 4.4, borderLineCap: 1 })
  pagina.drawCircle({ x: M - 2 + 23.5 * 0.5, y: A4[1] - 32 - 33 * 0.5, size: 1.7, color: IPE })
  escribir('Tríplice', M + 36, A4[1] - 56, { tam: 24, fuente: titulo, color: rgb(1, 1, 1) })
  escribir(t.titulo, A4[0] - M, A4[1] - 46, { tam: 15, fuente: titulo, color: rgb(1, 1, 1), derecha: true })
  escribir(d.numero, A4[0] - M, A4[1] - 64, { tam: 11, fuente: num, color: rgb(0.81, 0.89, 0.87), derecha: true })
  y = A4[1] - 96 - 22
  pagina.drawRectangle({ x: M, y: y - 8, width: ANCHO, height: 24, color: NEBLINA, borderColor: LINEA, borderWidth: 0.6 })
  escribir(t.simulado, M + 10, y, { tam: 9, color: TINTA2 })
  y -= 40

  // ---------- Datos: pedido, comprador y entrega en tres columnas
  const col = ANCHO / 3
  const bloque = (x: number, etiqueta: string, lineas: string[]) => {
    escribir(etiqueta.toUpperCase(), x, y, { tam: 8, fuente: titulo, color: TINTA2 })
    let yy = y - 15
    for (const l of lineas) for (const r of renglones(l, texto, 10, col - 16)) { escribir(r, x, yy, { fuente: /\d/.test(r) ? num : texto }); yy -= 13 }
    return yy
  }
  const fin = Math.min(
    bloque(M, t.pedido, [d.numero, `${t.fecha}: ${fecha.format(new Date(d.creado))}`, `${t.estado}: ${d.estado}`]),
    bloque(M + col, t.comprador, [d.comprador.nombre, d.comprador.email, d.comprador.telefono].filter(Boolean)),
    bloque(M + col * 2, t.entrega, [d.entrega.modo === 'retiro' ? t.retiro : t.domicilio, ...d.entrega.texto]),
  )
  y = fin - 18

  // ---------- Tabla de productos
  const X = { producto: M, cantidad: M + ANCHO * 0.56, unitario: M + ANCHO * 0.72, impuesto: M + ANCHO * 0.8, subtotal: M + ANCHO }
  const cabeza = () => {
    pagina.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + ANCHO, y: y + 12 }, thickness: 1, color: AGUA })
    escribir(t.producto, X.producto, y, { tam: 9, fuente: titulo, color: TINTA2 })
    escribir(t.cantidad, X.cantidad, y, { tam: 9, fuente: titulo, color: TINTA2, derecha: true })
    escribir(t.unitario, X.unitario, y, { tam: 9, fuente: titulo, color: TINTA2, derecha: true })
    escribir(t.impuesto, X.impuesto, y, { tam: 9, fuente: titulo, color: TINTA2, derecha: true })
    escribir(t.subtotal, X.subtotal, y, { tam: 9, fuente: titulo, color: TINTA2, derecha: true })
    y -= 8
    pagina.drawLine({ start: { x: M, y }, end: { x: M + ANCHO, y }, thickness: 0.6, color: LINEA })
    y -= 16
  }
  cabeza()
  for (const it of d.items) {
    const lineas = renglones(it.titulo, titulo, 10, ANCHO * 0.5)
    const alto = lineas.length * 13 + (it.detalle ? 12 : 0) + 12
    if (y - alto < 120) { // nueva página
      pagina = doc.addPage(A4); paginas.push(pagina); y = A4[1] - M
      cabeza()
    }
    lineas.forEach((l, i) => escribir(l, X.producto, y - i * 13, { fuente: titulo }))
    if (it.detalle) escribir(it.detalle, X.producto, y - lineas.length * 13, { tam: 8.5, color: TINTA2 })
    escribir(String(it.cantidad), X.cantidad, y, { derecha: true, fuente: num })
    escribir(f(it.precio), X.unitario, y, { derecha: true, fuente: num })
    escribir(it.tasa == null ? '—' : `${Math.round(it.tasa * 1000) / 10} %`, X.impuesto, y, { derecha: true, fuente: num })
    escribir(f(it.precio * it.cantidad), X.subtotal, y, { derecha: true, fuente: titulo })
    y -= alto
    pagina.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + ANCHO, y: y + 6 }, thickness: 0.4, color: LINEA })
    y -= 6
  }

  // ---------- Totales
  if (y < 200) { pagina = doc.addPage(A4); paginas.push(pagina); y = A4[1] - M }
  const etiquetaX = M + ANCHO * 0.58
  const fila = (a: string, b: string, fuerte = false) => {
    escribir(a, etiquetaX, y, { tam: fuerte ? 12 : 10, fuente: fuerte ? titulo : texto })
    escribir(b, M + ANCHO, y, { tam: fuerte ? 12 : 10, fuente: fuerte ? titulo : num, derecha: true })
    y -= fuerte ? 20 : 15
  }
  y -= 4
  fila(t.productos, f(d.productos))
  if (d.descuento > 0) fila(t.cupon.replace('{codigo}', d.cupon ?? ''), `− ${f(d.descuento)}`)
  fila(t.envio, d.envio === 0 ? t.gratis : f(d.envio))
  pagina.drawLine({ start: { x: etiquetaX, y: y + 10 }, end: { x: M + ANCHO, y: y + 10 }, thickness: 1, color: AGUA })
  y -= 4
  fila(t.total, f(d.total), true)
  if (d.impuestos.length) {
    const linea = t.incluye.replace('{lista}', d.impuestos.map((x) => `${x.nombre}: ${f(x.monto)}`).join(' · '))
    for (const r of renglones(linea, num, 9, ANCHO * 0.42)) { escribir(r, etiquetaX, y, { tam: 9, fuente: num, color: TINTA2 }); y -= 12 }
  }
  if (d.cotizacion && d.moneda !== 'USD') {
    escribir(t.cotizacion.replace('{valor}', f(d.cotizacion)), etiquetaX, y - 2, { tam: 9, fuente: num, color: TINTA2 })
  }

  // ---------- Pie en todas las páginas
  paginas.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: 64 }, end: { x: M + ANCHO, y: 64 }, thickness: 0.6, color: LINEA })
    renglones(t.pie, texto, 8, ANCHO - 60).forEach((r, j) => pg.drawText(r, { x: M, y: 50 - j * 11, size: 8, font: texto, color: TINTA2 }))
    const n = t.pagina.replace('{n}', String(i + 1)).replace('{total}', String(paginas.length))
    pg.drawText(n, { x: M + ANCHO - texto.widthOfTextAtSize(n, 8), y: 50, size: 8, font: texto, color: TINTA2 })
  })

  return doc.save()
}
