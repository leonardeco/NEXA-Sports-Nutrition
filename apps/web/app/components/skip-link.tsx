/** Primer foco del teclado: salta el encabezado fijo (RNF-06). */
export function SkipLink() {
  return (
    <a
      href="#contenido"
      className="sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:inline-block focus:h-auto focus:w-auto focus:overflow-visible focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--color-nexa-navy-deep)] focus:bg-white"
    >
      Saltar al contenido
    </a>
  )
}
