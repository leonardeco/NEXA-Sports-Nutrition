import { ProductGridSkeleton, Skeleton } from "../components/skeleton"

/** Silueta del catálogo: misma rejilla de filtros y resultados. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-2 h-4 w-56" />

      <div className="mt-6 flex gap-2">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-28" />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden space-y-7 lg:block">
          {Array.from({ length: 3 }, (_, group) => (
            <div key={group} className="space-y-2.5">
              <Skeleton className="h-2.5 w-20" />
              {Array.from({ length: 5 }, (_, row) => (
                <Skeleton key={row} className="h-4 w-full" />
              ))}
            </div>
          ))}
        </aside>

        <section>
          <div className="mb-4 flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-6 w-24" />
            ))}
          </div>
          <ProductGridSkeleton count={12} />
        </section>
      </div>
    </main>
  )
}
