'use client'
// Carga diferida de las fotos de las vidrieras: el servidor las manda sin `src` (con data-src y data-srcset) y
// acá se piden recién cuando la tarjeta está por entrar en pantalla. El `loading="lazy"` del navegador las pide
// con un margen de 1.250 px o más: en el celular eso son ocho fotos compitiendo con la fuente y el JavaScript
// antes del primer pintado. Sin JavaScript se ven igual (cada una tiene su <noscript>).
import { useEffect } from 'react'

export function ImagenesDiferidas() {
  useEffect(() => {
    const cargar = (img: HTMLImageElement) => {
      if (img.dataset.srcset) img.srcset = img.dataset.srcset
      if (img.dataset.src) img.src = img.dataset.src
      img.removeAttribute('data-diferida')
    }
    const visor = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue
        visor.unobserve(e.target)
        cargar(e.target as HTMLImageElement)
      }
    }, { rootMargin: '300px 0px' })
    const observar = (raiz: ParentNode) => raiz.querySelectorAll<HTMLImageElement>('img[data-diferida]').forEach((i) => visor.observe(i))
    observar(document)
    // las páginas a las que se navega después también traen vidrieras
    const cambios = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n instanceof Element && observar(n))))
    cambios.observe(document.body, { childList: true, subtree: true })
    return () => { visor.disconnect(); cambios.disconnect() }
  }, [])
  return null
}
