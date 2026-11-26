// Idioma en la URL (/es, /pt, /en) y región + moneda en una cookie.
// La gente ve /es/p/pava-electrica; por dentro se reescribe a /es/py-pyg/p/pava-electrica, así cada
// combinación de región y moneda es una página cacheable distinta y el precio sale bien desde el servidor.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { esIdioma, IDIOMA_PREDETERMINADO, type Idioma } from './lib/i18n/idiomas'
import {
  COOKIE_IDIOMA, COOKIE_MONEDA, COOKIE_REGION, esMoneda, esRegion, leerMercado, MONEDA_DE, REGION_DE_IDIOMA,
  segmentoMercado, type Region,
} from './lib/region'

/** Primer idioma que entendemos del encabezado Accept-Language, con su región si la trae ("es-AR"). */
function detectar(aceptado: string | null): { idioma: Idioma; region?: Region } {
  for (const parte of (aceptado ?? '').split(',')) {
    const [codigo] = parte.trim().toLowerCase().split(';')
    const [lengua, pais] = codigo.split('-')
    if (esIdioma(lengua)) {
      const region = pais?.toUpperCase()
      return { idioma: lengua, region: esRegion(region) && region !== 'XX' ? region : undefined }
    }
  }
  return { idioma: IDIOMA_PREDETERMINADO }
}

function dirigir(req: NextRequest) {
  const url = req.nextUrl.clone()
  const partes = url.pathname.split('/')
  const detectado = detectar(req.headers.get('accept-language'))

  if (!esIdioma(partes[1])) {
    const guardado = req.cookies.get(COOKIE_IDIOMA)?.value
    const idioma = esIdioma(guardado) ? guardado : detectado.idioma
    url.pathname = `/${idioma}${url.pathname === '/' ? '' : url.pathname}`
    return NextResponse.redirect(url)
  }

  // ya viene con el segmento interno (navegación interna o enlace directo): se respeta
  if (leerMercado(partes[2])) return NextResponse.next()

  const idioma = partes[1] as Idioma
  const regionCookie = req.cookies.get(COOKIE_REGION)?.value
  const region: Region = esRegion(regionCookie) ? regionCookie : detectado.region ?? REGION_DE_IDIOMA[idioma]
  const monedaCookie = req.cookies.get(COOKIE_MONEDA)?.value
  const moneda = esMoneda(monedaCookie) ? monedaCookie : MONEDA_DE[region]

  url.pathname = ['', idioma, segmentoMercado({ region, moneda }), ...partes.slice(2)].join('/').replace(/\/$/, '')
  return NextResponse.rewrite(url)
}

// Con Supabase, la sesión se renueva acá (los componentes de servidor no pueden escribir cookies). Solo si hay
// una cookie de sesión: los visitantes sin cuenta no pagan una consulta a Supabase Auth en cada página.
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const CLAVE_SB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function proxy(req: NextRequest) {
  const res = dirigir(req)
  if (!URL_SB || !CLAVE_SB || !req.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return res
  const sb = createServerClient(URL_SB, CLAVE_SB, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista, encabezados) => {
        for (const { name, value, options } of lista) res.cookies.set(name, value, options)
        for (const [k, v] of Object.entries(encabezados ?? {})) res.headers.set(k, v)
      },
    },
  })
  await sb.auth.getClaims()
  return res
}

export const config = {
  // todo menos la API, los archivos internos de Next y los archivos con extensión (fotos, íconos, robots.txt)
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
