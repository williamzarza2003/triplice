// Pedidos con productos de mi tienda, por estado. La tienda avanza su parte (preparando → enviado o listo para
// retirar) y eso es lo que el comprador ve en la línea de tiempo de su pedido (fase 3).
import type { Metadata } from 'next'
import Image from 'next/image'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { Icono } from '@/components/Icono'
import { Alerta, Aviso, Filtros, NoVendedor } from '@/components/vender/Comunes'
import s from '@/components/vender/Vender.module.css'
import { conSesion, montoMinimo, opcionesTexto } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { foto } from '@/lib/imagenes'
import { hace } from '@/lib/vender/formato'
import { sinTienda, type FiltroPedidos, type ListaPedidos, type PedidoVendedor } from '@/lib/vender/tipos'
import { avanzarAccion } from '../acciones'

const FILTROS: FiltroPedidos[] = ['por_preparar', 'preparando', 'en_camino', 'entregados', 'todos']

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'vender.pedidos' })
  return { title: t('titulo'), robots: { index: false } }
}

export default function PaginaPedidos(props: PageProps<'/[idioma]/[mercado]/vender/pedidos'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

/** Lo que el comprador va a ver de mi parte: en qué estado quedó (para el sello). */
function estadoMio(p: PedidoVendedor) {
  if (p.grupo === 'cancelados') return 'cancelado'
  if (p.grupo === 'por_preparar') return 'confirmado'
  if (p.grupo === 'preparando') return 'preparando'
  if (p.grupo === 'en_camino') return p.modo === 'retiro' ? 'listo_retiro' : 'enviado'
  return p.estado === 'devolucion' ? 'devolucion' : 'entregado'
}

async function Contenido({ searchParams }: PageProps<'/[idioma]/[mercado]/vender/pedidos'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const uno = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const filtro: FiltroPedidos = FILTROS.includes(uno('filtro') as FiltroPedidos) ? (uno('filtro') as FiltroPedidos) : 'por_preparar'
  await conSesion(ctx.idioma, '/vender/pedidos')
  const [t, lista] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'vender.pedidos' }),
    rpcCuenta<ListaPedidos>('vendedor_pedidos', { filtro }),
  ])
  if (!lista || sinTienda(lista)) return <NoVendedor idioma={ctx.idioma} />

  const loc = LOCALE[ctx.idioma]
  const zona = { timeZone: 'America/Asuncion' } as const
  const hoy = new Intl.DateTimeFormat('en-CA', zona).format(new Date())
  const diaDe = (x: string) => new Intl.DateTimeFormat('en-CA', zona).format(new Date(x))
  const hora = (x: string) => new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...zona }).format(new Date(x))
  const fecha = (x: string) => new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...zona }).format(new Date(x))
  const aqui = ruta(ctx.idioma, `/vender/pedidos${filtro === 'por_preparar' ? '' : `?filtro=${filtro}`}`)
  const [avNumero, avEstado] = uno('avanzado').split('.')
  const error = uno('error')

  return (
    <>
      <div className={s.cabeza}><div><h1>{t('titulo')}</h1></div></div>
      {avNumero && avEstado && t.has(`estados.${avEstado}`) && <Aviso texto={t('avanzado', { numero: avNumero, estado: t(`estados.${avEstado}`) })} />}
      {error && <Alerta texto={t.has(`errores.${error}`) ? t(`errores.${error}`) : t('errores.servidor')} />}
      <div className={s.barra}>
        <Filtros etiqueta={t('filtrosEtiqueta')} locale={loc} opciones={FILTROS.map((f) => ({
          href: ruta(ctx.idioma, `/vender/pedidos${f === 'por_preparar' ? '' : `?filtro=${f}`}`), texto: t(`filtros.${f}`),
          n: f === 'todos' ? undefined : lista.cuentas[f], actual: f === filtro,
        }))} />
      </div>

      <section className="panel" aria-label={t(`filtros.${filtro}`)}>
        {lista.items.length === 0 ? (
          <div className={s.vacio}><p>{filtro === 'por_preparar' ? t('vacio.por_preparar') : t('vacio.otro')}</p></div>
        ) : (
          <table className={`${s.tabla} ${s.tablaPedidos}`}>
            <thead>
              <tr>
                <th scope="col">{t('columnas.pedido')}</th><th scope="col">{t('columnas.entrega')}</th><th scope="col">{t('columnas.productos')}</th>
                <th scope="col" className={s.num}>{t('columnas.total')}</th><th scope="col">{t('columnas.accion')}</th>
              </tr>
            </thead>
            <tbody>
              {lista.items.map((p) => {
                const estado = estadoMio(p)
                const abierto = p.grupo === 'por_preparar' || p.grupo === 'preparando'
                return (
                  <tr key={p.numero} id={`pedido-${p.numero}`}>
                    <td>
                      <span className={s.pedidoNumero}>{t('pedido', { numero: p.numero })}</span>
                      <span className={s.meta}>{abierto ? t('entro', { hace: hace(p.creado, ctx.idioma) }) : fecha(p.creado)}</span>
                      {abierto && (
                        <span className={`${s.plazo} ${p.atrasado ? s.atrasado : ''}`}>
                          <Icono nombre="reloj" tam={16} />
                          {p.atrasado ? t('atrasado', { hace: hace(p.limite, ctx.idioma) })
                            : diaDe(p.limite) === hoy ? t('limite', { hora: hora(p.limite) }) : t('limiteDia', { fecha: fecha(p.limite) })}
                        </span>
                      )}
                    </td>
                    <td>
                      {p.comprador && <span>{t('comprador', { nombre: p.comprador })}</span>}
                      <span className={s.meta}>{p.modo === 'retiro' ? t('retiro') : t('domicilio', { destino: p.destino ?? '' })}</span>
                    </td>
                    <td>
                      <ul className={s.items}>
                        {p.items.map((x, i) => (
                          <li key={i}>
                            {x.imagen ? <Image src={foto(x.imagen)} alt="" width={40} height={40} sizes="40px" /> : <span className={s.sinFoto} />}
                            <span>{x.titulo} × {x.cantidad}<small>{opcionesTexto(x.opciones, ctx.idioma)}</small></span>
                          </li>
                        ))}
                      </ul>
                      {p.otras_tiendas && abierto && <span className={s.otras}>{t('otras')}</span>}
                    </td>
                    <td className={s.num} data-etiqueta={t('columnas.total')}>{montoMinimo(p.total, p.moneda)}</td>
                    <td>
                      {abierto ? (
                        <form action={avanzarAccion}>
                          <input type="hidden" name="idioma" value={ctx.idioma} />
                          <input type="hidden" name="volver" value={aqui} />
                          <input type="hidden" name="numero" value={p.numero} />
                          <input type="hidden" name="modo" value={p.modo} />
                          <input type="hidden" name="estado" value={p.grupo === 'por_preparar' ? 'preparando' : 'enviado'} />
                          <button type="submit" className={`boton ${p.grupo === 'por_preparar' ? 'boton--sec' : 'boton--marca'}`}>
                            {p.grupo === 'por_preparar' ? t('preparar') : p.modo === 'retiro' ? t('listo') : t('enviar')}
                          </button>
                        </form>
                      ) : <span className={s.estado} data-estado={estado}>{t(`estados.${estado}`)}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {lista.items.length >= 60 && <p className={s.letraChica}>{t('mas')}</p>}
      </section>
    </>
  )
}
