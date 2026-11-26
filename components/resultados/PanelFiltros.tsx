'use client'
// En escritorio los filtros siempre están a la vista; en el celular se abren en una hoja desde abajo.
import { useEffect, useState } from 'react'
import { Icono } from '../Icono'
import s from './Resultados.module.css'

const EVENTO = 'triplice:abrir-filtros'

/** Botón "Filtrar" del celular (va en la barra de resultados, lejos del panel: se avisan con un evento). */
export function BotonFiltros({ texto, activos }: { texto: string; activos: number }) {
  return (
    <button type="button" className={`boton boton--sec ${s.botonFiltros}`} aria-controls="filtros"
      onClick={() => window.dispatchEvent(new Event(EVENTO))}>
      <Icono nombre="filtro" tam={18} />{texto}{activos > 0 && <span className={s.contador}>{activos}</span>}
    </button>
  )
}

type Props = { titulo: string; cerrar: string; children: React.ReactNode }

export function PanelFiltros({ titulo, cerrar, children }: Props) {
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    const abrir = () => setAbierto(true)
    window.addEventListener(EVENTO, abrir)
    return () => window.removeEventListener(EVENTO, abrir)
  }, [])
  // cada filtro elegido navega y la hoja queda abierta para seguir filtrando, con el total al día
  useEffect(() => {
    document.body.style.overflow = abierto ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [abierto])
  useEffect(() => {
    if (!abierto) return
    const cerrarConEscape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    window.addEventListener('keydown', cerrarConEscape)
    return () => window.removeEventListener('keydown', cerrarConEscape)
  }, [abierto])

  return (
    <>
      <aside id="filtros" className={s.filtros} data-abierto={abierto} aria-label={titulo}
        role={abierto ? 'dialog' : undefined} aria-modal={abierto || undefined}>
        <div className={s.filtrosCabeza}>
          <h2>{titulo}</h2>
          <button type="button" className={s.cerrarFiltros} onClick={() => setAbierto(false)} aria-label={cerrar}>
            <Icono nombre="cerrar" />
          </button>
        </div>
        {children}
        <div className={s.filtrosPie}>
          <button type="button" className="boton boton--marca boton--ancho" onClick={() => setAbierto(false)}>{cerrar}</button>
        </div>
      </aside>
      {abierto && <div className={s.velo} onClick={() => setAbierto(false)} aria-hidden="true" />}
    </>
  )
}
