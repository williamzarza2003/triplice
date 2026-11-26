import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { categorias } from '@/lib/datos/consultas'
import { ruta, type Contexto } from '@/lib/contexto'
import { Icono } from '../Icono'
import { BotonCarrito } from './BotonCarrito'
import { BotonCuenta } from './BotonCuenta'
import { Buscador } from './Buscador'
import { MenuCategorias } from './MenuCategorias'
import { SelectorRegion } from './SelectorRegion'
import s from './Encabezado.module.css'

export async function Encabezado({ ctx }: { ctx: Contexto }) {
  const [t, tc, arbol] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'encabezado' }),
    getTranslations({ locale: ctx.idioma, namespace: 'comun' }),
    categorias(ctx.idioma),
  ])
  return (
    <header className={s.encabezado}>
      <p className={s.aviso}>{tc('avisoDemo')}</p>
      <div className={`contenedor ${s.fila}`}>
        <MenuCategorias etiqueta={t('abrirCategorias')} />
        <Link className={s.logo} href={ruta(ctx.idioma)} aria-label={t('inicioMarca')}>
          <Image src="/marca/logotipo-claro.svg" alt="" width={132} height={37} loading="eager" unoptimized />
        </Link>
        <Buscador idioma={ctx.idioma} moneda={ctx.moneda} tasas={ctx.tasas} impuestos={ctx.impuestos} />
        <SelectorRegion idioma={ctx.idioma} region={ctx.region} moneda={ctx.moneda} />
        <BotonCuenta idioma={ctx.idioma} entrar={t('entrar')} hola={t('hola')} tuCuenta={t('tuCuenta')} />
        <BotonCarrito href={ruta(ctx.idioma, '/carrito')} etiqueta={t('carrito')} etiquetaCon={t.raw('carritoCon') as string} />
      </div>
      <nav id="categorias" className={s.categorias} aria-label={t('categorias')}>
        <div className={`contenedor ${s.categoriasFila}`}>
          <Link href={ruta(ctx.idioma, '/buscar')} className={s.todas}>
            <Icono nombre="menu" tam={16} />{t('todas')}
          </Link>
          <Link href={ruta(ctx.idioma, '/cuenta')} className={s.soloCelular}><Icono nombre="persona" tam={16} />{t('tuCuenta')}</Link>
          <Link href={ruta(ctx.idioma, '/buscar?orden=vendidos')}>{t('masVendidos')}</Link>
          {arbol.map((c) => (
            <Link key={c.slug} href={ruta(ctx.idioma, `/c/${c.slug}`)}>{c.nombre}</Link>
          ))}
        </div>
      </nav>
    </header>
  )
}
