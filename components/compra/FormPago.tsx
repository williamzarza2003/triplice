'use client'
// Formulario de pago en tres pasos de verdad (entrega → tus datos → pago). Los montos de cada opción de
// entrega llegan calculados del servidor; el navegador solo elige cuál mostrar. Al pagar, el servidor vuelve
// a calcular todo y, si algo cambió, avisa en vez de cobrar otro monto.
import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EstadoPago } from '@/app/[idioma]/[mercado]/pagar/acciones'
import type { Campo } from '@/lib/compra/direccion'
import { normalizar } from '@/lib/texto'
import { Icono } from '../Icono'
import s from './Pago.module.css'

export type OpcionEntrega = {
  clave: 'retiro' | 'frontera' | 'pais' | 'mundo'
  total: number
  totalTexto: string
  envioTexto: string
  plazo: string
  nombre: string
  ciudades: string[]
}

type Textos = {
  pasoEntrega: string; pasoDatos: string; pasoPago: string; retiro: string; domicilio: string; gratis: string
  datosRetiro: string; pagar: string; procesando: string; notaStripe: string; notaSimulado: string; protegida: string
  zonaElegida: string; errores: Record<string, string>; generales: Record<'sin_items' | 'cambio' | 'pago', string>
  campos: Partial<Record<Campo, string>>; ayudas: Partial<Record<Campo, string>>; opcional: string
}

type Props = {
  accion: (e: EstadoPago, f: FormData) => Promise<EstadoPago>
  idioma: string; mercado: string; region: string
  opciones: OpcionEntrega[]
  camposDireccion: { campo: Campo; requerido: boolean }[]
  sugerencias: Partial<Record<Campo, string[]>>
  proveedor: 'stripe' | 'simulado'
  textos: Textos
  retiro: React.ReactNode
  resumenes: Record<string, React.ReactNode>
}

const AUTOCOMPLETAR: Partial<Record<Campo, string>> = {
  nombre: 'name', email: 'email', telefono: 'tel', ciudad: 'address-level2', direccion: 'street-address', codigo: 'postal-code',
}

