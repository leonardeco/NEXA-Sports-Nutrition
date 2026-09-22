/**
 * Bloque de carga. Las páginas del catálogo son `force-dynamic` y consultan
 * la base en cada petición: sin esto el cliente ve blanco hasta que la
 * consulta vuelve.
 *
 * `animate-pulse` queda anulado por la regla de `prefers-reduced-motion` de
 * globals.css, así que no hace falta condicionarlo aquí.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse ${className}`}
      style={{ background: "var(--surface-sunken)" }}
    />
  )
}

/** Silueta de una tarjeta de producto: misma caja que `ProductCard`. */
export function ProductCardSkeleton() {
  return (
    <div className="border" style={{ borderColor: "var(--border-subtle)" }}>
      <Skeleton className="aspect-square w-full" />
      <div className="space-y-2 p-3.5">
        <Skeleton className="h-2.5 w-1/3" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="mt-3 h-5 w-2/5" />
      </div>
    </div>
  )
}

export function ProductGridSkeleton({
  count,
  className = "grid grid-cols-2 gap-4 lg:grid-cols-3",
}: {
  count: number
  className?: string
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}
