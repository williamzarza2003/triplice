// Al arrancar el servidor: si no hay Supabase, se empieza a abrir la base embebida (PGlite) en segundo plano,
// así la primera búsqueda no paga los segundos de carga en frío.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { precalentar } = await import('./lib/datos/fuente')
  precalentar()
}
