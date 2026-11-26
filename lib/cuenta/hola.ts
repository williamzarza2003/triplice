// Cookie del saludo del encabezado ("Hola, Lorena"). La lee el navegador para que el encabezado siga siendo
// estático (igual que el contador del carrito). No guarda nada privado ni da acceso a nada: la sesión real
// la verifica siempre el servidor.
export const COOKIE_HOLA = 'triplice_hola'

export function leerHola(cookie: string | undefined): string | null {
  if (!cookie) return null
  try {
    const nombre = decodeURIComponent(cookie).trim().slice(0, 30)
    return nombre || null
  } catch {
    return null
  }
}
