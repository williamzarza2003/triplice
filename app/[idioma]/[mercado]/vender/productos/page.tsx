// Mis productos: búsqueda, filtro por estado (activos, pausados, sin stock), stock rápido y pausar/activar desde la lista.
// Todo son formularios comunes (funcionan sin JavaScript); en el celular la tabla se vuelve una lista.
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { Icono } from '@/components/Icono'
import { Alerta, Aviso, Filtros, NoVendedor } from '@/components/vender/Comunes'
import s from '@/components/vender/Vender.module.css'
import { conSesion, opcionesTexto } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { foto } from '@/lib/imagenes'
import { formatear } from '@/lib/precios'
import { sinTienda, type FiltroProductos, type ListaProductos } from '@/lib/vender/tipos'
import { pausarAccion, stockAccion } from '../acciones'

const FILTROS: FiltroProductos[] = ['todos', 'activos', 'pausados', 'sin_stock']

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'vender.productos' })
  return { title: t('titulo'), robots: { index: false } }
}

export default function PaginaProductos(props: PageProps<'/[idioma]/[mercado]/vender/productos'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

async function Contenido({ searchParams }: PageProps<'/[idioma]/[mercado]/vender/productos'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const uno = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const q = uno('q').slice(0, 80)
  const filtro: FiltroProductos = FILTROS.includes(uno('filtro') as FiltroProductos) ? (uno('filtro') as FiltroProductos) : 'todos'
  const pagina = Math.max(1, Math.min(500, Number(uno('pagina')) || 1))
  await conSesion(ctx.idioma, '/vender/productos')
  const [t, tv, lista] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'vender.productos' }),
    getTranslations({ locale: ctx.idioma, namespace: 'vender' }),
    rpcCuenta<ListaProductos>('vendedor_productos', { q, filtro, pagina, idioma: ctx.idioma }),
  ])
  if (!lista || sinTienda(lista)) return <NoVendedor idioma={ctx.idioma} />

  const loc = LOCALE[ctx.idioma]
  const numero = new Intl.NumberFormat(loc)
  const enlace = (cambios: Record<string, string | number | null>) => {
    const p = new URLSearchParams()
    const todo = { q, filtro: filtro === 'todos' ? null : filtro, pagina: null, ...cambios }
    for (const [k, v] of Object.entries(todo)) if (v !== null && v !== '') p.set(k, String(v))
    const x = p.toString()
    return ruta(ctx.idioma, `/vender/productos${x ? `?${x}` : ''}`)
  }
  const aqui = enlace({ pagina: pagina > 1 ? pagina : null })
  const guardado = uno('guardado')
  const error = uno('error')
  const usd = (cent: number) => formatear(cent / 100, 'USD')
  const ocultos = <><input type="hidden" name="idioma" value={ctx.idioma} /><input type="hidden" name="volver" value={aqui} /></>

  return (
    <>
      <div className={s.cabeza}>
        <div>
          <h1>{t('titulo')}</h1>
          <p>{t('cantidad', { n: lista.cuentas.todos, activos: numero.format(lista.cuentas.activos) })}</p>
        </div>
        <Link className="boton boton--accion" href={ruta(ctx.idioma, '/vender/productos/nuevo')}><Icono nombre="mas" tam={18} />{tv('publicar')}</Link>
      </div>
      {guardado === 'stock' && <Aviso texto={t('stockGuardado')} />}
      {guardado === 'pausado' && <Aviso texto={t('pausado')} />}
      {guardado === 'activado' && <Aviso texto={t('activado')} />}
      {guardado && !['stock', 'pausado', 'activado'].includes(guardado) && (
        <Aviso texto={t('guardado')} enlace={{ href: ruta(ctx.idioma, `/p/${guardado}`), texto: t('verFicha') }} />
      )}
      {error === 'stock' && <Alerta texto={t('errorStock')} />}
      {error === 'no_existe' && <Alerta texto={tv('errores.no_existe')} />}

      <div className={s.barra}>
        <form className={s.buscar} role="search" action={ruta(ctx.idioma, '/vender/productos')}>
          {filtro !== 'todos' && <input type="hidden" name="filtro" value={filtro} />}
          <label className="sr-only" htmlFor="buscar-productos">{t('buscar')}</label>
          <input id="buscar-productos" type="search" name="q" defaultValue={q} placeholder={t('buscar')} maxLength={80} />
          <button type="submit" className="boton boton--sec">{t('buscarBoton')}</button>
        </form>
        <Filtros etiqueta={t('filtrosEtiqueta')} locale={loc} opciones={FILTROS.map((f) => ({
          href: enlace({ filtro: f === 'todos' ? null : f }), texto: t(`filtros.${f}`), n: lista.cuentas[f], actual: f === filtro,
        }))} />
      </div>

      <section className="panel" aria-label={t('titulo')}>
        {lista.items.length === 0 ? (
          <div className={s.vacio}><p>{q ? t('vacioBuscar', { q }) : t('vacio')}</p></div>
        ) : (
          <table className={`${s.tabla} ${s.tablaProductos}`}>
            <thead>
              <tr>
                <th scope="col">{t('producto')}</th><th scope="col">{t('estado')}</th><th scope="col" className={s.num}>{t('precio')}</th>
                <th scope="col">{t('stock')}</th><th scope="col">{t('acciones')}</th>
              </tr>
            </thead>
            <tbody>
              {lista.items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className={s.prod}>
                      {p.imagen ? <Image src={foto(p.imagen)} alt="" width={56} height={56} sizes="56px" /> : <span className={s.sinFoto} />}
                      <div>
                        <Link href={ruta(ctx.idioma, `/vender/productos/${p.id}`)}>{p.titulo}</Link>
                        <small>{p.marca} · {t('variantes', { n: p.variantes.length })}{!p.editable && ` · ${t('ajeno')}`}</small>
                      </div>
                    </div>
                  </td>
                  <td data-etiqueta={t('estado')}><span className={s.estado} data-estado={p.estado}>{t(`estados.${p.estado}`)}</span></td>
                  <td className={s.num} data-etiqueta={t('precio')}>
                    {p.variantes.length > 1 ? t('desde', { precio: usd(p.precio) }) : usd(p.precio)}
                    <small className={s.meta}>{t('sinImpuestos')}</small>
                  </td>
                  <td data-etiqueta={t('stock')}>
                    <form action={stockAccion}>
                      {ocultos}
                      {p.variantes.length === 1 ? (
                        <div className={s.stock}>
                          <label className="sr-only" htmlFor={`s-${p.variantes[0].oferta}`}>{t('stockDe', { variante: p.titulo })}</label>
                          <input id={`s-${p.variantes[0].oferta}`} name={`s.${p.variantes[0].oferta}`} inputMode="numeric" pattern="[0-9]*" defaultValue={p.variantes[0].stock} required />
                          <button type="submit" className="boton boton--sec">{t('guardarStock')}</button>
                        </div>
                      ) : (
                        <details className={s.stockVariantes}>
                          <summary>{numero.format(p.stock)} {t('unidades')} · {t('variantes', { n: p.variantes.length })}</summary>
                          {p.variantes.map((v) => {
                            const nombre = opcionesTexto(v.opciones, ctx.idioma) || v.sku
                            return (
                              <label key={v.oferta}>
                                <span>{nombre}</span>
                                <input name={`s.${v.oferta}`} inputMode="numeric" pattern="[0-9]*" defaultValue={v.stock} aria-label={t('stockDe', { variante: nombre })} required />
                              </label>
                            )
                          })}
                          <button type="submit" className="boton boton--sec">{t('guardarStock')}</button>
                        </details>
                      )}
                    </form>
                  </td>
                  <td data-etiqueta={t('acciones')}>
                    <div className={s.acciones}>
                      <Link className="boton boton--sec" href={ruta(ctx.idioma, `/vender/productos/${p.id}`)}>{t('editar')}</Link>
                      <form action={pausarAccion}>
                        {ocultos}
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="activa" value={p.activa ? '0' : '1'} />
                        <button type="submit" className={s.enlaceBoton}>{p.activa ? t('pausar') : t('activar')}</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {lista.total > 20 && (
          <div className={s.paginas}>
            <span>{t('pagina', { desde: numero.format((pagina - 1) * 20 + 1), hasta: numero.format(Math.min(lista.total, pagina * 20)), total: numero.format(lista.total) })}</span>
            <span className={s.acciones}>
              {pagina > 1 && <Link href={enlace({ pagina: pagina - 1 })}>{t('anteriores')}</Link>}
              {pagina * 20 < lista.total && <Link href={enlace({ pagina: pagina + 1 })}>{t('siguientes')}</Link>}
            </span>
          </div>
        )}
      </section>
    </>
  )
}
