# ADR-0009 — El importe manda sobre la firma del webhook

- **Estado:** Aceptada
- **Fecha:** 2026-09-03

## Contexto

ADR-0003 establece que la confirmación del cobro llega exclusivamente por webhook, y que
se verifica `X-Event-Checksum` antes de tocar la base de datos. Al implementar F3 se
comprobó, contra la documentación de Wompi, **qué campos cubre esa firma**:

```
checksum = SHA256(valores de signature.properties + timestamp + secreto_de_eventos)
```

Y `signature.properties` contiene, por defecto:

```
transaction.id, transaction.status, transaction.amount_in_cents
```

**`transaction.reference` no está firmado.** Es decir: el campo que dice a qué orden
pertenece el pago es precisamente el que la firma no protege.

El ataque que esto abre es concreto. Quien haya hecho un pago legítimo de mil pesos recibe
—o puede provocar— un evento firmado válido. Reenviarlo cambiando solo `reference` por el
número de una orden de medio millón produce un evento cuyo checksum **sigue cuadrando**,
porque ninguno de los tres campos firmados ha cambiado. Un sistema que confíe solo en la
firma marcaría esa orden como pagada.

## Decisión

**La firma autentica el evento; el importe autoriza su aplicación.** Antes de cambiar
ningún estado, `applyPayment` comprueba dentro de la misma transacción que:

1. La moneda del evento es `COP`.
2. `amount_in_cents` es **exactamente igual** al `total_cents` de la orden.

Si algo no cuadra, el evento no se aplica aunque su firma sea válida. Queda registrado en
`webhook_events` con estado `REJECTED` y su motivo, y se responde `200` para no gastar los
reintentos de Wompi en algo que nunca va a cambiar.

Un test unitario deja constancia explícita de que la firma **no** cambia al manipular la
referencia, para que nadie retire la comprobación creyéndola redundante.

## Alternativas consideradas

**Ampliar `signature.properties` para incluir `reference`.** Sería la solución de raíz,
pero la lista de propiedades firmadas la decide Wompi y viaja dentro del propio evento:
no es algo que el comercio configure ni pueda exigir.

**Confiar en que la referencia es secreta.** El número de orden se le muestra al cliente,
se dicta por WhatsApp y por teléfono y aparece en correos. No es un secreto y no puede
sostener una decisión de cobro.

**Verificar contra la API antes de aplicar cada webhook.** Consultar
`GET /v1/transactions/{id}` en cada evento daría la verdad de primera mano, pero añade una
llamada de red sincrónica dentro del camino crítico del webhook y una dependencia de que
Wompi esté disponible para poder cobrar. La comprobación de importe consigue lo mismo sin
salir de la transacción.

## Consecuencias

**A favor:** el cobro no depende de que la pasarela firme lo que nos hace falta. La
comprobación es local, barata y está dentro de la misma transacción que el cambio de
estado. Además atrapa un segundo caso, más aburrido pero más probable que el ataque: un
pago parcial o un importe descuadrado por un cambio de precio a mitad de checkout.

**En contra:** obliga a que el total de la orden sea inmutable desde que se genera la
firma de integridad hasta que llega el webhook. Ya lo es —los snapshots se congelan en el
checkout (ADR-0008)—, pero cualquier futura funcionalidad que recalcule el total de una
orden ya cursada rompería el cobro. Un descuento aplicado a posteriori, por ejemplo, tiene
que crear una orden nueva y no editar la existente.

Relacionada: [[0003-wompi-webhook-idempotente]], [[0008-carrito-como-orden-en-borrador]]
