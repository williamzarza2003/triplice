'use client'
// La parte de la ficha que cambia al elegir una variante: galería, opciones, caja de compra y vendedores.
// Los precios llegan ya convertidos y formateados desde el servidor: acá solo se elige cuál mostrar.
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import COLORES from '@/lib/catalogo/colores.json'
import type { Idioma } from '@/lib/i18n/idiomas'
import { textoSobre } from '@/lib/color'
import { foto } from '@/lib/imagenes'
import { Icono } from '../Icono'
import s from './Compra.module.css'

export type OfertaVista = {
  id: string
  /** la única más barata con stock (si hay empate de precio, ninguna) */
  masBarato: boolean
  precio: string
  lista: string | null
  descuento: number
  equivalencias: string | null
  stock: number
  envioGratis: boolean
  preparacionH: number
  cerca: boolean
  tienda: { slug: string; nombre: string; ciudad: string; color: string; recomendacion: number | null; opiniones: number | null; aTiempo: number | null; respuesta: string | null }
}
export type VarianteVista = { id: string; sku: string; opciones: Record<string, string>; imagenes: string[]; ofertas: OfertaVista[] }

type Props = { idioma: Idioma; titulo: string; variantes: VarianteVista[]; info: React.ReactNode; detalles: React.ReactNode }

const NOMBRE_COLOR = COLORES as Record<string, { hex: string; es: string; pt: string; en: string }>

