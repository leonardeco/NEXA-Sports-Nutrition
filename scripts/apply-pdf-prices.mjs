import { readFileSync, writeFileSync } from "node:fs"

const path = "packages/db/prisma/seed-data/productos-legacy.json"
const items = JSON.parse(readFileSync(path, "utf8"))

/** Precios del Catálogo Gorifiit (escritorio), aplicados a ids del seed NEXA. */
const prices = {
  3: 185000,
  4: 330000,
  6: 112000,
  7: 92000,
  11: 160000,
  12: 140000,
  13: 160000,
  14: 245000,
  16: 155000,
  17: 160000,
  19: 130000,
  23: 240000,
  24: 417000,
  25: 587000,
  26: 250000,
  27: 420000,
  29: 410000,
  30: 140000,
  31: 175000,
  32: 170000,
  33: 310000,
  34: 175000,
  35: 490000,
  38: 100000,
  41: 100000,
  45: 100000,
  46: 190000,
  53: 398000,
  54: 127000,
  55: 260000,
  56: 450000,
  59: 240000,
  60: 415000,
  61: 395000,
  64: 130000,
  65: 220000,
  67: 178000,
  70: 131000,
  76: 130000,
  77: 173000,
  88: 85000,
  92: 93000,
  95: 110000,
  100: 145000,
  104: 149000,
  113: 130000,
  114: 145000,
  120: 220000,
  121: 327000,
  122: 80000,
  123: 270000,
  124: 120000,
}

let changed = 0
for (const item of items) {
  const next = prices[item.id]
  if (next !== undefined && next !== item.precio) {
    process.stdout.write(`${item.id} ${item.nombre}: ${item.precio} -> ${next}\n`)
    item.precio = next
    changed += 1
  }
}

writeFileSync(path, `${JSON.stringify(items, null, 2)}\n`)
process.stdout.write(`updated ${changed} of ${items.length}\n`)
