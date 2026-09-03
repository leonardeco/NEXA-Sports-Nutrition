# NEXA Sports Nutrition

Tienda de suplementos deportivos: catálogo sobre PostgreSQL, cobro en línea con Wompi y
un asistente de ventas que consulta el catálogo real.

Refactor de [`sports-store`](https://github.com/leonardeco/sports-store) (LEOFIT), que era
una SPA estática con los productos en un archivo JSON y los pedidos por WhatsApp.

## Stack

| Capa | Tecnología |
|---|---|
| Front y BFF | Next.js 15 (App Router), React 19, TypeScript estricto |
| Estilos | Tailwind CSS 4 con tokens de marca en `packages/ui` |
| Dominio | `packages/core` — sin dependencias de framework |
| Datos | PostgreSQL 17 + pgvector, Prisma 6 |
| Pagos | Wompi (PSE, Nequi, tarjeta, Bancolombia) |
| Asistente | Uso de herramientas sobre el catálogo |
| Despliegue | Vercel + Neon |

## Estructura

```
apps/web/          Next.js: rutas públicas, panel de administración y API
packages/core/     Dominio puro: entidades, casos de uso y puertos
packages/db/       Prisma: esquema, migraciones y repositorios
packages/ui/       Tokens de marca y componentes
infra/docker/      Entorno de desarrollo local
infra/k8s/         Manifiestos de portabilidad (ver más abajo)
docs/              Constitución, ADS y decisiones de arquitectura
```

## Puesta en marcha

Requisitos: Node 20.11 o superior, pnpm 10, Docker Desktop.

```bash
pnpm install
cp .env.example .env
pnpm docker:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

La aplicación queda en `http://localhost:3000` y Adminer en `http://localhost:8080`
(servidor `postgres`, usuario `nexa`, contraseña `nexa`).

Sin Docker, la aplicación también arranca apuntando `DATABASE_URL` a una base de Neon.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción |
| `pnpm lint` | ESLint, incluida la frontera del dominio |
| `pnpm typecheck` | TypeScript en los cuatro paquetes |
| `pnpm test` | Tests unitarios |
| `pnpm db:migrate` | Aplica migraciones en desarrollo |
| `pnpm db:studio` | Explorador de datos de Prisma |
| `pnpm docker:up` / `docker:down` | Levanta o para PostgreSQL |
| `pnpm docker:reset` | Destruye el volumen de datos |

## Reglas del proyecto

Las reglas permanentes están en [`docs/constitution.md`](docs/constitution.md). Dos que
conviene conocer antes de tocar código:

**El dominio no conoce el framework.** `packages/core` no puede importar `next`,
`@prisma/client` ni `react`. No es una recomendación: ESLint lo bloquea y el PR no pasa.
Gracias a eso, extraer el dominio a un servicio propio el día que haga falta no exige
reescribir lógica de negocio.

**El servidor es la única fuente de verdad del dinero y del stock.** Los totales se
recalculan siempre desde la base de datos; ningún importe enviado por el cliente se usa
para cobrar. Todo movimiento de inventario queda registrado.

## Sobre Kubernetes

Los manifiestos de `infra/k8s` **no son el despliegue en uso**. La producción de esta fase
es Vercel con la base de datos en Neon, y Vercel no ejecuta Kubernetes. Los manifiestos
existen para demostrar que la aplicación es portable y como ruta de salida si algún día
Vercel deja de encajar. CI construye la imagen Docker en cada PR para que no envejezcan
sin uso. El razonamiento completo está en
[ADR-0006](docs/hydraia/adr/0006-kubernetes-como-portabilidad.md).

## Documentación

- [Constitución](docs/constitution.md) — reglas permanentes
- [ADS](docs/ads/ADS-NEXA-v1.md) — análisis y diseño del sistema
- [Decisiones de arquitectura](docs/hydraia/adr/) — ADR-0001 a ADR-0007

## Estado

| Fase | Estado |
|---|---|
| F0 · Fundaciones | Completa |
| F1 · Catálogo | Siguiente |
| F2 · Carrito y órdenes | Pendiente |
| F3 · Pagos Wompi | Pendiente |
| F4 · Asistente | Pendiente |
| F5 · Endurecimiento | Pendiente |
| F6 · Portabilidad | Pendiente |

## Licencia

Uso privado. Todos los derechos reservados.
