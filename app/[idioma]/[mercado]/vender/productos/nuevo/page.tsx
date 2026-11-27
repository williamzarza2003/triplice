import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { PaginaFormulario } from '@/components/vender/PaginaFormulario'
import { contexto } from '@/lib/contexto'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'vender.form' })
  return { title: t('nuevo'), robots: { index: false } }
}

export default function PaginaNuevo() {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><PaginaFormulario id={null} /></Suspense>
}
