/** "Foz do Iguaçu" → "foz do iguacu": para comparar ciudades escritas a mano con la lista de la base. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
