# ADS — Análisis y Diseño de Sistemas
## NEXA Sports Nutrition · v1.0

| Campo | Valor |
|---|---|
| Proyecto | NEXA Sports Nutrition (refactor de `sports-store` / LEOFIT) |
| Versión | 1.0 — 2026-09-02 |
| Autor | Leonardo (`leonardecojt@gmail.com`) |
| Estado | Borrador para aprobación |
| Repo origen | `github.com/leonardeco/sports-store` |
| Documentos ligados | [`docs/constitution.md`](../constitution.md), ADR-0001 … ADR-0007 |

---

## 1. Contexto y problema

LEOFIT es hoy una SPA estática (React 18 + Vite) que muestra 127 productos leídos de un
archivo JSON y termina la venta abriendo un enlace `wa.me` con el pedido en texto plano.
Funciona como escaparate, pero como negocio tiene cinco límites duros:

1. **No hay venta.** No existe pago; el dinero se coordina fuera del sistema y nada queda
   registrado. No hay forma de responder "¿cuánto vendí este mes?".
2. **No hay inventario real.** `stock` es un número en el JSON que nunca se decrementa. Se
   puede vender lo que no existe.
3. **Cambiar el catálogo es desplegar.** Subir un precio requiere editar código, commit,
   CI y deploy. El dueño del negocio depende del desarrollador para todo.
4. **El bot es decorativo.** `InteractiveChatbot.jsx` es un árbol de decisión de 285
   líneas que no conoce el catálogo, no responde preguntas fuera del guion y no vende.
5. **La marca cambió.** El proyecto pasa a NEXA Sports Nutrition, con identidad negro /
   blanco / naranja y un isotipo propio.

El refactor no es cosmético: se pasa de un sitio estático a una aplicación transaccional
con base de datos, pagos y un asistente de ventas con IA.

---

## 2. Alcance

### 2.1 Dentro del alcance (v1)

- Catálogo servido desde PostgreSQL, con búsqueda, filtros y fichas de producto.
- Carrito persistente e inventario con reserva y movimientos auditados.
- Checkout real con **Wompi** (PSE, Nequi, tarjeta, Bancolombia) + confirmación por webhook.
- WhatsApp como canal de respaldo para cerrar venta con una persona.
- Asistente de ventas con IA que consulta el catálogo real y puede añadir al carrito.
- Panel de administración mínimo: productos, precios, stock y órdenes.
- Rebranding completo a NEXA (identidad, tokens, componentes).
- Infraestructura: Docker Compose para desarrollo, manifiestos Kubernetes, despliegue en
  Vercel + Neon.

### 2.2 Fuera del alcance (v1)

- Bot atendiendo por WhatsApp Business API (requiere verificación con Meta y plantillas
  aprobadas) — se deja el puerto listo, no la integración.
- Cuentas de cliente con historial. En v1 se compra como invitado.
- Multi-vendedor, multi-sede, multi-moneda o marketplaces.
- Facturación electrónica DIAN.
- App móvil nativa.

### 2.3 Supuestos declarados

- Volumen esperado: decenas de pedidos/mes, cientos de visitas/día. La arquitectura se
  optimiza para **fiabilidad y operabilidad por una sola persona**, no para escala.
- Un único operador del negocio (el dueño) gestiona catálogo y despacho.
- Moneda única COP. Envíos nacionales en Colombia.
- Se dispone de cuenta de comercio Wompi (sandbox primero, producción después).

---

## 3. Actores del sistema

| Actor | Descripción | Interacción principal |
|---|---|---|
| **Cliente** | Comprador final, mayoritariamente móvil | Navega, consulta al bot, compra |
| **Administrador** | Dueño del negocio | Carga productos, ajusta precios/stock, despacha órdenes |
| **Asesor humano** | Ventas por WhatsApp (`+57 322 699 3891`) | Recibe escalados del bot y pedidos manuales |
| **Wompi** | Pasarela de pagos | Procesa la transacción, notifica por webhook |
| **Modelo de IA** | Claude (Anthropic API) | Ejecuta el asistente de ventas con herramientas del dominio |

---

## 4. Análisis del sistema actual (AS-IS)

### 4.1 Inventario técnico medido