export function FormPago({ accion, idioma, mercado, region, opciones, camposDireccion, sugerencias, proveedor, textos, retiro, resumenes }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null)
  const [modo, setModo] = useState<'retiro' | 'domicilio'>(estado?.valores.modo === 'domicilio' ? 'domicilio' : 'retiro')
  const [ciudad, setCiudad] = useState(estado?.valores.ciudad ?? '')
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)

  const domicilio = opciones.filter((o) => o.clave !== 'retiro')
  const ambito = region === 'XX' ? 'mundo' : domicilio.find((o) => o.clave === 'frontera' && o.ciudades.includes(normalizar(ciudad))) ? 'frontera' : 'pais'
  const elegida = modo === 'retiro' ? opciones.find((o) => o.clave === 'retiro')! : domicilio.find((o) => o.clave === ambito) ?? domicilio[0]
  const errores = estado?.errores ?? {}

  // si cambió un precio o el stock, se vuelven a pedir los montos; y el foco va al primer error
  useEffect(() => {
    if (estado?.general === 'cambio') router.refresh()
    const primero = form.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-error-general]')
    primero?.focus()
  }, [estado, router])

  const campo = (c: Campo, requerido: boolean, ancho: string) => (
    <label key={c} className={`${s.campo} ${s[ancho]}`} data-error={errores[c] ? true : undefined}>
      <span>{textos.campos[c]}{!requerido && <small> {textos.opcional}</small>}</span>
      <input name={c} defaultValue={estado?.valores[c] ?? ''} autoComplete={AUTOCOMPLETAR[c]} required={requerido}
        type={c === 'email' ? 'email' : c === 'telefono' ? 'tel' : 'text'} inputMode={c === 'codigo' && region !== 'XX' ? (region === 'AR' ? 'text' : 'numeric') : undefined}
        list={sugerencias[c]?.length ? `sug-${c}` : undefined}
        onChange={c === 'ciudad' ? (e) => setCiudad(e.target.value) : undefined}
        aria-invalid={errores[c] ? true : undefined} aria-describedby={errores[c] ? `err-${c}` : textos.ayudas[c] ? `ayu-${c}` : undefined} />
      {sugerencias[c]?.length ? <datalist id={`sug-${c}`}>{sugerencias[c]!.map((x) => <option key={x} value={x} />)}</datalist> : null}
      {textos.ayudas[c] && !errores[c] && <small id={`ayu-${c}`}>{textos.ayudas[c]}</small>}
      {errores[c] && <span id={`err-${c}`} className={s.error}><Icono nombre="info" tam={16} />{textos.errores[`${errores[c]}${c === 'codigo' || c === 'zona' ? `_${region}` : ''}`] ?? textos.errores[errores[c]!]}</span>}
    </label>
  )

  return (
    <form ref={form} action={enviar} className={s.pago} noValidate>
      <input type="hidden" name="idioma" value={idioma} />
      <input type="hidden" name="mercado" value={mercado} />
      <input type="hidden" name="modo" value={modo} />
      <input type="hidden" name="total" value={elegida.total} />

      <div className={s.pasos}>
        <section className="panel" aria-labelledby="t-entrega">
          <h2 id="t-entrega" className={s.paso}><span aria-hidden="true">1</span>{textos.pasoEntrega}</h2>
          <fieldset className={s.opciones}>
            <legend className="sr-only">{textos.pasoEntrega}</legend>
            <label className={s.opcion}>
              <input type="radio" name="modo_radio" checked={modo === 'retiro'} onChange={() => setModo('retiro')} />
              <span><b>{textos.retiro}</b><small>{opciones.find((o) => o.clave === 'retiro')!.plazo}</small></span>
              <b className={s.gratis}>{textos.gratis}</b>
            </label>
            <label className={s.opcion}>
              <input type="radio" name="modo_radio" checked={modo === 'domicilio'} onChange={() => setModo('domicilio')} />
              <span><b>{textos.domicilio}</b><small>{modo === 'domicilio' ? `${elegida.nombre} · ${elegida.plazo}` : domicilio.map((o) => o.nombre).join(' · ')}</small></span>
              <b>{modo === 'domicilio' ? elegida.envioTexto : domicilio.map((o) => o.envioTexto).sort()[0]}</b>
            </label>
          </fieldset>
          {modo === 'retiro' ? <div className={s.retiro}>{retiro}</div> : (
            <div className={s.grupo}>
              {camposDireccion.map(({ campo: c, requerido }) => campo(c, requerido, c === 'direccion' || c === 'referencia' ? 'c6' : 'c3'))}
              <p className={`${s.c6} ${s.zona}`} role="status"><Icono nombre="camion" tam={16} />{textos.zonaElegida.replace('{zona}', elegida.nombre).replace('{plazo}', elegida.plazo).replace('{envio}', elegida.envioTexto)}</p>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="t-datos">
          <h2 id="t-datos" className={s.paso}><span aria-hidden="true">2</span>{textos.pasoDatos}</h2>
          {modo === 'retiro' && <p className={s.ayuda}>{textos.datosRetiro}</p>}
          <div className={s.grupo}>
            {campo('nombre', true, 'c6')}
            {campo('email', true, 'c3')}
            {campo('telefono', true, 'c3')}
          </div>
        </section>

        <section className="panel" aria-labelledby="t-pagar">
          <h2 id="t-pagar" className={s.paso}><span aria-hidden="true">3</span>{textos.pasoPago}</h2>
          <p className={s.prueba}>{proveedor === 'stripe' ? textos.notaStripe : textos.notaSimulado}</p>
        </section>
      </div>

      <aside className={`panel ${s.resumen}`} aria-labelledby="t-tu-pedido">
        {resumenes[elegida.clave]}
        {estado?.general && (
          <p className={s.error} role="alert" tabIndex={-1} data-error-general><Icono nombre="info" tam={16} />{textos.generales[estado.general]}</p>
        )}
        <button type="submit" className="boton boton--accion boton--ancho" disabled={pendiente}>
          {pendiente ? textos.procesando : (
            // el monto en Schibsted: la fuente de los botones tiene el cero con barra
            <>{textos.pagar.split('{total}')[0]}<span className="numero">{elegida.totalTexto}</span>{textos.pagar.split('{total}')[1]}</>
          )}
        </button>
        <p className={s.nota}><Icono nombre="escudo" tam={16} />{textos.protegida}</p>
      </aside>
    </form>
  )
}
