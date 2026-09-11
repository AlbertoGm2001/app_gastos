/**
 * API local de la app: se monta como middleware del dev server de Vite (vite.config.ts),
 * no como servicio aparte. Así el `.pem` y la cadena de Postgres se quedan en Node, no hay
 * CORS y todo sigue arrancando con un único `npm run dev`.
 *
 * Todo lo que no sea /api/auth/* exige sesión (ver server/auth.mjs). Sin AUTH_USERNAME y
 * AUTH_PASSWORD en el entorno la API no sirve nada: fail-closed, no abierta.
 *
 * Rutas (todas bajo /api):
 *   POST /api/auth/login         entra con el usuario y contraseña del entorno
 *   POST /api/auth/logout        cierra la sesión
 *   GET  /api/auth/session       si hay sesión y si la autenticación está configurada
 *   GET  /api/bank/status        estado de la conexión y de la base de datos
 *   GET  /api/bank/aspsps        bancos disponibles en un país
 *   POST /api/bank/connect       arranca el SCA, devuelve la URL del banco
 *   GET  /api/bank/callback      redirect del banco: canjea el code por una sesión
 *   POST /api/bank/sync          banco → Postgres, y devuelve los movimientos
 *   POST /api/bank/disconnect    olvida la sesión local
 *   GET  /api/transactions       lee los movimientos de Postgres
 *   POST /api/transactions/import  sube un extracto importado en el navegador
 *   GET  /api/state              estado del usuario: viajes, categorías, ajustes
 *   PUT  /api/state              guarda el subconjunto del estado que llegue en el cuerpo
 */
import { randomUUID } from 'node:crypto'
import { createClient } from './enablebanking.mjs'
import { mapTransaction } from './mapTransaction.mjs'
import { assignContentIds } from './dedupKey.mjs'
import {
  deleteStatementOverlap,
  ensureSchema,
  getStats,
  listTransactions,
  readUserState,
  replaceBankRange,
  upsertTransactions,
  writeUserState,
} from './db.mjs'
import { clearSession, readSession, writeSession } from './session.mjs'
import {
  AUTH_NOT_CONFIGURED,
  authConfig,
  clearFailedAttempts,
  clientIp,
  expiredCookie,
  isAuthConfigured,
  isAuthenticated,
  lockoutRemaining,
  recordFailedAttempt,
  sessionCookie,
  verifyCredentials,
} from './auth.mjs'

/**
 * Rutas que se sirven sin sesión: solo las de acceso. Todo lo demás —movimientos, estado
 * del usuario, banco— queda detrás de la cookie.
 */
const PUBLIC_ROUTES = new Set(['GET /api/auth/session', 'POST /api/auth/login', 'POST /api/auth/logout'])

/** Días de validez que se piden al banco. El banco puede recortarlo a su máximo. */
const DEFAULT_CONSENT_DAYS = 90

/**
 * Ventana que se pide al banco en cada sync. Se pide siempre el máximo, no un margen
 * sobre el último movimiento guardado: la sync reemplaza el tramo completo, así que
 * pedirlo todo cuesta el mismo acceso y elimina cualquier deriva.
 *
 * 89 y no 90 porque el Santander responde `422 Wrong transactions period requested` en
 * cuanto te pasas de su horizonte de histórico, y el borde exacto se mueve con el día.
 */
const HISTORY_WINDOW_DAYS = 89

const DAY_MS = 86400000

/** Cada cuánto se admite comprobar el consentimiento contra la API. Ver `verifyConsent`. */
const VERIFY_EVERY_MS = 6 * 60 * 60 * 1000

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)

/** Días completos que faltan para una fecha ISO, o `null` si no hay fecha o no se entiende. */
function daysUntil(isoDate) {
  if (!isoDate) return null
  const target = Date.parse(isoDate)
  if (Number.isNaN(target)) return null
  return Math.floor((target - Date.now()) / DAY_MS)
}

