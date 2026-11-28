'use client'
// Alta o edición de una categoría y de un dato técnico (atributo). Funcionan sin JavaScript (useActionState con una
// Server Action) y cada error vuelve atado a su campo, con un mensaje que dice cómo resolverlo.
import { useActionState } from 'react'
import type { EstadoForm } from '@/app/[idioma]/[mercado]/admin/acciones'
import type { AtributoAdmin, Tres } from '@/lib/admin/tipos'
import { useTextos } from '@/lib/i18n/textos'
import { Icono } from '../Icono'
import v from '../vender/Vender.module.css'
import s from './Admin.module.css'

type Accion = (e: EstadoForm, f: FormData) => Promise<EstadoForm>
const IDIOMAS = ['es', 'pt', 'en'] as const

function useCampos(estado: EstadoForm) {
  const t = useTextos('admin')
  const val = (k: string, d = '') => estado?.valores?.[k] ?? d
  const deCampo = (campo: string) => !!estado?.error && (estado.campo === campo || (campo.startsWith('nombre') && estado.campo === 'nombre' && campo === 'nombre.es'))
  const error = (campo: string) => deCampo(campo)
    ? <p id={`e-${campo}`} className={v.error} role="alert"><Icono nombre="info" tam={16} />{estado?.pista && estado.error === 'en_uso' ? estado.pista : t(`errores.${estado!.error}`)}</p>
    : null
  const invalido = (campo: string) => (deCampo(campo) ? { 'aria-invalid': true, 'aria-describedby': `e-${campo}` } as const : {})
  const general = estado?.error && !estado.campo ? <p className={v.error} role="alert"><Icono nombre="info" tam={16} />{t(`errores.${estado.error}`)}</p> : null
  return { t, val, error, invalido, general }
}

function Nombres({ prefijo, nombre, val, error, invalido, maximo, t }: {
  prefijo: string; nombre?: Tres; maximo: number
  val: (k: string, d?: string) => string; error: (c: string) => React.ReactNode; invalido: (c: string) => object; t: (k: string) => string
}) {
  return (
    <fieldset className={`${v.campo} ${v.ancho}`}>
      <legend className={v.campo}><span>{t('categorias.nombre')}</span></legend>
      <div className={s.idiomas}>
        {IDIOMAS.map((i) => (
          <label key={i} style={{ display: 'contents' }}>
            <span lang={i}>{i.toUpperCase()}</span>
            <input name={`nombre.${i}`} lang={i} required minLength={2} maxLength={maximo} defaultValue={val(`nombre.${i}`, nombre?.[i] ?? '')}
              aria-label={t(`categorias.nombreEn.${i}`)} id={`${prefijo}-nombre-${i}`} {...invalido(`nombre.${i}`)} />
          </label>
        ))}
      </div>
      {IDIOMAS.map((i) => <div key={i}>{error(`nombre.${i}`)}</div>)}
    </fieldset>
  )
}