| Dimensión | Estado |
|---|---|
| Stack | React 18.3, Vite 5.4, Tailwind 3.4, React Router 6.30 — JavaScript, sin tipos |
| Código | 30 archivos, ~3.192 líneas JSX/JS |
| Datos | `src/data/productos.json` — 127 productos, 4 categorías, 15 marcas |
| Activos | 274 imágenes en `public/img` (39 MB, PNG + WebP), catálogo PDF |
| Estado global | Context API + `useReducer`, persistencia en `localStorage` (`leofit_cart`) |
| Tests | 2 archivos (`cartReducer.test.js`, `whatsapp.test.js`) con Vitest |
| CI | GitHub Actions: lint → test → build |
| Despliegue | Netlify (`leofit.netlify.app`) y Vercel, ambos estáticos |
| Backend | Ninguno |

### 4.2 Esquema de datos actual

```jsonc
{
  "id": 1,                    // entero secuencial, sin SKU
  "nombre": "Nitro Tech 2 LBS",
  "marca": "MuscleTech",      // string libre, acoplado a CONFIG.brands
  "categoria": "Proteínas",   // string libre
  "precio": 185000,           // COP, entero
  "descripcion": "...",
  "imagen": "/img/productos/1-nitro-tech-2-lbs.webp",  // una sola imagen
  "badge": "Más vendido",     // presentación mezclada con datos
  "stock": 19,                // nunca se actualiza
  "destacado": true,
  "beneficios": "...",
  "modo_uso": "..."
}
```

### 4.3 Deuda técnica identificada

| # | Hallazgo | Impacto | Evidencia |
|---|---|---|---|
| D1 | `stock` nunca se decrementa | Se puede vender inventario inexistente | `CartContext.jsx` solo lee `prod.stock` |
| D2 | Las variantes se **inventan en el front** | El cliente pide "Vainilla" de algo que quizá no existe | `CartContext.jsx`: `categoria === "Preentrenos" ? "Punch" : "Vainilla"` |
| D3 | Sin persistencia de órdenes | El `#ORD-` del mensaje de WhatsApp no existe en ningún sistema | `utils/whatsapp.js` |
| D4 | Config de negocio en código | Cambiar precio o teléfono = redeploy | `src/config.js` |
| D5 | 39 MB de imágenes en el repo | Clones lentos, sin optimización por dispositivo | `public/img` |
| D6 | Sin TypeScript | Errores de forma de datos se descubren en runtime | Todo el `src/` |
| D7 | Dos números de WhatsApp sin criterio | El pedido y la asesoría van a personas distintas sin trazabilidad | `CONFIG.whatsapp.asesora` |
| D8 | Marca inconsistente | Naranja `#E8602C`, navy `#1B3A6B` y lima `#AAFF00` conviven con retrocompat `dark-*` en tema claro | `tailwind.config.js` |
| D9 | Bot desconectado del catálogo | Recomienda categorías, no productos | `InteractiveChatbot.jsx` |

### 4.4 Qué se conserva

No todo se tira. Se rescata y se migra:

- **Los 127 productos** con sus descripciones, beneficios y modo de uso (contenido real, costoso de rehacer).
- **Las 274 imágenes** (se reubican en almacenamiento de objetos, no en el repo).
- **La lógica del reducer del carrito** y sus tests: se portan a `packages/core` con tipos.
- **El formateo de moneda COP** (`Intl.NumberFormat` es-CO).
- **El árbol de conversación** del chatbot: se convierte en ejemplos de intención para el prompt del bot IA.
- **El workflow de CI** como base.

---

## 5. Requisitos

### 5.1 Requisitos funcionales (formato EARS)

**Catálogo**
- RF-01 · EL SISTEMA muestra el catálogo de productos activos con nombre, marca, categoría, precio en COP y disponibilidad, leídos de la base de datos.
- RF-02 · CUANDO el cliente aplica filtros de marca, categoría o rango de precio, EL SISTEMA devuelve únicamente los productos que cumplen todos los filtros activos.
- RF-03 · CUANDO el cliente escribe en la búsqueda, EL SISTEMA devuelve resultados por coincidencia de texto en español y por similitud semántica, ordenados por relevancia.
- RF-04 · SI un producto no tiene stock disponible, ENTONCES EL SISTEMA lo muestra marcado como agotado y deshabilita la compra.

