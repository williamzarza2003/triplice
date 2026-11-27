'use client'
// Alta y edición de un producto con sus variantes. Las variantes se agregan y se quitan en el navegador; cada una lleva
// sus opciones (color, memoria, talle…), su precio en dólares sin impuestos, su stock y hasta 4 fotos. El precio se
// muestra al lado como lo vería el comprador en cada país (con su impuesto), con el mismo cálculo que la tienda.
// Antes de mandar, las fotos se achican en el navegador (no viajan 10 MB desde el celular); el servidor igual las
// vuelve a achicar a 1200 px, les saca el EXIF y las pasa a WebP. El formulario no se vacía si algo sale mal.
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { reglaDe, precioFinal, type Regla } from '@/lib/compra/impuestos'
import { useTextos } from '@/lib/i18n/textos'
import { foto } from '@/lib/imagenes'
import { formatear, type Tasas } from '@/lib/precios'
import { EJES_LIBRES, precioACentavos } from '@/lib/vender/producto'
import type { CategoriaForm, ProductoEdicion } from '@/lib/vender/tipos'
import type { EstadoProducto } from '@/app/[idioma]/[mercado]/vender/acciones'
import { Icono } from '../Icono'
import s from './Vender.module.css'

const MAX_FOTOS = 4
const EJES = ['color', ...EJES_LIBRES] as const
const PAISES = [['PY', 'PYG'], ['BR', 'BRL'], ['AR', 'ARS']] as const

type Fila = {
  key: number; id: string | null; sku: string | null; opciones: Record<string, string>; imagenes: string[]
  precio: string; lista: string; stock: string; pausada: boolean
}

const aTexto = (cent: number | null | undefined) => (cent ? (cent / 100).toFixed(2).replace('.', ',') : '')
const idCampo = (clave: string) => `campo-${clave.replace(/\./g, '-')}`

/** Achica una foto a 1600 px como máximo (JPEG) antes de mandarla; si el navegador no puede, va la original. */
async function achicar(f: File): Promise<File> {
  try {
    const img = await createImageBitmap(f)
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height))
    if (escala === 1 && f.size < 1_500_000) return f
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(img.width * escala)
    lienzo.height = Math.round(img.height * escala)
    lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height)
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.88))
    return blob ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f
  } catch {
    return f
  }
}

