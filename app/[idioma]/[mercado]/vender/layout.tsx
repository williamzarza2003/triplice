// Marco del panel del vendedor: el menú es estático (se cachea igual para todos) y cada página arma su contenido con
// la sesión. Mismo esqueleto que la cuenta del comprador, para que el que vende y compra no tenga que aprender dos.
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import s from '@/components/cuenta/Cuenta.module.css'
import { MenuVender } from '@/components/vender/MenuVender'
import { contexto, ruta } from '@/lib/contexto'
import { salirAccion } from '../cuenta/acciones'

export const metadata: Metadata = { robots: { index: false } }

export default async function MarcoVender({ children }: LayoutProps<'/[idioma]/[mercado]/vender'>) {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'vender' })
  const tc = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  const r = (c: string) => ruta(ctx.idioma, c)
  return (
    <div className={`contenedor ${s.marco}`}>
      <MenuVender idioma={ctx.idioma} titulo={t('menu.etiqueta')} hola={tc('hola')} salir={t('menu.salir')} salirAccion={salirAccion} enlaces={[
        { href: r('/vender'), texto: t('menu.resumen'), icono: 'grafico' },
        { href: r('/vender/pedidos'), texto: t('menu.pedidos'), icono: 'caja' },
        { href: r('/vender/productos'), texto: t('menu.productos'), icono: 'tienda' },
        { href: r('/vender/preguntas'), texto: t('menu.preguntas'), icono: 'conversa' },
      ]} />
      <main id="contenido">{children}</main>
    </div>
  )
}
