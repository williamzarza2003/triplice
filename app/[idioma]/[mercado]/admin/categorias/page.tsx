// Categorías: el árbol (principales y subcategorías) con lo que usa cada una, para ordenar, editar, crear y borrar.
// Lo que está en uso no se borra y el mensaje dice por qué (la base lo frena igual: categorias_validar).
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import { NoAdmin } from '@/components/admin/Comunes'
import a from '@/components/admin/Admin.module.css'
import { FormCategoria } from '@/components/admin/FormCategoria'
import { Icono } from '@/components/Icono'
import { Alerta, Aviso } from '@/components/vender/Comunes'
import s from '@/components/vender/Vender.module.css'
import { ICONOS_CATEGORIA, noEsAdmin, type CategoriaAdmin } from '@/lib/admin/tipos'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { borrarCategoriaAccion, guardarCategoriaAccion, ordenarAccion } from '../acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'admin.categorias' })
  return { title: t('titulo'), robots: { index: false, follow: false } }
}

export default function PaginaCategorias(props: PageProps<'/[idioma]/[mercado]/admin/categorias'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

async function Contenido({ searchParams }: PageProps<'/[idioma]/[mercado]/admin/categorias'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const uno = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  await conSesion(ctx.idioma, '/admin/categorias')
  const [t, ta, arbol, mensajes] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'admin.categorias' }),
    getTranslations({ locale: ctx.idioma, namespace: 'admin' }),
    rpcCuenta<CategoriaAdmin[]>('admin_categorias', { idioma: ctx.idioma }),
    getMessages({ locale: ctx.idioma }),
  ])
  if (noEsAdmin(arbol)) return <NoAdmin idioma={ctx.idioma} />
  const numero = new Intl.NumberFormat(LOCALE[ctx.idioma])
  const aqui = ruta(ctx.idioma, '/admin/categorias')
  const errorId = uno('id')
  const enUso = uno('error') === 'en_uso'
  const abierta = uno('abierta')
  const motivoUso = () => [
    Number(uno('p')) > 0 && t('usoProductos', { n: Number(uno('p')) }),
    Number(uno('s')) > 0 && t('usoSubcategorias', { n: Number(uno('s')) }),
    Number(uno('r')) > 0 && t('usoReglas', { n: Number(uno('r')) }),
  ].filter(Boolean).join(' ')

  function fila(c: CategoriaAdmin, hermanas: number, i: number) {
    const usos = [t('productos', { n: c.productos }), c.atributos ? t('atributos', { n: c.atributos }) : null, c.reglas ? t('regla') : null].filter(Boolean).join(' · ')
    const ocupado = c.productos > 0 || (c.hijas?.length ?? 0) > 0 || c.reglas > 0
    const orden = (mover: 'arriba' | 'abajo', deshabilitado: boolean, icono: string) => (
      <form action={ordenarAccion}>
        <input type="hidden" name="idioma" value={ctx.idioma} /><input type="hidden" name="volver" value={aqui} />
        <input type="hidden" name="id" value={c.id} /><input type="hidden" name="mover" value={mover} />
        <button type="submit" className={a.chico} disabled={deshabilitado} aria-label={t(mover === 'arriba' ? 'subir' : 'bajar', { nombre: c.texto })}>
          <Icono nombre={icono} tam={16} />
        </button>
      </form>
    )
    return (
      <>
        <div className={a.fila} id={`categoria-${c.id}`}>
          <div>
            {c.hijas ? <h2>{c.icono && <Icono nombre={c.icono} tam={18} />}{c.texto}</h2> : <b>{c.texto}</b>}
            <p><code>/c/{c.slug}</code> · {usos}</p>
          </div>
          <div className={a.herramientas}>
            {orden('arriba', i === 0, 'arriba')}
            {orden('abajo', i === hermanas - 1, 'abajo')}
            <Link className={a.chico} href={ruta(ctx.idioma, `/admin/categorias/${c.id}`)} aria-label={t('editarDe', { nombre: c.texto })}>{t('editar')}</Link>
            <form action={borrarCategoriaAccion}>
              <input type="hidden" name="idioma" value={ctx.idioma} /><input type="hidden" name="id" value={c.id} />
              <button type="submit" className={`${a.chico} ${a.chicoPeligro}`} aria-label={t('borrarDe', { nombre: c.texto })}
                aria-describedby={ocupado ? `uso-${c.id}` : undefined}>{t('borrar')}</button>
            </form>
            {ocupado && <span id={`uso-${c.id}`} className="sr-only">{t('noSeBorra')}</span>}
          </div>
        </div>
        {enUso && errorId === String(c.id) && <div className={a.enUso}><Alerta texto={t('enUso', { nombre: c.texto, motivo: motivoUso() })} /></div>}
      </>
    )
  }

  const textos = { admin: { categorias: (mensajes.admin as Record<string, never>).categorias, errores: (mensajes.admin as Record<string, never>).errores } }
  return (
    <>
      <div className={s.cabeza}><div><h1>{t('titulo')}</h1><p>{t('explica', { n: numero.format(arbol.length), m: numero.format(arbol.reduce((x, c) => x + (c.hijas?.length ?? 0), 0)) })}</p></div></div>
      {uno('guardado') && <Aviso texto={t(`guardado.${uno('guardado') === 'borrada' ? 'borrada' : 'nueva'}`)} />}
      {uno('error') && uno('error') !== 'en_uso' && <Alerta texto={ta.has(`errores.${uno('error')}`) ? ta(`errores.${uno('error')}`) : ta('errores.servidor')} />}
      <ul className={a.arbol}>
        {arbol.map((c, i) => (
          <li key={c.id} className={`panel ${a.principal}`}>
            {fila(c, arbol.length, i)}
            {(c.hijas?.length ?? 0) > 0 && (
              // cerradas: son 16 principales y unas 70 subcategorías (en el celular, la lista abierta mide metros).
              // Se abre sola la que acaba de cambiar o tiene un error.
              <details className={a.desplegar} open={c.hijas!.some((h) => String(h.id) === errorId || String(h.id) === abierta)}>
                <summary>{t('verHijas', { n: c.hijas!.length })}</summary>
                <ul className={a.hijas} aria-label={t('subcategoriasDe', { nombre: c.texto })}>
                  {c.hijas!.map((h, j) => <li key={h.id}>{fila(h, c.hijas!.length, j)}</li>)}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
      <section className={`panel ${a.nueva}`} aria-labelledby="t-nueva">
        <h2 id="t-nueva" className={s.panelTitulo} style={{ marginBottom: 'var(--e-4)' }}>{t('nueva')}</h2>
        <Textos locale={LOCALE[ctx.idioma]} mensajes={textos}>
          <FormCategoria accion={guardarCategoriaAccion} idioma={ctx.idioma} principales={arbol.map((c) => ({ id: c.id, texto: c.texto }))} iconos={ICONOS_CATEGORIA} />
        </Textos>
      </section>
    </>
  )
}
