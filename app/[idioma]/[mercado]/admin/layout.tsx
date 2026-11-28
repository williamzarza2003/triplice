// Marco del panel de administración: el mismo esqueleto que la cuenta y el panel del vendedor (menú estático que se
// cachea igual para todos; cada página arma su contenido con la sesión y la base decide si es admin). Nada de /admin
// se indexa.
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import s from '@/components/cuenta/Cuenta.module.css'
import { MenuVender } from '@/components/vender/MenuVender'
import { contexto, ruta } from '@/lib/contexto'
import { salirAccion } from '../cuenta/acciones'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function MarcoAdmin({ children }: LayoutProps<'/[idioma]/[mercado]/admin'>) {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'admin' })
  const tc = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  const r = (c: string) => ruta(ctx.idioma, c)
  return (
    <div className={`contenedor ${s.marco}`}>
      <MenuVender idioma={ctx.idioma} titulo={t('menu.etiqueta')} hola={tc('hola')} salir={t('menu.salir')} salirAccion={salirAccion} enlaces={[
        { href: r('/admin'), texto: t('menu.resumen'), icono: 'grafico' },
        { href: r('/admin/tiendas'), texto: t('menu.tiendas'), icono: 'tienda' },
        { href: r('/admin/moderacion'), texto: t('menu.moderacion'), icono: 'escudo' },
        { href: r('/admin/categorias'), texto: t('menu.categorias'), icono: 'filtro' },
        { href: r('/admin/impuestos'), texto: t('menu.impuestos'), icono: 'info' },
        { href: r('/admin/cotizaciones'), texto: t('menu.cotizaciones'), icono: 'globo' },
        { href: r('/admin/registro'), texto: t('menu.registro'), icono: 'reloj' },
      ]} />
      <main id="contenido">{children}</main>
    </div>
  )
}
