# ADR-0003 — Wompi con confirmación por webhook firmado e idempotente

- **Estado:** Aceptada
- **Fecha:** 2026-09-02

## Contexto

Hoy no existe cobro: `generarLinkWhatsApp()` arma un mensaje con un número de orden que no
existe en ningún sistema. Se necesita cobrar en línea en Colombia (PSE, Nequi, tarjeta,
Bancolombia) sin dejar de ofrecer WhatsApp como canal humano.

## Decisión

**Wompi** como pasarela, integrada por Checkout Web con firma de integridad, y
**confirmación exclusivamente por webhook**.

1. El servidor recalcula el total desde la base de datos y crea la orden en
   `PENDING_PAYMENT` con una referencia única.
2. Calcula la firma de integridad `SHA256(referencia + amountInCents + COP + integritySecret)`.
3. El navegador solo recibe la clave pública, la referencia y la firma.
4. El redirect de vuelta **no confirma nada**: solo consulta estado.
5. El webhook verifica `X-Event-Checksum`, inserta el evento en `webhook_events` con
   `event_id` único, y solo entonces aplica el cambio de estado y el descuento de stock,
   todo en una única transacción.
6. Un job de reconciliación cada 10 minutos consulta `GET /v1/transactions/{id}` para
   órdenes que llevan más de 30 minutos pendientes.

## Alternativas consideradas

**Confiar en el redirect del navegador.** Es la causa clásica de órdenes marcadas como
pagadas sin cobro real: el parámetro es manipulable y el usuario puede cerrar el navegador
antes de volver.

**Mercado Pago o Stripe.** Stripe no soporta PSE ni Nequi, que son los medios de pago
dominantes en Colombia. Mercado Pago es viable pero Wompi (grupo Bancolombia) tiene mejor
integración local y ya estaba en el plan del negocio.

**Solo WhatsApp.** Mantiene el statu quo: sin registro de ventas ni métricas.

## Consecuencias

**A favor:** ninguna orden puede quedar pagada sin stock descontado. Los reintentos de
Wompi son seguros. El caso de webhook perdido — la falla más común y más cara — queda
cubierto por la reconciliación.

**En contra:** hay una ventana de segundos entre que el cliente paga y ve la confirmación;
la página de resultado debe hacer polling. Añade cuatro secretos que gestionar y un job
programado que operar.

**Obligatorio antes de producción:** flujo completo probado en sandbox, incluyendo pago
rechazado, webhook duplicado y webhook nunca entregado.

Relacionada: [[0004-inventario-como-libro-de-movimientos]], [[0007-dinero-en-centavos]]
