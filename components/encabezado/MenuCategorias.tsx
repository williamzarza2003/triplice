'use client'
// Botón de categorías del celular: abre y cierra la barra de categorías (que en escritorio siempre se ve).
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Icono } from '../Icono'
import s from './MenuCategorias.module.css'

export function MenuCategorias({ etiqueta }: { etiqueta: string }) {
  const camino = usePathname()
  // se guarda en qué página se abrió: al navegar a otra, queda cerrado solo
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null)
  const abierto = abiertoEn === camino

  useEffect(() => {
    document.getElementById('categorias')?.setAttribute('data-abierto', String(abierto))
  }, [abierto])

  return (
    <button type="button" className={s.boton} aria-label={etiqueta} aria-expanded={abierto} aria-controls="categorias"
      onClick={() => setAbiertoEn(abierto ? null : camino)}>
      <Icono nombre={abierto ? 'cerrar' : 'menu'} />
    </button>
  )
}
