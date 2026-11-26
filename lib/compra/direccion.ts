// Datos de contacto y dirección del comprador, con los formatos de cada país: barrio y referencia en
// Paraguay, CEP de 8 dígitos y estado en Brasil, código postal y provincia en Argentina. Módulo puro:
// el formulario lo usa para mostrar los campos y el servidor para validar antes de cobrar.
import { z } from 'zod'
import type { Region } from '../region'

export type Modo = 'retiro' | 'domicilio'
export type Campo = 'nombre' | 'email' | 'telefono' | 'ciudad' | 'zona' | 'direccion' | 'codigo' | 'referencia'
export type Error = 'requerido' | 'email' | 'telefono' | 'codigo' | 'zona'

/** Qué pide cada país además del nombre, el correo y el teléfono. `zona` es el barrio, el estado, la provincia o el país. */
export const CAMPOS_DIRECCION: Record<Region, { campo: Campo; requerido: boolean }[]> = {
  PY: [{ campo: 'ciudad', requerido: true }, { campo: 'zona', requerido: true }, { campo: 'direccion', requerido: true }, { campo: 'referencia', requerido: false }],
  BR: [{ campo: 'codigo', requerido: true }, { campo: 'zona', requerido: true }, { campo: 'ciudad', requerido: true }, { campo: 'direccion', requerido: true }, { campo: 'referencia', requerido: false }],
  AR: [{ campo: 'codigo', requerido: true }, { campo: 'zona', requerido: true }, { campo: 'ciudad', requerido: true }, { campo: 'direccion', requerido: true }, { campo: 'referencia', requerido: false }],
  XX: [{ campo: 'zona', requerido: true }, { campo: 'ciudad', requerido: true }, { campo: 'direccion', requerido: true }, { campo: 'codigo', requerido: false }],
}

const CODIGO: Partial<Record<Region, RegExp>> = {
  BR: /^\d{5}-?\d{3}$/, // CEP
  AR: /^(\d{4}|[A-Za-z]\d{4}[A-Za-z]{3})$/, // código postal o CPA
}
const UF = /^[A-Za-z]{2}$/

export type Datos = Partial<Record<Campo, string>>

const recortar = (x: unknown) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ').slice(0, 160) : '')

/** Valida y normaliza. Devuelve los datos limpios o, por campo, la clave del error para mostrar. */
export function validarDatos(region: Region, modo: Modo, entrada: Record<string, unknown>):
  { ok: true; datos: Datos } | { ok: false; errores: Partial<Record<Campo, Error>>; datos: Datos } {
  const datos: Datos = {}
  const errores: Partial<Record<Campo, Error>> = {}
  const pedir: { campo: Campo; requerido: boolean }[] = [
    { campo: 'nombre', requerido: true }, { campo: 'email', requerido: true }, { campo: 'telefono', requerido: true },
    ...(modo === 'domicilio' ? CAMPOS_DIRECCION[region] : []),
  ]
  for (const { campo, requerido } of pedir) {
    const v = recortar(entrada[campo])
    datos[campo] = v
    if (!v) {
      if (requerido) errores[campo] = 'requerido'
      continue
    }
    if (campo === 'nombre' && v.length < 3) errores[campo] = 'requerido'
    if (campo === 'email' && !z.email().safeParse(v).success) errores[campo] = 'email'
    if (campo === 'telefono' && v.replace(/\D/g, '').length < 7) errores[campo] = 'telefono'
    if (campo === 'codigo' && CODIGO[region] && !CODIGO[region]!.test(v.replace(/\s/g, ''))) errores[campo] = 'codigo'
    if (campo === 'codigo' && region === 'BR' && !errores.codigo) datos.codigo = v.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')
    if (campo === 'zona' && region === 'BR' && !UF.test(v)) errores[campo] = 'zona'
    if (campo === 'zona' && region === 'BR' && !errores.zona) datos.zona = v.toUpperCase()
  }
  return Object.keys(errores).length ? { ok: false, errores, datos } : { ok: true, datos }
}

/** La dirección en una línea, para el comprobante. */
export function direccionEnUnaLinea(region: Region, d: Datos): string {
  const partes = region === 'PY'
    ? [d.direccion, d.zona, d.ciudad, d.referencia]
    : region === 'BR' ? [d.direccion, d.referencia, d.ciudad, d.zona, d.codigo && `CEP ${d.codigo}`]
      : region === 'AR' ? [d.direccion, d.referencia, d.ciudad, d.zona, d.codigo && `CP ${d.codigo}`]
        : [d.direccion, d.ciudad, d.codigo, d.zona]
  return partes.filter(Boolean).join(', ')
}
