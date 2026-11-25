'use client'
import { useTextos } from '@/lib/i18n/textos'

// Error de una página: se explica qué pasó y se ofrece reintentar sin perder el resto del sitio.
export default function ErrorDePagina({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTextos('error')
  return (
    <main id="contenido" className="contenedor" style={{ paddingTop: 'var(--e-10)' }}>
      <div className="panel" role="alert" style={{ maxWidth: 620, display: 'grid', gap: 'var(--e-4)', justifyItems: 'start' }}>
        <h1 style={{ fontSize: 'var(--t-28)' }}>{t('titulo')}</h1>
        <p>{t('texto')}</p>
        <button type="button" className="boton boton--marca" onClick={() => retry()}>{t('reintentar')}</button>
      </div>
    </main>
  )
}
