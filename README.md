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

Requisitos: Node 20.11 o superior y pnpm 10.

```bash
pnpm install
cp .env.example .env
```

Rellena al menos `DATABASE_URL` y `DIRECT_URL` en el `.env`. Hay dos caminos:

**Neon** (es lo que se usa). Crea un proyecto y copia las dos cadenas: la de *pooled
connection* va en `DATABASE_URL` y la *direct* en `DIRECT_URL`.

**Docker**, si prefieres una base local:

```bash
pnpm docker:up   # PostgreSQL en :5432 y Adminer en :8080
```

Luego, en cualquiera de los dos casos:

```bash
pnpm db:migrate                                    # aplica el esquema
pnpm db:seed                                       # carga los 127 productos
pnpm db:admin correo@ejemplo.com "una contraseña"  # crea el acceso al panel
pnpm dev
```

La aplicación queda en `http://localhost:3000` y el panel en `/acceso`.

El seed es idempotente y aborta si no salen 127 productos, 127 variantes y el stock total
exacto: prefiere no cargar nada a cargar el catálogo a medias.

> **El `.env` vive solo en la raíz del monorepo.** Prisma lo carga con `dotenv -e ../../.env`
> en los scripts de `@nexa/db`, y Next desde `apps/web/next.config.ts`. Si aparece
> `Environment variable not found: DATABASE_URL`, es que algo se saltó ese puente.

## Variables de entorno

Todas están en [`.env.example`](.env.example) con su explicación. Las que hay que conocer:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` · `DIRECT_URL` | Conexión con y sin pooling |
| `NEXA_SHIPPING_FLAT_CENTS` | Tarifa plana de envío nacional, en centavos. `1200000` = $12.000 |
| `ADMIN_SESSION_SECRET` | Firma la sesión del panel. Mínimo 32 caracteres, o el panel queda inaccesible a propósito |
| `CRON_SECRET` | Autoriza el job que libera reservas vencidas |
| `WOMPI_*` | Las cuatro claves de la pasarela. Sin ellas el botón de pago no se renderiza y la tienda sigue funcionando con WhatsApp |
| `ANTHROPIC_API_KEY` | Asistente de ventas (F4) |

Ninguna se commitea: `.env` está en `.gitignore` y solo viaja `.env.example` con las claves vacías.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción |
| `pnpm lint` | ESLint, incluida la frontera del dominio |
| `pnpm typecheck` | TypeScript en los cuatro paquetes |
| `pnpm test` | Tests unitarios. No necesitan base de datos |
| `pnpm test:integration` | Tests contra PostgreSQL real. Mueven stock y lo dejan como estaba |
| `pnpm db:migrate` | Aplica migraciones en desarrollo |
| `pnpm db:seed` | Carga el catálogo |
| `pnpm db:admin <correo> <contraseña>` | Crea o actualiza un administrador |
| `pnpm db:studio` | Explorador de datos de Prisma |
| `pnpm docker:up` / `docker:down` | Levanta o para PostgreSQL local |
| `pnpm docker:reset` | Destruye el volumen de datos |

## Cómo se cobra

El flujo completo está en [ADR-0003](docs/hydraia/adr/0003-wompi-webhook-idempotente.md).
Tres reglas que explican por qué el código es como es:

**El redirect del navegador no confirma nada.** Wompi devuelve al cliente con un `?id=` que
es manipulable, así que se usa como identificador y jamás como estado: con ese id se le
pregunta a Wompi, con nuestras credenciales, cuál fue el resultado real. Quien confía en el
parámetro acaba con órdenes marcadas como pagadas sin cobro detrás.

**El importe manda sobre la firma.** Wompi firma el id, el estado y el importe de la
transacción, pero **no la referencia**. Un evento legítimo se puede reapuntar a otra orden
sin romper el checksum, así que antes de aplicar nada se comprueba que el importe coincida
con el total de la orden. El porqué completo está en
[ADR-0009](docs/hydraia/adr/0009-el-importe-manda-sobre-la-firma.md).

**Nada queda pagado sin stock descontado.** El cambio de estado, los movimientos de
inventario y el registro del pago se escriben en un solo `COMMIT`. Y si el webhook nunca
llega —Wompi solo reintenta tres veces en 24 horas— un job de reconciliación le pregunta a
la pasarela antes de dar la orden por perdida.

El webhook se configura en el dashboard de Wompi apuntando a `/api/webhooks/wompi`.

## Reglas del proyecto

Las reglas permanentes están en [`docs/constitution.md`](docs/constitution.md). Dos que
conviene conocer antes de tocar código:

**El dominio no conoce el framework.** `packages/core` no puede importar `next`,
`@prisma/client` ni `react`. No es una recomendación: ESLint lo bloquea y el PR no pasa.
Gracias a eso, extraer el dominio a un servicio propio el día que haga falta no exige
reescribir lógica de negocio.

**El servidor es la única fuente de verdad del dinero y del stock.** Los totales se
recalculan siempre desde la base de datos; ningún importe enviado por el cliente se usa
para cobrar. El inventario no es un contador que se suma y se resta, sino un libro de
movimientos donde cada faltante es explicable
([ADR-0004](docs/hydraia/adr/0004-inventario-como-libro-de-movimientos.md)).

**Los mensajes de commit no llevan emoji ni pies de atribución.** La autoría la dicen los
campos `author` y `committer`, no un renglón al final. Hay un gancho que lo verifica; se
activa una vez por clon:

```bash
git config core.hooksPath .githooks
```

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
- [Decisiones de arquitectura](docs/hydraia/adr/) — ADR-0001 a ADR-0009

## Estado

| Fase | Estado |
|---|---|
| F0 · Fundaciones | Completa |
| F1 · Catálogo | Completa. 127 productos migrados y servidos desde PostgreSQL |
| F2 · Carrito y órdenes | Completa. Una orden se crea, reserva stock y expira sola |
| F3 · Pagos Wompi | Código completo y probado con eventos firmados. Falta un pago real en el sandbox de Wompi, que ADR-0003 exige antes de producción |
| F4 · Asistente | Pendiente |
| F5 · Endurecimiento | Pendiente |
| F6 · Portabilidad | Pendiente |

Verificación actual: 118 tests unitarios, 31 de integración contra PostgreSQL, 18 rutas.

**Desviación conocida:** el proyecto de Neon corre PostgreSQL 16.15, no 17 como exige el
principio 1 de la constitución. Neon no actualiza la versión mayor en sitio, así que la
migración implica crear un proyecto nuevo y resembrar. Está planificada, y conviene hacerla
antes de que entre el primer pedido real: hasta entonces el catálogo se resiembra en un
comando y no hay nada que perder.

## Licencia

Uso privado. Todos los derechos reservados.
