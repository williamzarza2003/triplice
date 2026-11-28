'use client'
// Alta de un vendedor: la cuenta (por su email) y la tienda, existente sin dueño o nueva. Lo que antes eran dos
// `update` a mano en el SQL Editor. Funciona sin JavaScript (useActionState con una Server Action); con JavaScript,
// el grupo de la opción que no se eligió se esconde (con :has, en el CSS).
import { useActionState } from 'react'
import Link from 'next/link'
import type { EstadoAlta } from '@/app/[idioma]/[mercado]/admin/acciones'
import { useTextos } from '@/lib/i18n/textos'
import { Icono } from '../Icono'
import v from '../vender/Vender.module.css'
import s from './Admin.module.css'

type Props = {
  accion: (e: EstadoAlta, f: FormData) => Promise<EstadoAlta>
  idioma: string
  sinDuenio: { slug: string; nombre: string; estado: string }[]
  paises: Record<string, string>
}

export function FormAlta({ accion, idioma, sinDuenio, paises }: Props) {
  const t = useTextos('admin')
  const [estado, enviar, enviando] = useActionState(accion, null)
  const val = (k: string, d = '') => estado?.valores?.[k] ?? d
  const modo = val('modo', sinDuenio.length ? 'existente' : 'nueva')
  const error = (campo: string) => (estado?.error && estado.campo === campo
    ? <p id={`e-${campo}`} className={v.error} role="alert"><Icono nombre="info" tam={16} />{t(`errores.${estado.error}`, { detalle: estado.detalle ?? '' })}</p>
    : null)
  const invalido = (campo: string) => (estado?.error && estado.campo === campo ? { 'aria-invalid': true, 'aria-describedby': `e-${campo}` } as const : {})

  return (
    <div className={s.alta}>
      <h2 id="t-alta" className={v.panelTitulo}>{t('alta.titulo')}</h2>
      <p className={v.sub} style={{ marginTop: -8 }}>{t('alta.explica')}</p>
      {estado?.ok && (
        <div className={s.hecho} role="status">
          <b><Icono nombre="check" tam={18} /> {t('alta.hecho', { cuenta: estado.ok.cuenta, tienda: estado.ok.tienda })}</b>
          <p>{t('alta.hechoTexto')} <Link href={`/${idioma}/tienda/${estado.ok.slug}`}>{t('alta.verTienda')}</Link></p>
        </div>
      )}
      <form action={enviar} className={v.form} noValidate={false}>
        <input type="hidden" name="idioma" value={idioma} />
        <div className={v.campos}>
          <div className={`${v.campo} ${v.ancho}`} style={{ maxWidth: 480 }}>
            <label htmlFor="alta-email">{t('alta.email')}</label>
            <input id="alta-email" name="email" type="email" required autoComplete="off" defaultValue={val('email')} {...invalido('email')} />
            <small>{t('alta.emailAyuda')}</small>
            {error('email')}
          </div>
        </div>
        <fieldset className={v.bloque}>
          <legend>{t('alta.tienda')}</legend>
          <div className={v.casillas}>
            <label className={v.casilla}><input type="radio" name="modo" value="existente" defaultChecked={modo === 'existente'} disabled={!sinDuenio.length} />{t('alta.existente')}</label>
            <label className={v.casilla}><input type="radio" name="modo" value="nueva" defaultChecked={modo === 'nueva'} />{t('alta.nueva')}</label>
          </div>
          <div className={`${v.campos} ${s.grupoExistente}`}>
            <div className={v.campo}>
              <label htmlFor="alta-tienda">{t('alta.cualTienda')}</label>
              <select id="alta-tienda" name="tienda" defaultValue={val('tienda')} {...invalido('tienda')}>
                <option value="">{sinDuenio.length ? t('alta.elegir') : t('alta.ningunaSinDuenio')}</option>
                {sinDuenio.map((x) => <option key={x.slug} value={x.slug}>{x.nombre}{x.estado === 'pendiente' ? ` (${t('alta.pendiente')})` : ''}</option>)}
              </select>
              <small>{t('alta.cualTiendaAyuda')}</small>
              {error('tienda')}
            </div>
          </div>
          <div className={`${v.campos} ${s.grupoNueva}`}>
            <div className={v.campo}>
              <label htmlFor="alta-nombre">{t('alta.nombre')}</label>
              <input id="alta-nombre" name="nueva.nombre" maxLength={60} defaultValue={val('nueva.nombre')} {...invalido('nueva.nombre')} />
              {error('nueva.nombre')}
            </div>
            <div className={v.campo}>
              <label htmlFor="alta-slug">{t('alta.slug')}</label>
              <input id="alta-slug" name="nueva.slug" maxLength={60} placeholder="mate-y-guampa" defaultValue={val('nueva.slug')} {...invalido('nueva.slug')} />
              <small>{t('alta.slugAyuda')}</small>
              {error('nueva.slug')}
            </div>
            <div className={v.campo}>
              <label htmlFor="alta-pais">{t('alta.pais')}</label>
              <select id="alta-pais" name="nueva.pais" defaultValue={val('nueva.pais', 'PY')} {...invalido('nueva.pais')}>
                {['PY', 'BR', 'AR'].map((p) => <option key={p} value={p}>{paises[p] ?? p}</option>)}
              </select>
            </div>
            <div className={v.campo}>
              <label htmlFor="alta-ciudad">{t('alta.ciudad')}</label>
              <input id="alta-ciudad" name="nueva.ciudad" maxLength={60} placeholder="Ciudad del Este" defaultValue={val('nueva.ciudad')} {...invalido('nueva.ciudad')} />
              {error('nueva.ciudad')}
            </div>
          </div>
        </fieldset>
        {estado?.error && !['email', 'tienda', 'nueva.nombre', 'nueva.slug', 'nueva.pais', 'nueva.ciudad'].includes(estado.campo ?? '') && (
          <p className={v.error} role="alert"><Icono nombre="info" tam={16} />{t(`errores.${estado.error}`, { detalle: estado.detalle ?? '' })}</p>
        )}
        <div><button type="submit" className="boton boton--marca" disabled={enviando}>{enviando ? t('alta.enviando') : t('alta.boton')}</button></div>
      </form>
    </div>
  )
}
