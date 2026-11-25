import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { Encabezado } from '@/components/encabezado/Encabezado'
import { Pie } from '@/components/Pie'
import { contexto } from '@/lib/contexto'
import { IDIOMAS, LOCALE } from '@/lib/i18n/idiomas'
import { TODOS_LOS_MERCADOS } from '@/lib/region'
import '@/tokens/tokens.css'
import '../../globales.css'

// Fuentes servidas desde el repo (subconjunto latino, fase 0). next/font arma el respaldo con las mismas
// métricas, así el texto no salta cuando termina de cargar la fuente.
const titulo = localFont({ src: '../../../tokens/fuentes/schibsted.woff2', variable: '--fuente-titulo', weight: '400 900', display: 'swap' })
const texto = localFont({ src: '../../../tokens/fuentes/atkinson.woff2', variable: '--fuente-texto', weight: '200 800', display: 'swap' })

export function generateStaticParams() {
  return IDIOMAS.flatMap((idioma) => TODOS_LOS_MERCADOS.map((mercado) => ({ idioma, mercado })))
}

export const viewport: Viewport = { themeColor: '#0f3d3e' }

export async function generateMetadata(): Promise<Metadata> {
  const { idioma } = await contexto()
  const t = await getTranslations({ locale: idioma, namespace: 'meta' })
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITIO ?? 'https://triplice.vercel.app'),
    title: { default: t('titulo'), template: '%s · Tríplice' },
    description: t('descripcion'),
    openGraph: { siteName: 'Tríplice', locale: LOCALE[idioma], type: 'website' },
  }
}

// Solo los textos que usan los componentes del navegador (el resto se queda en el servidor)
const PARA_EL_NAVEGADOR = ['encabezado', 'sugerencias', 'region', 'comun', 'ficha', 'buscar', 'precio', 'error'] as const

export default async function Raiz({ children }: LayoutProps<'/[idioma]/[mercado]'>) {
  const ctx = await contexto()
  const [mensajes, t] = await Promise.all([
    getMessages({ locale: ctx.idioma }),
    getTranslations({ locale: ctx.idioma, namespace: 'comun' }),
  ])
  const cliente = Object.fromEntries(PARA_EL_NAVEGADOR.map((k) => [k, mensajes[k]]))
  return (
    <html lang={LOCALE[ctx.idioma]} className={`${titulo.variable} ${texto.variable}`}>
      <body>
        <a className="saltar" href="#contenido">{t('saltar')}</a>
        <NextIntlClientProvider locale={ctx.idioma} messages={cliente} timeZone="America/Asuncion">
          <Encabezado ctx={ctx} />
          {children}
          <Pie ctx={ctx} />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
