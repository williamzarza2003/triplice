import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { contexto, ruta } from '@/lib/contexto'

export default async function NoEncontrado() {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'error' })
  const te = await getTranslations({ locale: ctx.idioma, namespace: 'encabezado' })
  return (
    <main id="contenido" className="contenedor" style={{ paddingTop: 'var(--e-10)' }}>
      <div className="panel" style={{ maxWidth: 620, display: 'grid', gap: 'var(--e-4)', justifyItems: 'start' }}>
        <h1 style={{ fontSize: 'var(--t-28)' }}>{t('noEncontradoTitulo')}</h1>
        <p>{t('noEncontradoTexto')}</p>
        <div style={{ display: 'flex', gap: 'var(--e-2)', flexWrap: 'wrap' }}>
          <Link className="boton boton--marca" href={ruta(ctx.idioma)}>{t('volver')}</Link>
          <Link className="boton boton--sec" href={ruta(ctx.idioma, '/buscar')}>{te('todas')}</Link>
        </div>
      </div>
    </main>
  )
}
