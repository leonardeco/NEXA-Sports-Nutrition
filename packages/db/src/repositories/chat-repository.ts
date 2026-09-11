// ─────────────────────────────────────────────────────────────────────────
//  Persistencia de conversaciones del asistente — RF-20, ADR-0005
// ─────────────────────────────────────────────────────────────────────────

import type { ChatRepository, ChatSessionRecord, ChatTurn, Id } from "@nexa/core"
import type { Prisma, PrismaClient } from "../../generated/client/index.js"

function toRecord(row: {
  id: string
  anonId: string
  messageCount: number
  tokenBudgetUsed: number
  endedAt: Date | null
  escalatedToHuman: boolean
}): ChatSessionRecord {
  return {
    id: row.id,
    anonId: row.anonId,
    messageCount: row.messageCount,
    tokenBudgetUsed: row.tokenBudgetUsed,
    endedAt: row.endedAt,
    escalatedToHuman: row.escalatedToHuman,
  }
}

export class PrismaChatRepository implements ChatRepository {
  constructor(private readonly db: PrismaClient) {}

  async findOrCreate(anonId: Id): Promise<ChatSessionRecord> {
    const open = await this.db.chatSession.findFirst({
      where: { anonId, endedAt: null },
      orderBy: { startedAt: "desc" },
    })
    if (open) return toRecord(open)

    const created = await this.db.chatSession.create({ data: { anonId } })
    return toRecord(created)
  }

  async listMessages(sessionId: Id): Promise<readonly ChatTurn[]> {
    const rows = await this.db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    })
    return rows.map((row) => ({
      role: row.role as ChatTurn["role"],
      content: row.content,
      toolCalls: row.toolCalls ?? undefined,
    }))
  }

  async append(sessionId: Id, turn: ChatTurn, tokensUsed = 0): Promise<ChatSessionRecord> {
    const userIncrement = turn.role === "user" ? 1 : 0
    const [session] = await this.db.$transaction([
      this.db.chatSession.update({
        where: { id: sessionId },
        data: {
          messageCount: { increment: userIncrement },
          tokenBudgetUsed: { increment: Math.max(tokensUsed, 0) },
        },
      }),
      this.db.chatMessage.create({
        data: {
          sessionId,
          role: turn.role,
          content: turn.content,
          ...(turn.toolCalls === undefined
            ? {}
            : { toolCalls: turn.toolCalls as Prisma.InputJsonValue }),
        },
      }),
    ])
    return toRecord(session)
  }

  async escalate(sessionId: Id): Promise<ChatSessionRecord> {
    const row = await this.db.chatSession.update({
      where: { id: sessionId },
      data: { escalatedToHuman: true, endedAt: new Date() },
    })
    return toRecord(row)
  }

  async close(sessionId: Id): Promise<ChatSessionRecord> {
    const row = await this.db.chatSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    })
    return toRecord(row)
  }
}
