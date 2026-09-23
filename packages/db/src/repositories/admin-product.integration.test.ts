// ─────────────────────────────────────────────────────────────────────────
//  RF-22: el administrador cambia precio, stock, visibilidad, destacado e
//  insignia sin redesplegar.
//
//  Los tests unitarios de packages/core cubren la validación; lo que no
//  pueden cubrir es que el cambio ocurra dentro de una transacción, que el
//  stock pase por el libro de movimientos en vez de escribirse a mano en la
//  columna, y que quede rastro en audit_log. Eso necesita PostgreSQL.
//
//  Cada caso deja el producto como lo encontró.
// ─────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto"
import { AdminProductError, Money } from "@nexa/core"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient } from "../../generated/client/index.js"
import { PrismaProductRepository } from "./product-repository"

const prisma = new PrismaClient()
const products = new PrismaProductRepository(prisma)

/** Actor propio para poder borrar exactamente lo que este archivo escribió. */
const ACTOR = `test-integracion-${randomUUID()}`

let slug: string
let variantId: string
let original: {
  priceCents: number
  stock: number
  isActive: boolean
  isFeatured: boolean
  badge: string | null
}

async function estado() {
  const row = await prisma.product.findUniqueOrThrow({
    where: { slug },
    select: {
      isActive: true,
      isFeatured: true,
      badge: true,
      variants: { where: { id: variantId }, select: { priceCents: true, stock: true } },
    },
  })
  const variant = row.variants[0]!
  return {
    priceCents: variant.priceCents,
    stock: variant.stock,
    isActive: row.isActive,
    isFeatured: row.isFeatured,
    badge: row.badge,
  }
}

async function diffsDeEsteTest() {
  return prisma.auditLog.findMany({
    where: { actorId: ACTOR },
    orderBy: { createdAt: "asc" },
    select: { diff: true, action: true, entity: true },
  })
}

beforeAll(async () => {
  const variant = await prisma.productVariant.findFirstOrThrow({
    where: { isActive: true, isDefault: true, product: { isActive: true } },
    select: { id: true, product: { select: { slug: true } } },
    orderBy: { id: "asc" },
  })
  variantId = variant.id
  slug = variant.product.slug
  original = await estado()
})

afterAll(async () => {
  // Primero los movimientos que generaron los ajustes, luego la columna.
  await prisma.inventoryMovement.deleteMany({
    where: { variantId, note: "Ajuste desde el panel" },
  })
  await prisma.productVariant.update({
    where: { id: variantId },
    data: { priceCents: original.priceCents, stock: original.stock },
  })
  await prisma.product.update({
    where: { slug },
    data: {
      isActive: original.isActive,
      isFeatured: original.isFeatured,
      badge: original.badge,
    },
  })
  await prisma.auditLog.deleteMany({ where: { actorId: ACTOR } })
  await prisma.$disconnect()
})

