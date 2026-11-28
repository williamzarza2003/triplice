// "Quienes compraron esto también compraron": el producto + el que más se llevó con él, con el total del combo y un
// botón para agregar los dos. El total lo calcula el servidor con el mismo precio de las tarjetas (con impuesto y en la
// moneda del mercado); el carrito lo vuelve a calcular con la base, como siempre. Se arma con la ficha (cacheada).
import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { categoriaDe, precio, precioNumero, ruta, type Contexto } from '@/lib/contexto'
import type { CompradosJuntos } from '@/lib/descubrir/servidor'
import { foto } from '@/lib/imagenes'
import { formatear } from '@/lib/precios'
import { comboAccion } from '@/app/[idioma]/[mercado]/descubrir/acciones'
import { Icono } from '../Icono'
import { BotonCombo } from './BotonCombo'
import s from './Descubrir.module.css'

export async function ComboJuntos({ datos, ctx }: { datos: CompradosJuntos; ctx: Contexto }) {
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'descubrir' })
  const [par, ...otros] = datos.items
  if (!par) return null
  const yo = datos.producto
  const total = precioNumero(ctx, yo.precio, categoriaDe(yo)) + precioNumero(ctx, par.precio, categoriaDe(par))
  const veces = datos.veces[par.slug]
  const r = (c: string) => ruta(ctx.idioma, c)
  const pieza = (p: typeof yo, esEste: boolean) => (
    <div className={s.pieza}>
      {p.imagen ? <Image src={foto(p.imagen)} alt="" width={96} height={96} sizes="96px" loading="lazy" /> : <span />}
      <p>
        {esEste ? <small>{t('juntosEste')}</small> : null}
        {esEste ? p.titulo : <Link href={r(`/p/${p.slug}`)}>{p.titulo}</Link>}
        <span className="precio" style={{ display: 'block' }}>{precio(ctx, p.precio, categoriaDe(p))}</span>
        <small>{p.tienda.nombre}</small>
      </p>
    </div>
  )
  return (
    <section className={`${s.juntos} fuera-de-pantalla`} aria-labelledby="t-juntos">
      <h2 id="t-juntos">{datos.fuente === 'pedidos' ? t('juntosTitulo') : t('juntosTituloCategoria')}</h2>
      <p className={s.juntosBajada}>
        {datos.fuente === 'pedidos' && veces ? t('juntosVeces', { n: veces }) : t('juntosCategoria', { categoria: datos.categoria })}
      </p>
      <div className={s.combo}>
        {pieza(yo, true)}
        <span className={s.mas} aria-hidden="true"><Icono nombre="mas" tam={18} /></span>
        {pieza(par, false)}
        <div className={s.total}>
          <p>{t('juntosTotal')}</p>
          <p className="precio">{formatear(total, ctx.moneda)}</p>
          <BotonCombo accion={comboAccion} slugs={[yo.slug, par.slug]} idioma={ctx.idioma} carrito={r('/carrito')} />
          <small>{t('juntosNota')}</small>
        </div>
      </div>
      {otros.length > 0 && (
        <ul className={s.otros} aria-label={t('juntosOtros')}>
          {otros.map((o) => (
            <li key={o.slug}><Link href={r(`/p/${o.slug}`)}>{o.titulo}</Link><span className="precio">{precio(ctx, o.precio, categoriaDe(o))}</span></li>
          ))}
        </ul>
      )}
    </section>
  )
}
