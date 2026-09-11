/**
 * Sesión del consentimiento de Enable Banking, guardada en Postgres (tabla `app_state`,
 * clave `bankSession`). Ver el comentario de `readBankSession` en `server/db.mjs` para el
 * por qué de que esto sean datos y no una credencial.
 *
 * Antes vivía en `.enablebanking/session.json`. Se movió al desplegar: el sistema de
 * ficheros de un servicio en Render es efímero —se pierde en cada despliegue y cada vez
 * que el servicio se duerme— y conservarlo exigía un disco persistente, que solo existe
 * en los planes pagados. Un consentimiento perdido no es un dato que se regenere solo:
 * hay que repetir el SCA en el banco a mano.
 *
 * Un consentimiento PSD2 dura como mucho 90 días, así que esto se renueva un puñado de
 * veces al año.
 */
import fs from 'node:fs'
import path from 'node:path'
import { clearBankSession, readBankSession, writeBankSession } from './db.mjs'

/**
 * El fichero de antes. Se sigue leyendo una única vez, para que la sesión que ya estaba
 * en esta máquina suba a la base de datos en vez de obligar a un SCA nuevo. Solo se lee:
 * nunca se vuelve a escribir ahí.
 */
const LEGACY_FILE = path.resolve(process.cwd(), '.enablebanking', 'session.json')

function readLegacyFile() {
  try {
    return JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'))
  } catch {
    return null
  }
}

export async function readSession(databaseUrl) {
  const stored = await readBankSession(databaseUrl)
  if (stored) return stored

  const legacy = readLegacyFile()
  if (!legacy) return null
  await writeBankSession(databaseUrl, legacy)
  console.log('Sesión de Enable Banking migrada de .enablebanking/session.json a la base de datos.')
  return legacy
}

export async function writeSession(databaseUrl, session) {
  await writeBankSession(databaseUrl, session)
}

export async function clearSession(databaseUrl) {
  await clearBankSession(databaseUrl)
}