describe("applyAdminProductChange contra PostgreSQL", () => {
  it("cambia el precio y lo devuelve ya convertido a centavos", async () => {
    const nuevo = Money.toCOP(Money.fromCents(original.priceCents)) + 1000
    const devuelto = await products.applyAdminProductChange(slug, { priceCop: nuevo }, ACTOR)

    expect(devuelto.priceCents).toBe(Money.fromCOP(nuevo))
    expect((await estado()).priceCents).toBe(Money.fromCOP(nuevo))
  })

  // Lo que distingue a ADR-0004: el stock no se escribe en la columna, se
  // deriva de un movimiento. Sin esto un faltante no seria explicable.
  it("ajusta el stock por el libro de movimientos, no a mano", async () => {
    const antes = (await estado()).stock
    const deseado = antes + 3

    await products.applyAdminProductChange(slug, { stock: deseado }, ACTOR)

    expect((await estado()).stock).toBe(deseado)

    const movimiento = await prisma.inventoryMovement.findFirst({
      where: { variantId, reason: "ADJUSTMENT" },
      orderBy: { createdAt: "desc" },
      select: { delta: true, reason: true, note: true },
    })
    expect(movimiento).toMatchObject({ delta: 3, reason: "ADJUSTMENT" })
  })

  it("un ajuste a la baja deja un movimiento negativo", async () => {
    const antes = (await estado()).stock
    await products.applyAdminProductChange(slug, { stock: antes - 2 }, ACTOR)

    const movimiento = await prisma.inventoryMovement.findFirstOrThrow({
      where: { variantId, reason: "ADJUSTMENT" },
      orderBy: { createdAt: "desc" },
      select: { delta: true },
    })
    expect(movimiento.delta).toBe(-2)
    expect((await estado()).stock).toBe(antes - 2)
  })

  it("destaca y deja de destacar el producto", async () => {
    await products.applyAdminProductChange(slug, { isFeatured: !original.isFeatured }, ACTOR)
    expect((await estado()).isFeatured).toBe(!original.isFeatured)

    await products.applyAdminProductChange(slug, { isFeatured: original.isFeatured }, ACTOR)
    expect((await estado()).isFeatured).toBe(original.isFeatured)
  })

  it("normaliza la insignia en el servidor, no solo en el formulario", async () => {
    await products.applyAdminProductChange(slug, { badge: "  Mas   vendido  " }, ACTOR)
    expect((await estado()).badge).toBe("Mas vendido")
  })

  it("una insignia vacía la quita en vez de guardar cadena vacía", async () => {
    await products.applyAdminProductChange(slug, { badge: "Oferta" }, ACTOR)
    await products.applyAdminProductChange(slug, { badge: "" }, ACTOR)
    expect((await estado()).badge).toBeNull()
  })

  it("oculta el producto del catálogo", async () => {
    await products.applyAdminProductChange(slug, { isActive: false }, ACTOR)
    expect((await estado()).isActive).toBe(false)
    expect(await products.findBySlug(slug)).toBeNull()

    await products.applyAdminProductChange(slug, { isActive: true }, ACTOR)
    expect(await products.findBySlug(slug)).not.toBeNull()
  })

  it("aplica varios campos en una sola llamada", async () => {
    const devuelto = await products.applyAdminProductChange(
      slug,
      { isFeatured: true, badge: "Nuevo" },
      ACTOR,
    )
    expect(devuelto.isFeatured).toBe(true)
    expect(devuelto.badge).toBe("Nuevo")
  })

  it("falla con un slug que no existe", async () => {
    await expect(
      products.applyAdminProductChange("no-existe-este-slug", { isFeatured: true }, ACTOR),
    ).rejects.toThrow(AdminProductError)
  })
})

describe("rastro en audit_log", () => {
  it("cada cambio queda registrado con su antes y su después", async () => {
    const previos = (await diffsDeEsteTest()).length
    const actual = await estado()

    await products.applyAdminProductChange(slug, { badge: "Auditado" }, ACTOR)

    const diffs = await diffsDeEsteTest()
    expect(diffs.length).toBe(previos + 1)

    const ultimo = diffs.at(-1)!
    expect(ultimo.entity).toBe("product")
    expect(ultimo.action).toBe("update")
    expect(ultimo.diff).toMatchObject({ badge: { from: actual.badge, to: "Auditado" } })
  })

  // Guardar el formulario sin tocar nada no debe ensuciar la auditoría.
  it("no registra nada cuando el valor enviado ya era el que había", async () => {
    const actual = await estado()
    const previos = (await diffsDeEsteTest()).length

    await products.applyAdminProductChange(
      slug,
      { isFeatured: actual.isFeatured, badge: actual.badge, isActive: actual.isActive },
      ACTOR,
    )

    expect((await diffsDeEsteTest()).length).toBe(previos)
  })

  it("tampoco mueve inventario cuando el stock enviado es el que ya había", async () => {
    const actual = await estado()
    const movimientosAntes = await prisma.inventoryMovement.count({ where: { variantId } })

    await products.applyAdminProductChange(slug, { stock: actual.stock }, ACTOR)

    expect(await prisma.inventoryMovement.count({ where: { variantId } })).toBe(movimientosAntes)
  })
})
