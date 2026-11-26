# Conectar Tríplice a Supabase

La web funciona sin configurar nada: si no encuentra las variables de Supabase, levanta la **misma base PostgreSQL**
embebida en el servidor (PGlite) con las migraciones y el seed de este repo. Así la vista previa de Vercel anda desde
el primer deploy. Con Supabase configurado, los datos salen de tu proyecto y el RLS lo aplica Supabase.

El código no cambia entre los dos modos: las páginas llaman a las mismas funciones SQL (`buscar`, `ficha`, `inicio`…),
con `supabase.rpc` o con PGlite, siempre como rol `anon`.

## 1. Crear el proyecto (lo hace William)

1. Entrá a [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
   - Nombre: `triplice`. Región: **South America (São Paulo)**, la más cercana a la triple frontera.
   - Plan gratuito: permite dos proyectos activos (uno ya es `cambio-cde`).
   - Guardá la contraseña de la base en tu gestor de contraseñas: no la pegues en el chat ni en el repo.
2. Esperá a que termine de crearse (1 o 2 minutos).

## 2. Cargar el esquema y los datos

En el proyecto nuevo → **SQL Editor** → **New query**, pegá y ejecutá, **en este orden**, el contenido completo de:

1. `supabase/migrations/20261125000100_catalogo.sql` (tablas, índices, búsqueda y RLS)
2. `supabase/migrations/20261125000200_funciones.sql` (las funciones que usa la web)
3. `supabase/migrations/20261126000100_compra.sql` (fase 2: impuestos, envío, retiro, cupones, carrito y pedidos)
4. `supabase/migrations/20261126000200_precios_con_impuestos.sql` (fase 2: precios con el impuesto de la región)
5. `supabase/migrations/20261127000100_cuentas.sql` (fase 3: perfiles, direcciones, devoluciones, opiniones con fotos, votos, preguntas y el bucket `resenas` de Storage)
6. `supabase/seed.sql` (323 productos, 15 tiendas, 5.500 reseñas, reglas de impuesto, zonas y cupones; pesa 2,7 MB:
   si el editor se queja del tamaño, usá la opción B)

Opción B, desde tu PC (sin pegar archivos grandes): en el proyecto → **Connect** → copiá la *connection string* de
tipo **Session pooler** y corré, desde la carpeta del repo:

```powershell
$env:SUPABASE_DB_URL = "postgresql://postgres.xxxx:TU_CONTRASEÑA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
```
```powershell
npx -y supabase db push --db-url $env:SUPABASE_DB_URL --include-seed
```

Para comprobar que quedó bien, en el SQL Editor:

```sql
select count(*) from public.productos;              -- 323
select public.buscar('{"q":"pava electirca"}') ->> 'corregido';  -- pava electrica
```

## 3. Variables de entorno en Vercel (las cargás vos)

Proyecto → **Connect** (o *Project Settings → API*): copiá la **Project URL** y la clave **anon public**
y la **service_role** (secreta: solo la usa el servidor para registrar y confirmar pedidos; el resto se lee como anónimo
y el RLS decide qué se ve).

En vercel.com → proyecto **triplice** → *Settings → Environment Variables*, para **Production** y **Preview**:

| Nombre | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | la Project URL (`https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clave anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | la clave service_role (**sin** `NEXT_PUBLIC_`: nunca llega al navegador) |
| `NEXT_PUBLIC_SITIO` | `https://triplice-beta.vercel.app` (imágenes para redes, robots.txt y la vuelta de Stripe; si falta, se usa esa misma) |
| `STRIPE_SECRET_KEY` | la clave secreta **de prueba** de Stripe (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | el secreto del webhook de prueba (`whsec_…`), ver PENDIENTES |
| `TRIPLICE_SECRETO` | 32 caracteres al azar: firma el comprobante que se guarda en el navegador |

Después, **Redeploy** del último deploy de producción (https://triplice-beta.vercel.app). En el pie de página dice de dónde salen los datos:
"Datos servidos por Supabase" o "por PostgreSQL (PGlite)".

## Para desarrollar en local con Supabase

Copiá `.env.example` a `.env.local` y completá las dos variables. Sin `.env.local`, `npm run dev` usa PGlite.

## 4. Cuentas (fase 3): Auth por email y Google

Sin esto, la vista previa usa la cuenta de prueba (solo existe en la base embebida). Con Supabase conectado:

1. **URL de vuelta.** *Authentication → URL Configuration*:
   - **Site URL:** `https://triplice-beta.vercel.app`
   - **Redirect URLs:** `https://triplice-beta.vercel.app/api/auth/callback`, `https://triplice-*-williamzarza.vercel.app/**` (vistas previas de cada rama) y `http://localhost:3000/api/auth/callback`.
2. **Email.** *Authentication → Sign In / Providers → Email*: dejalo prendido (viene así). Entra con un enlace; no hace falta contraseña. El plan gratuito manda pocos correos por hora: para más, configurá un SMTP propio en *Authentication → Emails*.
3. **Google.** En [console.cloud.google.com](https://console.cloud.google.com) → *APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth* (tipo *Aplicación web*). En *URI de redireccionamiento autorizados* poné la que muestra Supabase en *Sign In / Providers → Google* (termina en `/auth/v1/callback`). Copiá el *ID de cliente* y el *secreto* en ese mismo panel de Supabase y prendé Google.
4. Las fotos de las opiniones usan el bucket `resenas`, que crea la migración de la fase 3 (público, 1 MB por foto, solo WebP: el servidor ya las convierte).
