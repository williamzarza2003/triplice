// Pagar: entrega (retiro en el local con mapa, o envío por zona y peso), datos del comprador y pago.
// Todos los montos de cada opción se calculan acá, en el servidor; el formulario solo elige cuál mostrar.
import type { Metadata } from 'next'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { FormPago, type OpcionEntrega } from '@/components/compra/FormPago'
import { enElMapa, MapaRetiro } from '@/components/compra/MapaRetiro'
import { Resumen } from '@/components/compra/Resumen'
import s from '@/components/compra/Compra.module.css'
import p from '@/components/compra/Pago.module.css'
import { CAMPOS_DIRECCION, type Campo } from '@/lib/compra/direccion'
import { proveedorDePago } from '@/lib/compra/pago'
import { aZona, cotizar, leerCookieCarrito, zonasEnvio, type Cotizacion } from '@/lib/compra/servidor'
import { contexto, ruta } from '@/lib/contexto'
import { foto } from '@/lib/imagenes'
import { formatear } from '@/lib/precios'
import { segmentoMercado } from '@/lib/region'
import { pagarAccion } from './acciones'

// Metadata fija: el título va dentro del contenido dinámico (React lo sube al <head>), así nada se calcula
// antes de leer la cookie del comprador.
export const metadata: Metadata = { robots: { index: false } }

export default function PaginaPagar() {
  return (
    <main id="contenido" className="contenedor">
      <Suspense fallback={<div className={s.cargando} aria-hidden="true" />}>
        <Pagar />
      </Suspense>
    </main>
  )
}

const SUGERENCIAS: Record<string, Partial<Record<Campo, string[]>>> = {
  PY: { ciudad: ['Ciudad del Este', 'Hernandarias', 'Minga Guazú', 'Presidente Franco', 'Asunción', 'Encarnación', 'Luque', 'San Lorenzo'] },
  BR: { ciudad: ['Foz do Iguaçu', 'Cascavel', 'Curitiba', 'São Paulo'], zona: ['PR', 'SC', 'RS', 'SP', 'RJ', 'MS'] },
  AR: { ciudad: ['Puerto Iguazú', 'Posadas', 'Eldorado', 'Buenos Aires'], zona: ['Misiones', 'Corrientes', 'Buenos Aires', 'CABA', 'Córdoba'] },
  XX: {},
}

