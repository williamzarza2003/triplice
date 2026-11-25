// next-intl: mensajes por idioma. Las páginas siempre pasan el idioma explícito (sale del segmento /es, /pt, /en),
// así next-intl no tiene que leer los encabezados y las páginas pueden quedar estáticas y cacheadas.
import { idioma as idiomaRaiz } from 'next/root-params'
import { getRequestConfig } from 'next-intl/server'
import { esIdioma, IDIOMA_PREDETERMINADO } from '../lib/i18n/idiomas'

// Sin locale explícito, el idioma sale del segmento raíz (next/root-params) y no de requestLocale,
// que leería los encabezados y volvería dinámica la página.
export default getRequestConfig(async ({ locale }) => {
  const pedido = locale ?? (await idiomaRaiz())
  const idioma = esIdioma(pedido) ? pedido : IDIOMA_PREDETERMINADO
  return {
    locale: idioma,
    messages: (await import(`../messages/${idioma}.json`)).default,
    timeZone: 'America/Asuncion',
  }
})
