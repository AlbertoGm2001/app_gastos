/**
 * Autenticación de la app: un único usuario, definido en variables de entorno del
 * servidor (`AUTH_USERNAME` / `AUTH_PASSWORD`). No hay tabla de usuarios ni registro: la
 * app es de una sola persona y el dato que protege —movimientos bancarios con nombres de
 * terceros— no admite un "todavía sin configurar" abierto de par en par.
 *
 * Por eso es **fail-closed**: si las variables no están puestas, la API no sirve nada
 * (503). Un despliegue al que se le olvide el entorno queda inservible, no público.
 *
 * La sesión es una cookie firmada, sin estado en el servidor: `HttpOnly` para que el JS
 * de la página no pueda leerla, `SameSite=Lax` porque el redirect del banco tras el SCA
 * es una navegación de nivel superior que tiene que llegar ya autenticada a
 * /api/bank/callback, y `Secure` cuando la petición viene por HTTPS.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'gastos_session'
/** Vida de la cookie. Larga a propósito: es un único usuario en su propio ordenador. */
const SESSION_DAYS = 30
const DAY_MS = 86400000

/** Intentos fallidos seguidos antes de bloquear, y cuánto dura el bloqueo. */
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60_000

export function authConfig(env) {
  return {
    username: (env.AUTH_USERNAME ?? '').trim(),
    password: env.AUTH_PASSWORD ?? '',
    secret: env.AUTH_SECRET ?? '',
  }
}

export const isAuthConfigured = (config) => Boolean(config.username && config.password)

export const AUTH_NOT_CONFIGURED =
  'La autenticación no está configurada en el servidor: define AUTH_USERNAME y AUTH_PASSWORD ' +
  'en .env.local (o en las variables de entorno del despliegue) y reinicia.'

/**
 * Clave con la que se firma la cookie. Si no hay `AUTH_SECRET` se deriva de las
 * credenciales, y así cambiar la contraseña invalida por sí solo las sesiones abiertas.
 */
function signingKey(config) {
  if (config.secret) return config.secret
  return createHash('sha256').update(`gastos.session.v1|${config.username}|${config.password}`).digest('hex')
}

/**
 * Comparación en tiempo constante. Se comparan los digest y no las cadenas: así la
 * duración no depende tampoco de la longitud, que `timingSafeEqual` filtraría lanzando.
 */
function equals(a, b) {
  const digest = (value) => createHash('sha256').update(String(value), 'utf8').digest()
  return timingSafeEqual(digest(a), digest(b))
}

const failures = new Map() // ip -> { count, until }

/** Milisegundos que quedan de bloqueo, 0 si no lo hay. */
export function lockoutRemaining(ip) {
  const entry = failures.get(ip)
  if (!entry?.until) return 0
  return Math.max(0, entry.until - Date.now())
}

function registerFailure(ip) {
  const entry = failures.get(ip) ?? { count: 0, until: 0 }
  entry.count += 1
  if (entry.count >= MAX_ATTEMPTS) {
    entry.until = Date.now() + LOCKOUT_MS
    entry.count = 0
  }
  failures.set(ip, entry)
}

export function verifyCredentials(config, username, password) {
  // Se comprueban los dos campos siempre, sin cortocircuito: un `&&` revelaría por
  // tiempo si el usuario existe.
  const userOk = equals(username ?? '', config.username)
  const passOk = equals(password ?? '', config.password)
  return userOk && passOk
}

/** Token `payload.firma`, con el usuario y la caducidad dentro del payload firmado. */
function issueToken(config) {
  const payload = Buffer.from(
    JSON.stringify({ u: config.username, exp: Date.now() + SESSION_DAYS * DAY_MS }),
  ).toString('base64url')
  const signature = createHmac('sha256', signingKey(config)).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyToken(config, token) {
  const [payload, signature] = String(token).split('.')
  if (!payload || !signature) return false
  const expected = createHmac('sha256', signingKey(config)).update(payload).digest('base64url')
  if (!equals(signature, expected)) return false
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return u === config.username && typeof exp === 'number' && exp > Date.now()
  } catch {
    return false
  }
}

/** HTTPS directo (dev server con mkcert) o detrás de un proxy que lo termina (Vercel). */
const isSecure = (req) =>
  Boolean(req.socket?.encrypted) || String(req.headers['x-forwarded-proto'] ?? '').split(',')[0] === 'https'

function cookie(req, value, maxAgeSeconds) {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (isSecure(req)) parts.push('Secure')
  return parts.join('; ')
}

export const sessionCookie = (req, config) => cookie(req, issueToken(config), SESSION_DAYS * 86400)
export const expiredCookie = (req) => cookie(req, '', 0)

function readCookie(req) {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE_NAME) return rest.join('=')
  }
  return null
}

export function isAuthenticated(config, req) {
  const token = readCookie(req)
  return Boolean(token) && verifyToken(config, token)
}

/** IP del cliente, para el bloqueo por intentos. Detrás de proxy, la primera de la lista. */
export const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'local'

export function recordFailedAttempt(req) {
  registerFailure(clientIp(req))
}

export function clearFailedAttempts(req) {
  failures.delete(clientIp(req))
}
