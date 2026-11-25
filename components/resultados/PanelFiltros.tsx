'use client'
// En escritorio los filtros siempre están a la vista; en el celular se abren en una hoja desde abajo.
import { useEffect, useState } from 'react'
import { Icono } from '../Icono'
import s from './Resultados.module.css'

type Props = { titulo: string; abrir: string; cerrar: string; activos: number; children: React.ReactNode }

export function PanelFiltros({ titulo, abrir, cerrar, activos, children }: Props) {
  const [abierto, setAbierto] = useState(false)
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
      <button type="button" className={`boton boton--sec ${s.botonFiltros}`} aria-expanded={abierto} aria-controls="filtros"
        onClick={() => setAbierto(true)}>
        <Icono nombre="filtro" tam={18} />{abrir}{activos > 0 && <span className={s.contador}>{activos}</span>}
      </button>
      <aside id="filtros" className={s.filtros} data-abierto={abierto} aria-label={titulo}>
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
