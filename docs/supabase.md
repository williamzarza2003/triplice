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
3. `supabase/seed.sql` (365 productos, 15 tiendas, 6.400 reseñas; pesa 2,9 MB: si el editor se queja del tamaño,
   usá la opción B)

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
select count(*) from public.productos;              -- 365
select public.buscar('{"q":"pava electirca"}') ->> 'corregido';  -- pava electrica
```

## 3. Variables de entorno en Vercel (las cargás vos)

Proyecto → **Connect** (o *Project Settings → API*): copiá la **Project URL** y la clave **anon public**
(la `service_role` no se usa: la web solo lee como anónimo y el RLS decide qué se ve).

En vercel.com → proyecto **triplice** → *Settings → Environment Variables*, para **Production** y **Preview**:

| Nombre | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | la Project URL (`https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clave anon public |
| `NEXT_PUBLIC_SITIO` | la URL de la vista previa o del dominio (para las imágenes de redes) |

Después, **Redeploy** del último deploy de `fase-1`. En el pie de página dice de dónde salen los datos:
"Datos servidos por Supabase" o "por PostgreSQL (PGlite)".

## Para desarrollar en local con Supabase

Copiá `.env.example` a `.env.local` y completá las dos variables. Sin `.env.local`, `npm run dev` usa PGlite.
