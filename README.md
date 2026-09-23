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
| Datos | PostgreSQL 18 + pgvector, Prisma 6 |
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
pnpm db:seed                                       # carga el catálogo
pnpm db:admin correo@ejemplo.com "una contraseña"  # crea el acceso al panel
pnpm dev
```

La aplicación queda en `http://localhost:3000` y el panel en `/acceso`.

El seed es idempotente y cuenta contra el propio archivo de origen, no contra un número
grabado: aborta si productos, variantes, imágenes o el stock total no cuadran. Prefiere no
cargar nada a cargar el catálogo a medias.

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
| `ANTHROPIC_API_KEY` | Asistente de ventas (F4). Sin ella el asesor responde 503 y la tienda sigue en pie |
| `VOYAGE_API_KEY` | Vectores del catálogo. Sin ella la búsqueda funciona, pero solo por texto |

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
| `pnpm test:e2e` | Playwright: catálogo → carrito → pedido. Necesita la app y la base |
| `pnpm db:migrate` | Aplica migraciones en desarrollo |
| `pnpm db:seed` | Carga el catálogo |
| `pnpm db:embed` | Vectores Voyage del catálogo (sin clave no hace nada) |
| `pnpm db:admin <correo> <contraseña>` | Crea o actualiza un administrador |
| `pnpm db:studio` | Explorador de datos de Prisma |
| `pnpm docker:up` / `docker:down` | Levanta o para PostgreSQL local |
| `pnpm docker:reset` | Destruye el volumen de datos |

## Cómo se cobra

El flujo completo está en [ADR-0003](docs/adr/0003-wompi-webhook-idempotente.md).
Tres reglas que explican por qué el código es como es:

**El redirect del navegador no confirma nada.** Wompi devuelve al cliente con un `?id=` que
es manipulable, así que se usa como identificador y jamás como estado: con ese id se le
pregunta a Wompi, con nuestras credenciales, cuál fue el resultado real. Quien confía en el
parámetro acaba con órdenes marcadas como pagadas sin cobro detrás.

**El importe manda sobre la firma.** Wompi firma el id, el estado y el importe de la
transacción, pero **no la referencia**. Un evento legítimo se puede reapuntar a otra orden
sin romper el checksum, así que antes de aplicar nada se comprueba que el importe coincida
con el total de la orden. El porqué completo está en
[ADR-0009](docs/adr/0009-el-importe-manda-sobre-la-firma.md).

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
([ADR-0004](docs/adr/0004-inventario-como-libro-de-movimientos.md)).

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
Vercel deja de encajar.

En cada PR, CI construye las dos imágenes (web y migraciones), **arranca la de web** y
comprueba que sirve el catálogo, `/api/alive` y los estáticos. Lo hace sin `DATABASE_URL`,
así que de paso verifica que la tienda sigue en pie sin base de datos (RNF-03). De los
manifiestos comprueba que `kustomize` los compone y que están los diez objetos;
`kubectl apply --dry-run=client` no sirve para esto porque necesita la discovery de un
clúster, y en CI no hay ninguno.

El procedimiento para levantar el stack está en
[docs/runbook-kubernetes.md](docs/runbook-kubernetes.md). El razonamiento, en
[ADR-0006](docs/adr/0006-kubernetes-como-portabilidad.md).

```bash
docker build -f infra/docker/Dockerfile --target runner  -t nexa-web:latest .
docker build -f infra/docker/Dockerfile --target migrate -t nexa-migrate:latest .
kubectl apply -k infra/k8s
```

## Documentación

- [Constitución](docs/constitution.md) — reglas permanentes
- [ADS](docs/ads/ADS-NEXA-v1.md) — análisis y diseño del sistema
- [Decisiones de arquitectura](docs/adr/) — ADR-0001 a ADR-0011
- [Runbook de Kubernetes](docs/runbook-kubernetes.md) — cómo levantar el stack portable
- [Runbook de Wompi sandbox](docs/runbook-wompi-sandbox.md) — cerrar F3 con un cobro de prueba
- [Runbook de Vercel](docs/runbook-vercel.md) — import del monorepo y variables

## Estado

| Fase | Estado |
|---|---|
| F0 · Fundaciones | Completa |
| F1 · Catálogo | Completa. 128 productos. Búsqueda híbrida texto + pgvector (RF-03); sin `VOYAGE_API_KEY` queda solo el texto |
| F2 · Carrito y órdenes | Completa. Una orden se crea, reserva stock y expira sola. Panel: precio, stock, visibilidad, destacado e insignia sin redesplegar (RF-22) |
| F3 · Pagos Wompi | Código completo, **sin estrenar**. Las llaves de `.env` son marcadores locales y no pasan `pnpm wompi:check`: no se ha procesado ningún pago, ni de prueba. Ver [runbook](docs/runbook-wompi-sandbox.md) |
| F4 · Asistente | Código completo. NexaBot tiene herramientas sobre el catálogo, barandas médicas y registro de sesión, pero **está mudo en producción**: falta `ANTHROPIC_API_KEY` |
| F5 · Endurecimiento | Completa. CSP, logs con `order_number`, jsx-a11y, E2E catálogo→pedido, Lighthouse en CI. Accesibilidad 100 medida en móvil contra producción |
| F6 · Portabilidad | Completa. `kubectl apply -k infra/k8s` deja Postgres, migraciones, web, HPA, Ingress y el cron de reservas. CI además **arranca** la imagen y comprueba que sirve |

