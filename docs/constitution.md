# Constitución — NEXA Sports Nutrition

Reglas permanentes del proyecto. Toda spec, plan, ADR y PR debe cumplirlas.
Si una decisión falta aquí, se detiene el trabajo y se pregunta; no se inventa.

1. **Stack cerrado.** TypeScript estricto en todo el código. Next.js 15 (App Router) como
   front y BFF, Prisma sobre PostgreSQL 17, pnpm workspaces. Añadir un lenguaje, un
   framework o un servicio gestionado nuevo exige un ADR aprobado.

2. **El dominio no conoce el framework.** `packages/core` no importa `next/*`,
   `@prisma/client` ni ningún SDK externo. Se comunica por puertos (interfaces); los
   adaptadores viven fuera. Verificable: lint prohíbe esos imports en `packages/core`.

3. **El servidor es la única fuente de verdad del dinero y del stock.** Precios, totales,
   descuentos y disponibilidad se recalculan siempre desde la base de datos. Ningún
   importe que venga del cliente se usa para cobrar. Todo movimiento de inventario queda
   registrado en `inventory_movements`.

4. **Todo borde valida y todo webhook es idempotente.** Cada Route Handler, Server Action
   y webhook valida su entrada con Zod. Los webhooks verifican firma y se deduplican por
   `event_id` antes de producir efectos.

5. **Cobertura obligatoria en lo que cobra o vende.** Casos de uso de carrito, órdenes,
   inventario y pagos llevan tests unitarios; el flujo catálogo → carrito → pago sandbox →
   confirmación lleva un test E2E. Un PR que toque esas áreas sin tests no entra.

6. **El bot no inventa.** Precio, stock, nombre y disponibilidad solo salen de un resultado
   de herramienta consultado a la base de datos. El bot no da consejo médico ni de
   dosificación clínica: escala a un humano.

7. **Cero secretos en el repositorio.** Solo `.env.example` con claves vacías. Las
   credenciales viven en el gestor de secretos del entorno.

8. **Español para el usuario, inglés para el código.** UI, contenido, mensajes de error de
   cara al cliente y documentación en español (es-CO). Identificadores, tablas, columnas,
   ramas y mensajes de commit en inglés.

Requisitos escritos en formato **EARS**:
`CUANDO <evento>, EL SISTEMA <respuesta>` · `SI <condición>, ENTONCES EL SISTEMA <respuesta>` ·
`MIENTRAS <estado>, EL SISTEMA <respuesta>` · `EL SISTEMA <comportamiento permanente>`.
