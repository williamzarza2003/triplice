import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { PaginaFormulario } from '@/components/vender/PaginaFormulario'
import { contexto } from '@/lib/contexto'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'vender.form' })
  return { title: t('editar'), robots: { index: false } }
}

// una muestra para prearmar el marco (como el detalle del pedido de la cuenta); el contenido sale con la sesión
export function generateStaticParams() {
  return [{ id: '00000000-0000-4000-8000-000000000000' }]
}

export default function PaginaEditar(props: PageProps<'/[idioma]/[mercado]/vender/productos/[id]'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: 640 }} aria-hidden="true" />}><Editar {...props} /></Suspense>
}

async function Editar({ params }: PageProps<'/[idioma]/[mercado]/vender/productos/[id]'>) {
  const { id } = await params
  return <PaginaFormulario id={id} />
}
