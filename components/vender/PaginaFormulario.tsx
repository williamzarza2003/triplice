// Lo que comparten "Publicar un producto" y "Editar producto": la sesión, las categorías con sus atributos, los colores,
// las cotizaciones y los impuestos de los tres países (para que el formulario muestre el precio final como lo ve el
// comprador) y los textos del formulario para el navegador.
import Link from 'next/link'
import { getMessages, getTranslations } from 'next-intl/server'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import COLORES from '@/lib/catalogo/colores.json'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { sinTienda, type CategoriaForm, type ProductoEdicion, type TiendaPanel } from '@/lib/vender/tipos'
import { guardarProductoAccion } from '@/app/[idioma]/[mercado]/vender/acciones'
import { NoVendedor } from './Comunes'
import { FormProducto } from './FormProducto'
import s from './Vender.module.css'

export async function PaginaFormulario({ id }: { id: string | null }) {
  const ctx = await contexto()
  const { demo } = await conSesion(ctx.idioma, id ? `/vender/productos/${id}` : '/vender/productos/nuevo')
  const [t, tf, mensajes, tienda, categorias, producto] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'vender.form' }),
    getTranslations({ locale: ctx.idioma, namespace: 'ficha.opcionNombre' }),
    getMessages({ locale: ctx.idioma }),
    rpcCuenta<TiendaPanel | null>('mi_tienda_datos'),
    rpcCuenta<CategoriaForm[]>('vendedor_categorias', { idioma: ctx.idioma }),
    id && /^[0-9a-f-]{36}$/.test(id) ? rpcCuenta<ProductoEdicion | null>('vendedor_producto', { id }) : Promise.resolve(null),
  ])
  if (!tienda || sinTienda(tienda)) return <NoVendedor idioma={ctx.idioma} />
  const colores = Object.entries(COLORES as Record<string, Record<string, string>>)
    .map(([clave, c]) => ({ clave, nombre: c[ctx.idioma] ?? c.es, hex: c.hex }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, LOCALE[ctx.idioma]))
  const nombresEje = Object.fromEntries(['color', 'almacenamiento', 'contenido', 'medida', 'talle'].map((e) => [e, tf(e)]))
  const v = mensajes.vender as Record<string, unknown>

  if (id && !producto) {
    return (
      <section className="panel">
        <h1 className={s.panelTitulo}>{t('editar')}</h1>
        <p className={s.sub}>{(mensajes.vender as { errores: Record<string, string> }).errores.no_existe}</p>
        <Link href={ruta(ctx.idioma, '/vender/productos')}>{t('volver')}</Link>
      </section>
    )
  }
  return (
    <>
      <p><Link href={ruta(ctx.idioma, '/vender/productos')}>{t('volver')}</Link></p>
      <div className={s.cabeza}>
        <div>
          <h1>{producto ? t('editar') : t('nuevo')}</h1>
          {producto && <p>{producto.titulo[ctx.idioma] ?? producto.titulo.es}</p>}
        </div>
        {producto && <Link href={ruta(ctx.idioma, `/p/${producto.slug}`)}>{(v.productos as Record<string, string>).verFicha}</Link>}
      </div>
      {demo && <AvisoDemo texto={t('demoFotos')} />}
      <Textos locale={LOCALE[ctx.idioma]} mensajes={{ vender: { form: v.form, errores: v.errores } as never }}>
        <FormProducto accion={guardarProductoAccion} categorias={categorias ?? []} producto={producto} colores={colores}
          tasas={ctx.tasas} impuestos={ctx.impuestosPaises} idioma={ctx.idioma} nombresEje={nombresEje} />
      </Textos>
    </>
  )
}
