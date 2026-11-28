'use client'
// En la página de alertas: los avisos ya se leyeron, el número del encabezado se apaga sin recargar.
import { useEffect } from 'react'
import { fijarAvisos } from '@/lib/descubrir/estado'

export function AvisosLeidos() {
  useEffect(() => { fijarAvisos(0) }, [])
  return null
}
