import { readFileSync } from "node:fs"

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=")
      const value = line.slice(i + 1).replace(/^["']|["']$/g, "")
      return [line.slice(0, i), value]
    }),
)

const pub = env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY ?? ""
const api = env.WOMPI_API_URL ?? "https://sandbox.wompi.co/v1"

process.stdout.write(`pub_prefix=${pub.slice(0, 9)}\n`)
process.stdout.write(`api=${api}\n`)

const res = await fetch(`${api}/merchants/${encodeURIComponent(pub)}`)
process.stdout.write(`merchant_status=${res.status}\n`)
const body = await res.json().catch(() => null)
if (body?.data) {
  process.stdout.write("merchant_ok=true\n")
  process.stdout.write(`has_name=${Boolean(body.data.name || body.data.legal_name)}\n`)
  process.stdout.write(`has_acceptance=${Boolean(body.data.presigned_acceptance)}\n`)
} else {
  process.stdout.write("merchant_ok=false\n")
  process.stdout.write(`error_type=${body?.error?.type ?? "unknown"}\n`)
  const reasons = body?.error?.reason ?? body?.error?.messages ?? body?.error
  process.stdout.write(`error_detail=${JSON.stringify(reasons)}\n`)
  process.stdout.write(`pub_len=${pub.length}\n`)
}
