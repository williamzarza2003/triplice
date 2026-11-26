// Guarda una preferencia (región, moneda, idioma) en una cookie que lee proxy.ts. Dura un año.
import { COOKIE_IDIOMA, COOKIE_MONEDA, COOKIE_REGION } from './region'

const UN_ANIO = 60 * 60 * 24 * 365

export function guardarPreferencias(p: { region?: string; moneda?: string; idioma?: string }) {
  const pares: [string, string | undefined][] = [[COOKIE_REGION, p.region], [COOKIE_MONEDA, p.moneda], [COOKIE_IDIOMA, p.idioma]]
  for (const [nombre, valor] of pares) {
    if (valor) document.cookie = `${nombre}=${encodeURIComponent(valor)}; path=/; max-age=${UN_ANIO}; samesite=lax`
  }
}
