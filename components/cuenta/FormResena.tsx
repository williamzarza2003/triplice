'use client'
// Escribir una opinión: estrellas (radios, se eligen con teclado), título, texto y hasta 4 fotos con vista previa.
// Las fotos viajan en el mismo formulario; el servidor las achica, les saca el EXIF y las pasa a WebP.
import { Fragment, useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useTextos } from '@/lib/i18n/textos'
import type { EstadoResena } from '@/app/[idioma]/[mercado]/cuenta/acciones'
import { Icono } from '../Icono'
import p from '../compra/Pago.module.css'
import s from './Cuenta.module.css'

const MAX = 4

export function FormResena({ accion, item, idioma }: {
  accion: (e: EstadoResena, f: FormData) => Promise<EstadoResena>; item: number; idioma: string
}) {
  const t = useTextos('cuenta')
  const [estado, enviar, enviando] = useActionState(accion, null)
  const [estrellas, setEstrellas] = useState(Number(estado?.valores.estrellas) || 0)
  const [fotos, setFotos] = useState<File[]>([])
  const [largo, setLargo] = useState(estado?.valores.texto.length ?? 0)
  const entrada = useRef<HTMLInputElement>(null)

  // vistas previas de las fotos elegidas (se liberan al cambiar)
  const vistas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos])
  useEffect(() => () => vistas.forEach((u) => URL.revokeObjectURL(u)), [vistas])

  // el <input type=file> lleva siempre las fotos elegidas (también al quitar una)
  useEffect(() => {
    if (!entrada.current) return
    const dt = new DataTransfer()
    fotos.forEach((f) => dt.items.add(f))
    entrada.current.files = dt.files
  }, [fotos])

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const nuevas = [...(e.target.files ?? [])].filter((f) => f.type.startsWith('image/'))
    setFotos((ant) => [...ant, ...nuevas.filter((n) => !ant.some((a) => a.name === n.name && a.size === n.size))].slice(0, MAX))
  }

  const error = estado?.error
  return (
    <form action={enviar} className={s.formEntrar} encType="multipart/form-data" noValidate>
      <input type="hidden" name="item" value={item} />
      <input type="hidden" name="idioma" value={idioma} />

      <fieldset className={s.estrellas} aria-describedby={error === 'estrellas' ? 'e-estrellas' : undefined}>
        <legend>{t('opinar.estrellas')}</legend>
        <div className={s.estrellasFila}>
          {[5, 4, 3, 2, 1].map((n) => (
            <Fragment key={n}>
              <input type="radio" id={`estrella-${n}`} name="estrellas" value={n} checked={estrellas === n} onChange={() => setEstrellas(n)} />
              <label htmlFor={`estrella-${n}`} title={t(`opinar.palabras.${n}`)}>
                <Icono nombre="estrella" /><span className="sr-only">{t(`opinar.palabras.${n}`)}</span>
              </label>
            </Fragment>
          ))}
        </div>
        <p className={s.palabra} aria-live="polite">{estrellas ? t(`opinar.palabras.${estrellas}`) : ''}</p>
        {error === 'estrellas' && <p id="e-estrellas" className={p.error} role="alert"><Icono nombre="info" tam={16} />{t('opinar.errores.estrellas')}</p>}
      </fieldset>

      <label className={p.campo}>
        <span>{t('opinar.titulo')}</span>
        <input name="titulo" maxLength={80} required defaultValue={estado?.valores.titulo} placeholder={t('opinar.tituloEjemplo')}
          aria-invalid={error === 'titulo' || undefined} aria-describedby={error === 'titulo' ? 'e-titulo' : undefined} />
        {error === 'titulo' && <p id="e-titulo" className={p.error} role="alert"><Icono nombre="info" tam={16} />{t('opinar.errores.titulo')}</p>}
      </label>

      <div className={p.campo}>
        <label htmlFor="texto-opinion">{t('opinar.texto')}</label>
        <textarea id="texto-opinion" name="texto" rows={6} maxLength={2000} required defaultValue={estado?.valores.texto} onChange={(e) => setLargo(e.target.value.trim().length)}
          aria-invalid={error === 'texto' || undefined} aria-describedby={`ayuda-texto${error === 'texto' ? ' e-texto' : ''}`} />
        <small id="ayuda-texto">{largo < 20 ? t('opinar.faltan', { n: 20 - largo }) : t('opinar.ayudaTexto')}</small>
        {error === 'texto' && <p id="e-texto" className={p.error} role="alert"><Icono nombre="info" tam={16} />{t('opinar.errores.texto')}</p>}
      </div>

      <div className={p.campo}>
        <span>{t('opinar.fotos')} <small>{t('opinar.fotosAyuda', { n: MAX })}</small></span>
        {vistas.length > 0 && (
          <ul className={s.fotosElegidas}>
            {vistas.map((u, i) => (
              <li key={u}>
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                <img src={u} alt={t('opinar.fotoN', { n: i + 1 })} />
                <button type="button" onClick={() => setFotos((ant) => ant.filter((_, j) => j !== i))} aria-label={t('opinar.quitarFoto', { n: i + 1 })}>
                  <Icono nombre="cerrar" tam={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {fotos.length < MAX && (
          <label className={`boton boton--sec ${s.elegirFotos}`}>
            <Icono nombre="camara" tam={20} />{fotos.length ? t('opinar.otraFoto') : t('opinar.agregarFotos')}
            <input ref={entrada} type="file" name="fotos" accept="image/*" multiple onChange={elegir} />
          </label>
        )}
        {fotos.length >= MAX && <input ref={entrada} type="file" name="fotos" hidden multiple readOnly />}
        {error && ['tipo', 'grande', 'muchas', 'ilegible'].includes(error) && (
          <p className={p.error} role="alert"><Icono nombre="info" tam={16} />{t(`opinar.errores.${error}`)}</p>
        )}
      </div>

      {error && ['no_verificada', 'ya_opinaste', 'servidor'].includes(error) && (
        <p className={p.error} role="alert"><Icono nombre="info" tam={16} />{t(`opinar.errores.${error}`)}</p>
      )}
      <button type="submit" className="boton boton--accion" disabled={enviando}>{enviando ? t('opinar.publicando') : t('opinar.publicar')}</button>
      <p className={s.letraChica}>{t('opinar.reglas')}</p>
    </form>
  )
}
