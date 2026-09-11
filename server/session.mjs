/**
 * Sesión de Enable Banking en disco local (.enablebanking/session.json, gitignorado).
 *
 * No va a Neon a propósito: la base de datos guarda datos, no credenciales, y la app
 * solo corre en esta máquina. Un consentimiento PSD2 dura como mucho 90 días, así que
 * este fichero se renueva con un SCA nuevo un puñado de veces al año.
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * `ENABLEBANKING_DIR` existe para Render: allí el sistema de ficheros del servicio es
 * efímero —cada despliegue arranca de cero— y el consentimiento se perdería en cada push,
 * obligando a repetir el SCA en el banco. La variable apunta al disco persistente que
 * declara `render.yaml`. En local no se pone y todo sigue en `.enablebanking/` como antes.
 */
const DIR = process.env.ENABLEBANKING_DIR
  ? path.resolve(process.env.ENABLEBANKING_DIR)
  : path.resolve(process.cwd(), '.enablebanking')
const FILE = path.join(DIR, 'session.json')

export function readSession() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return null
  }
}

export function writeSession(session) {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(session, null, 2), 'utf8')
}

export function clearSession() {
  try {
    fs.rmSync(FILE)
  } catch {
    /* no había sesión */
  }
}

/** Una autorización pendiente vale para un único redirect; se guarda para validar el `state`. */
export function readPending() {
  return readSession()?.pending ?? null
}

export function writePending(pending) {
  writeSession({ ...(readSession() ?? {}), pending })
}