**Carrito e inventario**
- RF-05 · CUANDO el cliente añade una variante al carrito, EL SISTEMA persiste el carrito asociado a su sesión y refleja la cantidad total.
- RF-06 · SI la cantidad solicitada supera el stock disponible de la variante, ENTONCES EL SISTEMA limita la cantidad al stock disponible e informa al cliente.
- RF-07 · CUANDO se confirma un pago, EL SISTEMA descuenta el stock registrando un movimiento de inventario con motivo `SALE` dentro de la misma transacción de base de datos.
- RF-08 · MIENTRAS una orden esté en estado `PENDING_PAYMENT`, EL SISTEMA mantiene el stock reservado y no disponible para otros clientes.
- RF-09 · SI una orden lleva más de 30 minutos en `PENDING_PAYMENT`, ENTONCES EL SISTEMA libera la reserva y marca la orden como `EXPIRED`.

**Checkout y pagos**
- RF-10 · CUANDO el cliente inicia el checkout, EL SISTEMA recalcula subtotal, envío y total desde la base de datos, ignorando cualquier importe enviado por el cliente.
- RF-11 · CUANDO se crea una orden, EL SISTEMA genera una referencia única y la firma de integridad requerida por Wompi.
- RF-12 · CUANDO Wompi notifica un evento por webhook, EL SISTEMA verifica la firma antes de procesarlo y rechaza con `401` cualquier evento no verificado.
- RF-13 · SI un evento de webhook ya fue procesado, ENTONCES EL SISTEMA responde `200` sin repetir efectos.
- RF-14 · CUANDO una transacción resulta `APPROVED`, EL SISTEMA marca la orden como `PAID`, descuenta el stock y notifica al cliente y al administrador.
- RF-15 · SI una orden en `PENDING_PAYMENT` supera los 30 minutos, ENTONCES EL SISTEMA consulta el estado real de la transacción en la API de Wompi antes de expirarla.
- RF-16 · EL SISTEMA ofrece en todo momento un botón de WhatsApp que traslada el pedido a un asesor humano conservando el número de orden.

**Asistente de ventas (bot)**
- RF-17 · CUANDO el cliente pregunta por productos, EL SISTEMA responde usando exclusivamente datos obtenidos de herramientas consultadas contra la base de datos.
- RF-18 · CUANDO el cliente acepta explícitamente una recomendación, EL SISTEMA añade la variante indicada a su carrito y confirma la acción.
- RF-19 · SI la consulta involucra dosificación clínica, condiciones médicas, embarazo o menores de edad, ENTONCES EL SISTEMA declina aconsejar y ofrece contacto con un asesor humano.
- RF-20 · EL SISTEMA registra cada sesión y mensaje del asistente para auditoría y mejora.
- RF-21 · SI una sesión supera su presupuesto de mensajes o tokens, ENTONCES EL SISTEMA cierra la conversación y ofrece WhatsApp.

**Administración**
- RF-22 · CUANDO el administrador autenticado modifica precio, stock o estado de un producto, EL SISTEMA aplica el cambio sin requerir un nuevo despliegue.
- RF-23 · EL SISTEMA presenta al administrador las órdenes con su estado, cliente, ítems y estado de pago.
- RF-24 · SI un usuario no autenticado solicita una ruta de administración, ENTONCES EL SISTEMA responde `404` sin revelar su existencia.

### 5.2 Requisitos no funcionales

| ID | Categoría | Requisito | Cómo se verifica |
|---|---|---|---|
| RNF-01 | Rendimiento | LCP ≤ 2,5 s y CLS ≤ 0,1 en 4G móvil en portada y catálogo | Lighthouse CI en cada PR |
| RNF-02 | Rendimiento | Respuesta de API de catálogo ≤ 300 ms p95 | Traza en producción |
| RNF-03 | Disponibilidad | El fallo del bot o de Wompi no impide navegar ni contactar por WhatsApp | Test de degradación |
| RNF-04 | Seguridad | Sin secretos en el repositorio; CSP estricta; validación Zod en todo borde | Escaneo en CI + revisión |
| RNF-05 | Integridad | Ninguna orden puede quedar pagada sin stock descontado, ni al revés | Transacción única + test de integración |
| RNF-06 | Accesibilidad | WCAG 2.1 AA en contraste, foco y navegación por teclado | `eslint-plugin-jsx-a11y` + auditoría axe |
| RNF-07 | Observabilidad | Toda orden y todo evento de webhook es rastreable por `order_number` | Logs estructurados |
| RNF-08 | Coste | Coste mensual de infraestructura ≤ 25 USD en el escenario previsto | Revisión de facturación |
| RNF-09 | Mantenibilidad | El dominio (`packages/core`) no importa framework ni ORM | Regla de lint |
| RNF-10 | SEO | Fichas de producto renderizadas en servidor con datos estructurados `Product` | Rich Results Test |