export function Compra({ idioma, titulo, variantes, info, detalles }: Props) {
  const t = useTranslations('ficha')
  const tp = useTranslations('precio')
  // la oferta elegida por defecto es la primera con stock: vienen ordenadas por precio y, con el mismo precio,
  // por la entrega más rápida (lib/ofertas.ts)
  const primeraConStock = (x: VarianteVista) => Math.max(0, x.ofertas.findIndex((o) => o.stock > 0))
  const inicial = Math.max(0, variantes.findIndex((v) => v.ofertas.some((o) => o.stock > 0)))
  const [vi, setVi] = useState(inicial)
  const [oi, setOi] = useState(() => primeraConStock(variantes[inicial]))
  const [foto_, setFoto] = useState(0)
  const [aviso, setAviso] = useState(false)
  const v = variantes[vi]
  const oferta = v.ofertas[oi] ?? v.ofertas[0]

  // ?v=SKU en la URL: la variante elegida se puede compartir
  useEffect(() => {
    const sku = new URLSearchParams(window.location.search).get('v')
    const i = variantes.findIndex((x) => x.sku === sku)
    if (i < 0) return
    const cuadro = requestAnimationFrame(() => { setVi(i); setOi(primeraConStock(variantes[i])) })
    return () => cancelAnimationFrame(cuadro)
  }, [variantes])

  function elegirVariante(i: number) {
    setVi(i); setOi(primeraConStock(variantes[i])); setFoto(0)
    const u = new URL(window.location.href)
    u.searchParams.set('v', variantes[i].sku)
    window.history.replaceState(window.history.state, '', u)
  }

  // grupos de opciones (color, medida, talle…) con sus valores en el orden en que aparecen
  const grupos = useMemo(() => {
    const g = new Map<string, string[]>()
    for (const x of variantes) for (const [k, val] of Object.entries(x.opciones)) {
      if (!g.has(k)) g.set(k, [])
      if (!g.get(k)!.includes(val)) g.get(k)!.push(val)
    }
    return [...g.entries()]
  }, [variantes])

  function elegirOpcion(clave: string, valor: string) {
    const deseadas = { ...v.opciones, [clave]: valor }
    const exacta = variantes.findIndex((x) => Object.entries(deseadas).every(([k, val]) => x.opciones[k] === val))
    elegirVariante(exacta >= 0 ? exacta : variantes.findIndex((x) => x.opciones[clave] === valor))
  }

  const nombreValor = (clave: string, valor: string) => (clave === 'color' ? NOMBRE_COLOR[valor]?.[idioma] ?? valor : valor)
  const disponible = (clave: string, valor: string) => variantes.some((x) => x.opciones[clave] === valor && x.ofertas.some((o) => o.stock > 0))

  return (
    <>
      <div className={s.ficha}>
        {/* ---------------------------------------------------------------- galería */}
        <section className={s.galeria} aria-label={t('galeria')}>
          <div className={s.miniaturas}>
            {v.imagenes.map((img, i) => (
              <button key={img} type="button" aria-current={i === foto_} aria-label={t('foto', { n: i + 1, total: v.imagenes.length })}
                onClick={() => setFoto(i)}>
                <Image src={foto(img)} alt="" width={64} height={64} sizes="64px" />
              </button>
            ))}
          </div>
          <Lupa src={foto(v.imagenes[foto_] ?? v.imagenes[0])} alt={titulo} etiqueta={t('ampliar')} descuento={oferta?.descuento ?? 0} />
          <div className={s.carrusel}>
            {v.imagenes.map((img, i) => (
              <Image key={img} src={foto(img)} alt={i === 0 ? titulo : ''} width={480} height={480} sizes="88vw" loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} />
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- información y opciones */}
        <div className={s.info}>
          {info}
          {grupos.map(([clave, valores]) => (
            <fieldset key={clave} className={s.opciones}>
              <legend>{t(`opcionNombre.${clave}` as 'opcionNombre.color')}: <b>{nombreValor(clave, v.opciones[clave])}</b></legend>
              <div>
                {valores.map((val) => {
                  const activa = v.opciones[clave] === val
                  return (
                    <button key={val} type="button" aria-pressed={activa} className={clave === 'color' ? s.color : s.opcion}
                      onClick={() => elegirOpcion(clave, val)} data-agotada={!disponible(clave, val)}
                      aria-label={clave === 'color' ? nombreValor(clave, val) : undefined}>
                      {clave === 'color'
                        ? <span className={s.muestra} style={{ background: NOMBRE_COLOR[val]?.hex ?? '#ccc' }} />
                        : val}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>

        {/* ---------------------------------------------------------------- caja de compra */}
        <aside className={s.caja} aria-label={t('vendido')}>
          {oferta ? (
            <>
              <p className={`precio ${s.precio}`}>
                <span className="sr-only">{tp('precio')}: </span>{oferta.precio}
                {oferta.descuento > 0 && <span className="sello sello--oferta">−{oferta.descuento} %</span>}
              </p>
              {oferta.lista && <p className={s.antes}><span className="sr-only">{tp('antes')} </span><s>{oferta.lista}</s></p>}
              {oferta.equivalencias && <p className={s.equivale}>{tp('equivale', { otros: oferta.equivalencias })}</p>}
              <p className={oferta.stock === 0 ? s.sinStock : oferta.stock <= 3 ? s.pocas : s.stock}>
                {oferta.stock === 0 ? t('sinStock') : oferta.stock <= 3 ? t('pocas', { n: oferta.stock }) : t('stock')}
              </p>
              <ul className={s.entrega}>
                {oferta.envioGratis && <li className={s.gratis}><Icono nombre="camion" tam={18} />{t('envioGratis')}</li>}
                <li><Icono nombre="mapa" tam={18} />
                  {oferta.cerca ? t('retiroHoy', { ciudad: oferta.tienda.ciudad, horas: oferta.preparacionH })
                    : t('preparacion', { ciudad: oferta.tienda.ciudad, horas: oferta.preparacionH })}
                </li>
              </ul>
              <button type="button" className="boton boton--accion boton--ancho" disabled={oferta.stock === 0}
                onClick={() => setAviso(true)} aria-describedby={aviso ? 'aviso-carrito' : undefined}>
                <Icono nombre="carrito" tam={20} />{t('agregar')}
              </button>
              <p id="aviso-carrito" className={s.aviso} role="status" hidden={!aviso}>{aviso && t('carritoPronto')}</p>
              <div className={s.vendedor}>
                <span>{t('vendido')}</span>
                <Link href={`/${idioma}/tienda/${oferta.tienda.slug}`}><b>{oferta.tienda.nombre}</b></Link>
                {oferta.tienda.recomendacion !== null && (
                  <span className={s.rep}>{t('recomienda', { n: oferta.tienda.recomendacion })}</span>
                )}
                {oferta.tienda.respuesta && <span>{t('responde', { tiempo: oferta.tienda.respuesta })}</span>}
              </div>
            </>
          ) : <p className={s.sinStock}>{t('sinStock')}</p>}
        </aside>

        {/* viñetas: debajo de las opciones en escritorio, después del precio en el celular */}
        {detalles && <div className={s.detalles}>{detalles}</div>}
      </div>

      {/* ---------------------------------------------------------------- comparar vendedores */}
      {v.ofertas.length > 1 && (
        <section className={s.vendedores} aria-labelledby="t-vendedores">
          <h2 id="t-vendedores">{t('ofertasTitulo')}</h2>
          <p className={s.subtitulo}>{t('ofertas', { n: v.ofertas.length })}</p>
          <table className={s.tabla}>
            <thead>
              <tr><th scope="col">{t('columnaTienda')}</th><th scope="col">{t('columnaPrecio')}</th><th scope="col">{t('columnaEntrega')}</th><th scope="col"><span className="sr-only">{t('verTienda')}</span></th></tr>
            </thead>
            <tbody>
              {v.ofertas.map((o, i) => (
                <tr key={o.id} aria-current={i === oi ? 'true' : undefined}>
                  <td>
                    <span className={s.logoTienda} style={{ background: o.tienda.color, color: textoSobre(o.tienda.color) }} aria-hidden="true">{o.tienda.nombre[0]}</span>
                    <span>
                      <Link href={`/${idioma}/tienda/${o.tienda.slug}`}><b>{o.tienda.nombre}</b></Link>
                      <small>{o.tienda.ciudad}{o.tienda.recomendacion !== null && ` · ${t('recomienda', { n: o.tienda.recomendacion })}`}</small>
                    </span>
                  </td>
                  <td className={s.celdaPrecio}>
                    <b className="precio">{o.precio}</b>
                    {o.masBarato && <small className={s.barato}>{t('masBarato')}</small>}
                  </td>
                  <td className={s.celdaEntrega}>
                    {o.envioGratis && <b className={s.gratis}>{t('envioGratis')}</b>}
                    <small>{o.cerca ? t('retiroHoy', { ciudad: o.tienda.ciudad, horas: o.preparacionH }) : t('preparacion', { ciudad: o.tienda.ciudad, horas: o.preparacionH })}</small>
                  </td>
                  <td>
                    <button type="button" className="boton boton--sec" aria-pressed={i === oi} disabled={o.stock === 0}
                      onClick={() => { setOi(i); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                      {i === oi ? <><Icono nombre="check" tam={16} />{t('elegida')}</> : t('elegirOferta')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}

/** Foto principal con lupa: al pasar el mouse se amplía siguiendo el puntero (en el celular, carrusel). */
function Lupa({ src, alt, etiqueta, descuento }: { src: string; alt: string; etiqueta: string; descuento: number }) {
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  return (
    <div className={s.principal} onMouseLeave={() => setZoom(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
      }}>
      <Image src={src} alt={alt} width={800} height={800} sizes="(max-width: 1100px) 45vw, 520px" loading="eager" fetchPriority="high"
        style={zoom ? { transform: 'scale(1.9)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} />
      {descuento > 0 && <span className="sello sello--oferta">−{descuento} %</span>}
      <span className={s.lupa} aria-hidden="true" title={etiqueta}><Icono nombre="buscar" tam={18} /></span>
    </div>
  )
}
