import type { Metadata } from "next"
import { AccessForm } from "./access-form"

export const metadata: Metadata = {
  title: "Acceso",
  // No se indexa ni se describe: nada aquí debe anunciar qué hay detrás.
  robots: { index: false, follow: false },
}

/**
 * Entrada al panel. Vive fuera de `/admin` a propósito: RF-24 pide que las
 * rutas de administración no revelen su existencia, y un formulario de
 * acceso colgado de `/admin/entrar` las revelaría igual.
 */
export default function AccesoPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-5 py-16">
      <h1 className="text-2xl font-bold">Acceso</h1>
      <AccessForm />
    </main>
  )
}