---

## 6. Diseño de la solución (TO-BE)

### 6.1 Vista de contenedores

```
                        ┌──────────────────────────────┐
   Cliente (móvil/web) ─▶│  Next.js 15 · App Router     │
                        │  ─ RSC: catálogo, fichas     │
                        │  ─ Client: carrito, chat      │
                        │  ─ Route Handlers = BFF       │
                        └───────┬──────────┬───────────┘
                                │          │
                 ┌──────────────┘          └──────────────┐
                 ▼                                        ▼
        ┌────────────────────┐                  ┌──────────────────┐
        │  @nexa/core        │                  │  Servicios ext.  │
        │  dominio + casos   │                  │  ─ Wompi         │
        │  de uso (puertos)  │                  │  ─ Anthropic API │
        └─────────┬──────────┘                  │  ─ Vercel Blob   │
                  │ puertos                     │  ─ Resend (mail) │
                  ▼                             └──────────────────┘
        ┌────────────────────┐
        │  @nexa/db (Prisma) │──────▶  PostgreSQL 17 + pgvector
        └────────────────────┘         (Docker local · Neon en nube)
```

### 6.2 Estructura del monorepo

```
nexa-sports-nutrition/
├─ apps/
│  └─ web/                     # Next.js 15 — front + BFF
│     ├─ app/
│     │  ├─ (tienda)/          # rutas públicas
│     │  ├─ (admin)/           # panel protegido
│     │  └─ api/               # route handlers: chat, checkout, webhooks
│     └─ components/
├─ packages/
│  ├─ core/                    # dominio puro: entidades, casos de uso, puertos
│  ├─ db/                      # schema Prisma, migraciones, seed, repositorios
│  └─ ui/                      # design system NEXA (tokens + componentes)
├─ infra/
│  ├─ docker/                  # Dockerfile + docker-compose.yml
│  └─ k8s/                     # deployment, service, ingress, secret, hpa, job
├─ docs/
│  ├─ constitution.md
│  ├─ ads/ADS-NEXA-v1.md
│  └─ hydraia/adr/
└─ pnpm-workspace.yaml
```

**La regla que sostiene la escalabilidad:** `packages/core` no importa `next/*` ni
`@prisma/client`. Define interfaces (`ProductRepository`, `PaymentGateway`,
`InventoryService`) y los adaptadores las implementan. Consecuencia práctica: el día que
el tráfico justifique un backend separado, `core` se envuelve en un servidor propio y se
despliega en Kubernetes **sin reescribir lógica de negocio**. Esa es la puerta de salida
que hace que empezar como monolito no sea una trampa.

### 6.3 Modelo de datos

```sql
-- Catálogo
brands              (id, slug UK, name, color, accent, logo_url, sort_order)
categories          (id, slug UK, name, color, accent, sort_order)
products            (id, slug UK, legacy_id, name, brand_id FK, category_id FK,
                     description, benefits, usage_instructions,
                     is_featured, is_active, search_vector tsvector,
                     created_at, updated_at)
product_variants    (id, product_id FK, sku UK, name, price_cents INT,
                     compare_at_price_cents, stock INT, is_default, is_active)
product_images      (id, product_id FK, url, alt, width, height, sort_order, is_primary)
product_embeddings  (product_id FK PK, embedding vector(1024), updated_at)

-- Inventario (auditoría, no un contador)
inventory_movements (id, variant_id FK, delta INT, reason ENUM, order_id FK NULL,
                     expires_at NULL, note, created_at)
   reason ∈ { RESTOCK, SALE, RESERVATION, RESERVATION_RELEASE, ADJUSTMENT, RETURN }

-- Ventas
customers           (id, email, phone, full_name, created_at)
orders              (id, order_number UK, customer_id FK NULL, status ENUM,
                     channel ENUM, session_id NULL, draft_session_id UK NULL,
                     subtotal_cents, shipping_cents,
                     discount_cents, total_cents, currency='COP',
                     shipping_city, shipping_address, notes,
                     created_at, updated_at, paid_at NULL)
   status  ∈ { DRAFT, PENDING_PAYMENT, PAID, PREPARING, SHIPPED, DELIVERED,
               CANCELLED, PAYMENT_FAILED, EXPIRED, REFUNDED }
   channel ∈ { WEB, BOT, WHATSAPP }
order_items         (id, order_id FK, variant_id FK,
                     product_name_snapshot, variant_name_snapshot,
                     unit_price_cents, quantity, line_total_cents)
payments            (id, order_id FK, provider, provider_transaction_id UK,
                     status, method, amount_cents, raw_payload JSONB, created_at)
webhook_events      (id, provider, event_id UK, signature, payload JSONB,
                     status, processed_at, error)

-- Asistente
chat_sessions       (id, anon_id, customer_id FK NULL, order_id FK NULL,
                     message_count, token_budget_used, started_at, ended_at)
chat_messages       (id, session_id FK, role, content, tool_calls JSONB, created_at)

-- Operación
admin_users         (id, email UK, password_hash, role, created_at)
audit_log           (id, actor_id, action, entity, entity_id, diff JSONB, created_at)
```

