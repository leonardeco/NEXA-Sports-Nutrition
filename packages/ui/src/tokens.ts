/**
 * Los mismos tokens de `tokens.css`, disponibles para JavaScript: imágenes
 * Open Graph, plantillas de correo y cualquier sitio donde no haya CSS.
 * Si cambia uno, cambia en los dos archivos.
 */
export const nexaColors = {
  ink: "#0A0A0A",
  navy: "#0F1B33",
  navyDeep: "#060C1A",
  paper: "#FFFFFF",
  orange: "#FF5A1F",
  orangeHover: "#E64A10",
  orangeSoft: "#FFF0E9",
  whatsapp: "#25D366",
  success: "#2E6B4F",
  warning: "#8A5A00",
  danger: "#B3261E",
} as const

export const nexaFonts = {
  display: '"Barlow Condensed", "Arial Narrow", sans-serif',
  sans: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const

export type NexaColor = keyof typeof nexaColors
