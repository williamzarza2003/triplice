// Resumen de la compra (carrito, pago y comprobante). Solo muestra: los montos vienen calculados del servidor.
import { getTranslations } from 'next-intl/server'
import type { Desglose } from '@/lib/compra/desglose'
import type { Idioma } from '@/lib/i18n/idiomas'
import { formatear } from '@/lib/precios'
import s from './Compra.module.css'

type Props = {
  d: Desglose
  idioma: Idioma
  unidades: number
  /** el envío todavía no se eligió (en el carrito) */
  envioPendiente?: boolean
  cupon?: string | null
  /** en Internacional no hay impuestos locales: se avisa en vez de desglosarlos */
  sinImpuestos?: boolean
}

export async function Resumen({ d, idioma, unidades, envioPendiente = false, cupon = null, sinImpuestos = false }: Props) {
  const t = await getTranslations({ locale: idioma, namespace: 'compra' })
  const f = (n: number) => formatear(n, d.moneda)
  return (
    <>
      <dl className={s.desglose}>
        <dt>{t('productos', { n: unidades })}</dt><dd>{f(d.productos)}</dd>
        {d.descuento > 0 && <><dt>{t('cupon', { codigo: cupon ?? '' })}</dt><dd className={s.ahorro}>− {f(d.descuento)}</dd></>}
        <dt>{t('envio')}</dt>
        <dd>{envioPendiente ? <small>{t('envioPendiente')}</small> : d.envio === 0 ? <span className={s.gratis}>{t('gratis')}</span> : f(d.envio)}</dd>
        <dt className={s.total}>{envioPendiente ? t('totalSinEnvio') : t('total')}</dt><dd className={s.total}>{f(d.total)}</dd>
      </dl>
      {d.impuestos.length > 0 && (
        <p className={s.incluye}>{t('incluye', { lista: d.impuestos.map((x) => `${x.nombre}: ${f(x.monto)}`).join(' · ') })}</p>
      )}
      {sinImpuestos && <p className={s.incluye}>{t('sinImpuestos')}</p>}
    </>
  )
}