export function FormCategoria({ accion, idioma, categoria, principales, iconos }: {
  accion: Accion; idioma: string
  categoria?: { id: number; slug: string; nombre: Tres; padre: number | null; icono: string | null; productos: number; hijas?: number }
  principales: { id: number; texto: string }[]
  iconos: string[]
}) {
  const [estado, enviar, enviando] = useActionState(accion, null)
  const { t, val, error, invalido, general } = useCampos(estado)
  const fijo = (categoria?.productos ?? 0) > 0
  const p = categoria ? `cat-${categoria.id}` : 'cat-nueva'
  return (
    <form action={enviar} className={v.form}>
      <input type="hidden" name="idioma" value={idioma} />
      {categoria && <input type="hidden" name="id" value={categoria.id} />}
      <div className={v.campos}>
        <Nombres prefijo={p} nombre={categoria?.nombre} maximo={60} val={val} error={error} invalido={invalido} t={t} />
        <div className={v.campo}>
          <label htmlFor={`${p}-slug`}>{t('categorias.slug')}</label>
          <input id={`${p}-slug`} name="slug" maxLength={60} defaultValue={val('slug', categoria?.slug ?? '')} readOnly={fijo}
            aria-describedby={`${p}-slug-ayuda`} {...invalido('slug')} />
          <small id={`${p}-slug-ayuda`}>{fijo ? t('categorias.slugFijo') : t('categorias.slugAyuda')}</small>
          {error('slug')}
        </div>
        <div className={v.campo}>
          <label htmlFor={`${p}-padre`}>{t('categorias.padre')}</label>
          {fijo || (categoria?.hijas ?? 0) > 0 ? (
            <>
              <input type="hidden" name="padre" value={categoria?.padre ?? ''} />
              <input id={`${p}-padre`} readOnly value={categoria?.padre ? principales.find((x) => x.id === categoria.padre)?.texto ?? '' : t('categorias.esPrincipal')} />
              <small>{fijo ? t('categorias.padreFijo') : t('categorias.padreConHijas')}</small>
            </>
          ) : (
            <select id={`${p}-padre`} name="padre" defaultValue={val('padre', String(categoria?.padre ?? ''))} {...invalido('padre')}>
              <option value="">{t('categorias.esPrincipal')}</option>
              {principales.filter((x) => x.id !== categoria?.id).map((x) => <option key={x.id} value={x.id}>{x.texto}</option>)}
            </select>
          )}
          {error('padre')}
        </div>
        {/* el ícono solo se ve en las principales: en una subcategoría no se ofrece */}
        {!categoria?.padre && <div className={v.campo}>
          <label htmlFor={`${p}-icono`}>{t('categorias.icono')}</label>
          <select id={`${p}-icono`} name="icono" defaultValue={val('icono', categoria?.icono ?? '')}>
            <option value="">{t('categorias.sinIcono')}</option>
            {iconos.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <small>{t('categorias.iconoAyuda')}</small>
        </div>}
      </div>
      {general}
      <div><button type="submit" className="boton boton--marca" disabled={enviando}>{categoria ? t('categorias.guardar') : t('categorias.crear')}</button></div>
    </form>
  )
}

export function FormAtributo({ accion, idioma, categoria, atributo }: { accion: Accion; idioma: string; categoria: number; atributo?: AtributoAdmin }) {
  const [estado, enviar, enviando] = useActionState(accion, null)
  const { t, val, error, invalido, general } = useCampos(estado)
  const enUso = (atributo?.usos ?? 0) > 0
  const p = atributo ? `attr-${atributo.id}` : 'attr-nuevo'
  return (
    <form action={enviar} className={v.form}>
      <input type="hidden" name="idioma" value={idioma} />
      <input type="hidden" name="categoria" value={categoria} />
      {atributo && <input type="hidden" name="id" value={atributo.id} />}
      <div className={v.campos}>
        <div className={v.campo}>
          <label htmlFor={`${p}-clave`}>{t('atributos.clave')}</label>
          <input id={`${p}-clave`} name="clave" required maxLength={31} pattern="[a-z][a-z0-9_]{1,30}" readOnly={enUso}
            defaultValue={val('clave', atributo?.clave ?? '')} aria-describedby={`${p}-clave-ayuda`} {...invalido('clave')} />
          <small id={`${p}-clave-ayuda`}>{enUso ? t('atributos.claveFija', { n: atributo!.usos }) : t('atributos.claveAyuda')}</small>
          {error('clave')}
        </div>
        <div className={v.campo}>
          <label htmlFor={`${p}-tipo`}>{t('atributos.tipo')}</label>
          {enUso ? (
            <><input type="hidden" name="tipo" value={atributo!.tipo} /><input id={`${p}-tipo`} readOnly value={t(`atributos.tipos.${atributo!.tipo}`)} /></>
          ) : (
            <select id={`${p}-tipo`} name="tipo" defaultValue={val('tipo', atributo?.tipo ?? 'texto')} {...invalido('tipo')}>
              {['texto', 'numero', 'booleano', 'opcion'].map((x) => <option key={x} value={x}>{t(`atributos.tipos.${x}`)}</option>)}
            </select>
          )}
          {error('tipo')}
        </div>
        <div className={v.campo}>
          <label htmlFor={`${p}-unidad`}>{t('atributos.unidad')}</label>
          <input id={`${p}-unidad`} name="unidad" maxLength={12} placeholder="W, kg, mAh" defaultValue={val('unidad', atributo?.unidad ?? '')} {...invalido('unidad')} />
          {error('unidad')}
        </div>
        <Nombres prefijo={p} nombre={atributo?.nombre} maximo={40} val={val} error={error} invalido={invalido} t={t} />
        <div className={`${v.campo} ${v.ancho}`}>
          <label htmlFor={`${p}-opciones`}>{t('atributos.opciones')}</label>
          <textarea id={`${p}-opciones`} name="opciones" rows={3} defaultValue={val('opciones', (atributo?.opciones ?? []).join('\n'))}
            aria-describedby={`${p}-opciones-ayuda`} {...invalido('opciones')} />
          <small id={`${p}-opciones-ayuda`}>{t('atributos.opcionesAyuda')}</small>
          {error('opciones')}
        </div>
        <label className={v.casilla} style={{ width: 'fit-content' }}>
          <input type="checkbox" name="filtrable" defaultChecked={val('filtrable', atributo?.filtrable ? 'on' : '') === 'on'} />{t('atributos.filtrable')}
        </label>
      </div>
      {general}
      <div><button type="submit" className="boton boton--marca" disabled={enviando}>{atributo ? t('atributos.guardar') : t('atributos.crear')}</button></div>
    </form>
  )
}
