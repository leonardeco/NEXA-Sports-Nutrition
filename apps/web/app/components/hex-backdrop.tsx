/**
 * Textura hexagonal del logotipo. Se usa en el hero y en secciones de corte,
 * nunca detrás de texto largo.
 */
export function HexBackdrop() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-60" aria-hidden="true">
      <defs>
        <pattern id="nexa-hex" width="34.64" height="60" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="var(--color-nexa-orange)" strokeWidth="1" strokeOpacity="0.22">
            <path d="M17.32 0 L34.64 10 L34.64 30 L17.32 40 L0 30 L0 10 Z" />
            <path d="M0 30 L17.32 40 L17.32 60 L0 70 L-17.32 60 L-17.32 40 Z" />
            <path d="M34.64 30 L51.96 40 L51.96 60 L34.64 70 L17.32 60 L17.32 40 Z" />
          </g>
        </pattern>
        <linearGradient id="nexa-hex-fade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.55" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="1" />
        </linearGradient>
        <mask id="nexa-hex-mask">
          <rect width="100%" height="100%" fill="url(#nexa-hex-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#nexa-hex)" mask="url(#nexa-hex-mask)" />
    </svg>
  )
}
