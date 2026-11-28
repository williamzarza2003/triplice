// Piezas que comparten las páginas del admin: la página para quien no es admin, el texto de una acción del registro
// y las iniciales de una tienda.
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { entrarAdminDemoAccion } from '@/app/[idioma]/[mercado]/admin/acciones'
import { modoCuentas } from '@/lib/cuenta/sesion'
import { ruta } from '@/lib/contexto'
import type { Idioma } from '@/lib/i18n/idiomas'
import type { Accion } from '@/lib/admin/tipos'
import { hace } from '@/lib/vender/formato'
import c from '../cuenta/Cuenta.module.css'
import v from '../vender/Vender.module.css'

/** Alguien con sesión que no es admin (o sin perfil de admin): qué es esto y, en la vista previa, cómo probarlo. */
export async function NoAdmin({ idioma }: { idioma: Idioma }) {
  const t = await getTranslations({ locale: idioma, namespace: 'admin.noAdmin' })
  return (
    <section className={`panel ${c.vacio}`} aria-labelledby="t-no-admin">
      <h1 id="t-no-admin" className={v.panelTitulo}>{t('titulo')}</h1>
      <p>{t('texto')}</p>
      {modoCuentas === 'demo' && (
        <>
          <p>{t('demo')}</p>
          <form action={entrarAdminDemoAccion}>
            <input type="hidden" name="idioma" value={idioma} />
            <button type="submit" className="boton boton--marca">{t('boton')}</button>
          </form>
        </>
      )}
      <Link href={ruta(idioma, '/cuenta')}>{t('volver')}</Link>
    </section>
  )
}

/** "MG" para "Mate y Guampa": la marca de la tienda en la lista (con su color). */
export function iniciales(nombre: string) {
  const palabras = nombre.split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(p))
  return (palabras.length > 1 ? palabras[0][0] + palabras[palabras.length - 1][0] : nombre.slice(0, 2)).toUpperCase()
}

/** Una acción del registro: "Mirta Giménez ocultó una reseña «…»", con el motivo y cuándo. */
export async function RenglonRegistro({ a, idioma }: { a: Accion; idioma: Idioma }) {
  const t = await getTranslations({ locale: idioma, namespace: 'admin.registro' })
  const accion = t.has(`acciones.${a.accion}`) ? t(`acciones.${a.accion}`) : a.accion
  return (
    <>
      <span><b>{a.admin_nombre}</b> {accion}{a.objeto_nombre && <> <q>{a.objeto_nombre}</q></>}</span>
      {a.motivo && <span>{t('motivo', { motivo: a.motivo })}</span>}
      <small><time dateTime={a.creado}>{hace(a.creado, idioma)}</time></small>
    </>
  )
}
