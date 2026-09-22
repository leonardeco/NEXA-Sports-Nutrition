"use client"

import { ASSISTANT_DISCLAIMER } from "@nexa/core"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

type Line = { from: "user" | "advisor"; text: string; whatsappUrl?: string | null }

type Reply = {
  text?: string
  escalated?: boolean
  cartChanged?: boolean
  whatsappUrl?: string | null
  error?: string
}

/**
 * Asesor de ventas en la tienda (F4). No usa iconografía de "IA": es un
 * asesor de NEXA, con el aviso de que no da consejo médico.
 */
export function SalesAdvisor() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)
  const [lines, setLines] = useState<Line[]>([
    {
      from: "advisor",
      text: "Hola, soy NexaBot, el asesor de NEXA. ¿Buscas proteína, creatina, un preentreno? Dime qué entrenas y te armo una recomendación del catálogo.",
    },
  ])
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [lines, open])

  if (pathname.startsWith("/admin") || pathname.startsWith("/acceso")) return null

  async function send() {
    const message = input.trim()
    if (!message || pending) return
    setInput("")
    setLines((current) => [...current, { from: "user", text: message }])
    setPending(true)
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      })
      const body = (await response.json()) as Reply
      const text = body.text ?? body.error ?? "No pude responder. Prueba de nuevo."
      setLines((current) => [
        ...current,
        { from: "advisor", text, whatsappUrl: body.whatsappUrl ?? null },
      ])
      if (body.cartChanged) {
        router.refresh()
      }
    } catch {
      setLines((current) => [
        ...current,
        { from: "advisor", text: "No pude conectar. Revisa tu conexión o escríbenos por WhatsApp." },
      ])
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="nexa-asesor"
        className="fixed right-5 bottom-24 z-50 flex h-14 items-center gap-2 rounded-full pr-5 pl-4 text-white shadow-lg transition-transform hover:scale-105"
        style={{ background: "var(--color-nexa-navy-deep)" }}
        aria-label={open ? "Cerrar NexaBot" : "Abrir NexaBot, el asesor de NEXA"}
      >
        {open ? (
          <span className="text-2xl leading-none" aria-hidden="true">
            ×
          </span>
        ) : (
          <svg viewBox="0 0 24 24" className="size-7 shrink-0" fill="none" aria-hidden="true">
            <path
              d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H13l-4 3.5V16H7.5A2.5 2.5 0 0 1 5 13.5v-7Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M8.5 9.5h7M8.5 12.5h4"
              stroke="var(--color-nexa-orange)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
        <span
          className="text-base font-bold italic uppercase leading-none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {open ? "Cerrar" : "NexaBot"}
        </span>
      </button>

      {open ? (
        <section
          id="nexa-asesor"
          className="fixed right-5 bottom-40 z-50 flex w-[min(100%-2.5rem,22rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl"
          aria-label="NexaBot"
        >
          <header className="bg-[var(--color-nexa-navy-deep)] px-4 py-3 text-white">
            <p
              className="text-lg font-bold italic uppercase leading-none"
              style={{ fontFamily: "var(--font-display)" }}
            >
              NexaBot
            </p>
            <p className="mt-1 text-[11px] leading-snug text-white/70">{ASSISTANT_DISCLAIMER}</p>
          </header>

          <div className="flex max-h-80 flex-col gap-3 overflow-y-auto px-4 py-3 text-sm">
            {lines.map((line, index) => (
              <div
                key={`${line.from}-${index}`}
                className={line.from === "user" ? "self-end max-w-[90%]" : "self-start max-w-[90%]"}
              >
                <p
                  className={
                    line.from === "user"
                      ? "rounded-2xl rounded-br-sm bg-[var(--color-nexa-navy-deep)] px-3 py-2 text-white"
                      : "rounded-2xl rounded-bl-sm bg-[var(--surface-sunken)] px-3 py-2 text-[var(--text-primary)]"
                  }
                >
                  {line.text}
                </p>
                {line.whatsappUrl ? (
                  <a
                    href={line.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs font-medium text-[var(--color-nexa-orange)]"
                  >
                    Escribir por WhatsApp
                  </a>
                ) : null}
              </div>
            ))}
            {pending ? (
              <p className="text-xs text-[var(--text-muted)]">Consultando el catálogo…</p>
            ) : null}
            <div ref={bottom} />
          </div>

          <form
            className="flex gap-2 border-t border-[var(--border-subtle)] p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <label className="sr-only" htmlFor="nexa-asesor-input">
              Mensaje para el asesor
            </label>
            <input
              id="nexa-asesor-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={2000}
              placeholder="¿Qué estás buscando?"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-ground)] px-3 py-2 text-sm"
              disabled={pending}
            />
            <button
              type="submit"
              disabled={pending || input.trim().length === 0}
              className="rounded-lg bg-[var(--color-nexa-orange)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </form>

          <p className="px-4 pb-3 text-[11px] text-[var(--text-muted)]">
            También puedes ir al{" "}
            <Link href="/catalogo" className="underline">
              catálogo
            </Link>{" "}
            o pagar en el{" "}
            <Link href="/carrito" className="underline">
              carrito
            </Link>
            .
          </p>
        </section>
      ) : null}
    </>
  )
}
