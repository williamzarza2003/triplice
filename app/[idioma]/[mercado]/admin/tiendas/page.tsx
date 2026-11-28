// Tiendas por estado (pendientes, aprobadas, suspendidas) con sus números, y las decisiones: aprobar, suspender con
// un motivo que la tienda ve en su panel, reactivar. Abajo, el alta de un vendedor (cuenta por email + tienda).
// Todo funciona sin JavaScript: los filtros son enlaces y cada decisión es un formulario.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import { FormAlta } from '@/components/admin/FormAlta'
import { iniciales, NoAdmin } from '@/components/admin/Comunes'
import a from '@/components/admin/Admin.module.css'
import { Alerta, Aviso, Filtros } from '@/components/vender/Comunes'
import s from '@/components/vender/Vender.module.css'
import { noEsAdmin, type EstadoTienda, type ListaTiendas } from '@/lib/admin/tipos'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { hace } from '@/lib/vender/formato'
import { altaVendedorAccion, estadoTiendaAccion } from '../acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'admin.tiendas' })
  return { title: t('titulo'), robots: { index: false, follow: false } }
}

export default function PaginaTiendas(props: PageProps<'/[idioma]/[mercado]/admin/tiendas'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

const ESTADOS: EstadoTienda[] = ['pendiente', 'aprobada', 'suspendida']

async function Contenido({ searchParams }: PageProps<'/[idioma]/[mercado]/admin/tiendas'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const uno = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const estado = (ESTADOS as string[]).includes(uno('estado')) ? (uno('estado') as EstadoTienda) : 'pendiente'
  const q = uno('q').slice(0, 60)
  await conSesion(ctx.idioma, '/admin/tiendas')
  const [t, ta, lista, mensajes] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'admin.tiendas' }),
    getTranslations({ locale: ctx.idioma, namespace: 'admin' }),
    rpcCuenta<ListaTiendas>('admin_tiendas', { estado, q }),
    getMessages({ locale: ctx.idioma }),
  ])
  if (noEsAdmin(lista)) return <NoAdmin idioma={ctx.idioma} />

  const loc = LOCALE[ctx.idioma]
  const numero = new Intl.NumberFormat(loc)
  const aqui = ruta(ctx.idioma, `/admin/tiendas?estado=${estado}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
  const guardado = uno('guardado')
  const errorDe = uno('id')
  const error = uno('error')
  const paises = mensajes.comun.paises as Record<string, string>
  const ocultos = (tid: string) => (
    <><input type="hidden" name="idioma" value={ctx.idioma} /><input type="hidden" name="volver" value={aqui} /><input type="hidden" name="tienda" value={tid} /></>
  )

  return (
    <>
      <div className={s.cabeza}><div><h1>{t('titulo')}</h1><p>{t('explica')}</p></div></div>
      {guardado && <Aviso texto={t(`guardado.${guardado === 'suspendida' ? 'suspendida' : 'aprobada'}`, { tienda: uno('nombre') || uno('n') })}
        enlace={guardado !== 'suspendida' && uno('n') ? { href: ruta(ctx.idioma, `/tienda/${uno('n')}`), texto: t('verTienda') } : undefined} />}

      <div className={s.barra}>
        <Filtros etiqueta={t('filtros')} locale={loc} opciones={ESTADOS.map((e) => ({
          href: ruta(ctx.idioma, `/admin/tiendas?estado=${e}`), texto: t(`estados.${e}`), n: lista.cuentas[e], actual: e === estado,
        }))} />
        <form className={s.buscar} role="search" action={ruta(ctx.idioma, '/admin/tiendas')}>
          <input type="hidden" name="estado" value={estado} />
          <label htmlFor="buscar-tienda" className="sr-only">{t('buscar')}</label>
          <input id="buscar-tienda" name="q" type="search" defaultValue={q} placeholder={t('buscarEjemplo')} maxLength={60} />
          <button type="submit" className="boton boton--sec">{t('buscar')}</button>
        </form>
      </div>

      {lista.items.length === 0 ? (
        <section className={`panel ${s.vacio}`}><p>{q ? t('vacioBusqueda', { q }) : t(`vacio.${estado}`)}</p></section>
      ) : (
        <ul className={a.tiendas}>
          {lista.items.map((x) => {
            const conError = errorDe === x.id ? error : ''
            const conDatos = x.ventas_12m + x.opiniones > 0
            return (
              <li key={x.id} id={`tienda-${x.id}`} className={`panel ${a.tienda}`}>
                <span className={a.marca} style={{ background: x.color }} aria-hidden="true">{iniciales(x.nombre)}</span>
                <div>
                  <h2>{x.estado === 'aprobada' ? <Link href={ruta(ctx.idioma, `/tienda/${x.slug}`)}>{x.nombre}</Link> : x.nombre}</h2>
                  <p className={a.lugar}>
                    {x.ciudad}, {paises[x.pais] ?? x.pais} · {t('desde', { anio: x.desde })} · {x.duenio ? t('duenio', { nombre: x.duenio.nombre }) : t('sinDuenio')}
                  </p>
                  <p className={s.meta}>
                    <span className={s.estado} data-estado={x.estado === 'aprobada' ? 'activos' : x.estado === 'pendiente' ? 'sin_stock' : 'devolucion'}>{t(`estado.${x.estado}`)}</span>
                    {' '}{t(`desdeEstado.${x.estado}`, { hace: hace(x.estado_desde, ctx.idioma) })}
                  </p>
                  <dl className={a.numeros}>
                    <div><dt>{t('reputacion')}</dt><dd>{conDatos && x.reputacion !== null ? `${numero.format(Number(x.reputacion))} %` : <small>{t('sinDatos')}</small>}</dd></div>
                    <div><dt>{t('ventas')}</dt><dd>{numero.format(x.ventas_12m)}</dd></div>
                    <div><dt>{t('productos')}</dt><dd>{numero.format(x.productos)} <small>{t('ofertas', { n: x.ofertas })}</small></dd></div>
                  </dl>
                  {x.estado === 'suspendida' && x.estado_motivo && (
                    <p className={a.motivo}><b>{t('motivoTitulo')}</b>{x.estado_motivo}</p>
                  )}
                  {conError && <div style={{ marginTop: 'var(--e-3)' }}><Alerta texto={ta.has(`errores.${conError}`) ? ta(`errores.${conError}`) : ta('errores.servidor')} /></div>}
                </div>
                <div className={a.decidir}>
                  {x.estado !== 'aprobada' && (
                    <form action={estadoTiendaAccion}>
                      {ocultos(x.id)}
                      <input type="hidden" name="estado" value="aprobada" />
                      <button type="submit" className="boton boton--marca">{t(x.estado === 'pendiente' ? 'aprobar' : 'reactivar', { tienda: x.nombre })}</button>
                    </form>
                  )}
                  {x.estado !== 'suspendida' && (
                    <details className={a.suspender} open={conError === 'motivo'}>
                      <summary>{t(x.estado === 'pendiente' ? 'rechazar' : 'suspender')}</summary>
                      <form action={estadoTiendaAccion} className={a.formMotivo}>
                        {ocultos(x.id)}
                        <input type="hidden" name="estado" value="suspendida" />
                        <label htmlFor={`motivo-${x.id}`}>{t('motivo')}</label>
                        <textarea id={`motivo-${x.id}`} name="motivo" rows={3} minLength={10} maxLength={400} required aria-describedby={`ayuda-${x.id}`} />
                        <small id={`ayuda-${x.id}`}>{t('motivoAyuda')}</small>
                        <button type="submit" className={`boton ${a.botonPeligro}`}>{t('confirmarSuspender', { tienda: x.nombre })}</button>
                      </form>
                    </details>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <section className="panel" style={{ marginTop: 'var(--e-6)' }} aria-labelledby="t-alta">
        <Textos locale={loc} mensajes={{ admin: { alta: (mensajes.admin as Record<string, never>).alta, errores: (mensajes.admin as Record<string, never>).errores } }}>
          <FormAlta accion={altaVendedorAccion} idioma={ctx.idioma} sinDuenio={lista.sin_duenio} paises={paises} />
        </Textos>
      </section>
    </>
  )
}
