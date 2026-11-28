// Marco de la cuenta: el menú es estático (se cachea igual para todos) y cada página arma su contenido con la sesión.
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MenuCuenta } from '@/components/cuenta/MenuCuenta'
import s from '@/components/cuenta/Cuenta.module.css'
import { contexto, ruta } from '@/lib/contexto'
import { salirAccion } from './acciones'

export const metadata: Metadata = { robots: { index: false } }

export default async function MarcoCuenta({ children }: LayoutProps<'/[idioma]/[mercado]/cuenta'>) {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  const ta = await getTranslations({ locale: ctx.idioma, namespace: 'admin' })
  const r = (c: string) => ruta(ctx.idioma, c)
  return (
    <div className={`contenedor ${s.marco}`}>
      <MenuCuenta idioma={ctx.idioma} hola={t('hola')} salir={t('salir')} salirAccion={salirAccion}
        admin={{ href: r('/admin'), texto: ta('menu.enlaceCuenta'), icono: 'escudo' }} enlaces={[
        { href: r('/cuenta'), texto: t('menu.pedidos'), icono: 'caja' },
        { href: r('/cuenta/listas'), texto: t('menu.listas'), icono: 'corazon' },
        { href: r('/cuenta/alertas'), texto: t('menu.alertas'), icono: 'campana' },
        { href: r('/cuenta/opiniones'), texto: t('menu.opiniones'), icono: 'estrella' },
        { href: r('/cuenta/direcciones'), texto: t('menu.direcciones'), icono: 'mapa' },
        { href: r('/cuenta/datos'), texto: t('menu.datos'), icono: 'persona' },
      ]} />
      <main id="contenido">{children}</main>
    </div>
  )
}
