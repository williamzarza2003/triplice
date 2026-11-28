'use client'
// "Agregar los dos al carrito". Sin JavaScript, el formulario agrega y lleva al carrito; con JavaScript, agrega sin
// salir de la ficha y avisa al contador del encabezado.
import { useActionState } from 'react'
import Link from 'next/link'
import type { EstadoCombo } from '@/app/[idioma]/[mercado]/descubrir/acciones'
import { useTextos } from '@/lib/i18n/textos'
import { Icono } from '../Icono'
import s from './Descubrir.module.css'

type Props = { accion: (e: EstadoCombo, f: FormData) => Promise<EstadoCombo>; slugs: string[]; idioma: string; carrito: string }

export function BotonCombo({ accion, slugs, idioma, carrito }: Props) {
  const t = useTextos('descubrir')
  const [estado, enviar, enviando] = useActionState<EstadoCombo, FormData>(async (prev, fd) => {
    fd.set('js', '1')
    const r = await accion(prev, fd)
    if (r?.ok) window.dispatchEvent(new Event('triplice:carrito'))
    return r
  }, null)
  return (
    <form action={enviar}>
      {slugs.map((x) => <input key={x} type="hidden" name="slug" value={x} />)}
      <input type="hidden" name="idioma" value={idioma} />
      <button type="submit" className="boton boton--accion boton--ancho" disabled={enviando}>
        <Icono nombre="carrito" tam={20} />{enviando ? t('juntosAgregando') : t('juntosAgregar')}
      </button>
      <p className={s.listo} role="status" style={{ marginTop: 8 }}>
        {estado?.ok && <>{t('juntosAgregados')} <Link href={carrito}>{t('juntosVerCarrito')}</Link></>}
        {estado?.error && t('juntosSinStock')}
      </p>
    </form>
  )
}