Decisiones del modelo, con su porqué:

- **`order_items` guarda snapshots** de nombre y precio. Si mañana sube el precio de la
  proteína, las órdenes viejas siguen contando lo que el cliente realmente pagó. Mientras
  la orden está en `DRAFT` —o sea, mientras es un carrito— esos snapshots no mandan: lo
  que se muestra y se suma sale de la variante viva. Se congelan en el checkout
  (ADR-0008).
- **El carrito es una orden en `DRAFT`**, por eso no hay tabla `carts`. `session_id` es la
  sesión anónima que la originó y se conserva siempre; `draft_session_id` vale lo mismo
  mientras la orden ES el carrito de esa sesión y pasa a `NULL` en el checkout. Su índice
  único es lo que garantiza un solo carrito abierto por sesión — un índice único parcial
  que Prisma no sabe declarar, codificado en el dato.
- **El stock no es una columna que se suma y se resta a mano.** El stock disponible es
  `SUM(delta)` sobre `inventory_movements`, cacheado en `product_variants.stock`. Cada
  cambio deja rastro de quién, cuándo y por qué. Esto mata la deuda D1 de raíz.
- **`product_variants` existe desde el día 1**, incluso con una sola variante `Única`.
  Elimina la invención de sabores del front (deuda D2).
- **Todo el dinero en centavos enteros.** Es el formato que exige Wompi
  (`amount_in_cents`), así se evita una conversión por operación y sus errores de redondeo.
  Se implementa como `INT`, no `BIGINT`, para que el valor viaje como `number` en
  TypeScript y en JSON sin conversiones. El techo es 2.147.483.647 centavos ≈ 21.474.836
  COP por campo, muy por encima de cualquier pedido previsto.
- **`webhook_events.event_id` es único.** Es el mecanismo de idempotencia: si Wompi
  reintenta, el `INSERT` falla y no se duplican efectos.

### 6.4 Contrato de API (BFF)

| Método | Ruta | Propósito | Auth |
|---|---|---|---|
| `GET` | `/api/products` | Listado con filtros y paginación | pública |
| `GET` | `/api/products/[slug]` | Ficha con variantes, imágenes y stock | pública |
| `GET` | `/api/search?q=` | Búsqueda híbrida texto + semántica | pública |
| `POST` | `/api/cart/items` | Añadir variante (valida stock server-side) | sesión |
| `PATCH` | `/api/cart/items/[id]` | Cambiar cantidad | sesión |
| `DELETE` | `/api/cart/items/[id]` | Quitar ítem | sesión |
| `POST` | `/api/checkout` | Crear orden, reservar stock, devolver firma Wompi | sesión |
| `GET` | `/api/orders/[orderNumber]` | Estado de la orden | sesión dueña |
| `POST` | `/api/webhooks/wompi` | Recibir eventos de transacción | firma HMAC |
| `GET`·`POST` | `/api/cron/expire-orders` | Reconciliar y expirar reservas vencidas | secreto de cron |
| `POST`·`DELETE` | `/api/admin/session` | Entrar y salir del panel | credenciales |
| `PATCH` | `/api/admin/orders/[orderNumber]/status` | Transición manual de una orden | admin |
| `POST` | `/api/chat` | Turno del asistente (streaming SSE) | sesión + rate limit |
| `POST` | `/api/admin/products` | CRUD de catálogo | admin |

La firma de integridad de Wompi la calcula el servidor y viaja al navegador dentro del
formulario de pago; la clave privada y los tres secretos nunca salen del servidor. El
acceso a una orden va acotado a la sesión que la creó: el número de orden se dicta por
WhatsApp y por teléfono, así que por sí solo no puede abrir el pedido de nadie.

Todo cuerpo de petición y respuesta se define con esquemas Zod compartidos en
`packages/core/src/contracts`, de forma que cliente y servidor no puedan divergir.

