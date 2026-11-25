import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Grilla } from '@/components/grilla/Grilla'
import { Icono } from '@/components/Icono'
import { MapaFrontera } from '@/components/inicio/MapaFrontera'
import { PaisesPortada } from '@/components/inicio/PaisesPortada'
import { contexto, precio, ruta } from '@/lib/contexto'
import { categorias, inicio } from '@/lib/datos/consultas'
import { foto } from '@/lib/imagenes'
import { descuento } from '@/lib/precios'
import s from './inicio.module.css'

export default async function Inicio() {
  const ctx = await contexto()
  const [t, tc, datos, arbol] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'inicio' }),
    getTranslations({ locale: ctx.idioma, namespace: 'comun' }),
    inicio(ctx.idioma, ctx.region),
    categorias(ctx.idioma),
  ])
  const destacada = datos.ofertas[0]
  const ofertas = datos.ofertas.slice(1, 7)
  const r = (camino: string) => ruta(ctx.idioma, camino)

  return (
    <main id="contenido" className="contenedor">
      <section className={s.portada} aria-labelledby="titulo-portada">
        <div className={s.mapa}>
          <MapaFrontera region={ctx.region} nombres={{ PY: tc('paises.PY'), BR: tc('paises.BR'), AR: tc('paises.AR') }} />
          <h1 id="titulo-portada">{t('titulo')}</h1>
          <p>{t('bajada')}</p>
          <PaisesPortada region={ctx.region} textos={{ actual: t('comprasDesde'), otro: t('comprarDesde') }}
            nombres={{ PY: tc('paises.PY'), BR: tc('paises.BR'), AR: tc('paises.AR') }} />
        </div>

        {destacada && (
          <article className={s.destacada} aria-labelledby="titulo-destacada">
            <h2 id="titulo-destacada">{t('ofertaDelDia')}</h2>
            {destacada.imagen && (
              <Image src={foto(destacada.imagen)} alt="" width={480} height={480} sizes="(max-width: 860px) 60vw, 300px" priority />
            )}
            <div>
              <p className={s.destacadaTitulo}><Link href={r(`/p/${destacada.slug}`)}>{destacada.titulo}</Link></p>
              <p className="precio">
                {precio(ctx, destacada.precio)}{' '}
                <span className="sello sello--oferta">−{descuento(destacada.precio, destacada.precio_lista)} %</span>
              </p>
              {destacada.precio_lista && <p className={s.antes}><s>{precio(ctx, destacada.precio_lista)}</s> · {destacada.tienda.nombre}</p>}
            </div>
          </article>
        )}
      </section>

      <nav className={s.atajos} aria-label={t('atajos')}>
        {arbol.slice(0, 7).map((c) => (
          <Link key={c.slug} className={s.atajo} href={r(`/c/${c.slug}`)}>
            <Icono nombre={c.icono} tam={26} />{c.nombre}
          </Link>
        ))}
        <Link className={s.atajo} href={r('/buscar')}><Icono nombre="menu" tam={26} />{tc('verTodo')}</Link>
      </nav>

      <section className="seccion" aria-labelledby="t-ofertas">
        <div className="seccion__cabeza">
          <h2 id="t-ofertas">{t('ofertas')}</h2>
          <Link href={r('/buscar?ofertas=1')}>{t('verOfertas')}</Link>
        </div>
        <Grilla items={ofertas} ctx={ctx} fila prioridad={6} />
      </section>

      <section className="seccion" aria-labelledby="t-vendidos">
        <div className="seccion__cabeza">
          <h2 id="t-vendidos">{t('vendidos')}</h2>
          <Link href={r('/buscar?orden=vendidos')}>{t('verVendidos')}</Link>
        </div>
        <Grilla items={datos.vendidos.slice(0, 6)} ctx={ctx} fila />
      </section>

      <section className="seccion" aria-labelledby="t-cerca">
        <div className="seccion__cabeza">
          <h2 id="t-cerca">{ctx.region === 'XX' ? t('cercaInternacional') : t('cerca', { pais: tc(`paises.${ctx.region}`) })}</h2>
          <Link href={r('/buscar?orden=calificacion')}>{t('verCerca')}</Link>
        </div>
        <Grilla items={datos.cerca.slice(0, 6)} ctx={ctx} fila />
      </section>

      <section className="seccion" aria-labelledby="t-tiendas">
        <div className="seccion__cabeza"><h2 id="t-tiendas">{t('tiendas')}</h2></div>
        <ul className={s.tiendas}>
          {datos.tiendas.map((x) => (
            <li key={x.slug}>
              <Link href={r(`/tienda/${x.slug}`)} className={s.tienda}>
                <span className={s.logoTienda} style={{ background: x.color }} aria-hidden="true">
                  {x.nombre.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </span>
                <span>
                  <b>{x.nombre}</b>
                  <small>{x.ciudad} · {tc(`paises.${x.pais}`)}</small>
                  <small className={s.rep}>{t('recomienda', { n: Number(x.recomendacion) })}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="seccion" aria-labelledby="t-novedades">
        <div className="seccion__cabeza">
          <h2 id="t-novedades">{t('novedades')}</h2>
          <Link href={r('/buscar?orden=novedades')}>{t('verNovedades')}</Link>
        </div>
        <Grilla items={datos.novedades.slice(0, 6)} ctx={ctx} fila />
      </section>

      <section className={s.confianza} aria-label={t('confianza')}>
        <div><Icono nombre="tienda" tam={28} /><span><b>{t('confianza1Titulo')}</b><p>{t('confianza1')}</p></span></div>
        <div><Icono nombre="globo" tam={28} /><span><b>{t('confianza2Titulo')}</b><p>{t('confianza2')}</p></span></div>
        <div><Icono nombre="conversa" tam={28} /><span><b>{t('confianza3Titulo')}</b><p>{t('confianza3')}</p></span></div>
      </section>
    </main>
  )
}
