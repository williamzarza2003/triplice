import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const conIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite (Postgres en WebAssembly) carga su .wasm y sus extensiones desde node_modules: no se empaqueta
  serverExternalPackages: ['@electric-sql/pglite'],
  // la base embebida que arma `npm run db:construir` y las extensiones que PGlite abre en tiempo de ejecución
  outputFileTracingIncludes: {
    '/**': ['./.datos/**', './node_modules/@electric-sql/pglite/dist/**/*.{wasm,data,tar.gz}'],
    // las fuentes de la marca para el comprobante en PDF
    '/api/comprobante/**': ['./tokens/fuentes/pdf/*.ttf'],
  },
  images: {
    // las fotos ya salen optimizadas del script (WebP en 3 tamaños): el cargador elige el archivo
    loader: 'custom',
    loaderFile: './lib/imagenes.ts',
  },
  poweredByHeader: false,
  experimental: {
    // fotos de opiniones y de productos: el navegador ya las achica, pero un producto con varias variantes pasa 1 MB
    serverActions: { bodySizeLimit: '12mb' },
    // El CSS va incrustado en el HTML: el primer pintado no espera otro archivo.
    inlineCss: true,
    // Por defecto Turbopack junta el CSS de todas las páginas en un solo bloque (72 KB en cada página con la fase 3).
    // Como va incrustado, un bloque más no cuesta un pedido: con requestCost 0 cada página lleva solo lo que importa.
    cssChunking: { type: 'graph', requestCost: 0 },
  },
}

export default conIntl(nextConfig)
