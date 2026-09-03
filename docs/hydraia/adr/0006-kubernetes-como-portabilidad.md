# ADR-0006 — Kubernetes como portabilidad, no como producción

- **Estado:** Aceptada
- **Fecha:** 2026-09-02

## Contexto

El plan pedía PostgreSQL con Docker y Kubernetes, y a la vez despliegue en Vercel con base
de datos en Neon. Son dos modelos de ejecución incompatibles: Vercel no ejecuta
Kubernetes, y un cluster propio haría innecesaria la mitad de lo que aporta Vercel.

## Decisión

- **Docker Compose es el entorno de desarrollo real.** PostgreSQL 17 con `pgvector` y
  Adminer, con volumen persistente. Es lo que se usa todos los días.
- **Los manifiestos de Kubernetes se escriben y se documentan, pero no se operan.** Viven
  en `infra/k8s`: Deployment, Service, Ingress, Secret, ConfigMap, HPA, StatefulSet de
  PostgreSQL y Job de migraciones.
- **La producción de esta fase es Vercel + Neon.**

## Alternativas consideradas

**Kubernetes en producción desde el día uno.** Para decenas de pedidos al mes con un solo
operador, el cluster costaría más que el resto de la infraestructura junta y añadiría una
carga operativa —parches, certificados, backups, monitorización— que nadie va a sostener.

**Descartar Kubernetes por completo.** Perdería la garantía de portabilidad y el valor
demostrativo, que son objetivos declarados del proyecto.

## Consecuencias

**A favor:** la aplicación queda contenerizada y verificablemente portable. Si Vercel deja
de encajar por coste o por límites de las funciones, existe una ruta de salida escrita, no
una intención. Junto con el desacople de `packages/core` (ADR-0001), migrar a un cluster no
exige reescribir lógica de negocio.

**En contra:** los manifiestos pueden envejecer sin uso. Mitigación: CI construye la imagen
Docker y valida los manifiestos con `kubectl apply --dry-run` en cada PR, de modo que un
manifiesto roto falla la build aunque nadie despliegue el cluster.

**Riesgo de honestidad:** el README debe decir explícitamente que Kubernetes es una ruta
alternativa y no el despliegue en uso. Presentarlo de otro modo sería describir mal la
arquitectura.

Relacionada: [[0001-nextjs-fullstack-monolito-modular]]
