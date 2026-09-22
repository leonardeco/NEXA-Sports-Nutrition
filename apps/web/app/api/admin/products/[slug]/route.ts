import { updateAdminProductSchema } from "@nexa/core"
import { productRepository } from "@nexa/db"
import { revalidateTag } from "next/cache"
import { NextResponse } from "next/server"
import { errorResponse, invalidRequest, readJson } from "@/lib/api"
import { readAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ slug: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const adminId = await readAdmin()
  if (!adminId) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  }

  const parsed = updateAdminProductSchema.safeParse(await readJson(request))
  if (!parsed.success) return invalidRequest(parsed.error)

  try {
    const { slug } = await params
    const { priceCop, stock, isActive, isFeatured, badge } = parsed.data
    const product = await productRepository.applyAdminProductChange(
      slug,
      {
        ...(priceCop !== undefined ? { priceCop } : {}),
        ...(stock !== undefined ? { stock } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(isFeatured !== undefined ? { isFeatured } : {}),
        ...(badge !== undefined ? { badge } : {}),
      },
      adminId,
    )
    revalidateTag("catalog")
    return NextResponse.json({ product })
  } catch (error) {
    return errorResponse(error)
  }
}
