/**
 * Isotipo NEXA: la X oscura atravesada por la flecha naranja, sobre el
 * cuadrado navy del logotipo.
 */
export function NexaMark({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="NEXA Sports Nutrition"
      className="shrink-0"
    >
      <rect width="64" height="64" rx="14" fill="var(--color-nexa-navy-deep)" />
      <path d="M17 14 L47 50" stroke="#2E3542" strokeWidth="9" strokeLinecap="square" fill="none" />
      <path
        d="M15 51 L45 19"
        stroke="var(--color-nexa-orange)"
        strokeWidth="9"
        strokeLinecap="butt"
        fill="none"
      />
      <path d="M52 12 L50 30 L34 14 Z" fill="var(--color-nexa-orange)" />
    </svg>
  )
}

export function NexaLockup() {
  return (
    <div className="flex items-center gap-3">
      <NexaMark />
      <div>
        <div
          className="text-[2.1rem] leading-[0.9] font-bold italic uppercase tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          NEXA
        </div>
        <div
          className="text-[0.7rem] uppercase"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "0.34em", color: "var(--text-muted)" }}
        >
          Sports Nutrition
        </div>
      </div>
    </div>
  )
}