---

## 7. Flujos críticos

### 7.1 Checkout con Wompi

```
Cliente          Next.js BFF              PostgreSQL          Wompi
  │                   │                        │                │
  │ POST /checkout    │                        │                │
  ├──────────────────▶│                        │                │
  │                   │ recalcula total        │                │
  │                   │ crea orden PENDING     │                │
  │                   │ + movimientos          │                │
  │                   │   RESERVATION (TTL 30m)│                │
  │                   ├───────────────────────▶│                │
  │                   │ firma integridad:      │                │
  │                   │ SHA256(ref+cents+COP+  │                │
  │                   │        integritySecret)│                │
  │ {ref, signature}  │                        │                │
  │◀──────────────────┤                        │                │
  │  Widget de Wompi ─────────────────────────────────────────▶ │
  │                   │                        │   procesa pago │
  │◀── redirect /checkout/resultado ─────────────────────────── │
  │                   │                        │                │
  │                   │◀── POST /api/webhooks/wompi ─────────────┤
  │                   │  verifica X-Event-Checksum              │
  │                   │  INSERT webhook_events (event_id UK)    │
  │                   │  BEGIN                 │                │
  │                   │   orden → PAID         │                │
  │                   │   RESERVATION_RELEASE + SALE            │
  │                   │  COMMIT ──────────────▶│                │
  │                   │  notifica cliente + admin               │
```

**Reglas no negociables de este flujo:**

1. **El redirect del navegador no confirma nada.** La página de resultado solo consulta
   el estado; la verdad la trae el webhook o la reconciliación.
2. **La firma se verifica antes de tocar la base de datos.** Evento sin firma válida →
   `401`, se registra y se descarta.
3. **Idempotencia por `event_id`.** Wompi reintenta; el sistema debe soportarlo.
4. **Un solo `COMMIT`** para cambio de estado + movimientos de inventario. No existe
   ventana donde la orden esté pagada y el stock intacto.
5. **Job de reconciliación** cada 10 minutos: para órdenes `PENDING_PAYMENT` con más de 30
   minutos, consulta `GET /v1/transactions/{id}` y resuelve. Cubre el caso de webhook
   perdido, que es la falla más común y más cara de esta integración.

**Configuración:** `WOMPI_PUBLIC_KEY` (única expuesta al navegador), `WOMPI_PRIVATE_KEY`,
`WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET` solo en servidor. Sandbox primero;
producción tras validar los cinco puntos anteriores con pagos de prueba.

### 7.2 Asistente de ventas con IA

Bucle de uso de herramientas contra `claude-sonnet-5`. El modelo nunca ve la base de
datos: ve resultados de herramientas.

| Herramienta | Qué hace | Por qué existe |
|---|---|---|
| `buscar_productos` | Búsqueda híbrida (`tsvector` español + `pgvector`) con filtros | Que recomiende productos reales, no genéricos |
| `obtener_producto` | Ficha completa con precio y stock actuales | Que nunca cite un precio de memoria |
| `comparar_productos` | Tabla comparativa de 2-3 variantes | La objeción más común es "¿cuál me conviene?" |
| `agregar_al_carrito` | Añade variante tras confirmación explícita | Aquí es donde el bot deja de informar y empieza a vender |
| `crear_enlace_pago` | Genera la orden y el checkout | Cierra la venta sin salir del chat |
| `escalar_a_humano` | Arma el `wa.me` con el contexto de la conversación | Salida digna cuando el bot no debe seguir |

**Barandas** (obligatorias en un negocio de suplementos):

- El prompt de sistema prohíbe consejo médico, dosificación clínica, interacciones con
  medicamentos, embarazo y menores → `escalar_a_humano`.
- Ningún número (precio, stock, gramaje) puede salir de la memoria del modelo: solo de un
  resultado de herramienta. Verificable revisando `chat_messages.tool_calls`.
- Límite de mensajes y de tokens por sesión, más rate limit por IP.
- Aviso visible: "orientación comercial, no consejo médico".
- Caché de prompt sobre el contexto de catálogo para reducir coste por conversación.

### 7.3 Migración de datos legacy

Script idempotente `packages/db/scripts/migrate-legacy.ts`:

1. Lee `productos.json` del repo antiguo.
2. Normaliza y crea `brands` (15) y `categories` (4) con sus colores desde `CONFIG`.
3. Crea `products` con `slug` derivado del nombre y `legacy_id` para trazabilidad.
4. Crea una `product_variant` **`Única`** por producto con precio y stock iniciales.
   *No se replica la invención de sabores del front.* Las variantes reales (Vainilla,
   Chocolate, Punch) se cargan después desde el panel, con datos verificados.
