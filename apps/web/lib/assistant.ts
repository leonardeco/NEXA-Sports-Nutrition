// ─────────────────────────────────────────────────────────────────────────
//  Adaptador del asistente — ADR-0005
//
//  Única pieza que habla con Anthropic. El dominio define las herramientas
//  y las barandas; aquí se arma el bucle de uso de herramientas y se
//  persiste cada turno (RF-20).
// ─────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk"
import {
  ASSISTANT_MAX_USER_MESSAGES,
  ASSISTANT_SYSTEM_PROMPT,
  ASSISTANT_TOKEN_BUDGET,
  ASSISTANT_TOOL_DEFINITIONS,
  AssistantError,
  assertSessionAcceptsTurn,
  requiresHumanEscalation,
  type ChatRepository,
  type ChatTurn,
} from "@nexa/core"
import { executeTool, type ToolContext } from "./assistant-tools"
import { whatsappLink } from "./config"

export class AssistantConfigError extends Error {
  constructor() {
    super("El asesor no está configurado")
    this.name = "AssistantConfigError"
  }
}

export interface AssistantReply {
  readonly text: string
  readonly escalated: boolean
  readonly cartChanged: boolean
  readonly whatsappUrl: string | null
}

const MAX_TOOL_ROUNDS = 6

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new AssistantConfigError()
  return new Anthropic({ apiKey })
}

function modelName(): string {
  return process.env.NEXA_BOT_MODEL?.trim() || "claude-sonnet-5"
}

function asHistory(
  turns: readonly ChatTurn[],
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = []
  for (const turn of turns) {
    if (turn.role === "user" || turn.role === "assistant") {
      messages.push({ role: turn.role, content: turn.content })
    }
  }
  return messages
}

export async function handleAssistantTurn(
  userMessage: string,
  ctx: ToolContext & { chats: ChatRepository },
): Promise<AssistantReply> {
  const whatsappUrl = whatsappLink(
    "Hola, vengo del asesor de la tienda NEXA y quiero que me atiendan.",
  )
  const session = await ctx.chats.findOrCreate(ctx.sessionId)
  assertSessionAcceptsTurn(session)

  if (requiresHumanEscalation(userMessage)) {
    await ctx.chats.append(session.id, { role: "user", content: userMessage })
    const text =
      "Esa consulta la tiene que resolver un asesor. No puedo recomendar suplementos cuando hay un tema médico, embarazo, menores o medicamentos de por medio. Escríbenos por WhatsApp y te atienden."
    await ctx.chats.append(session.id, { role: "assistant", content: text })
    await ctx.chats.escalate(session.id)
    return { text, escalated: true, cartChanged: false, whatsappUrl }
  }

  await ctx.chats.append(session.id, { role: "user", content: userMessage })

  const history = await ctx.chats.listMessages(session.id)
  const messages: Anthropic.MessageParam[] = asHistory(history)

  const anthropic = client()
  let cartChanged = false
  let escalated = false
  let finalText = ""
  let tokensUsed = 0

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await anthropic.messages.create({
      model: modelName(),
      max_tokens: 1024,
      system: ASSISTANT_SYSTEM_PROMPT,
      tools: ASSISTANT_TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
      messages,
    })

    tokensUsed += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    )
    const texts = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim()

    if (toolUses.length === 0 || response.stop_reason === "end_turn") {
      finalText = texts
      break
    }

    messages.push({ role: "assistant", content: response.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      const result = await executeTool(use.name, use.input, ctx)
      cartChanged = cartChanged || result.cartChanged
      if (result.escalate) escalated = true
      await ctx.chats.append(session.id, {
        role: "tool",
        content: result.content,
        toolCalls: { name: use.name, input: use.input },
      })
      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: result.content,
      })
    }

    messages.push({ role: "user", content: toolResults })

    if (escalated) {
      finalText =
        texts ||
        "Te paso con un asesor. Por WhatsApp te atienden con calma y con el contexto de esta conversación."
      break
    }
  }

  if (!finalText) {
    finalText =
      "No pude completar la respuesta. Prueba de nuevo o escríbenos por WhatsApp."
  }

  await ctx.chats.append(
    session.id,
    { role: "assistant", content: finalText },
    tokensUsed,
  )

  if (escalated) {
    await ctx.chats.escalate(session.id)
  } else {
    const latest = await ctx.chats.findOrCreate(ctx.sessionId)
    if (latest.messageCount >= ASSISTANT_MAX_USER_MESSAGES || latest.tokenBudgetUsed >= ASSISTANT_TOKEN_BUDGET) {
      await ctx.chats.close(session.id)
    }
  }

  return {
    text: finalText,
    escalated,
    cartChanged,
    whatsappUrl: escalated ? whatsappUrl : null,
  }
}

export { AssistantError }
