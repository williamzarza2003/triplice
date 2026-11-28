// Impuestos por país y categoría (simulación aproximada). Una columna por país con su tasa general y las de cada
// categoría; cada una se cambia con vista previa del precio final de un producto de ejemplo en los tres países.
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import { NoAdmin } from '@/components/admin/Comunes'
import a from '@/components/admin/Admin.module.css'
import { FormImpuesto } from '@/components/admin/FormImpuesto'
import { Alerta, Aviso } from '@/components/vender/Comunes'
import s from '@/components/vender/Vender.module.css'
import { noEsAdmin, type ImpuestosAdmin } from '@/lib/admin/tipos'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { borrarImpuestoAccion, impuestoAccion } from '../acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'admin.impuestos' })
  return { title: t('titulo'), robots: { index: false, follow: false } }
}

export default function PaginaImpuestos(props: PageProps<'/[idioma]/[mercado]/admin/impuestos'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

const PAISES = ['PY', 'BR', 'AR'] as const

async function Contenido({ searchParams }: PageProps<'/[idioma]/[mercado]/admin/impuestos'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const uno = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  await conSesion(ctx.idioma, '/admin/impuestos')
  const [t, ta, datos, mensajes] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'admin.impuestos' }),
    getTranslations({ locale: ctx.idioma, namespace: 'admin' }),
    rpcCuenta<ImpuestosAdmin>('admin_impuestos', { idioma: ctx.idioma }),
    getMessages({ locale: ctx.idioma }),
  ])
  if (noEsAdmin(datos)) return <NoAdmin idioma={ctx.idioma} />
  const paises = mensajes.comun.paises as Record<string, string>
  const pct = new Intl.NumberFormat(LOCALE[ctx.idioma], { style: 'percent', maximumFractionDigits: 2 })
  const m = mensajes.admin as Record<string, never>
  const textos = { admin: { impuestos: m.impuestos, categorias: m.categorias, errores: m.errores } }
  const categorias = datos.categorias.map((c) => ({ id: c.id, texto: c.texto, grupo: c.padre_texto }))
  const guardado = uno('guardado')

  return (
    <Textos locale={LOCALE[ctx.idioma]} mensajes={textos}>
      <div className={s.cabeza}><div><h1>{t('titulo')}</h1><p>{t('explica')}</p></div></div>
      {guardado && <Aviso texto={guardado === 'borrada' ? t('borrada') : t('guardada', { pais: paises[guardado] ?? guardado })} />}
      {uno('error') && <Alerta texto={ta.has(`errores.${uno('error')}`) ? ta(`errores.${uno('error')}`) : ta('errores.servidor')} />}
      <div className={a.paises}>
        {PAISES.map((pais) => {
          const reglas = datos.reglas.filter((r) => r.pais === pais)
          return (
            <section key={pais} id={`pais-${pais}`} className={`panel ${a.pais}`} aria-labelledby={`t-${pais}`}>
              <h2 id={`t-${pais}`}>{paises[pais]} <small>{t('reglas', { n: reglas.length })}</small></h2>
              <ul className={a.reglas}>
                {reglas.map((r) => (
                  <li key={r.id}>
                    <div className={a.regla}>
                      <span>
                        <b>{r.categoria_texto ?? t('general')}</b>
                        <small>{r.nombre[ctx.idioma]}{r.productos !== null && ` · ${t('afecta', { n: r.productos })}`}</small>
                      </span>
                      <span className={a.tasa}>{pct.format(Number(r.tasa))}</span>
                    </div>
                    <details className={a.editar}>
                      <summary>{t('cambiar', { regla: r.categoria_texto ?? t('general') })}</summary>
                      <FormImpuesto accion={impuestoAccion} idioma={ctx.idioma} pais={pais} paises={paises}
                        regla={{ id: r.id, tasa: Number(r.tasa), nombre: r.nombre, categoria_id: r.categoria_id }} />
                      {r.categoria_id !== null && (
                        <form action={borrarImpuestoAccion} style={{ marginTop: 'var(--e-2)' }}>
                          <input type="hidden" name="idioma" value={ctx.idioma} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="pais" value={pais} />
                          <button type="submit" className={`${a.chico} ${a.chicoPeligro}`}>{t('quitar', { general: pct.format(Number(reglas.find((x) => x.categoria_id === null)?.tasa ?? 0)) })}</button>
                        </form>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
              <details className={a.editar}>
                <summary>{t('agregar')}</summary>
                <FormImpuesto accion={impuestoAccion} idioma={ctx.idioma} pais={pais} paises={paises}
                  categorias={categorias.filter((c) => !reglas.some((r) => r.categoria_id === c.id))} />
              </details>
            </section>
          )
        })}
      </div>
      <p className={s.letraChica}>{t('nota')}</p>
    </Textos>
  )
}
