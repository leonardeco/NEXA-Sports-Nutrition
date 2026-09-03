# ADR-0001 — Next.js full-stack con dominio desacoplado, en vez de API separada

- **Estado:** Aceptada
- **Fecha:** 2026-09-02
- **Contexto del proyecto:** NEXA Sports Nutrition v1

## Contexto

El proyecto necesita backend por primera vez: base de datos, pagos y un asistente con IA.
El volumen esperado es de decenas de pedidos al mes con un solo operador. El despliegue
objetivo es Vercel + Neon. Se evaluaron tres formas: Next.js full-stack, una API NestJS
separada, y una API FastAPI en Python.

## Decisión

La aplicación es un **monolito modular en Next.js 15 (App Router)**. Los Route Handlers y
Server Actions actúan como BFF. La lógica de negocio vive en `packages/core`, un paquete
sin dependencias de framework que define puertos (`ProductRepository`, `PaymentGateway`,
`InventoryService`) implementados por adaptadores externos.

Regla verificable por lint: `packages/core` no puede importar `next/*` ni `@prisma/client`.

## Alternativas consideradas

**NestJS como API separada.** Más estructura formal y sería el camino real para
Kubernetes en producción. Rechazada porque duplica el despliegue, añade CORS y
autenticación entre servicios, y multiplica el coste operativo para un catálogo de 127
productos y un solo operador. La estructura que aporta se consigue con disciplina de
módulos dentro del monolito.

**FastAPI en Python.** Justificable solo si la IA fuera el núcleo del producto. Aquí la IA
es un canal de venta más; añadir un segundo lenguaje impone dos toolchains, dos pipelines
de CI y dos modelos de despliegue sin beneficio proporcional.

## Consecuencias

**A favor:** un despliegue, un lenguaje, un pipeline. Los componentes de servidor eliminan
la mayoría de las llamadas a API para leer el catálogo. Coste de infraestructura mínimo.

**En contra:** los límites de módulo dependen de disciplina, no de la red — por eso la
regla de lint es obligatoria. El escalado es del proceso completo, no por servicio.

**Puerta de salida:** cuando el tráfico lo justifique, `packages/core` se envuelve en un
servidor propio (NestJS o Fastify) y se despliega en contenedor sin reescribir lógica de
negocio. Esa extracción es el objetivo del desacople, no una idea de futuro vaga.

Relacionada: [[0006-kubernetes-como-portabilidad]]
