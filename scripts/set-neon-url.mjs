import { readFileSync, writeFileSync, existsSync } from "node:fs"

const pooled = process.env.NEXA_POOLED_URL ?? ""
if (!pooled.startsWith("postgresql://")) {
  console.error("missing NEXA_POOLED_URL")
  process.exit(1)
}

const direct = pooled.replace("-pooler.", ".")
const path = ".env"
let text = existsSync(path) ? readFileSync(path, "utf8") : ""
if (!text.endsWith("\n") && text.length > 0) text += "\n"

function upsert(name, value) {
  const line = `${name}="${value}"`
  const re = new RegExp(`^${name}=.*$`, "m")
  if (re.test(text)) text = text.replace(re, line)
  else text += `${line}\n`
}

upsert("DATABASE_URL", pooled)
upsert("DIRECT_URL", direct)
writeFileSync(path, text)
process.stdout.write("env_updated\n")
