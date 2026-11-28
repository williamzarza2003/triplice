'use client'
// Un enlace para compartir: el campo se puede seleccionar a mano (sin JavaScript también) y el botón lo copia.
// En el servidor sale con la dirección pública del sitio; en el navegador, con la de donde se está mirando (así la
// vista previa de una rama comparte su propia dirección).
import { useEffect, useState } from 'react'
import { Icono } from '../Icono'

type Props = { base: string; camino: string; etiqueta: string; copiar: string; copiado: string; className?: string; id: string }

export function CopiarEnlace({ base, camino, etiqueta, copiar, copiado, className, id }: Props) {
  const [listo, setListo] = useState(false)
  const [url, setUrl] = useState(`${base}${camino}`)
  useEffect(() => {
    const cuadro = requestAnimationFrame(() => setUrl(`${location.origin}${camino}`))
    return () => cancelAnimationFrame(cuadro)
  }, [camino])
  return (
    <div className={className}>
      <label htmlFor={id}>{etiqueta}</label>
      <div>
        <input id={id} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="boton boton--sec" onClick={async () => {
          try { await navigator.clipboard.writeText(url); setListo(true); setTimeout(() => setListo(false), 2500) } catch { setListo(false) }
        }}>
          <Icono nombre={listo ? 'check' : 'enlace'} tam={18} />{listo ? copiado : copiar}
        </button>
      </div>
      <span className="sr-only" role="status">{listo ? copiado : ''}</span>
    </div>
  )
}
