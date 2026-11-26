'use client'
// Búsqueda instantánea: a partir de la segunda letra pide sugerencias (productos y categorías) a /api/sugerir,
// que corre la misma búsqueda tolerante a errores que la página de resultados.
// Es un combobox accesible: flechas para moverse, Enter para ir, Escape para cerrar.
import { useEffect, useId, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTextos } from '@/lib/i18n/textos'
import type { Sugerencias } from '@/lib/datos/tipos'
import type { Idioma } from '@/lib/i18n/idiomas'
import { foto } from '@/lib/imagenes'
import { precioFinal, reglaDe, type Impuestos } from '@/lib/compra/impuestos'
import { formatear, type Tasas } from '@/lib/precios'
import type { Moneda } from '@/lib/region'
import { Icono } from '../Icono'
import s from './Buscador.module.css'

type Opcion = { href: string; clave: string }

export function Buscador({ idioma, moneda, tasas, impuestos }: { idioma: Idioma; moneda: Moneda; tasas: Tasas; impuestos: Impuestos }) {
  const t = useTextos('encabezado')
  const ts = useTextos('sugerencias')
  const router = useRouter()
  const id = useId()
  const [q, setQ] = useState('')
  const [datos, setDatos] = useState<Sugerencias | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(-1)
  const [cargando, setCargando] = useState(false)
  const pedido = useRef<AbortController | null>(null)

  const termino = q.trim()
  useEffect(() => {
    if (termino.length < 2) {
      pedido.current?.abort()
      return
    }
    const espera = setTimeout(async () => {
      pedido.current?.abort()
      const control = new AbortController()
      pedido.current = control
      setCargando(true)
      try {
        const r = await fetch(`/api/sugerir?q=${encodeURIComponent(termino)}&idioma=${idioma}`, { signal: control.signal })
        if (r.ok) {
          setDatos(await r.json())
          setActiva(-1)
        }
      } catch {
        /* se canceló porque la persona siguió escribiendo */
      } finally {
        if (!control.signal.aborted) setCargando(false)
      }
    }, 120)
    return () => clearTimeout(espera)
  }, [termino, idioma])

  const buscarTodo = `/${idioma}/buscar?q=${encodeURIComponent(termino)}`
  const visibles = termino.length >= 2 && datos ? datos : null
  const opciones: Opcion[] = visibles
    ? [
        ...visibles.categorias.map((c) => ({ clave: `c-${c.slug}`, href: `/${idioma}/buscar?q=${encodeURIComponent(termino)}&categoria=${c.slug}` })),
        ...visibles.productos.map((p) => ({ clave: `p-${p.slug}`, href: `/${idioma}/p/${p.slug}` })),
        { clave: 'todo', href: buscarTodo },
      ]
    : []
  const mostrar = abierto && termino.length >= 2 && (visibles !== null || cargando)
  const idOpcion = (i: number) => `${id}-op-${i}`

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && opciones.length) {
      e.preventDefault()
      setAbierto(true)
      setActiva((i) => (i + 1) % opciones.length)
    } else if (e.key === 'ArrowUp' && opciones.length) {
      e.preventDefault()
      setActiva((i) => (i <= 0 ? opciones.length - 1 : i - 1))
    } else if (e.key === 'Escape') {
      setAbierto(false)
      setActiva(-1)
    } else if (e.key === 'Enter' && activa >= 0 && opciones[activa]) {
      e.preventDefault()
      setAbierto(false)
      router.push(opciones[activa].href)
    }
  }

  let i = -1
  return (
    <form className={s.buscador} role="search" action={`/${idioma}/buscar`}
      onSubmit={(e) => {
        if (!termino) e.preventDefault()
        setAbierto(false)
      }}>
      <label className="sr-only" htmlFor={`${id}-q`}>{t('buscarEtiqueta')}</label>
      <input id={`${id}-q`} name="q" type="search" value={q} placeholder={t('buscarPlaceholder')} autoComplete="off"
        role="combobox" aria-expanded={mostrar} aria-controls={`${id}-lista`} aria-autocomplete="list"
        aria-activedescendant={mostrar && activa >= 0 ? idOpcion(activa) : undefined}
        onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={teclado} />
      <button className={s.boton} type="submit" aria-label={t('botonBuscar')}><Icono nombre="buscar" /></button>

      <ul id={`${id}-lista`} className={s.lista} role="listbox" hidden={!mostrar} aria-label={t('buscarEtiqueta')}>
        {!visibles && cargando && <li className={s.vacio} role="presentation">{ts('buscando')}</li>}
        {visibles?.corregido && <li className={s.aviso} role="presentation">{ts('quisisteDecir', { c: visibles.corregido })}</li>}
        {visibles?.categorias.map((c) => {
          i++
          const n = i
          return (
            <li key={c.slug} id={idOpcion(n)} role="option" aria-selected={activa === n}>
              <a href={opciones[n].href} className={s.opcion} tabIndex={-1}
                onMouseDown={(e) => { e.preventDefault(); router.push(opciones[n].href); setAbierto(false) }}>
                <Icono nombre="buscar" tam={16} />
                <span><b>{termino}</b> {ts('enCategoria', { categoria: c.nombre })}</span>
              </a>
            </li>
          )
        })}
        {visibles?.productos.map((p) => {
          i++
          const n = i
          return (
            <li key={p.slug} id={idOpcion(n)} role="option" aria-selected={activa === n}>
              <a href={opciones[n].href} className={s.opcion} tabIndex={-1}
                onMouseDown={(e) => { e.preventDefault(); router.push(opciones[n].href); setAbierto(false) }}>
                {p.imagen ? <Image src={foto(p.imagen)} alt="" width={40} height={40} sizes="40px" /> : <span className={s.sinFoto} />}
                <span className={s.titulo}>{p.titulo}</span>
                <span className={s.precio}>{formatear(precioFinal(p.precio, reglaDe(impuestos, { sub: p.categoria_slug, padre: p.categoria_padre }).tasa, moneda, tasas), moneda)}</span>
              </a>
            </li>
          )
        })}
        {visibles && visibles.productos.length === 0 && visibles.categorias.length === 0 && (
          <li className={s.vacio} role="presentation">{ts('vacio', { q: termino })}</li>
        )}
        {visibles && (
          <li id={idOpcion(opciones.length - 1)} role="option" aria-selected={activa === opciones.length - 1}>
            <a href={buscarTodo} className={`${s.opcion} ${s.todo}`} tabIndex={-1}
              onMouseDown={(e) => { e.preventDefault(); router.push(buscarTodo); setAbierto(false) }}>
              {ts('verTodos', { q: termino })}
            </a>
          </li>
        )}
      </ul>
    </form>
  )
}
