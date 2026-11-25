'use client'
// Región, moneda e idioma. Se guardan en cookies (las lee proxy.ts) y la página se vuelve a pedir:
// los precios salen del servidor ya convertidos, nunca se recalculan en el navegador.
import { useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTextos } from '@/lib/i18n/textos'
import { IDIOMAS, NOMBRE_IDIOMA, type Idioma } from '@/lib/i18n/idiomas'
import { guardarPreferencias } from '@/lib/preferencias'
import { MONEDA_DE, MONEDAS, REGIONES, type Moneda, type Region } from '@/lib/region'
import { REGLAS } from '@/lib/precios'
import { Icono } from '../Icono'
import s from './SelectorRegion.module.css'

export function SelectorRegion({ idioma, region, moneda }: { idioma: Idioma; region: Region; moneda: Moneda }) {
  const t = useTextos('region')
  const tc = useTextos('comun')
  const te = useTextos('encabezado')
  const dialogo = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const camino = usePathname()
  const [r, setR] = useState(region)
  const [m, setM] = useState(moneda)
  const [i, setI] = useState(idioma)

  function abrir() {
    setR(region); setM(moneda); setI(idioma)
    dialogo.current?.showModal()
  }

  function elegirRegion(nueva: Region) {
    // si la moneda acompañaba a la región, la sigue; si la persona eligió otra a mano, se respeta
    if (m === MONEDA_DE[r]) setM(MONEDA_DE[nueva])
    setR(nueva)
  }

  function confirmar(e: React.FormEvent) {
    e.preventDefault()
    guardarPreferencias({ region: r, moneda: m, idioma: i })
    dialogo.current?.close()
    if (i !== idioma) {
      // misma página en el otro idioma: /es/p/x → /pt/p/x
      router.push(camino.replace(/^\/(es|pt|en)(?=\/|$)/, `/${i}`))
    }
    router.refresh()
  }

  return (
    <>
      <button type="button" className={s.boton} onClick={abrir} aria-haspopup="dialog">
        <span className={s.pais}>{tc(`paises.${region}`)}</span>
        <span className={s.moneda}>{REGLAS[moneda].simbolo} {moneda} · {idioma.toUpperCase()}</span>
        <span className="sr-only">{te('regionAclaracion')}</span>
        <Icono nombre="abajo" tam={16} className={s.flecha} />
      </button>

      <dialog ref={dialogo} className={s.dialogo} aria-labelledby="titulo-region">
        <form className={s.cuerpo} onSubmit={confirmar}>
          <h2 id="titulo-region">{t('titulo')}</h2>
          <p className={s.ayuda}>{t('ayuda')}</p>
          <fieldset className={s.regiones}>
            <legend>{t('leyendaRegion')}</legend>
            {REGIONES.map((x) => (
              <label key={x}>
                <input type="radio" name="region" value={x} checked={r === x} onChange={() => elegirRegion(x)} />
                <span>
                  <b>{tc(`paises.${x}`)}</b>
                  <small>{t('monedaDe', { moneda: `${REGLAS[MONEDA_DE[x]].simbolo} ${MONEDA_DE[x]}` })}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className={s.selects}>
            <label>{t('moneda')}
              <select value={m} onChange={(e) => setM(e.target.value as Moneda)}>
                {MONEDAS.map((x) => <option key={x} value={x}>{t(`monedas.${x}`)}</option>)}
              </select>
            </label>
            <label>{t('idioma')}
              <select value={i} onChange={(e) => setI(e.target.value as Idioma)}>
                {IDIOMAS.map((x) => <option key={x} value={x} lang={x}>{NOMBRE_IDIOMA[x]}</option>)}
              </select>
            </label>
          </div>
          <p className={s.nota}><Icono nombre="info" tam={16} />{t('sinImpuestos')}</p>
          <div className={s.acciones}>
            <button type="button" className="boton boton--sec" onClick={() => dialogo.current?.close()}>{t('cancelar')}</button>
            <button type="submit" className="boton boton--marca">{t('guardar')}</button>
          </div>
        </form>
      </dialog>
    </>
  )
}
