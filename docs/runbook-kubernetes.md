# Runbook — Kubernetes (ADR-0006)

Los manifiestos de `infra/k8s` son la **ruta de salida**, no el despliegue en uso.
La producción de esta fase es Vercel + Neon. Este documento sirve para levantar
el stack en un cluster de laboratorio (kind, minikube o equivalente) y para
saber qué tocar el día que Vercel deje de encajar.

Criterio de F6: `kubectl apply -k infra/k8s` deja el stack completo.

## Qué hay dentro

| Recurso | Nombre | Para qué |
|---|---|---|
| Namespace | `nexa` | Aísla el stack |
| ConfigMap | `nexa-config` | URL pública, tarifa de envío, WhatsApp |
| Secret | `nexa-secret` | Base, sesión de admin, cron, Wompi, Anthropic |
| StatefulSet + Service | `nexa-postgres` | PostgreSQL 18 con pgvector |
| Job | `nexa-migrate` | `prisma migrate deploy` |
| Deployment + Service + HPA | `nexa-web` | Next.js standalone, 1–3 réplicas |
| Ingress | `nexa-web` | Host `nexa.local`, clase `nginx` |
| CronJob | `nexa-expire-orders` | RF-09 cada 5 minutos |

## Prerrequisitos

- Docker
- `kubectl`
- Un cluster con storage (kind y minikube lo traen) e Ingress NGINX
- Las imágenes construidas **en la máquina del cluster** o cargadas en él

```bash
# kind
kind create cluster --name nexa
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/kind/deploy.yaml

# minikube
minikube start
minikube addons enable ingress
```

## Construir las imágenes

Desde la raíz del repo:

```bash
docker build -f infra/docker/Dockerfile --target runner  -t nexa-web:latest .
docker build -f infra/docker/Dockerfile --target migrate -t nexa-migrate:latest .
```

Cargarlas en el cluster (kind):

```bash
kind load docker-image nexa-web:latest --name nexa
kind load docker-image nexa-migrate:latest --name nexa
```

En minikube: `eval $(minikube docker-env)` **antes** de construir, para que las
imágenes queden en el Docker del cluster.

## Levantar

```bash
kubectl apply -k infra/k8s
kubectl -n nexa wait --for=condition=ready pod -l app.kubernetes.io/name=nexa-postgres --timeout=180s
kubectl -n nexa wait --for=condition=complete job/nexa-migrate --timeout=180s
kubectl -n nexa wait --for=condition=available deploy/nexa-web --timeout=180s
```

El Job de migraciones no se vuelve a crear si ya existe con el mismo nombre.
Antes de un segundo apply:

```bash
kubectl -n nexa delete job nexa-migrate --ignore-not-found
```

## Entrar a la tienda

```bash
# /etc/hosts (Windows: C:\Windows\System32\drivers\etc\hosts)
127.0.0.1 nexa.local
```

kind con el manifiesto de Ingress NGINX publica en `localhost:80`. minikube:
`minikube ip` y ese IP contra `nexa.local`, o `minikube tunnel`.

Comprobar:

```bash
curl -fsS http://nexa.local/api/alive
curl -fsS http://nexa.local/api/health
```

## Semilla del catálogo (una vez)

El Job de migraciones **no** carga productos. Después de que `nexa-web` esté listo:

```bash
kubectl -n nexa delete job nexa-seed --ignore-not-found
kubectl -n nexa create job nexa-seed --from=job/nexa-migrate --dry-run=client -o yaml
```

Más directo, reutilizando la imagen de migrate, que trae el repo y Prisma:

```bash
kubectl -n nexa run nexa-seed --rm -it --restart=Never \
  --image=nexa-migrate:latest --image-pull-policy=IfNotPresent \
  --env="DATABASE_URL=postgresql://nexa:nexa@nexa-postgres:5432/nexa?schema=public" \
  --env="DIRECT_URL=postgresql://nexa:nexa@nexa-postgres:5432/nexa?schema=public" \
  -- pnpm --filter @nexa/db exec tsx prisma/seed.ts
```

Alta del administrador:

```bash
kubectl -n nexa run nexa-admin --rm -it --restart=Never \
  --image=nexa-migrate:latest --image-pull-policy=IfNotPresent \
  --env="DATABASE_URL=postgresql://nexa:nexa@nexa-postgres:5432/nexa?schema=public" \
  --env="DIRECT_URL=postgresql://nexa:nexa@nexa-postgres:5432/nexa?schema=public" \
  -- pnpm --filter @nexa/db exec tsx prisma/create-admin.ts correo@ejemplo.com "una contraseña larga"
```

## Secretos de verdad

`infra/k8s/secret.yaml` trae las mismas claves que docker-compose (`nexa`/`nexa`)
para que un `kubectl apply` funcione en laboratorio. Antes de cualquier
exposición pública:

```bash
kubectl -n nexa edit secret nexa-secret
```

O bórralo y créalo desde un archivo que **no** vive en git:

```bash
kubectl -n nexa create secret generic nexa-secret --from-env-file=.env.k8s
```

Wompi y Anthropic vacíos son válidos: la tienda sigue en pie (RNF-03).

## Cron de reservas (RF-09)

El CronJob pega cada 5 minutos a `/api/cron/expire-orders` con
`Authorization: Bearer $CRON_SECRET`. Si el secreto del Secret no coincide
con el de la app, el Job falla y el stock reservado no se libera. Se puede
disparar a mano:

```bash
kubectl -n nexa create job nexa-expire-now --from=cronjob/nexa-expire-orders
```

## HPA

El autoscaler pide métricas de CPU. En kind/minikube hay que tener
metrics-server. Sin él los pods quedan en 1 réplica y el HPA se queja en
`kubectl -n nexa describe hpa nexa-web`; la tienda funciona igual.

## Tirar todo

```bash
kubectl delete -k infra/k8s
# el PVC del StatefulSet a veces queda:
kubectl -n nexa delete pvc --all
```

## Qué no es este stack

- No sustituye a Vercel. No hay CDN, preview por PR ni crons de Vercel.
- No hay backups de Postgres. Un laboratorio se resiembra; producción
  exigiría un operador o snapshots antes de usarlo en serio.
- CI **no despliega** el cluster. Construye las imágenes y corre
  `kubectl apply -k infra/k8s --dry-run=client` para que un manifiesto
  roto falle el PR (ADR-0006).
