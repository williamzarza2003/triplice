// Pantalla de resultados (búsqueda, categoría y tienda): filtros por facetas a la izquierda, con contadores,
// y la grilla a la derecha. Los filtros son enlaces: funcionan sin JavaScript y la URL se puede compartir.
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { conPagina, conParametro, tiene, valorDe, type Parametros } from '@/lib/busqueda'
import { valor } from '@/lib/catalogo/valores'
import type { Contexto } from '@/lib/contexto'
import type { Busqueda } from '@/lib/datos/tipos'
import { formatear, precioEn, REGLAS } from '@/lib/precios'
import { Grilla } from '../grilla/Grilla'
import { Icono } from '../Icono'
import { Orden } from './Orden'
import { BotonFiltros, PanelFiltros } from './PanelFiltros'
import s from './Resultados.module.css'

type Props = {
  ctx: Contexto
  datos: Busqueda
  base: string
  params: Parametros
  titulo: string
  /** enlaces de categoría: en la búsqueda filtran (?categoria=), en una categoría llevan a la subcategoría */
  enlaceCategoria: (slug: string) => string
  ocultar?: ('categoria' | 'marca')[]
  /** antes de la grilla (por ejemplo, las subcategorías) */
  arriba?: React.ReactNode
  nivelTitulo?: 1 | 2
}

function Opcion({ href, activo, children, n, tipo = 'casilla' }: {
  href: string; activo: boolean; children: React.ReactNode; n?: number; tipo?: 'casilla' | 'radio'
}) {
  return (
    <li>
      <Link href={href} className={s.opcion} aria-current={activo ? 'true' : undefined} scroll={false} prefetch={false}>
        <span className={tipo === 'radio' ? s.radio : s.casilla} aria-hidden="true">{activo && tipo === 'casilla' && <Icono nombre="check" tam={14} />}</span>
        <span className={s.texto}>{children}</span>
        {n !== undefined && <small className="numero">{n}</small>}
      </Link>
    </li>
  )
}

