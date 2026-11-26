// Tarjeta de producto: mucha información en tres niveles de lectura (qué es → cuánto → quién y desde dónde),
// sin verse recargada. Toda la tarjeta es un enlace (el del título se estira con ::after).
import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { categoriaDe, precio, ruta, type Contexto } from '@/lib/contexto'
import type { TarjetaDatos } from '@/lib/datos/tipos'
import { ANCHOS, foto } from '@/lib/imagenes'
import { descuento } from '@/lib/precios'
import { FotoDiferida } from '../FotoDiferida'
import { Icono } from '../Icono'
import { Estrellas } from '../Estrellas'
import s from './Tarjeta.module.css'

type Props = { p: TarjetaDatos; ctx: Contexto; nivel?: 2 | 3 | 4; prioridad?: 'alta' | 'eager' | false; diferida?: boolean }

const TAMANOS = '(max-width: 860px) 46vw, (max-width: 1100px) 23vw, 200px'
const juego = (img: string) => ANCHOS.map((a) => `${foto(img)}-${a}.webp ${a}w`).join(', ')

export async function Tarjeta({ p, ctx, nivel = 3, prioridad = false, diferida = false }: Props) {
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'tarjeta' })
  const tc = await getTranslations({ locale: ctx.idioma, namespace: 'comun' })
  const tp = await getTranslations({ locale: ctx.idioma, namespace: 'precio' })
  const desc = descuento(p.precio, p.precio_lista)
  const href = ruta(ctx.idioma, `/p/${p.slug}`)
  const Titulo = `h${nivel}` as const
  const cerca = p.tienda.pais === ctx.region
  return (
    <article className={s.tarjeta}>
      <Link className={s.foto} href={href} tabIndex={-1} aria-hidden="true">
        {p.imagen && diferida && (
          <FotoDiferida width={240} height={240} sizes={TAMANOS} src={`${foto(p.imagen)}-480.webp`} srcSet={juego(p.imagen)} />
        )}
        {p.imagen && !diferida && (
          <Image src={foto(p.imagen)} alt="" width={240} height={240} sizes={TAMANOS}
            loading={prioridad ? 'eager' : 'lazy'} fetchPriority={prioridad === 'alta' ? 'high' : 'auto'} />
        )}
        {desc > 0 && <span className={`sello sello--oferta ${s.sello}`}>−{desc} %</span>}
        {p.condicion !== 'nuevo' && <span className={`sello sello--neutro ${s.condicion}`}>{tc(`condicion.${p.condicion}`)}</span>}
      </Link>
      <div className={s.cuerpo}>
        <Titulo className={s.titulo}><Link href={href}>{p.titulo}</Link></Titulo>
        <Estrellas valor={Number(p.promedio)} n={p.resenas} coma={ctx.idioma !== 'en'} etiqueta={p.resenas
          ? t('estrellas', { valor: Number(p.promedio).toLocaleString(ctx.idioma), n: p.resenas })
          : t('sinOpiniones')} />
        <p className={`precio ${s.precio}`}>
          <span className="sr-only">{tp('precio')}: </span>{precio(ctx, p.precio, categoriaDe(p))}
          {desc > 0 && p.precio_lista && (
            <s className={s.antes}><span className="sr-only">{tp('antes')} </span>{precio(ctx, p.precio_lista, categoriaDe(p))}</s>
          )}
        </p>
        {p.envio_gratis
          ? <p className={`${s.linea} ${s.envio}`}><Icono nombre="camion" tam={16} />{t('envioGratis')}</p>
          : <p className={s.linea}><Icono nombre="mapa" tam={16} />{cerca ? t('retiroHoy', { ciudad: p.tienda.ciudad }) : t('desde', { ciudad: p.tienda.ciudad })}</p>}
        <p className={s.tienda}>
          {p.tienda.nombre}
          {p.ofertas > 1 && <span className={s.mas}> · {t('mas', { n: p.ofertas - 1 })}</span>}
        </p>
        {p.stock > 0 && p.stock <= 3 && <p className={s.ultimas}>{t('ultimas', { n: p.stock })}</p>}
      </div>
    </article>
  )
}
