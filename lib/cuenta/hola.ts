// Cookie del saludo del encabezado ("Hola, Lorena"). La lee el navegador para que el encabezado siga siendo
// estático (igual que el contador del carrito). No guarda nada privado ni da acceso a nada: la sesión real
// la verifica siempre el servidor.
export const COOKIE_HOLA = 'triplice_hola'

export function leerHola(cookie: string | undefined): string | null {
  if (!cookie) return null
  try {
    // Next codifica el valor otra vez al guardar la cookie: "Rubén" llega como "Rub%25C3%25A9n" → dos vueltas
    let nombre = decodeURIComponent(cookie)
    if (/%[0-9A-F]{2}/i.test(nombre)) nombre = decodeURIComponent(nombre)
    nombre = nombre.trim().slice(0, 30)
    return nombre || null
  } catch {
    return null
  }
}

/**
 * Fase 5: si la persona es admin, el menú de la cuenta muestra el enlace a la administración. Igual que el saludo: no
 * guarda nada privado ni da acceso a nada (cada página del admin lo verifica en la base con es_admin()).
 */
export const COOKIE_ADMIN = 'triplice_admin'
