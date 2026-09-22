import { ProductGridSkeleton, Skeleton } from "./components/skeleton"

/** Silueta de la portada mientras la base devuelve destacados y marcas. */
export default function Loading() {
  return (
    <main>
      <section className="bg-[var(--color-nexa-navy-deep)]">
        <div className="mx-auto max-w-6xl space-y-4 px-5 py-20 sm:py-28">
          <Skeleton className="h-3 w-24 opacity-20" />
          <Skeleton className="h-12 w-4/5 max-w-lg opacity-20 sm:h-16" />
          <Skeleton className="h-4 w-3/5 max-w-md opacity-20" />
          <div className="flex gap-3 pt-3">
            <Skeleton className="h-11 w-40 opacity-20" />
            <Skeleton className="h-11 w-40 opacity-20" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <Skeleton className="h-7 w-40" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-14">
        <Skeleton className="h-7 w-40" />
        <div className="mt-5">
          <ProductGridSkeleton count={8} className="grid grid-cols-2 gap-4 lg:grid-cols-4" />
        </div>
      </section>
    </main>
  )
}
