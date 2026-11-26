import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ruta, type Contexto } from '@/lib/contexto'
import { categorias } from '@/lib/datos/consultas'
import { origenDatos } from '@/lib/datos/fuente'
import s from './Pie.module.css'

const REPO = 'https://github.com/williamzarza2003/triplice'

export async function Pie({ ctx }: { ctx: Contexto }) {
  const [t, te, arbol] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'pie' }),
    getTranslations({ locale: ctx.idioma, namespace: 'encabezado' }),
    categorias(ctx.idioma),
  ])
  const mitad = Math.ceil(arbol.length / 2)
  return (
    <footer className={s.pie}>
      <div className={`contenedor ${s.grilla}`}>
        <div>
          <Image src="/marca/logotipo-claro.svg" alt="Tríplice" width={132} height={37} unoptimized />
          <p className={s.lema}>{t('lema')}</p>
        </div>
        <nav aria-label={t('comprar')}>
          <h2>{t('comprar')}</h2>
          <Link href={ruta(ctx.idioma, '/buscar')}>{te('todas')}</Link>
          <Link href={ruta(ctx.idioma, '/buscar?orden=vendidos')}>{te('masVendidos')}</Link>
          {arbol.slice(0, mitad).map((c) => <Link key={c.slug} href={ruta(ctx.idioma, `/c/${c.slug}`)}>{c.nombre}</Link>)}
        </nav>
        <nav aria-label={t('categorias')}>
          <h2>{t('categorias')}</h2>
          {arbol.slice(mitad).map((c) => <Link key={c.slug} href={ruta(ctx.idioma, `/c/${c.slug}`)}>{c.nombre}</Link>)}
        </nav>
        <div>
          <h2>{t('proyecto')}</h2>
          <a href={REPO}>{t('codigo')}</a>
          <a href={`${REPO}/blob/fase-2/docs/arquitectura.md`}>{t('arquitectura')}</a>
          <p className={s.fase}>{t('fase')}</p>
        </div>
      </div>
      <p className={`contenedor ${s.legal}`}>
        {t('legal')} {t('datos', { origen: origenDatos === 'supabase' ? 'Supabase' : 'PostgreSQL (PGlite)' })}
      </p>
    </footer>
  )
}
