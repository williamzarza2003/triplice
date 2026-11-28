'use client'
// Cambiar (o crear) una regla de impuesto. Primero "Ver cómo queda": el servidor calcula el precio final de un
// producto de ejemplo en los tres países con el mismo cálculo de la tienda, antes y después. Recién entonces se guarda.
// Sin JavaScript funciona igual (useActionState con una Server Action).
import { useActionState } from 'react'
import type { EstadoImpuesto } from '@/app/[idioma]/[mercado]/admin/acciones'
import { useTextos } from '@/lib/i18n/textos'
import { formatear } from '@/lib/precios'
import type { Tres } from '@/lib/admin/tipos'
import { Icono } from '../Icono'
import v from '../vender/Vender.module.css'
import s from './Admin.module.css'

type Props = {
  accion: (e: EstadoImpuesto, f: FormData) => Promise<EstadoImpuesto>
  idioma: string
  pais: 'PY' | 'BR' | 'AR'
  regla?: { id: number; tasa: number; nombre: Tres; categoria_id: number | null }
  categorias?: { id: number; texto: string; grupo: string | null }[]
  paises: Record<string, string>
}

export function FormImpuesto({ accion, idioma, pais, regla, categorias, paises }: Props) {
  const t = useTextos('admin')
  const [estado, enviar, enviando] = useActionState(accion, null)
  const p = regla ? `regla-${regla.id}` : `regla-nueva-${pais}`
  const val = (k: string, d = '') => estado?.valores?.[k] ?? d
  const porcentaje = (x: number) => new Intl.NumberFormat(idioma === 'en' ? 'en-US' : 'es-PY', { maximumFractionDigits: 2 }).format(x * 100)
  const err = (campo: string) => estado?.error && (estado.campo === campo || (campo === 'nombre.es' && estado.campo === 'nombre'))
  const msj = estado?.error ? t(`errores.${estado.error}`) : ''
  const grupos = [...new Set((categorias ?? []).map((c) => c.grupo ?? ''))]

  return (
    <form action={enviar} className={s.formImpuesto}>
      <input type="hidden" name="idioma" value={idioma} />
      <input type="hidden" name="pais" value={pais} />
      {regla && <input type="hidden" name="id" value={regla.id} />}
      {regla && <input type="hidden" name="categoria" value={regla.categoria_id ?? ''} />}
      {categorias && (
        <div className={v.campo}>
          <label htmlFor={`${p}-categoria`}>{t('impuestos.categoria')}</label>
          <select id={`${p}-categoria`} name="categoria" required defaultValue={val('categoria')} aria-invalid={err('categoria') || undefined}>
            <option value="">{t('impuestos.elegirCategoria')}</option>
            {grupos.map((g) => (
              <optgroup key={g} label={g || t('impuestos.principales')}>
                {categorias.filter((c) => (c.grupo ?? '') === g).map((c) => <option key={c.id} value={c.id}>{c.texto}</option>)}
              </optgroup>
            ))}
          </select>
          {err('categoria') && <p className={v.error} role="alert"><Icono nombre="info" tam={16} />{msj}</p>}
        </div>
      )}
      <div className={v.campo}>
        <label htmlFor={`${p}-tasa`}>{t('impuestos.tasa')}</label>
        <div className={s.porcentaje}>
          <input id={`${p}-tasa`} name="tasa" inputMode="decimal" required defaultValue={val('tasa', regla ? porcentaje(Number(regla.tasa)) : '')}
            aria-invalid={err('tasa') || undefined} aria-describedby={`${p}-tasa-ayuda`} />
        </div>
        <small id={`${p}-tasa-ayuda`}>{t('impuestos.tasaAyuda')}</small>
        {err('tasa') && <p className={v.error} role="alert"><Icono nombre="info" tam={16} />{msj}</p>}
      </div>
      <fieldset>
        <legend>{t('impuestos.nombre')}</legend>
        <div className={s.idiomas}>
          {(['es', 'pt', 'en'] as const).map((i) => (
            <label key={i} style={{ display: 'contents' }}>
              <span lang={i}>{i.toUpperCase()}</span>
              <input name={`nombre.${i}`} lang={i} required maxLength={40} defaultValue={val(`nombre.${i}`, regla?.nombre[i] ?? '')}
                aria-label={t(`categorias.nombreEn.${i}`)} aria-invalid={err(`nombre.${i}`) || undefined} />
            </label>
          ))}
        </div>
        {(err('nombre.es') || err('nombre.pt') || err('nombre.en')) && <p className={v.error} role="alert"><Icono nombre="info" tam={16} />{msj}</p>}
      </fieldset>
      {estado?.error && !estado.campo && <p className={v.error} role="alert"><Icono nombre="info" tam={16} />{msj}</p>}

      {estado?.vista && <input type="hidden" name="vista" value={estado.vista.tasa} />}
      {estado?.vista && (
        <div className={s.vista} role="status" aria-live="polite">
          <p>{t('impuestos.ejemplo', { producto: estado.vista.ejemplo.titulo, base: formatear(Number(estado.vista.ejemplo.precio) / 100, 'USD') })}</p>
          <table>
            <thead><tr><th scope="col">{t('impuestos.pais')}</th><th scope="col">{t('impuestos.antes')}</th><th scope="col">{t('impuestos.despues')}</th></tr></thead>
            <tbody>
              {estado.vista.filas.map((f) => (
                <tr key={f.pais} data-cambia={f.cambia}>
                  <td>{paises[f.pais] ?? f.pais}</td>
                  <td>{formatear(f.antes.precio, f.moneda)}</td>
                  <td>{formatear(f.despues.precio, f.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{estado.vista.filas.some((f) => f.cambia) ? t('impuestos.cambia') : t('impuestos.noCambia')}</p>
        </div>
      )}
      <div className={s.botones}>
        <button type="submit" name="paso" value="vista" className="boton boton--sec" disabled={enviando}>{t('impuestos.verComoQueda')}</button>
        {estado?.vista && <button type="submit" name="paso" value="guardar" className="boton boton--marca" disabled={enviando}>{t('impuestos.guardar')}</button>}
      </div>
    </form>
  )
}
