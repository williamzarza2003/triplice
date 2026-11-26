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
  },
  images: {
    // las fotos ya salen optimizadas del script (WebP en 3 tamaños): el cargador elige el archivo
    loader: 'custom',
    loaderFile: './lib/imagenes.ts',
  },
  poweredByHeader: false,
  // el CSS de todo el sitio pesa ~8 KB comprimido: incrustado en el HTML, el primer pintado no espera otro archivo
  experimental: { inlineCss: true },
}

export default conIntl(nextConfig)
