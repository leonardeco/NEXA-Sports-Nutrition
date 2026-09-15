import { readFileSync } from "node:fs"
const items = JSON.parse(readFileSync("packages/db/prisma/seed-data/productos-legacy.json", "utf8"))
for (const p of items) {
  process.stdout.write(`${p.id}\t${p.precio}\t${p.marca}\t${p.nombre}\n`)
}
process.stdout.write(`TOTAL ${items.length}\n`)