/**
 * Error con código HTTP propio. Sin esto todo salía como 500, y un login rechazado no es
 * un fallo del servidor: el cliente necesita distinguir credenciales malas (401) de
 * bloqueo por intentos (429) o de servidor sin configurar (503).
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

/**
 * Comprueba la fecha desde la que sincronizar antes de gastar un acceso al banco: solo
 * hay 4 al día por consentimiento, así que un 422 por una fecha mal puesta es caro.
 *
 * El límite inferior es el horizonte de histórico del banco; el superior, hoy: pedir el
 * futuro no devuelve nada y habría gastado el acceso igual.
 */
function validateDateFrom(value) {
  const date = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Fecha no válida: "${value}". Debe ser aaaa-mm-dd.`)

  const oldest = isoDay(Date.now() - HISTORY_WINDOW_DAYS * DAY_MS)
  const today = isoDay(Date.now())
  if (date < oldest) {
    throw new Error(
      `El banco no da histórico anterior a ${oldest} (unos ${HISTORY_WINDOW_DAYS} días). ` +
        'Lo de antes solo está en el extracto.',
    )
  }
  if (date > today) throw new Error(`La fecha ${date} está en el futuro.`)
  return date
}

/** Las cuentas llegan como objetos o como uids sueltos según el banco y la versión. */
function accountUids(session) {
  return (session.accounts ?? [])
    .map((account) => (typeof account === 'string' ? account : account.uid ?? account.account_uid ?? account.id))
    .filter(Boolean)
}

export function createApiMiddleware(env) {
  const config = {
    applicationId: env.ENABLE_BANKING_APPLICATION_ID,
    // Las dos formas de dar la clave privada: el PEM entero en una variable (lo que
    // permite desplegar donde no haya ficheros secretos ni disco) o la ruta a su fichero,
    // más cómodo en local. Gana la variable. Ver `readPrivateKey` en enablebanking.mjs.
    privateKey: env.ENABLE_BANKING_PRIVATE_KEY,
    keyPath: env.ENABLE_BANKING_KEY_PATH,
    databaseUrl: env.DATABASE_URL,
    country: env.ENABLE_BANKING_COUNTRY || 'ES',
    redirectUrl: env.ENABLE_BANKING_REDIRECT_URL || 'https://localhost:5173/api/bank/callback',
  }

  const authEnv = authConfig(env)

  let schemaReady = null
  const withSchema = () => (schemaReady ??= ensureSchema(config.databaseUrl))

  /**
   * Pregunta a Enable Banking si el consentimiento sigue vivo, y aprovecha para refrescar
   * `validUntil` y las cuentas con lo que diga la API.
   *
   * Hace falta porque el consentimiento se puede **revocar desde la banca online del
   * banco**, y de eso no nos enteramos: `validUntil` seguiría en el futuro y la app diría
   * "conectado" hasta que una sincronización fallara. Fallar una sync es el peor momento
   * para descubrirlo, porque puede haber costado uno de los 4 accesos diarios.
   *
   * No se comprueba en cada petición, a propósito. `GET /sessions/{id}` lee el registro de
   * Enable Banking y no la cuenta del banco —está fuera de "Accounts data" en su
   * referencia—, pero su documentación no dice que no cuente para el límite de accesos, y
   * gastarlos a ciegas es caro: no se recuperan hasta el día siguiente. De ahí las dos
   * cautelas: solo con `?verify`, y como mucho una comprobación cada 6 horas, que en la
   * interpretación más pesimista son 4 al día y no más.
   *
   * `throttled` distingue "no se ha comprobado porque no lo has pedido" de "lo has pedido
   * pero el freno de 6 h lo ha evitado". Sin esa diferencia el botón de la tarjeta diría
   * "confirmado por el banco" sin haber hablado con el banco.
   *
   * @returns {Promise<{ revoked: boolean | null, error: string | null, session: object | null, throttled: boolean }>}
   */
  async function verifyConsent(session, requested) {
    const fresh = Boolean(session.verifiedAt) && Date.now() - Date.parse(session.verifiedAt) < VERIFY_EVERY_MS
    if (!requested || fresh) return { revoked: null, error: null, session: null, throttled: requested && fresh }

    try {
      const remote = await createClient(config).getSession(session.sessionId)
      const updated = {
        ...session,
        accounts: remote.accounts ?? session.accounts,
        validUntil: remote.access?.valid_until ?? session.validUntil,
        verifiedAt: new Date().toISOString(),
      }
      await writeSession(config.databaseUrl, updated)
      return { revoked: false, error: null, session: updated, throttled: false }
    } catch (error) {
      // Un consentimiento cerrado o desaparecido es una respuesta legítima, no una avería:
      // se distingue por el mensaje porque el cliente lanza el texto de la API.
      const revoked = /CLOSED_SESSION|SESSION_NOT_FOUND|→ 40[134]/.test(error.message)
      if (revoked) {
        const updated = { ...session, verifiedAt: new Date().toISOString() }
        await writeSession(config.databaseUrl, updated)
        return { revoked: true, error: error.message, session: updated, throttled: false }
      }
      // Un fallo de red no es una revocación: no se toca nada y se informa.
      return { revoked: null, error: error.message, session: null, throttled: false }
    }
  }

  const routes = {
    /**
     * Estado de la sesión. Es la única ruta que el navegador puede pedir sin estar
     * autenticado, y por eso también es la que dice si el servidor tiene credenciales
     * configuradas: sin eso la pantalla de acceso no podría explicar por qué falla todo.
     */
    'GET /api/auth/session': async (req) => {
      const ok = isAuthConfigured(authEnv) && isAuthenticated(authEnv, req)
      return { configured: isAuthConfigured(authEnv), authenticated: ok, username: ok ? authEnv.username : null }
    },

    'POST /api/auth/login': async (req, res) => {
      if (!isAuthConfigured(authEnv)) throw new HttpError(503, AUTH_NOT_CONFIGURED)

      const locked = lockoutRemaining(clientIp(req))
      if (locked > 0) {
        throw new HttpError(429, `Demasiados intentos fallidos. Espera ${Math.ceil(locked / 1000)} s.`)
      }

      const body = await readBody(req)
      if (!verifyCredentials(authEnv, body.username, body.password)) {
        recordFailedAttempt(req)
        // Un mensaje único para usuario mal puesto y contraseña mal puesta: decir cuál de
        // los dos ha fallado confirmaría el nombre de usuario a quien lo esté probando.
        throw new HttpError(401, 'Usuario o contraseña incorrectos.')
      }

      clearFailedAttempts(req)
      res.setHeader('Set-Cookie', sessionCookie(req, authEnv))
      return { authenticated: true, username: authEnv.username }
    },

    'POST /api/auth/logout': async (req, res) => {
      res.setHeader('Set-Cookie', expiredCookie(req))
      return { authenticated: false }
    },

    'GET /api/bank/status': async (_req, _res, url) => {
      // La sesión vive ahora en la base de datos, así que el esquema tiene que existir
      // antes de leerla: por eso `withSchema()` sube por encima del try que solo cubría
      // las estadísticas.
      let session = null
      let stats = null
      let dbError = null
      try {
        await withSchema()
        session = await readSession(config.databaseUrl)
        stats = await getStats(config.databaseUrl)
      } catch (error) {
        // La BDD puede estar aún sin configurar: el estado se muestra igual.
        schemaReady = null
        dbError = error.message
      }

      const check = session?.sessionId ? await verifyConsent(session, url.searchParams.has('verify')) : null
      if (check?.session) session = check.session

      return {
        // La clave puede llegar por variable de entorno o por fichero: basta una.
        configured: Boolean(config.applicationId && (config.privateKey || config.keyPath)),
        connected: Boolean(session?.sessionId) && check?.revoked !== true,
        aspsp: session?.aspsp ?? null,
        validUntil: session?.validUntil ?? null,
        // Días que quedan de consentimiento. Se calcula aquí y no en el cliente para que
        // el aviso de "caduca pronto" no dependa del reloj del navegador.
        expiresInDays: daysUntil(session?.validUntil),
        accounts: session?.accounts?.length ?? 0,
        connectedAt: session?.connectedAt ?? null,
        // Qué sabemos del consentimiento y desde cuándo. `revoked` solo es `true` si
        // Enable Banking lo ha dicho; `null` significa que no se ha comprobado.
        revoked: check?.revoked ?? null,
        verifiedAt: session?.verifiedAt ?? null,
        verifyError: check?.error ?? null,
        // Se pidió comprobar pero el freno de 6 h lo evitó: no se ha hablado con el banco.
        verifyThrottled: check?.throttled ?? false,
        db: stats,
        dbError,
      }
    },

    'GET /api/bank/aspsps': async (_req, _res, url) => {
      const country = url.searchParams.get('country') || config.country
      const data = await createClient(config).listAspsps(country)
      const aspsps = (data.aspsps ?? []).map((aspsp) => ({
        name: aspsp.name,
        country: aspsp.country,
        logo: aspsp.logo ?? null,
        maximumConsentValidity: aspsp.maximum_consent_validity ?? null,
      }))
      return { aspsps }
    },

    'POST /api/bank/connect': async (req) => {
      const body = await readBody(req)
      const aspspName = body.aspspName
      if (!aspspName) throw new Error('Falta el nombre del banco (aspspName).')

      const country = body.country || config.country
      const days = Number(body.days) || DEFAULT_CONSENT_DAYS
      const validUntil = new Date(Date.now() + days * DAY_MS).toISOString()
      const state = randomUUID()

      const auth = await createClient(config).startAuthorization({
        aspspName,
        country,
        redirectUrl: config.redirectUrl,
        state,
        validUntil,
      })
      // El state se guarda para comprobar que el redirect que vuelve es el nuestro.
      await withSchema()
      const previous = (await readSession(config.databaseUrl)) ?? {}
      await writeSession(config.databaseUrl, { ...previous, pending: { state, aspspName, country, validUntil } })
      return { url: auth.url ?? auth.redirect_url, state }
    },

    'GET /api/bank/callback': async (_req, res, url) => {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      await withSchema()
      const pending = (await readSession(config.databaseUrl))?.pending

      const fail = (reason) => {
        res.statusCode = 302
        res.setHeader('Location', `/?eb=error&reason=${encodeURIComponent(reason)}`)
        res.end()
      }
      if (!code) return fail(url.searchParams.get('error') || 'El banco no ha devuelto ningún code.')
      if (pending && state && pending.state !== state) return fail('El state del redirect no coincide.')

      const session = await createClient(config).createSession(code)
      await writeSession(config.databaseUrl, {
        sessionId: session.session_id ?? session.sessionId,
        accounts: session.accounts ?? [],
        aspsp: session.aspsp?.name ?? pending?.aspspName ?? null,
        country: session.aspsp?.country ?? pending?.country ?? config.country,
        validUntil: session.access?.valid_until ?? pending?.validUntil ?? null,
        connectedAt: new Date().toISOString(),
      })
      res.statusCode = 302
      res.setHeader('Location', '/?eb=ok')
      res.end()
      return undefined
    },

    'POST /api/bank/sync': async (req) => {
      await withSchema()
      const session = await readSession(config.databaseUrl)
      if (!session?.sessionId) throw new Error('No hay ninguna conexión bancaria activa. Conecta el banco primero.')

      const body = await readBody(req)
      await withSchema()

      const dateFrom = body.dateFrom ? validateDateFrom(body.dateFrom) : isoDay(Date.now() - HISTORY_WINDOW_DAYS * DAY_MS)

      const client = createClient(config)
      const uids = accountUids(session)
      if (uids.length === 0) throw new Error('La sesión no tiene cuentas autorizadas.')

      const mapped = []
      let skipped = 0
      for (const uid of uids) {
        const rawTransactions = await client.listTransactions({ accountUid: uid, dateFrom })
        for (const raw of rawTransactions) {
          const transaction = mapTransaction(raw, uid)
          if (transaction) mapped.push(transaction)
          else skipped += 1
        }
      }

      // Reemplazo del tramo, no upsert por id: el banco es autoritativo sobre los días
      // que cubre y sus referencias no son estables (ver server/dedupKey.mjs).
      //
      // El tramo arranca en el primer movimiento que ha devuelto el banco, no en
      // `dateFrom`: si su horizonte de histórico es más corto de lo que hemos pedido, no
      // queremos vaciar los días que no ha llegado a cubrir. Y si no ha devuelto nada, no
      // se borra nada: sería indistinguible de un fallo transitorio.
      const identified = assignContentIds(mapped, 'eb')
      const replaced =
        identified.length > 0
          ? await replaceBankRange(config.databaseUrl, {
              from: identified.reduce((min, t) => (t.date < min ? t.date : min), identified[0].date),
              to: isoDay(Date.now()),
              transactions: identified,
            })
          : { deleted: 0, inserted: 0 }

      const overlap = await deleteStatementOverlap(config.databaseUrl)

      return {
        fetched: identified.length,
        inserted: replaced.inserted,
        replaced: replaced.deleted,
        statementRemoved: overlap.removed,
        bankRange: overlap.from ? { from: overlap.from, to: overlap.to } : null,
        skipped,
        dateFrom,
        transactions: await listTransactions(config.databaseUrl),
      }
    },

    'POST /api/bank/disconnect': async () => {
      await withSchema()
      await clearSession(config.databaseUrl)
      return { connected: false }
    },

    'GET /api/transactions': async (_req, _res, url) => {
      await withSchema()
      const from = url.searchParams.get('from') ?? undefined
      return { transactions: await listTransactions(config.databaseUrl, { from }) }
    },

    /**
     * Movimientos de un extracto importado desde el navegador. Entran como
     * `source = 'statement'`, igual que los de `npm run db:import`, y se descarta lo que
     * solape con el tramo que ya cubre el banco.
     */
    'POST /api/transactions/import': async (req) => {
      await withSchema()
      const body = await readBody(req)
      const incoming = Array.isArray(body.transactions) ? body.transactions : []
      const valid = incoming.filter((t) => t?.id && t?.date && Number.isFinite(Number(t.amount)))
      if (valid.length === 0) throw new Error('No hay movimientos válidos que importar.')

      const { inserted } = await upsertTransactions(
        config.databaseUrl,
        valid.map((t) => ({
          id: t.id,
          date: String(t.date).slice(0, 10),
          merchant: t.merchant ?? t.description ?? '',
          description: t.description ?? t.merchant ?? '',
          amount: Number(t.amount),
          accountUid: null,
          raw: null,
        })),
        'statement',
      )
      const overlap = await deleteStatementOverlap(config.databaseUrl)
      return {
        inserted,
        statementRemoved: overlap.removed,
        transactions: await listTransactions(config.databaseUrl),
      }
    },

    /**
     * Estado del usuario completo. Se pide entero al arrancar: son pocos kilobytes y así
     * la app no tiene que encadenar peticiones antes de pintar.
     */
    'GET /api/state': async () => {
      await withSchema()
      return await readUserState(config.databaseUrl)
    },

    /**
     * Guarda el subconjunto que venga en el cuerpo. Cada campo es un reemplazo completo,
     * igual que los setters del cliente, que siempre entregan el valor entero.
     */
    'PUT /api/state': async (req) => {
      await withSchema()
      const body = await readBody(req)
      return { written: await writeUserState(config.databaseUrl, body) }
    },
  }

  return async function apiMiddleware(req, res, next) {
    if (!req.url?.startsWith('/api/')) return next()

    const url = new URL(req.url, 'http://localhost')
    const route = `${req.method} ${url.pathname}`
    const handler = routes[route]
    if (!handler) return json(res, 404, { error: `Ruta no encontrada: ${req.method} ${url.pathname}` })

    if (!PUBLIC_ROUTES.has(route)) {
      if (!isAuthConfigured(authEnv)) return json(res, 503, { error: AUTH_NOT_CONFIGURED })
      if (!isAuthenticated(authEnv, req)) {
        // El callback del banco es una navegación del navegador, no una llamada de la
        // app: un 401 con JSON crudo en pantalla no le dice nada al usuario. La cookie es
        // SameSite=Lax justamente para que este redirect llegue ya autenticado; si no lo
        // está, la sesión ha caducado durante el SCA.
        if (route === 'GET /api/bank/callback') {
          const reason = 'Tu sesión ha caducado. Entra otra vez y repite la autorización.'
          res.statusCode = 302
          res.setHeader('Location', `/?eb=error&reason=${encodeURIComponent(reason)}`)
          return res.end()
        }
        return json(res, 401, { error: 'No autenticado.' })
      }
    }

    try {
      const result = await handler(req, res, url)
      if (result !== undefined && !res.writableEnded) json(res, 200, result)
    } catch (error) {
      if (!res.writableEnded) json(res, error.status ?? 500, { error: error.message })
    }
  }
}
