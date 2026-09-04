"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export function AccessForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSending(true)

    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setError(payload.error ?? "Credenciales incorrectas")
        setSending(false)
        return
      }
      router.push("/admin")
      router.refresh()
    } catch {
      setError("No hay conexión. Inténtalo de nuevo.")
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="text-xs" style={{ color: "var(--text-muted)" }}>
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full border bg-white px-3 py-2.5 text-sm"
          style={{ borderColor: "var(--border-subtle)" }}
        />
      </div>

      <div>
        <label htmlFor="password" className="text-xs" style={{ color: "var(--text-muted)" }}>
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full border bg-white px-3 py-2.5 text-sm"
          style={{ borderColor: "var(--border-subtle)" }}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-nexa-warning)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="w-full px-6 py-3 text-sm font-semibold tracking-wide text-white uppercase disabled:opacity-50"
        style={{ background: "var(--color-nexa-navy-deep)" }}
      >
        {sending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  )
}
