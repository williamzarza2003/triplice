// URL pública del sitio: imágenes para redes, robots.txt y la vuelta de Stripe.
// En Vercel conviene cargar NEXT_PUBLIC_SITIO; si falta, se usa el dominio de producción.
// (triplice.vercel.app es de otra persona: el nuestro es triplice-beta.)
export const SITIO_PRODUCCION = 'https://triplice-beta.vercel.app'

export const SITIO = (process.env.NEXT_PUBLIC_SITIO || SITIO_PRODUCCION).replace(/\/+$/, '')