5. Registra el stock inicial como movimiento `RESTOCK`, no como columna suelta.
6. Sube las 274 imágenes a Vercel Blob y guarda las URLs en `product_images`.
7. Genera embeddings de `name + description + benefits` para la búsqueda semántica.

**Verificación de la migración:** 127 productos, 127 variantes, ≥127 imágenes, suma de
stock igual a la del JSON original. Si no cuadra, el script falla.

---

## 8. Identidad visual NEXA

Extraída del logotipo entregado.

| Token | Valor | Uso |
|---|---|---|
| `--nexa-ink` | `#0A0A0A` | Fondo principal, tipografía sobre claro |
| `--nexa-navy` | `#0F1B33` | Superficies oscuras, fondo hexagonal del isotipo |
| `--nexa-paper` | `#FFFFFF` | Superficies claras, texto sobre oscuro |
| `--nexa-orange` | `#FF5A1F` | Acento único: CTA, precio, badges, flecha del logo |
| `--nexa-orange-hover` | `#E64A10` | Estado hover del acento |
| `--nexa-whatsapp` | `#25D366` | Exclusivo del botón flotante de WhatsApp |
| `--nexa-muted` | `#6B7280` | Texto secundario |

**Regla de uso del naranja:** es un acento, no un color de fondo. Si en una pantalla hay
más de tres elementos naranjas, deja de leerse como llamada a la acción. Negro y blanco
cargan la estructura; el naranja marca dónde hacer clic.

- **Fondo:** textura hexagonal oscura del logo, aplicada al hero y a secciones de corte,
  nunca detrás de texto largo.
- **Tipografía:** Barlow Condensed (títulos — condensada e itálica, en la línea del
  logotipo) + IBM Plex Sans (texto). Se descarta Inter, que es la fuente por defecto del
  proyecto actual y la más genérica del ecosistema: IBM Plex Sans mantiene el carácter
  técnico sin sonar a plantilla.
- **Contacto:** WhatsApp flotante `+57 322 699 3891` en verde `#25D366`,
  correo `leonardecojt@gmail.com`.

---

## 9. Infraestructura y despliegue

| Entorno | Composición | Propósito |
|---|---|---|
| **Local** | `docker-compose`: PostgreSQL 17 + pgvector + Adminer; Next.js con HMR fuera del contenedor | Desarrollo diario |
| **Preview** | Vercel Preview + rama de base de datos de Neon por PR | Revisión aislada con datos reales |
| **Producción** | Vercel (app) + Neon (Postgres) + Vercel Blob (imágenes) + Upstash Redis (rate limit) | Demo y venta real |
| **Kubernetes** | `infra/k8s`: Deployment, Service, Ingress, Secret, HPA, StatefulSet de Postgres, Job de migraciones | Portabilidad y aprendizaje |

**Sobre Kubernetes, con honestidad:** Vercel no ejecuta Kubernetes. Los dos no conviven
en el mismo despliegue. Los manifiestos cumplen dos funciones legítimas — demostrar que
la aplicación está contenerizada y es portable, y ser la ruta de salida si algún día se
abandona Vercel — pero **no son el camino de producción de esta fase**, y mantener el
cluster costaría más que todo el resto de la infraestructura junta. Se construyen y se
documentan; no se operan.

**Branching de base de datos en Neon:** cada PR crea una rama de la base con datos de
producción, CI corre migraciones y tests contra ella, y se destruye al hacer merge. Es la
razón principal para elegir Neon por encima de un Postgres gestionado convencional.

---

## 10. Plan por fases

| Fase | Entregable | Criterio de aceptación |
|---|---|---|
| **F0 · Fundaciones** | Monorepo pnpm, TypeScript estricto, Prisma, Docker Compose, CI, tokens NEXA | `pnpm dev` levanta app + base; CI en verde |
| **F1 · Catálogo** | Migración de 127 productos y 274 imágenes; listado, filtros, búsqueda, ficha | Paridad funcional con el sitio actual, servido desde PostgreSQL |
| **F2 · Carrito y órdenes** | Dominio de carrito, reserva de stock, órdenes, admin mínimo | Una orden se crea, reserva stock y expira sola |
| **F3 · Pagos Wompi** | Checkout, webhook firmado e idempotente, reconciliación | Pago sandbox completo: orden `PAID` con stock descontado |
| **F4 · Asistente IA** | Bot con herramientas, búsqueda híbrida, barandas | El bot vende un producto real de principio a fin |
| **F5 · Endurecimiento** | SEO, accesibilidad, observabilidad, Lighthouse, E2E | RNF-01, RNF-06 y RNF-07 verificados |
| **F6 · Portabilidad** | Manifiestos K8s, documentación, runbook | `kubectl apply` levanta el stack completo |

