// Simulador de pago: solo existe mientras la vista previa no tenga claves de prueba de Stripe. No pide datos de
// tarjeta: se elige el resultado de la prueba (aprobada o rechazada), como las tarjetas 4242… y 4000…0002 de Stripe.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { Simulador } from '@/components/compra/Simulador'
import s from '@/components/compra/Compra.module.css'
import { proveedorDePago } from '@/lib/compra/pago'
import { leerPedido } from '@/lib/compra/pedido'
import { contexto, ruta } from '@/lib/contexto'
import { formatear } from '@/lib/precios'
import type { Moneda } from '@/lib/region'
import { simularPagoAccion } from '../acciones'

// El título va en la metadata (con el idioma de la URL): un <title> dentro del contenido dinámico no reemplaza al del layout
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'pagar' })
  return { title: t('simuladorTitulo'), robots: { index: false } }
}

export default function PaginaSimulador() {
  return (
    <main id="contenido" className="contenedor">
      <Suspense fallback={<div className={s.cargando} aria-hidden="true" />}><Contenido /></Suspense>
    </main>
  )
}

async function Contenido() {
  await connection() // se arma en cada visita
  const pedido = await leerPedido()
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'pagar' })
  if (!pedido || proveedorDePago() !== 'simulado') redirect(ruta(ctx.idioma, '/carrito'))
  if (pedido.estado === 'confirmado') redirect(ruta(ctx.idioma, `/pedido/${pedido.numero}`))
  return (
    <>
      <h1 className={s.titulo}>{t('simuladorTitulo')}</h1>
      <Simulador accion={simularPagoAccion} textos={{
        explicacion: t('simuladorTexto'), pedido: t('simuladorPedido', { numero: pedido.numero }),
        total: formatear(pedido.desglose.total, pedido.moneda as Moneda), aprobada: t('simuladorAprobada'),
        rechazada: t('simuladorRechazada'), rechazo: t('simuladorRechazo'), volver: t('simuladorVolver'), volverHref: ruta(ctx.idioma, '/pagar'),
      }} />
    </>
  )
}
