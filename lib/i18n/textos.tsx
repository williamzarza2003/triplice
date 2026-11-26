'use client'
// Textos para los componentes del navegador. Cada parte de la página recibe solo los textos que usa
// (el encabezado los suyos, la ficha los de la compra), y un proveedor dentro de otro suma los dos.
import { createContext, useContext, useMemo } from 'react'
import { formatear, type Valores } from './formato'

type Arbol = { [clave: string]: string | Arbol }
type Valor = { locale: string; mensajes: Arbol }

const Contexto = createContext<Valor>({ locale: 'es-PY', mensajes: {} })

export function Textos({ locale, mensajes, children }: { locale: string; mensajes: Arbol; children: React.ReactNode }) {
  const padre = useContext(Contexto)
  const valor = useMemo(() => ({ locale, mensajes: { ...padre.mensajes, ...mensajes } }), [locale, mensajes, padre.mensajes])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** Como useTranslations de next-intl: t('clave', { n: 2 }) dentro de un grupo de messages/*.json. */
export function useTextos(grupo: string) {
  const { locale, mensajes } = useContext(Contexto)
  return (clave: string, valores?: Valores) => {
    let nodo: string | Arbol | undefined = mensajes[grupo]
    for (const parte of clave.split('.')) nodo = typeof nodo === 'object' ? nodo[parte] : undefined
    return typeof nodo === 'string' ? formatear(nodo, locale, valores) : `${grupo}.${clave}`
  }
}