Cada fase cierra con revisión de código y con la constitución como lista de verificación.

**Avance al 4 de septiembre de 2026:** F0, F1 y F2 completas y verificadas contra
PostgreSQL. F3 con el código completo y probado con eventos firmados de extremo a extremo,
a falta del pago real en el sandbox de Wompi que exige ADR-0003 antes de producción.
Verificación actual: 118 tests unitarios y 31 de integración.

---

## 11. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Webhook de Wompi perdido → orden pagada sin confirmar | Media | **Alto** | Job de reconciliación cada 10 min contra la API de Wompi |
| R2 | Sobreventa por carrera entre dos compras del último ítem | Media | Alto | Reserva de stock con TTL + `SELECT … FOR UPDATE` en la transacción |
| R3 | El bot afirma un precio o stock inventado | Media | Alto | Prohibición dura en el prompt + todo número desde herramienta + revisión de logs |
| R4 | El bot da consejo médico | Baja | **Alto** (legal) | Barandas explícitas, escalado a humano, aviso visible |
| R5 | Coste del LLM se dispara | Media | Medio | Límite por sesión, rate limit, caché de prompt, alerta de gasto |
| R6 | Migración de imágenes incompleta o rota | Media | Medio | Script idempotente con verificación de conteo y checksum |
| R7 | Cold start de Neon en la primera visita | Alta | Bajo | Connection pooling + ISR en catálogo; el plan de pago lo elimina |
| R8 | Alcance del panel de administración crece sin control | Alta | Medio | v1 estrictamente: productos, precios, stock, órdenes. Nada más |
| R9 | Meses de refactor sin nada desplegado | Media | Alto | Cada fase despliega a producción; F1 ya reemplaza al sitio actual |

---

## 12. Decisiones registradas (ADR)

| ADR | Decisión |
|---|---|
| [0001](../hydraia/adr/0001-nextjs-fullstack-monolito-modular.md) | Next.js full-stack con dominio desacoplado, en vez de API separada |
| [0002](../hydraia/adr/0002-postgresql-prisma-neon.md) | PostgreSQL + Prisma + Neon con branching por PR |
| [0003](../hydraia/adr/0003-wompi-webhook-idempotente.md) | Wompi con confirmación por webhook firmado e idempotente |
| [0004](../hydraia/adr/0004-inventario-como-libro-de-movimientos.md) | Inventario como libro de movimientos, no como contador |
| [0005](../hydraia/adr/0005-bot-con-herramientas-de-dominio.md) | Bot con uso de herramientas sobre la base de datos, no RAG documental |
| [0006](../hydraia/adr/0006-kubernetes-como-portabilidad.md) | Kubernetes como portabilidad, no como producción |
| [0007](../hydraia/adr/0007-dinero-en-centavos.md) | Dinero almacenado en centavos enteros |
| [0008](../hydraia/adr/0008-carrito-como-orden-en-borrador.md) | El carrito es una orden en `DRAFT`; no existe tabla `carts` |
| [0009](../hydraia/adr/0009-el-importe-manda-sobre-la-firma.md) | El importe del evento se valida contra el total: Wompi no firma `reference` |

---

## 13. Métricas de éxito

| Métrica | Línea base actual | Objetivo v1 |
|---|---|---|
| Órdenes registradas en el sistema | 0 | 100 % |
| Pagos cobrados en el sitio | 0 % | ≥ 40 % (el resto por WhatsApp) |
| Tiempo para cambiar un precio | Redeploy (~10 min) | < 30 s desde el panel |
| Incidentes de sobreventa | No medible | 0 |
| Conversaciones del bot que terminan en carrito | 0 % | ≥ 15 % |
| LCP móvil en catálogo | Por medir | ≤ 2,5 s |

---

## 14. Aprobación

Este documento requiere aprobación explícita antes de escribir código de producción.
Aprobar implica aceptar el alcance de la sección 2, los supuestos de 2.3 y las siete
decisiones de la sección 12.
