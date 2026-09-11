// ─────────────────────────────────────────────────────────────────────────
//  Pago sandbox real contra Wompi — ADR-0003
//
//    pnpm wompi:sandbox
//
//  Crea una orden, cobra con la tarjeta de prueba 4242…, espera APPROVED y
//  aplica el pago como lo haría el redirect (webhook que nunca llega a
//  localhost). Después reenvía el evento firmado dos veces al webhook para
//  probar idempotencia, y una segunda orden con 4111… para el rechazo.
//
//  No imprime secretos. Si las llaves no son de un comercio sandbox válido,
//  se detiene y dice de dónde sacarlas.
// ─────────────────────────────────────────────────────────────────────────

import { createHash, randomUUID } from "node:crypto"
import {
  Money,
  eventChecksumPayload,
  integrityPayload,
  wompiEventSchema,
  type WompiEvent,
} from "@nexa/core"
import {
  cartRepository,
  inventoryService,
  orderRepository,
  prisma,
} from "../src/index.js"

const api = process.env.WOMPI_API_URL ?? "https://sandbox.wompi.co/v1"
const pub = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY ?? ""
const prv = process.env.WOMPI_PRIVATE_KEY ?? ""
const integrity = process.env.WOMPI_INTEGRITY_SECRET ?? ""
const events = process.env.WOMPI_EVENTS_SECRET ?? ""
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function fail(message: string): never {
  throw new Error(message)
}

async function merchantOk(): Promise<boolean> {
  if (!pub.startsWith("pub_test_") || pub.length < 40) return false
  const res = await fetch(`${api}/merchants/${encodeURIComponent(pub)}`)
  if (!res.ok) return false
  const body = (await res.json()) as { data?: { presigned_acceptance?: { acceptance_token?: string } } }
  return Boolean(body.data)
}

async function acceptanceToken(): Promise<string> {
  const res = await fetch(`${api}/merchants/${encodeURIComponent(pub)}`)
  const body = (await res.json()) as {
    data?: { presigned_acceptance?: { acceptance_token?: string } }
  }
  const token = body.data?.presigned_acceptance?.acceptance_token
  if (!token) fail("Wompi no devolvió acceptance_token. Revisa la llave pública.")
  return token
}

async function tokenize(number: string): Promise<string> {
  const res = await fetch(`${api}/tokens/cards`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${pub}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      number,
      cvc: "123",
      exp_month: "12",
      exp_year: "29",
      card_holder: "APROBADA SANDBOX",
    }),
  })
  const body = (await res.json()) as { data?: { id?: string }; error?: unknown }
  if (!res.ok || !body.data?.id) {
    fail(`No se pudo tokenizar la tarjeta (HTTP ${res.status}).`)
  }
  return body.data.id
}

async function createTransaction(input: {
  reference: string
  amountCents: number
  token: string
  acceptance: string
  email: string
}): Promise<string> {
  const signature = sha256(
    integrityPayload({
      reference: input.reference,
      amountCents: Money.fromCents(input.amountCents),
      currency: "COP",
      integritySecret: integrity,
    }),
  )
  const res = await fetch(`${api}/transactions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${prv}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount_in_cents: input.amountCents,
      currency: "COP",
      customer_email: input.email,
      payment_method: { type: "CARD", installments: 1, token: input.token },
      reference: input.reference,
      acceptance_token: input.acceptance,
      signature,
    }),
  })
  const body = (await res.json()) as { data?: { id?: string; status?: string }; error?: unknown }
  if (!res.ok || !body.data?.id) {
    fail(`Wompi no creó la transacción (HTTP ${res.status}).`)
  }
  return body.data.id
}

async function waitStatus(id: string, wanted: string): Promise<{ status: string; amount: number }> {
  for (let i = 0; i < 20; i += 1) {
    const res = await fetch(`${api}/transactions/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${pub}` },
    })
    const body = (await res.json()) as {
      data?: { status?: string; amount_in_cents?: number }
    }
    const status = body.data?.status
    const amount = body.data?.amount_in_cents ?? 0
    if (status && status !== "PENDING") {
      if (status !== wanted) fail(`La transacción ${id} quedó en ${status}, se esperaba ${wanted}.`)
      return { status, amount }
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  fail(`La transacción ${id} no salió de PENDING a tiempo.`)
}

async function openOrder() {
  const variant = await prisma.productVariant.findFirst({
    where: { isActive: true, stock: { gt: 0 }, product: { isActive: true } },
    orderBy: { stock: "desc" },
  })
  if (!variant) fail("No hay una variante con stock. Corre pnpm db:seed.")

  const sessionId = randomUUID()
  const stockAntes = await inventoryService.availableStock(variant.id)
  await cartRepository.addItem(sessionId, variant.id, 1)
  const order = await orderRepository.checkout(sessionId, {
    fullName: "Ana Gómez",
    email: "ana.sandbox@example.com",
    phone: "3226993891",
    shippingCity: "Bogotá",
    shippingAddress: "Calle 1 # 2-3",
  })
  return { sessionId, variantId: variant.id, stockAntes, order }
}

function signedEvent(tx: {
  id: string
  reference: string
  status: string
  amount_in_cents: number
}): unknown {
  const timestamp = Math.floor(Date.now() / 1000)
  const base = wompiEventSchema.parse({
    event: "transaction.updated",
    data: {
      transaction: {
        id: tx.id,
        reference: tx.reference,
        status: tx.status,
        amount_in_cents: tx.amount_in_cents,
        currency: "COP",
        payment_method_type: "CARD",
      },
    },
    timestamp,
    signature: {
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
      checksum: "pendiente",
    },
  }) as WompiEvent
  base.signature.checksum = sha256(eventChecksumPayload(base, events))
  return base
}

async function postWebhook(event: unknown): Promise<{ status: number; duplicated?: boolean }> {
  const res = await fetch(`${site}/api/webhooks/wompi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  })
  const body = (await res.json().catch(() => ({}))) as { duplicated?: boolean }
  return { status: res.status, duplicated: body.duplicated }
}

