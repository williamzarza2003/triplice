// Comparar vendedores de un mismo producto. Módulo puro: recibe el precio ya convertido y redondeado en la
// moneda que ve el comprador, porque eso es lo que compara la gente (US$ 18,00 y US$ 18,01 se ven los dos
// como ₲ 132.000: para quien mira, es un empate).

export type Comparable = {
  /** precio en la moneda del comprador, redondeado como se muestra */
  precio: number
  stock: number
  /** horas hasta que la tienda lo tiene listo para enviar o retirar */
  preparacionH: number
  /** % de compradores que recomiendan la tienda (desempate final) */
  recomendacion?: number | null
}

/**
 * Orden de la tabla de vendedores: primero el precio; con el mismo precio, la entrega más rápida; y si
 * también empatan, la tienda mejor recomendada. No muta el arreglo.
 */
export function ordenarOfertas<T extends Comparable>(ofertas: readonly T[]): T[] {
  return [...ofertas].sort((a, b) =>
    a.precio - b.precio
    || a.preparacionH - b.preparacionH
    || (b.recomendacion ?? 0) - (a.recomendacion ?? 0))
}

/**
 * La oferta que merece la etiqueta "Más barato": la de menor precio entre las que tienen stock, y solo si
 * ninguna otra con stock cuesta lo mismo. Con empate (o con una sola oferta disponible) no hay "más barato".
 */
export function masBarata<T extends Comparable>(ofertas: readonly T[]): T | null {
  const disponibles = ofertas.filter((o) => o.stock > 0)
  if (disponibles.length < 2) return null
  const [primera, segunda] = ordenarOfertas(disponibles)
  return primera.precio < segunda.precio ? primera : null
}