Verificación actual: 245 tests unitarios, 43 de integración contra PostgreSQL, E2E de
catálogo a pedido. Los tres jobs de CI en verde.

**Rendimiento y accesibilidad**, medidos en móvil con 4G lento contra producción:

| Ruta | LCP | CLS | Accesibilidad |
|---|---|---|---|
| `/` | 2,5 s | 0 | 100 |
| `/catalogo` | 2,5 s | 0,005 | 100 |
| `/producto/…` | 2,5 s | 0 | 100 |

El CLS cumple el RNF-01 con holgura. **El LCP no**: el requisito pide 2,5 s y las tres
rutas quedan entre 2.514 y 2.584 ms. Falla por decenas de milisegundos, de forma
consistente. Ver la deuda técnica más abajo.

Producción: <https://nexa-sports-nutrition-web.vercel.app>. `GET /api/health` responde
`{"ok":true,"db":true}` cuando la aplicación alcanza la base; `/api/alive` dice qué commit
está sirviendo.

**Versión de PostgreSQL:** producción corre 18.6 en Neon, y CI, el `docker-compose` y los
manifiestos de Kubernetes usan la misma versión mayor a propósito: los tests de integración
tienen que validar contra lo que de verdad atiende a los clientes. El mínimo es 17
([ADR-0011](docs/adr/0011-postgresql-17-o-superior.md), que enmienda a ADR-0002). Subir la
versión mayor no exige un ADR nuevo, pero sí alinear los cuatro entornos en el mismo cambio.

## Deuda técnica

Lo que se sabe que falta, con su porqué. Nada de esto impide vender hoy; todo tiene
consecuencia si se deja correr.

### Bloqueado por credenciales o por una decisión del dueño

| Qué | Consecuencia de dejarlo |
|---|---|
| **Wompi sin estrenar.** Las claves de `.env` son marcadores locales | F3 es código que nunca ha movido un peso. ADR-0003 exige probar en sandbox pago rechazado, webhook duplicado y webhook que no llega |
| **`ANTHROPIC_API_KEY` sin poner en Vercel** | NexaBot responde 503. Toda F4 existe y no la usa nadie. Al ponerla, corregir también `NEXA_BOT_MODEL`, que se importó con un valor viejo |
| **`VOYAGE_API_KEY` sin poner** | La búsqueda cae a solo texto; pgvector está construido y sin usar |
| **`catalogo-nexa.pdf` pesa 38,7 MB** | Es el 88 % del repositorio y viaja en cada clon, en cada build y en la imagen Docker. El botón "Descargar PDF" se lo manda entero a alguien en datos móviles. Comprimirlo necesita ghostscript; sacarlo del repo necesita decidir dónde vive |

### Deuda del código

**El LCP no cumple el RNF-01 y Lighthouse no lo verifica.** El requisito pide LCP ≤ 2,5 s
en 4G móvil; medido en producción da entre 2.514 y 2.584 ms en las tres rutas. Además
`lighthouserc.json` corre con `preset: desktop` y exige el LCP solo como **aviso a 4000 ms**,
así que el gate no comprueba lo que el requisito dice. Apretarlo a 2500 en móvil dejaría CI
en rojo: hay que decidir si se optimiza o si se enmienda el número, como se hizo con la
versión de PostgreSQL.

**Las metas se renderizan fuera del `<head>`.** El `</head>` cierra en el byte 1.575 y el
`<title>` y la `description` aparecen dentro del `<body>`. Google ignora las metas que no
están en el head, así que a efectos de buscador ninguna página tiene descripción. Pasa en
todas las rutas, incluidas las que no tienen `loading.tsx`, así que es cómo Next transmite
la respuesta y no algo de este código. Sin investigar.

**Módulos sin test donde duele.** `apps/web/lib/config.ts` contiene
`orderWhatsappMessage`, que arma el mensaje del pedido y ya tuvo un fallo —llegaba el
número de orden sin los productos—; `packages/db/src/admin/password.ts` hashea las
contraseñas del panel; `chat-repository.ts` y `apps/web/lib/assistant.ts` tampoco tienen
ninguno.

**`pnpm start` con `output: standalone`.** Next avisa de que esa combinación no es la
correcta y recomienda `node .next/standalone/server.js`. Funciona y CI lo usa así, pero no
es como arranca el contenedor, así que el E2E prueba un arranque que producción no usa.

**Los manifiestos no se validan contra el esquema de Kubernetes.** CI comprueba que
`kustomize` compone y que están los diez objetos, que es lo que se puede hacer sin un
clúster. La validación real pediría `kubeconform`, que es una dependencia más.

**Las variables `VERCEL_*` no están documentadas.** `VERCEL`, `VERCEL_GIT_COMMIT_SHA` y
`VERCEL_GIT_COMMIT_REF` se leen en el código y no aparecen en `.env.example` porque las
inyecta la plataforma. En local `/api/alive` no sabe qué commit sirve.

## Licencia

Uso privado. Todos los derechos reservados.
