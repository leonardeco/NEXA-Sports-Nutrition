# Runbook — pago sandbox de Wompi (ADR-0003)

El código de cobro ya está. Cerrar F3 exige **un pago real en el sandbox de
Wompi**: orden `PAID` y stock descontado. Los tests unitarios con eventos
firmados no sustituyen eso.

## Llaves

En [comercios.wompi.co](https://comercios.wompi.co) → Desarrollo → Programadores,
activa **Sandbox** y copia cuatro valores a `.env`:

| Dashboard | Variable |
|---|---|
| Llave pública | `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` (`pub_test_…`, ~40 caracteres) |
| Llave privada | `WOMPI_PRIVATE_KEY` (`prv_test_…`) |
| Secreto de integridad | `WOMPI_INTEGRITY_SECRET` |
| Secreto de eventos | `WOMPI_EVENTS_SECRET` |

`WOMPI_API_URL` queda en `https://sandbox.wompi.co/v1`.

Comprobar sin imprimir secretos:

```bash
pnpm wompi:check
```

Si responde `Formato inválido` / `merchant_ok=false`, las llaves de `.env` no
son las del comercio. Un placeholder tipo `pub_test_abc` no sirve.

## Correr el flujo

Con la base sembrada (`pnpm db:seed`) y las llaves buenas:

```bash
pnpm wompi:sandbox
```

Eso cubre los tres escenarios que ADR-0003 pide antes de producción:

1. **Aprobado** con tarjeta `4242 4242 4242 4242` → orden `PAID`, stock −1.
   El webhook no llega a localhost: se confirma preguntándole a Wompi por id
   (el mismo camino del redirect `?id=`).
2. **Webhook duplicado**: el mismo evento firmado se reenvía dos veces; el
   segundo responde `duplicated` y no vuelve a descontar.
3. **Rechazado** con `4111 1111 1111 1111` → `PAYMENT_FAILED` y el stock
   vuelve.

Para el botón en el navegador: `pnpm dev`, arma un pedido, **Pagar con Wompi**,
misma tarjeta 4242, cualquier fecha futura y CVC de 3 dígitos. Wompi te
devuelve a `/checkout/resultado/{orden}?id=…`.

## Webhook hacia esta máquina

Wompi no alcanza `localhost`. En local manda el redirect. En un preview de
Vercel, configura la URL de eventos del sandbox a:

```
https://<tu-dominio>/api/webhooks/wompi
```
