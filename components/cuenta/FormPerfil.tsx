'use client'
// Datos y preferencias: nombre (se firma "Lorena B." en opiniones y preguntas), teléfono, y la región, moneda e
// idioma con los que se abre la tienda al entrar.
import { useActionState } from 'react'
import { useTextos } from '@/lib/i18n/textos'
import { IDIOMAS, NOMBRE_IDIOMA } from '@/lib/i18n/idiomas'
import { MONEDAS, REGIONES } from '@/lib/region'
import type { EstadoPerfil } from '@/app/[idioma]/[mercado]/cuenta/acciones'
import type { Perfil } from '@/lib/cuenta/sesion'
import { Icono } from '../Icono'
import p from '../compra/Pago.module.css'
import s from './Cuenta.module.css'

export function FormPerfil({ accion, idioma, perfil, email, guardado }: {
  accion: (e: EstadoPerfil, f: FormData) => Promise<EstadoPerfil>; idioma: string; perfil: Perfil; email: string; guardado: boolean
}) {
  const t = useTextos('cuenta')
  const tc = useTextos('comun')
  const tp = useTextos('pagar')
  const [estado, enviar, enviando] = useActionState(accion, guardado ? { ok: true, errores: {} } : null)
  const e = estado?.errores ?? {}
  return (
    <form action={enviar} className={s.formEntrar} noValidate>
      <input type="hidden" name="idioma" value={idioma} />
      {estado?.ok && <p className={s.aviso} role="status"><Icono nombre="check" tam={18} />{t('datos.guardados')}</p>}
      <div className={p.grupo}>
        <label className={`${p.campo} ${p.c3}`}>
          <span>{tp('campos.PY.nombre')}</span>
          <input name="nombre" defaultValue={perfil.nombre} autoComplete="name" maxLength={80} aria-invalid={e.nombre ? true : undefined} aria-describedby="ayuda-nombre" />
          <small id="ayuda-nombre">{e.nombre ? <span className={p.error}>{tp('errores.requerido')}</span> : t('datos.firma', { firma: perfil.firma })}</small>
        </label>
        <label className={`${p.campo} ${p.c3}`}>
          <span>{tp('campos.PY.telefono')} <small>{t('opcional')}</small></span>
          <input name="telefono" defaultValue={perfil.telefono ?? ''} autoComplete="tel" inputMode="tel" aria-invalid={e.telefono ? true : undefined} />
          {e.telefono && <small className={p.error}>{tp('errores.telefono')}</small>}
        </label>
        <div className={`${p.campo} ${p.c6}`}>
          <span>{t('datos.email')}</span>
          <p style={{ margin: 0 }}>{email} <small className={s.letraChica}>· {t('datos.emailNota')}</small></p>
        </div>
      </div>
      <fieldset className={p.grupo} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: 8 }}>{t('datos.preferencias')}</legend>
        <label className={`${p.campo} ${p.c3}`} style={{ gridColumn: 'span 2' }}>
          <span>{t('datos.region')}</span>
          <select className={s.select} name="region" defaultValue={perfil.region}>{REGIONES.map((r) => <option key={r} value={r}>{tc(`paises.${r}`)}</option>)}</select>
        </label>
        <label className={`${p.campo} ${p.c3}`} style={{ gridColumn: 'span 2' }}>
          <span>{t('datos.moneda')}</span>
          <select className={s.select} name="moneda" defaultValue={perfil.moneda}>{MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </label>
        <label className={`${p.campo} ${p.c3}`} style={{ gridColumn: 'span 2' }}>
          <span>{t('datos.idioma')}</span>
          <select className={s.select} name="idioma_preferido" defaultValue={perfil.idioma}>{IDIOMAS.map((i) => <option key={i} value={i}>{NOMBRE_IDIOMA[i]}</option>)}</select>
        </label>
      </fieldset>
      <p className={s.letraChica}>{t('datos.preferenciasNota')}</p>
      <button type="submit" className="boton boton--marca" disabled={enviando}>{enviando ? t('enviando') : t('datos.guardar')}</button>
    </form>
  )
}