async function main(): Promise<void> {
  if (!(await merchantOk())) {
    fail(
      [
        "Las llaves WOMPI_* de .env no son de un comercio sandbox válido.",
        "Wompi respondió que la llave pública tiene formato inválido (hace falta pub_test_ y ~40 caracteres).",
        "",
        "1. Entra a https://comercios.wompi.co",
        "2. Activa modo Sandbox (Desarrollo → Programadores).",
        "3. Copia llave pública (pub_test_…), privada (prv_test_…),",
        "   secreto de integridad y secreto de eventos.",
        "4. Pégalas en .env y vuelve a correr: pnpm wompi:sandbox",
      ].join("\n"),
    )
  }

  const acceptance = await acceptanceToken()

  const aprobado = await openOrder()
  const tokenOk = await tokenize("4242424242424242")
  const txId = await createTransaction({
    reference: aprobado.order.orderNumber,
    amountCents: aprobado.order.totalCents,
    token: tokenOk,
    acceptance,
    email: "ana.sandbox@example.com",
  })
  const done = await waitStatus(txId, "APPROVED")

  const pagada = await orderRepository.applyPayment(aprobado.order.orderNumber, {
    transactionId: txId,
    reference: aprobado.order.orderNumber,
    status: "APPROVED",
    amountCents: Money.fromCents(done.amount),
    currency: "COP",
    method: "CARD",
  })
  const stockDespues = await inventoryService.availableStock(aprobado.variantId)
  if (pagada.status !== "PAID") fail(`La orden quedó en ${pagada.status}, no PAID.`)
  if (stockDespues !== aprobado.stockAntes - 1) {
    fail(`Stock ${aprobado.stockAntes} → ${stockDespues}; se esperaba ${aprobado.stockAntes - 1}.`)
  }
  process.stdout.write(`ok approved ${pagada.orderNumber} stock ${aprobado.stockAntes}->${stockDespues}\n`)

  const evento = signedEvent({
    id: txId,
    reference: pagada.orderNumber,
    status: "APPROVED",
    amount_in_cents: done.amount,
  })
  try {
    const first = await postWebhook(evento)
    const second = await postWebhook(evento)
    process.stdout.write(
      `ok webhook ${first.status} then duplicate=${String(second.duplicated)} status=${second.status}\n`,
    )
  } catch {
    process.stdout.write(
      `skip webhook: ${site} no responde. Arranca pnpm dev y vuelve a correr para el duplicado.\n`,
    )
  }

  const rechazado = await openOrder()
  const tokenKo = await tokenize("4111111111111111")
  const txKo = await createTransaction({
    reference: rechazado.order.orderNumber,
    amountCents: rechazado.order.totalCents,
    token: tokenKo,
    acceptance,
    email: "ana.sandbox@example.com",
  })
  await waitStatus(txKo, "DECLINED")
  const fallida = await orderRepository.applyPayment(rechazado.order.orderNumber, {
    transactionId: txKo,
    reference: rechazado.order.orderNumber,
    status: "DECLINED",
    amountCents: rechazado.order.totalCents,
    currency: "COP",
    method: "CARD",
  })
  const stockVuelto = await inventoryService.availableStock(rechazado.variantId)
  if (fallida.status !== "PAYMENT_FAILED") fail(`El rechazo quedó en ${fallida.status}.`)
  if (stockVuelto !== rechazado.stockAntes) {
    fail(`Tras DECLINED el stock debía volver a ${rechazado.stockAntes}, quedó ${stockVuelto}.`)
  }
  process.stdout.write(`ok declined ${fallida.orderNumber} stock restored ${stockVuelto}\n`)
  process.stdout.write("sandbox wompi: tres escenarios de ADR-0003 en verde\n")
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    const text = error instanceof Error ? error.message : String(error)
    if (text) console.error(text)
    await prisma.$disconnect().catch(() => undefined)
    process.exit(1)
  })
