/**
 * Cliente de la API de Enable Banking (PSD2 / Open Banking).
 *
 * Vive en Node y no en el navegador por dos razones: la clave privada RSA con la que
 * se firma cada petición no puede viajar al cliente, y api.enablebanking.com no sirve
 * CORS. Lo consume el middleware de Vite (server/api.mjs).
 *
 * Documentación: https://enablebanking.com/docs/api/reference/
 */
import { createSign } from 'node:crypto'
import fs from 'node:fs'

const BASE_URL = 'https://api.enablebanking.com'
/** Vida del JWT. El máximo que admite la API es 24 h; una hora sobra y se renueva solo. */
const TOKEN_TTL_SECONDS = 3600

const base64url = (value) => Buffer.from(value).toString('base64url')

let cached = null // { token, expiresAt }

/**
 * Reconstruye un PEM que haya perdido su formato al viajar por una variable de entorno.
 *
 * Pegar una clave en el formulario de un panel la estropea de formas muy variadas, y
 * todas dan el mismo error críptico de OpenSSL —`error:1E08010C:DECODER routines::
 * unsupported`—, que no dice ni que el problema sea el formato:
 *
 * - los saltos de línea se convierten en espacios, o desaparecen del todo;
 * - llegan escritos como los dos caracteres `\` y `n`;
 * - el valor acaba entre comillas, que pasan a formar parte de la cadena.
 *
 * En todos los casos el contenido está intacto: es base64 entre una cabecera y un pie. Así
 * que en vez de intentar adivinar qué le pasó, se extrae el cuerpo, se le quita todo el
 * espacio en blanco y se vuelve a montar el PEM con sus líneas de 64 caracteres, que es lo
 * que espera `createSign`. Un PEM correcto pasa por aquí sin cambiar.
 */
function normalizePem(value) {
  const sinComillas = value.trim().replace(/^["']|["']$/g, '')
  const conSaltos = sinComillas.replace(/\\r/g, '').replace(/\\n/g, '\n')

  const match = conSaltos.match(/-----BEGIN ([A-Z ]+?)-----([\s\S]*?)-----END \1-----/)
  if (!match) return conSaltos

  const [, tipo, cuerpo] = match
  const base64 = cuerpo.replace(/\s+/g, '')
  const lineas = base64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${tipo}-----\n${lineas.join('\n')}\n-----END ${tipo}-----\n`
}

/**
 * La clave privada RSA, de la variable de entorno o de un fichero.
 *
 * La variable (`ENABLE_BANKING_PRIVATE_KEY`, con el PEM entero dentro) existe para poder
 * desplegar en cualquier sitio sin depender de que el proveedor ofrezca ficheros
 * secretos ni disco. En local sigue siendo más cómodo el fichero, así que se admiten
 * las dos y gana la variable.
 */
function readPrivateKey({ privateKey, keyPath }) {
  if (privateKey?.trim()) return normalizePem(privateKey)

  if (!keyPath) {
    throw new Error(
      'Falta la clave privada de Enable Banking: pon el PEM en ENABLE_BANKING_PRIVATE_KEY ' +
        'o la ruta a su fichero en ENABLE_BANKING_KEY_PATH.',
    )
  }
  try {
    return fs.readFileSync(keyPath, 'utf8')
  } catch {
    throw new Error(
      `No se ha podido leer la clave privada de Enable Banking en "${keyPath}". ` +
        'Descárgala del Control Panel al registrar la aplicación y apunta ENABLE_BANKING_KEY_PATH a ella.',
    )
  }
}

/**
 * JWT RS256 con el formato que exige Enable Banking: el `kid` es el id de la
 * aplicación y el issuer/audience son constantes suyas, no nuestras.
 */
function buildToken({ applicationId, keyPath, privateKey }) {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.expiresAt - 60 > now) return cached.token

  const header = { typ: 'JWT', alg: 'RS256', kid: applicationId }
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`

  let signature
  try {
    signature = createSign('RSA-SHA256').update(signingInput).sign(readPrivateKey({ privateKey, keyPath })).toString('base64url')
  } catch (error) {
    // OpenSSL solo dice "DECODER routines::unsupported", que no menciona ni la clave ni el
    // formato. Traducirlo evita repetir el rato que costó averiguarlo la primera vez: el
    // síntoma es que todo funciona salvo lo que habla con el banco, porque es lo único
    // que firma.
    const fuente = privateKey?.trim() ? 'ENABLE_BANKING_PRIVATE_KEY' : `el fichero ${keyPath}`
    throw new Error(
      `No se ha podido firmar con la clave privada de ${fuente}: ${error.message}. ` +
        'Suele ser que el PEM está mal copiado. Tiene que empezar por "-----BEGIN PRIVATE KEY-----", ' +
        'acabar por "-----END PRIVATE KEY-----" y no llevar comillas alrededor.',
    )
  }

  cached = { token: `${signingInput}.${signature}`, expiresAt: payload.exp }
  return cached.token
}

export function createClient({ applicationId, keyPath, privateKey }) {
  if (!applicationId) throw new Error('Falta ENABLE_BANKING_APPLICATION_ID en .env.local')

  async function request(method, path, body) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${buildToken({ applicationId, keyPath, privateKey })}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    let data
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }
    if (!response.ok) {
      const detail = data?.message ?? data?.error ?? data?.raw ?? response.statusText
      throw new Error(`Enable Banking ${method} ${path} → ${response.status}: ${detail}`)
    }
    return data
  }

  return {
    /** Bancos disponibles en un país (ISO-2). */
    listAspsps: (country = 'ES') => request('GET', `/aspsps?country=${encodeURIComponent(country)}`),

    /**
     * Arranca la autorización del usuario en su banco. Devuelve la URL a la que hay
     * que enviarlo para el SCA; `redirectUrl` tiene que estar en la whitelist de la app.
     */
    startAuthorization: ({ aspspName, country, redirectUrl, state, validUntil, psuType = 'personal' }) =>
      request('POST', '/auth', {
        access: { valid_until: validUntil },
        aspsp: { name: aspspName, country },
        state,
        redirect_url: redirectUrl,
        psu_type: psuType,
      }),

    /** Canjea el `code` del redirect por una sesión con las cuentas autorizadas. */
    createSession: (code) => request('POST', '/sessions', { code }),

    getSession: (sessionId) => request('GET', `/sessions/${encodeURIComponent(sessionId)}`),

    /**
     * Movimientos de una cuenta desde `dateFrom`, siguiendo la paginación por
     * `continuation_key` hasta agotarla.
     */
    async listTransactions({ accountUid, dateFrom }) {
      const all = []
      let continuationKey
      do {
        const params = new URLSearchParams()
        if (dateFrom) params.set('date_from', dateFrom)
        if (continuationKey) params.set('continuation_key', continuationKey)
        const query = params.size > 0 ? `?${params}` : ''
        const page = await request('GET', `/accounts/${encodeURIComponent(accountUid)}/transactions${query}`)
        all.push(...(page.transactions ?? []))
        continuationKey = page.continuation_key
      } while (continuationKey)
      return all
    },
  }
}
