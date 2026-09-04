// ─────────────────────────────────────────────────────────────────────────
//  Alta de un administrador del panel.
//
//    pnpm db:admin correo@ejemplo.com "una contraseña larga"
//
//  Si el correo ya existe, le cambia la contraseña en lugar de fallar: es
//  también la forma de recuperar el acceso.
//
//  La contraseña llega por argumento y queda en el historial del intérprete.
//  Para un operador único en su propia máquina es un compromiso aceptable;
//  lo que no se hace nunca es escribirla en el repositorio.
// ─────────────────────────────────────────────────────────────────────────

import { PrismaClient } from "../generated/client/index.js"
import { hashPassword } from "../src/admin/password"

const MIN_LENGTH = 12

async function main(): Promise<void> {
  const [email, password] = process.argv.slice(2)

  if (!email || !password) {
    throw new Error('Uso: pnpm db:admin correo@ejemplo.com "contraseña"')
  }
  if (!email.includes("@")) {
    throw new Error(`"${email}" no parece un correo`)
  }
  if (password.length < MIN_LENGTH) {
    throw new Error(`La contraseña necesita al menos ${MIN_LENGTH} caracteres`)
  }

  const prisma = new PrismaClient()
  try {
    const passwordHash = await hashPassword(password)
    const admin = await prisma.adminUser.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
      select: { id: true, createdAt: true },
    })

    const nuevo = Date.now() - admin.createdAt.getTime() < 5_000
    process.stdout.write(`${nuevo ? "Creado" : "Actualizado"} el administrador ${email}\n`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
