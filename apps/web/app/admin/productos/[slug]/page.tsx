import { productRepository } from "@nexa/db"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminProductForm } from "./product-form"

export const dynamic = "force-dynamic"

type Params = Promise<{ slug: string }>

export default async function AdminProductoPage({ params }: { params: Params }) {
  const { slug } = await params
  const product = await productRepository.findBySlugForAdmin(slug)
  if (!product) notFound()

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <p className="text-sm">
        <Link href="/admin/productos" className="underline">
          Productos
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold">{product.name}</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        {product.brand.name}
      </p>
      <AdminProductForm product={product} />
    </main>
  )
}
