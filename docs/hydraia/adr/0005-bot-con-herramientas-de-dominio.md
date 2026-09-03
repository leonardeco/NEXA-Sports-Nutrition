# ADR-0005 — Bot con herramientas de dominio, no RAG documental

- **Estado:** Aceptada
- **Fecha:** 2026-09-02

## Contexto

`InteractiveChatbot.jsx` es un árbol de decisión de 285 líneas que no conoce el catálogo:
recomienda categorías, nunca productos, y no puede vender. El objetivo es un asistente que
responda de verdad y cierre ventas.

## Decisión

Un bucle de **uso de herramientas** contra `claude-sonnet-5`, donde el modelo no recibe
documentos sino acceso a funciones del dominio:

| Herramienta | Efecto |
|---|---|
| `buscar_productos` | Búsqueda híbrida: `tsvector` español + `pgvector` semántico |
| `obtener_producto` | Ficha con precio y stock actuales |
| `comparar_productos` | Comparativa de 2-3 variantes |
| `agregar_al_carrito` | Añade tras confirmación explícita del cliente |
| `crear_enlace_pago` | Genera orden y checkout |
| `escalar_a_humano` | Enlace `wa.me` con el contexto de la conversación |

**Barandas obligatorias:**

- Ningún dato numérico puede provenir de la memoria del modelo. Precio, stock y gramaje
  salen siempre de un resultado de herramienta. Auditable en `chat_messages.tool_calls`.
- Dosificación clínica, condiciones médicas, interacciones con medicamentos, embarazo y
  menores de edad → `escalar_a_humano`, sin excepción.
- Límite de mensajes y de tokens por sesión, más rate limit por IP.
- Aviso visible: orientación comercial, no consejo médico.
- Toda sesión y todo mensaje quedan registrados.

## Alternativas consideradas

**RAG sobre documentos.** Los datos que importan (precio, stock, disponibilidad) cambian
constantemente; un índice documental sirve información obsoleta con total confianza. El
catálogo ya es una base de datos consultable: convertirlo en documentos es perder precisión
a cambio de nada.

**Mejorar el árbol de reglas.** Coste cero y respuestas predecibles, pero no conversa ni
vende fuera del guion, que era justamente el objetivo.

**Volcar el catálogo completo en el prompt.** Con 127 productos cabría hoy, pero no escala,
encarece cada turno y sigue permitiendo que el modelo cite stock desactualizado.

## Consecuencias

**A favor:** el bot vende productos reales con datos reales. Añadir una capacidad es añadir
una herramienta, no reescribir un árbol. El registro de conversaciones alimenta mejoras del
catálogo y del prompt.

**En contra:** coste por conversación (mitigado con caché de prompt y límites por sesión) y
latencia mayor que un árbol estático. Requiere evaluaciones periódicas contra un conjunto
de conversaciones de referencia, sobre todo para verificar que las barandas aguantan.

Relacionada: [[0002-postgresql-prisma-neon]]
