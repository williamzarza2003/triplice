// Piezas que comparten las páginas del panel: la página para quien no es vendedor, los filtros y los avisos.
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { modoCuentas } from '@/lib/cuenta/sesion'
import { ruta } from '@/lib/contexto'
import type { Idioma } from '@/lib/i18n/idiomas'
import { entrarVendedorDemoAccion } from '@/app/[idioma]/[mercado]/vender/acciones'
import { Icono } from '../Icono'
import c from '../cuenta/Cuenta.module.css'
import s from './Vender.module.css'

/** Un comprador (o alguien sin tienda) que llega al panel: qué es esto y qué puede hacer. */
export async function NoVendedor({ idioma }: { idioma: Idioma }) {
  const t = await getTranslations({ locale: idioma, namespace: 'vender.noVendedor' })
  return (
    <section className={`panel ${c.vacio}`} aria-labelledby="t-no-vendedor">
      <h1 id="t-no-vendedor" className={s.panelTitulo}>{t('titulo')}</h1>
      <p>{t('texto')}</p>
      {modoCuentas === 'demo' && (
        <>
          <p>{t('demo')}</p>
          <form action={entrarVendedorDemoAccion}>
            <input type="hidden" name="idioma" value={idioma} />
            <button type="submit" className="boton boton--marca">{t('boton')}</button>
          </form>
        </>
      )}
      <Link href={ruta(idioma, '/cuenta')}>{t('volver')}</Link>
    </section>
  )
}

/** Filtros como enlaces (funcionan sin JavaScript y se pueden compartir): el actual va marcado. */
export function Filtros({ etiqueta, opciones, locale }: {
  etiqueta: string; locale: string; opciones: { href: string; texto: string; n?: number; actual: boolean }[]
}) {
  const numero = new Intl.NumberFormat(locale)
  return (
    <nav aria-label={etiqueta}>
      <ul className={s.filtros}>
        {opciones.map((o) => (
          <li key={o.href}>
            <Link href={o.href} aria-current={o.actual ? 'page' : undefined} scroll={false}>
              {o.texto}{o.n !== undefined && <small>{numero.format(o.n)}</small>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function Aviso({ texto, enlace }: { texto: string; enlace?: { href: string; texto: string } }) {
  return (
    <p className={s.aviso} role="status">
      <Icono nombre="check" tam={18} />
      <span>{texto}</span>
      {enlace && <Link href={enlace.href}>{enlace.texto}</Link>}
    </p>
  )
}

export function Alerta({ texto }: { texto: string }) {
  return <p className={s.alerta} role="alert"><Icono nombre="info" tam={18} /><span>{texto}</span></p>
}
