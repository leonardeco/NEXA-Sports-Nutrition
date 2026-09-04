// ─────────────────────────────────────────────────────────────────────────
//  Contraseñas de administrador
//
//  scrypt, que viene en Node, en vez de bcrypt o argon2: son dependencias
//  con binario nativo y la constitución cierra el stack. scrypt es una KDF
//  legítima, con coste de memoria, y aquí hay un puñado de operadores, no un
//  millón de usuarios.
//
//  El formato guardado lleva el esquema por delante para poder migrar a otra
//  KDF sin adivinar qué hay dentro de cada fila.
// ─────────────────────────────────────────────────────────────────────────

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

const derive = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64
const SCHEME = "scrypt"

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex")
  const key = await derive(password, salt, KEY_LENGTH)
  return `${SCHEME}:${salt}:${key.toString("hex")}`
}

/**
 * Comparación en tiempo constante: comparar con `===` filtra por el tiempo
 * de respuesta cuántos bytes iniciales acertó quien lo intenta.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(":")
  if (scheme !== SCHEME || !salt || !hash) return false

  const expected = Buffer.from(hash, "hex")
  const actual = await derive(password, salt, KEY_LENGTH)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}
