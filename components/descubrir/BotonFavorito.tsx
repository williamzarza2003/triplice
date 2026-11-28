'use client'
// El corazón: un botón con aria-pressed dentro de un formulario (sin JavaScript, el formulario llama a la acción y,
// sin cuenta, lleva a entrar). Con JavaScript marca al instante, guarda en la cuenta y late una vez.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { favoritoAccion, favoritoFormAccion } from '@/app/[idioma]/[mercado]/descubrir/acciones'
import { conSesion, entrarParaFavorito, marcarFavorito, useDescubrir } from '@/lib/descubrir/estado'
import { useTextos } from '@/lib/i18n/textos'
import { Icono } from '../Icono'
import s from './Descubrir.module.css'

type Props = { slug: string; idioma: string; titulo: string; ancho?: boolean }

export function BotonFavorito({ slug, idioma, titulo, ancho = false }: Props) {
  const t = useTextos('descubrir')
  const { favoritos } = useDescubrir()
  const marcado = favoritos.has(slug)
  const [latido, setLatido] = useState(false)
  const [, empezar] = useTransition()
  const [error, setError] = useState(false)
  const router = useRouter()

  function tocar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!conSesion()) { router.push(entrarParaFavorito(idioma, slug)); return }
    const quiere = !marcado
    marcarFavorito(slug, quiere)
    setError(false)
    if (quiere) { setLatido(true); setTimeout(() => setLatido(false), 450) }
    const fd = new FormData(e.currentTarget)
    fd.set('favorito', quiere ? '1' : '0')
    empezar(async () => {
      const r = await favoritoAccion(fd).catch(() => null)
      if (!r || 'error' in r) { marcarFavorito(slug, !quiere); setError(true) }
    })
  }

  // un botón con aria-pressed tiene que decir siempre lo mismo: el lector anuncia "presionado" o no
  const etiqueta = t('favoritoDe', { titulo })
  return (
    <form action={favoritoFormAccion} onSubmit={tocar} className={ancho ? undefined : s.formFoto}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="idioma" value={idioma} />
      <button type="submit" aria-pressed={marcado} aria-label={ancho ? undefined : etiqueta} title={ancho ? undefined : etiqueta}
        className={`${ancho ? s.corazonAncho : `${s.corazon} ${s.enTarjeta}`} ${latido ? s.latido : ''}`}>
        <Icono nombre="corazon" tam={ancho ? 20 : 19} />
        {ancho && <span>{t('favorito')}</span>}
      </button>
      {error && <span className="sr-only" role="alert">{t('errorFavorito')}</span>}
    </form>
  )
}