async function Pagar() {
  await connection() // se arma en cada visita: nada de esta página se puede prerenderizar
  // primero la cookie: hace que la página se arme en cada visita (sin ella Next intentaría prerenderizarla)
  const carrito = await leerCookieCarrito()
  const ctx = await contexto()
  const [t, tc, zonas] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'pagar' }),
    getTranslations({ locale: ctx.idioma, namespace: 'comun' }),
    zonasEnvio(ctx.idioma),
  ])
  const r = (c: string) => ruta(ctx.idioma, c)
  const f = (n: number) => formatear(n, ctx.moneda)
  const retiro = await cotizar(ctx, carrito, { modo: 'retiro' })
  if (retiro.items.length === 0) redirect(r('/carrito'))

  const delPais = zonas.filter((z) => z.pais === ctx.region)
  const domicilio = await Promise.all(delPais.map(async (z) => ({ z, cot: await cotizar(ctx, carrito, { modo: 'domicilio', zona: aZona(z) }) })))
  const unidades = retiro.items.reduce((n, i) => n + i.cantidad, 0)
  const cupon = retiro.cupon && !('error' in retiro.cupon) ? retiro.cupon.codigo : null

  // los locales donde se retira (uno por tienda del carrito) y en cuántas horas está listo
  const comprables = retiro.renglones.filter((x) => x.dato && x.cantidadCobrable > 0)
  const tiendas = [...new Map(comprables.map((x) => [x.dato!.tienda.slug, x.dato!])).values()]
  const puntos = tiendas.map((d, i) => ({
    n: i + 1, ...d.tienda.puntos[0], tienda: d.tienda.nombre,
    horas: Math.max(...comprables.filter((x) => x.dato!.tienda.slug === d.tienda.slug).map((x) => x.dato!.preparacion_h)),
  }))
  const listo = (h: number) => (h <= 4 ? t('listoHoras', { h }) : h < 24 ? t('listoHoy') : t('listoDias', { d: Math.ceil(h / 24) }))

  const resumen = (cot: Cotizacion) => (
    <>
      <h2 id="t-tu-pedido">{t('tuPedido')}</h2>
      <div className={p.miniaturas}>
        {comprables.slice(0, 8).map((x) => x.dato!.variante.imagen && (
          <Image key={x.o} src={foto(x.dato!.variante.imagen)} alt={`${x.dato!.producto.titulo} (${x.cantidadCobrable})`} width={56} height={56} sizes="56px" />
        ))}
      </div>
      <Resumen d={cot.desglose} idioma={ctx.idioma} unidades={unidades} cupon={cupon} sinImpuestos={ctx.region === 'XX'} />
      <p className={p.nota}>{ctx.region === 'XX' ? t('notaInternacional', { moneda: ctx.moneda }) : t('notaImpuestos', { pais: tc(`paises.${ctx.region}`), moneda: ctx.moneda })}</p>
    </>
  )

  const opciones: OpcionEntrega[] = [
    { clave: 'retiro', total: retiro.desglose.total, totalTexto: f(retiro.desglose.total), envioTexto: t('gratis'), nombre: t('retiro'), ciudades: [],
      plazo: puntos.length === 1 ? `${puntos[0].tienda} · ${listo(puntos[0].horas)}` : t('variosLocales', { n: puntos.length }) },
    ...domicilio.map(({ z, cot }) => ({
      clave: z.ambito, total: cot.desglose.total, totalTexto: f(cot.desglose.total), nombre: z.nombre, ciudades: z.ciudades,
      envioTexto: cot.desglose.envio === 0 ? t('gratis') : f(cot.desglose.envio),
      plazo: t('plazo', { min: z.dias_min, max: z.dias_max }),
    })),
  ]
  const resumenes = Object.fromEntries([['retiro', resumen(retiro)], ...domicilio.map(({ z, cot }) => [z.ambito, resumen(cot)])])

  const mapa = (
    <>
      <MapaRetiro puntos={puntos} paises={{ PY: tc('paises.PY'), BR: tc('paises.BR'), AR: tc('paises.AR') }} puente={t('puente')} />
      <ol className={p.puntos} aria-label={t('dondeRetiras')}>
        {puntos.map((x) => (
          <li key={x.n}>
            <span aria-hidden="true">{x.n}</span>
            <div>
              <b>{x.tienda}</b>
              <small>{x.direccion}, {x.ciudad}{!enElMapa(x) && ` · ${t('fueraDelMapa')}`}</small>
              <small>{x.horario}</small>
              <small className={p.listo}>{listo(x.horas)}</small>
            </div>
          </li>
        ))}
      </ol>
    </>
  )

  const errores = ['requerido', 'email', 'telefono', 'codigo', 'codigo_BR', 'codigo_AR', 'zona', 'zona_BR']
  const camposTodos: Campo[] = ['nombre', 'email', 'telefono', 'ciudad', 'zona', 'direccion', 'codigo', 'referencia']

  return (
    <>
      <title>{`${t('titulo')} · Tríplice`}</title>
      <h1 className={s.titulo}>{t('titulo')}</h1>
      <FormPago accion={pagarAccion} idioma={ctx.idioma} mercado={segmentoMercado(ctx)} region={ctx.region} opciones={opciones}
        camposDireccion={CAMPOS_DIRECCION[ctx.region]} sugerencias={SUGERENCIAS[ctx.region]} proveedor={proveedorDePago()}
        retiro={mapa} resumenes={resumenes}
        textos={{
          pasoEntrega: t('pasoEntrega'), pasoDatos: t('pasoDatos'), pasoPago: t('pasoPago'), retiro: t('retiro'), domicilio: t('domicilio'),
          gratis: t('gratis'), datosRetiro: t('datosRetiro'), pagar: t('pagar', { total: '{total}' }), procesando: t('procesando'),
          notaStripe: t('notaStripe'), notaSimulado: t('notaSimulado'), protegida: t('protegida'), opcional: t('opcional'),
          zonaElegida: t('zonaElegida', { zona: '{zona}', plazo: '{plazo}', envio: '{envio}' }),
          errores: Object.fromEntries(errores.map((e) => [e, t(`errores.${e}`)])),
          generales: { sin_items: t('generales.sin_items'), cambio: t('generales.cambio'), pago: t('generales.pago') },
          campos: Object.fromEntries(camposTodos.map((c) => [c, t(`campos.${ctx.region}.${c}`)])),
          ayudas: Object.fromEntries((['telefono', 'referencia', 'codigo'] as Campo[]).filter((c) => t.has(`ayudas.${ctx.region}.${c}`)).map((c) => [c, t(`ayudas.${ctx.region}.${c}`)])),
        }} />
    </>
  )
}
