// El registro: quién hizo qué, cuándo y por qué (las últimas 100 acciones). Lo escribe la base con disparadores;
// nadie lo edita ni lo borra, tampoco un admin.
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { NoAdmin } from '@/components/admin/Comunes'
import { Filtros } from '@/components/vender/Comunes'
import s from '@/components/vender/Vender.module.css'
import { noEsAdmin, type Accion } from '@/lib/admin/tipos'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'admin.registro' })
  return { title: t('titulo'), robots: { index: false, follow: false } }
}

export default function PaginaRegistro(props: PageProps<'/[idioma]/[mercado]/admin/registro'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

const TIPOS = ['tiendas', 'cuenta', 'resena', 'pregunta', 'respuesta', 'categoria', 'atributo', 'impuesto', 'cotizacion'] as const

async function Contenido({ searchParams }: PageProps<'/[idioma]/[mercado]/admin/registro'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const tipo = typeof sp.tipo === 'string' && (TIPOS as readonly string[]).includes(sp.tipo) ? sp.tipo : null
  await conSesion(ctx.idioma, '/admin/registro')
  const [t, lista] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'admin.registro' }),
    rpcCuenta<Accion[]>('admin_registro', tipo ? { tipo } : {}),
  ])
  if (noEsAdmin(lista)) return <NoAdmin idioma={ctx.idioma} />
  const fecha = new Intl.DateTimeFormat(LOCALE[ctx.idioma], { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Asuncion' })
  const cambio = (x: Accion) => {
    const antes = x.antes ?? {}
    const despues = x.despues ?? {}
    for (const k of ['estado', 'rol', 'tasa', 'por_usd'] as const) {
      if (k in despues && antes[k] !== despues[k]) {
        const f = (v: unknown) => (k === 'tasa' ? `${Math.round(Number(v) * 10000) / 100} %` : String(v ?? '—'))
        return `${f(antes[k])} → ${f(despues[k])}`
      }
    }
    return ''
  }

  return (
    <>
      <div className={s.cabeza}><div><h1>{t('titulo')}</h1><p>{t('explica')}</p></div></div>
      <div className={s.barra}>
        <Filtros etiqueta={t('filtros')} locale={LOCALE[ctx.idioma]} opciones={[
          { href: ruta(ctx.idioma, '/admin/registro'), texto: t('todo'), actual: !tipo },
          ...TIPOS.map((x) => ({ href: ruta(ctx.idioma, `/admin/registro?tipo=${x}`), texto: t(`tipos.${x}`), actual: tipo === x })),
        ]} />
      </div>
      <section className="panel">
        {lista.length === 0 ? <p className={s.sub}>{t('vacio')}</p> : (
          <table className={s.tabla}>
            <thead><tr><th scope="col">{t('cuando')}</th><th scope="col">{t('quien')}</th><th scope="col">{t('que')}</th><th scope="col">{t('porque')}</th></tr></thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.id}>
                  <td data-etiqueta={t('cuando')} style={{ whiteSpace: 'nowrap' }}><time dateTime={x.creado}>{fecha.format(new Date(x.creado))}</time></td>
                  <td data-etiqueta={t('quien')}>{x.admin_nombre}</td>
                  <td data-etiqueta={t('que')}>
                    {t.has(`acciones.${x.accion}`) ? t(`acciones.${x.accion}`) : x.accion}
                    {x.objeto_nombre && <> <q>{x.objeto_nombre}</q></>}
                    {cambio(x) && <small className={s.meta}>{cambio(x)}</small>}
                  </td>
                  <td data-etiqueta={t('porque')}>{x.motivo ?? <span className={s.sub}>{t('sinMotivo')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
