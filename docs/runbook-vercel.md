# Runbook — despliegue en Vercel

La producción de esta fase es Vercel + Neon (ADR-0006). El import de GitHub
tiene que tratar el repo como **monorepo pnpm**, no como una app Next suelta.

## Import

URL típica:

`https://vercel.com/new/import?...&s=https://github.com/leonardeco/NEXA-Sports-Nutrition`

En el formulario:

| Campo | Valor |
|---|---|
| Framework | Next.js |
| Root Directory | `apps/web` (Vercel lo propone solo; está bien) |
| Project Name | `nexa` (no dejes `web`) |
| Build Command | dejar el default: Vercel corre `vercel-build` de `@nexa/web` |
| Install Command | default (`pnpm install` desde el workspace) |
| Node | 22.x |

`vercel-build` genera el cliente de Prisma y después hace `next build`.
Sin ese paso el deploy falla: `packages/db/generated` no está en git.

## Variables (Production y Preview)

Obligatorias para que arranque:

| Variable | Qué poner |
|---|---|
| `DATABASE_URL` | Neon **pooled** (`-pooler.`) |
| `DIRECT_URL` | Neon **direct** (sin pooler), para migraciones |
| `NEXT_PUBLIC_SITE_URL` | `https://<proyecto>.vercel.app` (luego el dominio) |
| `ADMIN_SESSION_SECRET` | ≥ 32 caracteres aleatorios |
| `CRON_SECRET` | ≥ 16 caracteres. Vercel lo manda en el cron como `Authorization: Bearer` |
| `NEXA_SHIPPING_FLAT_CENTS` | `1200000` |

Opcionales (sin ellas la tienda sigue, RNF-03):

| Variable | Efecto si falta |
|---|---|
| `WOMPI_*` (4 claves) | No hay botón de pago; queda WhatsApp |
| `ANTHROPIC_API_KEY` | El asesor responde 503 |
| `VOYAGE_API_KEY` | Búsqueda solo por texto |

`NEXT_PUBLIC_*` se inyectan en el build: si cambias `NEXT_PUBLIC_SITE_URL` o
la clave pública de Wompi, hay que **redesplegar**.

## Después del primer deploy

Desde tu máquina, contra Neon (no hace falta Vercel CLI):

```bash
# .env local apuntando a las mismas cadenas de Neon
pnpm db:migrate:deploy
pnpm db:seed
pnpm db:admin tu@correo.com "una contraseña larga"
pnpm db:embed   # solo si hay VOYAGE_API_KEY
```

Webhook de Wompi (sandbox) en el dashboard de Wompi:

```
https://<proyecto>.vercel.app/api/webhooks/wompi
```

## Cron (RF-09)

El plan **Hobby** rechaza cualquier cron más de una vez al día. Por eso el
manifiesto usa `0 6 * * *` (06:00 UTC = 01:00 en Colombia). Las reservas
pueden quedar retenidas hasta ~24 h; en Pro se puede volver a `*/5 * * * *`.

Disparo a mano:

```bash
curl -X GET https://<proyecto>.vercel.app/api/cron/expire-orders \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Qué no hacer

- Root Directory = raíz del repo, sin `vercel-build`: Vercel no encuentra
  `next.config` y el build no genera Prisma.
- Poner `DATABASE_URL` solo en Runtime y no en Build: `prisma generate` falla.
- Commitear `.env`.
