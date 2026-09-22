import { Skeleton } from "../../components/skeleton"

/** Silueta de la ficha: foto a la izquierda, datos a la derecha. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <Skeleton className="h-3 w-40" />

      <div className="mt-5 grid gap-10 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full" />

        <div className="space-y-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-4/5" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-6 h-12 w-56" />

          <div className="space-y-2 pt-6">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>

          <div className="space-y-2 pt-4">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    </main>
  )
}