export function FormProducto({ accion, categorias, producto, colores, tasas, impuestos, idioma, nombresEje }: {
  accion: (e: EstadoProducto, f: FormData) => Promise<EstadoProducto>
  categorias: CategoriaForm[]; producto: ProductoEdicion | null
  colores: { clave: string; nombre: string; hex: string }[]
  tasas: Tasas; impuestos: Record<string, Regla[]>; idioma: string
  nombresEje: Record<string, string>
}) {
  const t = useTextos('vender')
  const [estado, enviar, enviando] = useActionState(accion, null)
  const [, empezar] = useTransition()
  const [preparando, setPreparando] = useState(false)
  const editable = producto?.editable ?? true
  const [categoria, setCategoria] = useState(producto?.categoria ?? '')
  const cat = categorias.find((c) => c.slug === categoria)
  const ejesIniciales = producto ? [...new Set(producto.variantes.flatMap((v) => Object.keys(v.opciones)))] : ['color']
  const [ejes, setEjes] = useState<string[]>(ejesIniciales)
  // cada fila tiene su clave ("v3") aunque se quiten otras: así los errores del servidor vuelven al campo correcto
  const nueva = (key: number): Fila => ({ key, id: null, sku: null, opciones: {}, imagenes: [], precio: '', lista: '', stock: '', pausada: false })
  const [filas, setFilas] = useState<Fila[]>(() => producto?.variantes.length
    ? producto.variantes.map((v, key) => ({
      key, id: v.id, sku: v.sku, opciones: v.opciones, imagenes: v.imagenes, precio: aTexto(v.oferta?.precio),
      lista: aTexto(v.oferta?.lista), stock: v.oferta ? String(v.oferta.stock) : '0', pausada: v.oferta ? !v.oferta.activa : false,
    }))
    : [nueva(0)])
  const [archivos, setArchivos] = useState<Record<number, File[]>>({})
  const resumen = useRef<HTMLDivElement>(null)
  const errores = estado?.errores ?? {}
  const lista = Object.entries(errores)
  const oferta0 = producto?.variantes.find((v) => v.oferta)?.oferta

  useEffect(() => { if (lista.length) resumen.current?.focus() }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps

  const vistas = useMemo(() => Object.fromEntries(Object.entries(archivos).map(([k, fs]) => [k, fs.map((f) => URL.createObjectURL(f))])), [archivos])
  useEffect(() => () => Object.values(vistas).flat().forEach((u) => URL.revokeObjectURL(u)), [vistas])

  const cambiar = (key: number, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...cambio } : f)))
  const error = (clave: string) => errores[clave] && (
    <p id={`e-${idCampo(clave)}`} className={s.error} role="alert"><Icono nombre="info" tam={16} />{t(`errores.${errores[clave]}`)}</p>
  )
  const invalido = (clave: string) => (errores[clave] ? { 'aria-invalid': true as const, 'aria-describedby': `e-${idCampo(clave)}` } : {})

  /** Cómo se llama el campo con error, para el resumen de arriba ("Variante 2: Stock"). */
  function etiqueta(clave: string) {
    const v = clave.match(/^v(\d+)\.(.+)$/)
    if (v) {
      const n = filas.findIndex((f) => `v${f.key}` === `v${v[1]}`) + 1
      const campo = v[2].startsWith('op.') ? nombresEje[v[2].slice(3)] ?? v[2].slice(3) : t(`form.${({ precio: 'precio', lista: 'lista', stock: 'stock', fotos: 'fotos', opciones: 'ejes' } as Record<string, string>)[v[2]] ?? 'variantesTitulo'}`)
      return `${t('form.variante', { n })}: ${campo}`
    }
    if (clave.startsWith('a.')) return cat?.atributos.find((a) => a.clave === clave.slice(2))?.nombre ?? clave.slice(2)
    const nombres: Record<string, string> = {
      titulo_es: 'tituloEs', titulo_pt: 'tituloPt', titulo_en: 'tituloEn', marca: 'marca', categoria: 'categoria', descripcion_es: 'descripcionEs',
      vinetas_es: 'vinetas', garantia_meses: 'garantia', peso_g: 'peso', preparacion_h: 'preparacion', ejes: 'ejes', condicion: 'condicion',
    }
    return nombres[clave] ? t(`form.${nombres[clave]}`) : t('form.variantesTitulo')
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setPreparando(true)
    Promise.all(filas.map(async (f) => [f.key, await Promise.all((archivos[f.key] ?? []).map(achicar))] as const)).then((listas) => {
      for (const [key, fs] of listas) for (const x of fs) fd.append(`v${key}.fotos`, x)
      setPreparando(false)
      empezar(() => enviar(fd))
    })
  }

  const ocupado = enviando || preparando
  return (
    <form className={s.form} onSubmit={alEnviar} noValidate encType="multipart/form-data">
      <input type="hidden" name="idioma" value={idioma} />
      {producto && <input type="hidden" name="id" value={producto.id} />}
      <input type="hidden" name="variantes" value={filas.map((f) => f.key).join(',')} />

      {lista.length > 0 && (
        <div ref={resumen} tabIndex={-1} className={s.resumenErrores} role="alert">
          <h2>{t('form.resumenErrores', { n: lista.length })}</h2>
          <ul>
            {lista.map(([clave, codigo]) => (
              <li key={clave}>
                {clave === 'general' ? t(`errores.${codigo}`) : <><a href={`#${idCampo(clave)}`}>{etiqueta(clave)}</a>: {t(`errores.${codigo}`)}</>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------------------------------------------------------------- qué es */}
      {editable ? (
        <section className={`panel ${s.bloque}`} aria-labelledby="t-que-es">
          <h2 id="t-que-es">{t('form.queEs')}</h2>
          <div className={s.campos}>
            <div className={s.campo}>
              <label htmlFor={idCampo('categoria')}>{t('form.categoria')}</label>
              <select id={idCampo('categoria')} name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} {...invalido('categoria')}>
                <option value="">{t('form.elegir')}</option>
                {[...new Set(categorias.map((c) => c.padre))].map((padre) => (
                  <optgroup key={padre} label={padre}>
                    {categorias.filter((c) => c.padre === padre).map((c) => <option key={c.slug} value={c.slug}>{c.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
              <small>{t('form.categoriaAyuda')}</small>
              {error('categoria')}
            </div>
            <div className={s.campo}>
              <label htmlFor={idCampo('marca')}>{t('form.marca')}</label>
              <input id={idCampo('marca')} name="marca" defaultValue={producto?.marca} maxLength={40} autoComplete="off" {...invalido('marca')} />
              <small>{t('form.marcaAyuda')}</small>
              {error('marca')}
            </div>
            <div className={`${s.campo} ${s.ancho}`}>
              <label htmlFor={idCampo('titulo_es')}>{t('form.tituloEs')}</label>
              <input id={idCampo('titulo_es')} name="titulo_es" defaultValue={producto?.titulo.es} maxLength={120} autoComplete="off" {...invalido('titulo_es')} />
              <small>{t('form.tituloAyuda')}</small>
              {error('titulo_es')}
            </div>
            <div className={`${s.campo} ${s.ancho}`}>
              <label htmlFor={idCampo('descripcion_es')}>{t('form.descripcionEs')}</label>
              <textarea id={idCampo('descripcion_es')} name="descripcion_es" defaultValue={producto?.descripcion.es} maxLength={2000} rows={4} {...invalido('descripcion_es')} />
              {error('descripcion_es')}
            </div>
            <div className={`${s.campo} ${s.ancho}`}>
              <label htmlFor={idCampo('vinetas_es')}>{t('form.vinetas')}</label>
              <textarea id={idCampo('vinetas_es')} name="vinetas_es" defaultValue={producto?.vinetas.es?.join('\n')} rows={4} {...invalido('vinetas_es')} />
              <small>{t('form.vinetasAyuda')}</small>
              {error('vinetas_es')}
            </div>
          </div>
          <details className={s.numeros} open={!!(producto?.titulo.pt || producto?.titulo.en || errores.titulo_pt || errores.titulo_en)}>
            <summary>{t('form.otrosIdiomas')}</summary>
            <p className={s.sub}>{t('form.otrosIdiomasAyuda')}</p>
            <div className={s.campos} style={{ marginTop: 'var(--e-3)' }}>
              {(['pt', 'en'] as const).map((i) => (
                <div key={i} className={s.campo}>
                  <label htmlFor={idCampo(`titulo_${i}`)}>{t(i === 'pt' ? 'form.tituloPt' : 'form.tituloEn')}</label>
                  <input id={idCampo(`titulo_${i}`)} name={`titulo_${i}`} lang={i} defaultValue={producto?.titulo[i]} maxLength={120} {...invalido(`titulo_${i}`)} />
                  {error(`titulo_${i}`)}
                </div>
              ))}
              {(['pt', 'en'] as const).map((i) => (
                <div key={i} className={s.campo}>
                  <label htmlFor={idCampo(`descripcion_${i}`)}>{t(i === 'pt' ? 'form.descripcionPt' : 'form.descripcionEn')}</label>
                  <textarea id={idCampo(`descripcion_${i}`)} name={`descripcion_${i}`} lang={i} defaultValue={producto?.descripcion[i]} maxLength={2000} rows={3} />
                </div>
              ))}
            </div>
          </details>
        </section>
      ) : (
        <section className={`panel ${s.bloque}`}>
          <p className={s.sub} style={{ marginTop: 0 }}>{t('form.ajeno')}</p>
          {/* lo que la base necesita para reconocer el producto, sin dejar editarlo */}
          <input type="hidden" name="categoria" value={categoria} />
          <input type="hidden" name="marca" value={producto?.marca} />
          <input type="hidden" name="titulo_es" value={producto?.titulo.es} />
          {ejes.map((e) => <input key={e} type="hidden" name="ejes" value={e} />)}
        </section>
      )}

      {/* ---------------------------------------------------------------- ficha técnica */}
      {editable && cat && cat.atributos.length > 0 && (
        <section className={`panel ${s.bloque}`} aria-labelledby="t-ficha">
          <h2 id="t-ficha">{t('form.fichaTecnica')}</h2>
          <p>{t('form.fichaAyuda')}</p>
          <div className={s.campos}>
            {cat.atributos.map((a) => {
              const clave = `a.${a.clave}`
              const valor = producto?.atributos[a.clave]
              return (
                <div key={`${categoria}-${a.clave}`} className={s.campo}>
                  <label htmlFor={idCampo(clave)}>{a.nombre}{a.unidad && <small> ({a.unidad})</small>}</label>
                  {a.tipo === 'booleano' ? (
                    <select id={idCampo(clave)} name={clave} defaultValue={valor === true ? 'si' : valor === false ? 'no' : ''}>
                      <option value="">{t('form.sinDato')}</option><option value="si">{t('form.si')}</option><option value="no">{t('form.no')}</option>
                    </select>
                  ) : (
                    <input id={idCampo(clave)} name={clave} defaultValue={valor === undefined ? '' : String(valor).replace('.', a.tipo === 'numero' ? ',' : '.')}
                      inputMode={a.tipo === 'numero' ? 'decimal' : undefined} maxLength={60} {...invalido(clave)} />
                  )}
                  {error(clave)}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- variantes */}
      <section className={`panel ${s.bloque}`} aria-labelledby="t-variantes">
        <h2 id="t-variantes">{t('form.variantesTitulo')}</h2>
        {editable && (
          <fieldset id={idCampo('ejes')}>
            <legend className={s.campo} style={{ fontWeight: 700, fontSize: 'var(--t-14)', marginBottom: 6 }}>{t('form.ejes')}</legend>
            <div className={s.casillas}>
              {EJES.map((e) => (
                <label key={e} className={s.casilla}>
                  <input type="checkbox" name="ejes" value={e} checked={ejes.includes(e)}
                    onChange={(x) => setEjes((xs) => (x.target.checked ? [...xs, e].slice(-2) : xs.filter((y) => y !== e)))} />
                  {nombresEje[e] ?? e}
                </label>
              ))}
            </div>
            <p className={s.sub}>{t('form.ejesAyuda')}</p>
            {error('ejes')}
          </fieldset>
        )}

        <div className={s.variantes}>
          {filas.map((f, i) => {
            const k = `v${f.key}`
            const cent = precioACentavos(f.precio)
            const fotos = vistas[f.key] ?? []
            const total = f.imagenes.length + fotos.length
            return (
              <fieldset key={f.key} className={s.variante} aria-labelledby={`t-${k}`}>
                <input type="hidden" name={`${k}.id`} value={f.id ?? ''} />
                {f.imagenes.map((img) => <input key={img} type="hidden" name={`${k}.imagen`} value={img} />)}
                <div className={s.varianteCabeza}>
                  <h3 id={`t-${k}`}>{t('form.variante', { n: i + 1 })} {f.sku && <code>{f.sku}</code>}</h3>
                  {editable && filas.length > 1 && (
                    <button type="button" className={s.quitar} onClick={() => setFilas((fs) => fs.filter((x) => x.key !== f.key))}>
                      {t('form.quitar', { n: i + 1 })}
                    </button>
                  )}
                </div>
                <div className={s.campos}>
                  {(editable ? ejes : Object.keys(f.opciones)).map((e) => {
                    const clave = `${k}.op.${e}`
                    return (
                      <div key={e} className={s.campo}>
                        <label htmlFor={idCampo(clave)}>{nombresEje[e] ?? e}</label>
                        {e === 'color' ? (
                          <select id={idCampo(clave)} name={clave} value={f.opciones.color ?? ''} disabled={!editable}
                            onChange={(x) => cambiar(f.key, { opciones: { ...f.opciones, color: x.target.value } })} {...invalido(clave)}>
                            <option value="">{t('form.elegirColor')}</option>
                            {colores.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
                          </select>
                        ) : (
                          <input id={idCampo(clave)} name={clave} value={f.opciones[e] ?? ''} maxLength={40} readOnly={!editable}
                            onChange={(x) => cambiar(f.key, { opciones: { ...f.opciones, [e]: x.target.value } })} {...invalido(clave)} />
                        )}
                        {error(clave)}
                      </div>
                    )
                  })}
                  {!editable && Object.entries(f.opciones).map(([e, v]) => <input key={e} type="hidden" name={`${k}.op.${e}`} value={v} />)}
                  <div className={s.campo}>
                    <label htmlFor={idCampo(`${k}.precio`)}>{t('form.precio')}</label>
                    <span className={s.precioCampo}>
                      <input id={idCampo(`${k}.precio`)} name={`${k}.precio`} inputMode="decimal" value={f.precio} placeholder="29,90" autoComplete="off"
                        onChange={(x) => cambiar(f.key, { precio: x.target.value })} {...invalido(`${k}.precio`)} />
                    </span>
                    {error(`${k}.precio`)}
                  </div>
                  <div className={s.campo}>
                    <label htmlFor={idCampo(`${k}.lista`)}>{t('form.lista')}</label>
                    <span className={s.precioCampo}>
                      <input id={idCampo(`${k}.lista`)} name={`${k}.lista`} inputMode="decimal" value={f.lista} autoComplete="off"
                        onChange={(x) => cambiar(f.key, { lista: x.target.value })} aria-describedby={`a-${k}-lista`} {...invalido(`${k}.lista`)} />
                    </span>
                    <small id={`a-${k}-lista`}>{t('form.listaAyuda')}</small>
                    {error(`${k}.lista`)}
                  </div>
                  <div className={s.campo}>
                    <label htmlFor={idCampo(`${k}.stock`)}>{t('form.stock')}</label>
                    <input id={idCampo(`${k}.stock`)} name={`${k}.stock`} inputMode="numeric" value={f.stock} placeholder="0" autoComplete="off"
                      onChange={(x) => cambiar(f.key, { stock: x.target.value })} {...invalido(`${k}.stock`)} />
                    {error(`${k}.stock`)}
                  </div>
                </div>
                <label className={s.casilla} style={{ justifySelf: 'start' }}>
                  <input type="checkbox" name={`${k}.pausada`} value="1" checked={f.pausada} onChange={(x) => cambiar(f.key, { pausada: x.target.checked })} />
                  {t('form.pausada')}
                </label>

                {editable && (
                  <div className={s.campo}>
                    <span>{t('form.fotos')} <small>{t('form.fotosAyuda')}</small></span>
                    <ul className={s.fotos} id={idCampo(`${k}.fotos`)} tabIndex={-1}>
                      {f.imagenes.map((img, j) => (
                        <li key={img}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`${foto(img)}-240.webp`} alt={t('form.foto', { n: j + 1, v: i + 1 })} width={80} height={80} />
                          <button type="button" className={s.x} aria-label={t('form.quitarFoto', { n: j + 1 })}
                            onClick={() => cambiar(f.key, { imagenes: f.imagenes.filter((x) => x !== img) })}><Icono nombre="cerrar" tam={14} /></button>
                        </li>
                      ))}
                      {fotos.map((u, j) => (
                        <li key={u}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt={t('form.foto', { n: f.imagenes.length + j + 1, v: i + 1 })} width={80} height={80} />
                          <button type="button" className={s.x} aria-label={t('form.quitarFoto', { n: f.imagenes.length + j + 1 })}
                            onClick={() => setArchivos((a) => ({ ...a, [f.key]: (a[f.key] ?? []).filter((_, n) => n !== j) }))}><Icono nombre="cerrar" tam={14} /></button>
                        </li>
                      ))}
                      {total < MAX_FOTOS && (
                        <li>
                          <label className={s.elegirFotos} data-invalido={!!errores[`${k}.fotos`]}>
                            <Icono nombre="camara" tam={20} />{t('form.elegirFotos')}
                            <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-fotos={k}
                              aria-describedby={errores[`${k}.fotos`] ? `e-${idCampo(`${k}.fotos`)}` : undefined}
                              onChange={(x) => {
                                const nuevas = [...(x.target.files ?? [])].filter((a) => a.type.startsWith('image/'))
                                setArchivos((a) => ({ ...a, [f.key]: [...(a[f.key] ?? []), ...nuevas].slice(0, MAX_FOTOS - f.imagenes.length) }))
                                x.target.value = ''
                              }} />
                          </label>
                        </li>
                      )}
                    </ul>
                    {total === 0 && i > 0 && <small>{t('form.fotosHeredadas')}</small>}
                    {error(`${k}.fotos`)}
                  </div>
                )}
                {error(`${k}.opciones`)}

                {cent !== null && (
                  <p className={s.vista} aria-live="polite">
                    <span>{t('form.vistaPrevia')}:</span>
                    {PAISES.map(([pais, moneda]) => {
                      const regla = reglaDe({ reglas: impuestos[pais] ?? [] }, cat ? { sub: cat.slug, padre: cat.padre_slug } : null)
                      return <span key={pais}>{pais} <b>{formatear(precioFinal(cent, regla.tasa, moneda, tasas), moneda)}</b></span>
                    })}
                  </p>
                )}
              </fieldset>
            )
          })}
        </div>
        {editable && filas.length < 20 && (
          <button type="button" className={`boton boton--sec ${s.agregar}`} onClick={() => setFilas((fs) => [...fs, nueva(Math.max(-1, ...fs.map((x) => x.key)) + 1)])}>
            <Icono nombre="mas" tam={18} />{t('form.agregar')}
          </button>
        )}
      </section>

      {/* ---------------------------------------------------------------- envío y garantía */}
      <section className={`panel ${s.bloque}`} aria-labelledby="t-venta">
        <h2 id="t-venta">{t('form.venta')}</h2>
        <div className={s.campos}>
          <div className={s.campo}>
            <label htmlFor={idCampo('preparacion_h')}>{t('form.preparacion')}</label>
            <input id={idCampo('preparacion_h')} name="preparacion_h" inputMode="numeric" defaultValue={oferta0?.preparacion_h ?? 24} {...invalido('preparacion_h')} />
            <small>{t('form.preparacionAyuda')}</small>
            {error('preparacion_h')}
          </div>
          {editable && (
            <>
              <div className={s.campo}>
                <label htmlFor={idCampo('garantia_meses')}>{t('form.garantia')}</label>
                <input id={idCampo('garantia_meses')} name="garantia_meses" inputMode="numeric" defaultValue={producto?.garantia_meses ?? 0} {...invalido('garantia_meses')} />
                {error('garantia_meses')}
              </div>
              <div className={s.campo}>
                <label htmlFor={idCampo('condicion')}>{t('form.condicion')}</label>
                <select id={idCampo('condicion')} name="condicion" defaultValue={producto?.condicion ?? 'nuevo'}>
                  {(['nuevo', 'reacondicionado', 'usado'] as const).map((c) => <option key={c} value={c}>{t(`form.condiciones.${c}`)}</option>)}
                </select>
              </div>
              <div className={s.campo}>
                <label htmlFor={idCampo('peso_g')}>{t('form.peso')}</label>
                <input id={idCampo('peso_g')} name="peso_g" inputMode="numeric" defaultValue={producto?.peso_g ?? ''} {...invalido('peso_g')} />
                <small>{t('form.pesoAyuda')}</small>
                {error('peso_g')}
              </div>
            </>
          )}
        </div>
        <label className={s.casilla} style={{ justifySelf: 'start' }}>
          <input type="checkbox" name="envio_gratis" value="1" defaultChecked={oferta0?.envio_gratis ?? false} />
          {t('form.envioGratis')}
        </label>
      </section>

      <div className={s.enviar}>
        <button type="submit" className="boton boton--accion" disabled={ocupado}>
          {preparando ? t('form.preparandoFotos') : enviando ? t('form.guardando') : producto ? t('form.guardar') : t('form.publicar')}
        </button>
      </div>
    </form>
  )
}
