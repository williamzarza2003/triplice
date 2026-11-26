'use client'
// Dirección guardada. Los campos cambian según el país (barrio en Paraguay, CEP y estado en Brasil, código postal
// y provincia en Argentina), con las mismas reglas que el pago (lib/compra/direccion.ts).
import { useActionState, useState } from 'react'
import { useTextos } from '@/lib/i18n/textos'
import { CAMPOS_DIRECCION } from '@/lib/compra/direccion'
import { REGIONES, type Region } from '@/lib/region'
import type { EstadoDireccion } from '@/app/[idioma]/[mercado]/cuenta/acciones'
import { Icono } from '../Icono'
import p from '../compra/Pago.module.css'
import s from './Cuenta.module.css'

type Valores = Record<string, string>

export function FormDireccion({ accion, idioma, inicial, region: regionInicial }: {
  accion: (e: EstadoDireccion, f: FormData) => Promise<EstadoDireccion>; idioma: string; inicial?: Valores; region: Region
}) {
  const t = useTextos('cuenta')
  const tp = useTextos('pagar')
  const tc = useTextos('comun')
  const [estado, enviar, enviando] = useActionState(accion, null)
  const v: Valores = estado?.valores ?? inicial ?? {}
  const [region, setRegion] = useState<Region>((v.region as Region) || regionInicial)
  const err = estado?.errores ?? {}
  const mensajeError = (e: string) => {
    const propio = tp(`errores.${e}_${region}`) // el CEP y el código postal tienen su propia explicación
    return propio.startsWith('pagar.') ? tp(`errores.${e}`) : propio
  }
  const campo = (nombre: string, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, ancho = p.c3) => (
    <label className={`${p.campo} ${ancho}`}>
      <span>{etiqueta}</span>
      <input name={nombre} defaultValue={v[nombre]} aria-invalid={err[nombre as keyof typeof err] ? true : undefined}
        aria-describedby={err[nombre as keyof typeof err] ? `e-${nombre}` : undefined} {...extra} />
      {err[nombre as keyof typeof err] && (
        <small id={`e-${nombre}`} className={p.error}><Icono nombre="info" tam={14} />{mensajeError(err[nombre as keyof typeof err]!)}</small>
      )}
    </label>
  )
  return (
    <form action={enviar} className={s.formEntrar} noValidate>
      <input type="hidden" name="idioma" value={idioma} />
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className={p.grupo}>
        {campo('alias', t('direcciones.alias'), { placeholder: t('direcciones.aliasEjemplo'), maxLength: 40 })}
        <label className={`${p.campo} ${p.c3}`}>
          <span>{t('direcciones.pais')}</span>
          <select className={s.select} name="region" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
            {REGIONES.map((r) => <option key={r} value={r}>{tc(`paises.${r}`)}</option>)}
          </select>
        </label>
        {campo('nombre', tp(`campos.${region}.nombre`), { autoComplete: 'name' })}
        {campo('telefono', tp(`campos.${region}.telefono`), { autoComplete: 'tel', inputMode: 'tel' })}
        {CAMPOS_DIRECCION[region].map(({ campo: c, requerido }) => (
          <span key={`${region}-${c}`} className={`${c === 'direccion' || c === 'referencia' ? p.c6 : p.c3}`} style={{ display: 'contents' }}>
            {campo(c, `${tp(`campos.${region}.${c}`)}${requerido ? '' : ` (${t('opcional')})`}`,
              { autoComplete: c === 'codigo' ? 'postal-code' : c === 'ciudad' ? 'address-level2' : c === 'direccion' ? 'street-address' : undefined },
              c === 'direccion' || c === 'referencia' ? p.c6 : p.c3)}
          </span>
        ))}
      </div>
      <label className={s.radio}>
        <input type="checkbox" name="predeterminada" value="1" defaultChecked={v.predeterminada === 'true' || v.predeterminada === '1'} />
        {t('direcciones.usarSiempre')}
      </label>
      {err.alias && !v.alias && <p className={p.error} role="alert"><Icono nombre="info" tam={16} />{t('direcciones.faltaAlias')}</p>}
      <button type="submit" className="boton boton--marca" disabled={enviando}>{enviando ? t('enviando') : t('direcciones.guardar')}</button>
    </form>
  )
}