export async function Resultados({ ctx, datos, base, params, titulo, enlaceCategoria, ocultar = [], arriba, nivelTitulo = 1 }: Props) {
  const [t, tc] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'buscar' }),
    getTranslations({ locale: ctx.idioma, namespace: 'comun' }),
  ])
  const f = datos.facetas
  const q = valorDe(params.q)
  const href = (clave: string, v: string | null, alternar = false) => conParametro(base, params, clave, v, alternar)
  const paginas = Math.max(1, Math.ceil(datos.total / datos.por_pagina))
  const H = `h${nivelTitulo}` as const

  // chips de los filtros activos, cada uno con su enlace para sacarlo
  const chips: { texto: string; href: string }[] = []
  if (valorDe(params.ofertas) === '1') chips.push({ texto: t('soloOfertas'), href: href('ofertas', null) })
  for (const m of [params.marca ?? []].flat()) chips.push({ texto: m, href: href('marca', m, true) })
  if (params.pmin || params.pmax) {
    const de = valorDe(params.pmin), a = valorDe(params.pmax)
    chips.push({ texto: `${REGLAS[ctx.moneda].simbolo} ${de || '0'} – ${a || '∞'}`, href: conParametro(conParametro(base, params, 'pmin', null), Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'pmin')), 'pmax', null) })
  }
  if (params.estrellas) chips.push({ texto: t('estrellasOMas', { n: valorDe(params.estrellas) }), href: href('estrellas', null) })
  if (valorDe(params.envio) === '1') chips.push({ texto: t('envioGratis'), href: href('envio', null) })
  for (const c of [params.condicion ?? []].flat()) chips.push({ texto: tc(`condicion.${c}`), href: href('condicion', c, true) })
  for (const [k, v] of Object.entries(params)) {
    if (!k.startsWith('a.')) continue
    for (const x of [v ?? []].flat()) chips.push({ texto: valor(x, ctx.idioma), href: href(k, x, true) })
  }
  if (params.categoria && !ocultar.includes('categoria')) {
    const nombre = f.categorias.find((c) => c.slug === valorDe(params.categoria))?.nombre ?? valorDe(params.categoria)
    chips.unshift({ texto: nombre, href: href('categoria', null) })
  }

  const rangoMin = f.precio.min ? formatear(precioEn(f.precio.min, ctx.moneda, ctx.tasas), ctx.moneda) : null
  const rangoMax = f.precio.max ? formatear(precioEn(f.precio.max, ctx.moneda, ctx.tasas), ctx.moneda) : null

  const filtros = (
    <>
      {!ocultar.includes('categoria') && f.categorias.length > 0 && (
        <fieldset>
          <legend>{t('categoria')}</legend>
          <ul>
            {f.categorias.map((c) => (
              <Opcion key={c.slug} href={enlaceCategoria(c.slug)} activo={valorDe(params.categoria) === c.slug} n={c.n} tipo="radio">{c.nombre}</Opcion>
            ))}
          </ul>
        </fieldset>
      )}

      <fieldset>
        <legend>{t('precio')}</legend>
        <form action={base} className={s.rango}>
          {Object.entries(params).filter(([k]) => !['pmin', 'pmax', 'pagina'].includes(k)).flatMap(([k, v]) =>
            [v ?? []].flat().map((x) => <input key={`${k}-${x}`} type="hidden" name={k} value={x} />))}
          <label><span>{t('desde')}</span>
            <input name="pmin" inputMode="numeric" defaultValue={valorDe(params.pmin)} placeholder={rangoMin ?? ''} autoComplete="off" />
          </label>
          <label><span>{t('hasta')}</span>
            <input name="pmax" inputMode="numeric" defaultValue={valorDe(params.pmax)} placeholder={rangoMax ?? ''} autoComplete="off" />
          </label>
          <button type="submit" className="boton boton--sec">{t('aplicar')}</button>
          <small>{t('rangoAyuda', { moneda: ctx.moneda })}</small>
        </form>
      </fieldset>

      {!ocultar.includes('marca') && f.marcas.length > 1 && (
        <fieldset>
          <legend>{t('marca')}</legend>
          <ul>
            {f.marcas.slice(0, 6).map((m) => (
              <Opcion key={m.valor} href={href('marca', m.valor, true)} activo={tiene(params, 'marca', m.valor)} n={m.n}>{m.valor}</Opcion>
            ))}
          </ul>
          {f.marcas.length > 6 && (
            <details className={s.mas}>
              <summary>{t('masMarcas', { n: f.marcas.length - 6 })}</summary>
              <ul>
                {f.marcas.slice(6).map((m) => (
                  <Opcion key={m.valor} href={href('marca', m.valor, true)} activo={tiene(params, 'marca', m.valor)} n={m.n}>{m.valor}</Opcion>
                ))}
              </ul>
            </details>
          )}
        </fieldset>
      )}

      {f.atributos.map((a) => (
        <fieldset key={a.clave}>
          <legend>{a.nombre}</legend>
          <ul>
            {a.valores.slice(0, 8).map((v) => (
              <Opcion key={v.valor} href={href(`a.${a.clave}`, v.valor, true)} activo={tiene(params, `a.${a.clave}`, v.valor)} n={v.n}>
                {a.tipo === 'booleano' ? (v.valor === 'true' ? t('si') : t('no')) : `${valor(v.valor, ctx.idioma)}${a.unidad ? ` ${a.unidad}` : ''}`}
              </Opcion>
            ))}
          </ul>
        </fieldset>
      ))}

      <fieldset>
        <legend>{t('estrellas')}</legend>
        <ul>
          {f.estrellas.map((e) => (
            <Opcion key={e.valor} tipo="radio" href={href('estrellas', valorDe(params.estrellas) === String(e.valor) ? null : String(e.valor))}
              activo={valorDe(params.estrellas) === String(e.valor)} n={e.n}>{t('estrellasOMas', { n: e.valor })}</Opcion>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend>{t('envio')}</legend>
        <ul>
          <Opcion href={href('envio', valorDe(params.envio) === '1' ? null : '1')} activo={valorDe(params.envio) === '1'} n={f.envio_gratis}>{t('envioGratis')}</Opcion>
        </ul>
      </fieldset>

      {f.condicion.length > 1 && (
        <fieldset>
          <legend>{t('condicion')}</legend>
          <ul>
            {f.condicion.map((c) => (
              <Opcion key={c.valor} href={href('condicion', c.valor, true)} activo={tiene(params, 'condicion', c.valor)} n={c.n}>{tc(`condicion.${c.valor}`)}</Opcion>
            ))}
          </ul>
        </fieldset>
      )}
    </>
  )

  return (
    <div className={s.resultados}>
      <PanelFiltros titulo={t('filtros')} cerrar={t('verResultados', { n: datos.total })}>
        {filtros}
      </PanelFiltros>

      <section className={s.principal} aria-labelledby="titulo-resultados">
        <div className={s.barra}>
          <div>
            <H id="titulo-resultados" className={s.titulo}>{titulo}</H>
            <p className={s.cuenta}>{t('resultados', { n: datos.total })}{q && ` ${t('para', { q })}`}</p>
          </div>
          <BotonFiltros texto={t('verFiltros')} activos={chips.length} />
          <Orden actual={valorDe(params.orden) || 'relevancia'} etiqueta={t('ordenar')} aplicar={t('aplicarOrden')}
            opciones={(['relevancia', 'vendidos', 'precio_asc', 'precio_desc', 'calificacion', 'novedades'] as const).map((o) => ({ valor: o, texto: t(`orden.${o}`) }))}
            base={base} params={params} />
        </div>

        {datos.modo === 'corregido' && datos.corregido && (
          <p className={s.aviso} role="status"><Icono nombre="info" tam={18} />{t('corregido', { q, c: datos.corregido })}</p>
        )}
        {datos.modo === 'aprox' && datos.total > 0 && (
          <p className={s.aviso} role="status"><Icono nombre="info" tam={18} />{t('aprox', { q })}</p>
        )}

        {chips.length > 0 && (
          <ul className={s.chips}>
            {chips.map((c) => (
              <li key={c.href + c.texto}>
                <Link href={c.href} className={s.chip} aria-label={t('quitar', { filtro: c.texto })} scroll={false}>
                  {c.texto}<Icono nombre="cerrar" tam={14} />
                </Link>
              </li>
            ))}
            <li><Link href={q ? `${base}?q=${encodeURIComponent(q)}` : base} className={s.limpiar}>{t('limpiar')}</Link></li>
          </ul>
        )}

        {arriba}

        {datos.items.length > 0 ? (
          <Grilla items={datos.items} ctx={ctx} nivel={nivelTitulo === 1 ? 2 : 3} prioridad={2} diferirDesde={2} />
        ) : (
          <div className={`panel ${s.vacio}`}>
            <p className={s.vacioTitulo}>{t('sinResultados')}</p>
            <p>{t('sinResultadosAyuda')}</p>
            {chips.length > 0 && <Link className="boton boton--sec" href={q ? `${base}?q=${encodeURIComponent(q)}` : base}>{t('limpiar')}</Link>}
          </div>
        )}

        {paginas > 1 && (
          <nav className={s.paginas} aria-label={t('paginacion')}>
            {datos.pagina > 1
              ? <Link className="boton boton--sec" href={conPagina(base, params, datos.pagina - 1)} rel="prev"><Icono nombre="izquierda" tam={18} />{t('anterior')}</Link>
              : <span />}
            <span className="numero">{t('pagina', { n: datos.pagina, total: paginas })}</span>
            {datos.pagina < paginas
              ? <Link className="boton boton--sec" href={conPagina(base, params, datos.pagina + 1)} rel="next">{t('siguiente')}<Icono nombre="derecha" tam={18} /></Link>
              : <span />}
          </nav>
        )}
      </section>
    </div>
  )
}
