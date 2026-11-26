'use client'
// Foto que se pide recién cuando está por entrar en pantalla (vidrieras, carrusel de la ficha). El
// `loading="lazy"` del navegador las pide con un margen de 1.250 px o más: en el celular eso son ocho fotos
// compitiendo con las fuentes y el JavaScript antes del primer pintado. Sin JavaScript se ve igual (<noscript>).
import { useEffect, useRef, useState } from 'react'

type Props = { src: string; srcSet: string; sizes: string; width: number; height: number; alt?: string }

export function FotoDiferida({ src, srcSet, sizes, width, height, alt = '' }: Props) {
  const ref = useRef<HTMLImageElement>(null)
  const [cerca, setCerca] = useState(false)
  useEffect(() => {
    const img = ref.current
    if (!img) return
    const visor = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setCerca(true); visor.disconnect() }
    }, { rootMargin: '300px 0px' })
    visor.observe(img)
    return () => visor.disconnect()
  }, [])
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- carga diferida propia */}
      <img ref={ref} alt={alt} width={width} height={height} sizes={sizes} src={cerca ? src : undefined} srcSet={cerca ? srcSet : undefined} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <noscript><img alt={alt} width={width} height={height} sizes={sizes} src={src} srcSet={srcSet} /></noscript>
    </>
  )
}
