/**
 * Persistencia en Postgres. La base de datos es la fuente de verdad de todo: los
 * movimientos y el estado del usuario (viajes, categorías, reclasificaciones manuales y
 * ajustes). En el navegador solo queda una caché de arranque.
 *
 * Se usa el driver `pg` estándar a propósito: valen igual el Postgres local de desarrollo
 * y un Neon en la nube, cambiando solo DATABASE_URL.
 *
 * Se guarda `raw` (la respuesta cruda del banco) para poder re-mapear movimientos ya
 * sincronizados si mejoramos el parseo de conceptos, sin volver a llamar a la API.
 */
import pg from 'pg'

let pool = null

/** Neon y cualquier Postgres gestionado exigen TLS; el local no lo tiene levantado. */
function sslFor(databaseUrl) {
  return /sslmode=require|neon\.tech/.test(databaseUrl) ? { rejectUnauthorized: false } : undefined
}

/**
 * Crea un pool contra `databaseUrl`. Lo usan también los scripts de `scripts/`, para que
 * todos se conecten exactamente igual: cualquier peculiaridad del destino se arregla aquí
 * una vez y no en cinco sitios.
 *
 * **Usa el endpoint directo de Neon, no el agrupado.** Neon ofrece dos cadenas y la que
 * enseña por defecto en el panel es la del host con `-pooler`, que es un PgBouncer en modo
 * transacción: reparte una conexión de servidor por transacción, así que el estado de
 * sesión —`search_path`, entre otros— no pertenece de verdad a tu conexión. Se ve medido:
 * con 60 consultas concurrentes por el pooler, `current_setting('search_path')` devuelve
 * dos valores distintos; por el endpoint directo, siempre el mismo. Y el daño no es
 * teórico: restaurar un volcado con `psql` deja un `search_path` vacío pegado a una
 * conexión del pooler —`pg_dump` emite `set_config('search_path','')`— y cualquier cliente
 * que la reutilice recibe `relation "bank_transactions" does not exist` contra una base de
 * datos que tiene la tabla y los datos.
 *
 * Un `set search_path` al conectar NO lo arregla, aunque lo parezca en una prueba tranquila:
 * por el pooler el `set` puede acabar en una conexión de servidor distinta de la que luego
 * sirve la consulta. El pooler está pensado para funciones serverless que abren y cierran
 * miles de conexiones efímeras; esto es un proceso largo con un pool de 4, justo el caso
 * del endpoint directo.
 */
export function createPool(databaseUrl, { max = 4 } = {}) {
  if (!databaseUrl) throw new Error('Falta DATABASE_URL (cadena de conexión de Postgres) en .env.local')
  if (/-pooler\./.test(databaseUrl)) {
    console.warn('AVISO: DATABASE_URL apunta al endpoint agrupado de Neon (el host con "-pooler").')
    console.warn('  Ahi el estado de sesion no es fiable y puede dar errores intermitentes de')
    console.warn('  "relation does not exist". Quita "-pooler" del host en .env.local.')
    console.warn('  Ver el comentario de createPool en server/db.mjs.')
  }

  return new pg.Pool({ connectionString: databaseUrl, ssl: sslFor(databaseUrl), max })
}

function getPool(databaseUrl) {
  pool ??= createPool(databaseUrl)
  return pool
}

const query = (databaseUrl, text, values) => getPool(databaseUrl).query(text, values)

export async function ensureSchema(databaseUrl) {
  await query(
    databaseUrl,
    `create table if not exists bank_transactions (
       id text primary key,
       date date not null,
       merchant text not null,
       description text not null,
       amount numeric(12, 2) not null,
       account_uid text,
       raw jsonb,
       synced_at timestamptz not null default now()
     )`,
  )
  await query(databaseUrl, 'create index if not exists bank_transactions_date_idx on bank_transactions (date desc)')
  // El origen ya no se deduce del prefijo del id: hace falta saberlo para resolver el
  // solape entre el extracto y el banco (el banco manda en el tramo que cubre).
  await query(databaseUrl, "alter table bank_transactions add column if not exists source text")
  await query(
    databaseUrl,
    "update bank_transactions set source = case when id like 'eb-%' then 'bank' else 'statement' end where source is null",
  )

  // --- Estado del usuario ---
  //
  // Vive aquí y no en localStorage porque es el único dato que NO se puede regenerar: los
  // movimientos se vuelven a bajar del banco o se reimportan del extracto, pero los viajes
  // y las recategorizaciones a mano no salen de ninguna parte. En localStorage estaban
  // además atados al origen del navegador, así que pasar el dev server de http a https los
  // dejó varados e invisibles.

  await query(
    databaseUrl,
    `create table if not exists app_state (
       key text primary key,
       value jsonb not null,
       updated_at timestamptz not null default now()
     )`,
  )

  await query(
    databaseUrl,
    `create table if not exists trips (
       id text primary key,
       name text not null,
       start_date date not null,
       end_date date not null,
       updated_at timestamptz not null default now()
     )`,
  )

  // Tabla aparte y NO una columna de bank_transactions: la sincronización reemplaza tramos
  // enteros (`replaceBankRange`), así que una columna se borraría en cada sync. Aquí las
  // reclasificaciones sobreviven a que el movimiento se reinserte.
  await query(
    databaseUrl,
    `create table if not exists transaction_categories (
       transaction_id text primary key,
       category_id text not null,
       updated_at timestamptz not null default now()
     )`,
  )
}

/**
 * Inserta los nuevos y refresca los que ya estaban (el banco puede cambiar el concepto o
 * el importe de un movimiento pendiente al consolidarlo).
 *
 * Va en una sola sentencia con arrays: un movimiento por round-trip haría la sync eterna.
 * `xmax = 0` distingue las filas realmente insertadas de las actualizadas por el upsert.
 *
 * @returns {Promise<{ inserted: number }>}
 */
export async function upsertTransactions(databaseUrl, transactions, source = 'bank') {
  return runUpsert((text, values) => query(databaseUrl, text, values), transactions, source)
}

/** El mismo upsert, sobre un cliente concreto, para poder ir dentro de una transacción. */
async function runUpsert(exec, transactions, source) {
  if (transactions.length === 0) return { inserted: 0 }

  const columns = [
    transactions.map((t) => t.id),
    transactions.map((t) => t.date),
    transactions.map((t) => t.merchant),
    transactions.map((t) => t.description),
    transactions.map((t) => t.amount),
    transactions.map((t) => t.accountUid ?? null),
    transactions.map((t) => JSON.stringify(t.raw ?? null)),
    transactions.map(() => source),
  ]

  const { rows } = await exec(
    `insert into bank_transactions (id, date, merchant, description, amount, account_uid, raw, source, synced_at)
     select * from unnest(
       $1::text[], $2::date[], $3::text[], $4::text[], $5::numeric[], $6::text[], $7::jsonb[], $8::text[]
     ) as t(id, date, merchant, description, amount, account_uid, raw, source), lateral (select now()) as s(synced_at)
     on conflict (id) do update set
       date = excluded.date,
       merchant = excluded.merchant,
       description = excluded.description,
       amount = excluded.amount,
       raw = coalesce(excluded.raw, bank_transactions.raw),
       source = excluded.source,
       synced_at = now()
     returning (xmax = 0) as inserted`,
    columns,
  )

  return { inserted: rows.filter((row) => row.inserted).length }
}

/**
 * Reemplaza los movimientos de banco de un tramo de fechas por los que acaba de mandar
 * el banco. Es la operación clave de la sincronización, y sustituye al upsert por id.
 *
 * El motivo: los ids del banco no son estables (ver `server/dedupKey.mjs`) y un pendiente
 * cambia de concepto, de importe y hasta de fecha al consolidarse. Emparejar movimiento a
 * movimiento no puede funcionar. Lo que sí es cierto es que **el banco es autoritativo
 * sobre un día completo**: si dice que el 20 de agosto tuvo estos cinco movimientos, son
 * esos cinco y no otros. Borrar el tramo y reinsertar es por tanto idempotente de verdad.
 *
 * Va en una transacción para que un fallo a mitad no deje el tramo vacío.
 *
 * @returns {Promise<{ deleted: number, inserted: number }>}
 */
export async function replaceBankRange(databaseUrl, { from, to, transactions }) {
  const client = await getPool(databaseUrl).connect()
  try {
    await client.query('begin')
    const { rowCount } = await client.query(
      "delete from bank_transactions where source = 'bank' and date >= $1 and date <= $2",
      [from, to],
    )
    const { inserted } = await runUpsert((text, values) => client.query(text, values), transactions, 'bank')
    await client.query('commit')
    return { deleted: rowCount ?? 0, inserted }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * Borra los movimientos de extracto que caen dentro del tramo que ya cubre el banco.
 *
 * El extracto .xls y la API del banco traen los mismos movimientos escritos distinto
 * ("Pago Movil En Moeve" vs "PAGO MOVIL EN MOEVE"), así que emparejarlos por texto es
 * frágil. En el tramo donde hay datos del banco no hace falta: el banco manda, y el
 * extracto solo sirve para el histórico anterior, que la API ya no devuelve (el Santander
 * corta alrededor de los 90 días).
 *
 * @returns {Promise<{ removed: number, from: string | null, to: string | null }>}
 */
export async function deleteStatementOverlap(databaseUrl) {
  const { rows } = await query(
    databaseUrl,
    "select min(date) as lo, max(date) as hi from bank_transactions where source = 'bank'",
  )
  const { lo, hi } = rows[0] ?? {}
  if (!lo || !hi) return { removed: 0, from: null, to: null }

  const { rowCount } = await query(
    databaseUrl,
    "delete from bank_transactions where source = 'statement' and date >= $1 and date <= $2",
    [lo, hi],
  )
  return { removed: rowCount ?? 0, from: toIsoDate(new Date(lo)), to: toIsoDate(new Date(hi)) }
}

/**
 * Borra los movimientos que provienen de un extracto importado a mano. No toca los que
 * trae el banco: esos son la fuente de verdad y no se pueden regenerar desde un fichero.
 *
 * @returns {Promise<number>} filas borradas.
 */
export async function deleteStatementTransactions(databaseUrl) {
  const { rowCount } = await query(
    databaseUrl,
    "delete from bank_transactions where source = 'statement' or (source is null and id not like 'eb-%')",
  )
  return rowCount ?? 0
}

/** Movimientos en el formato `Transaction` que espera la app. */
export async function listTransactions(databaseUrl, { from } = {}) {
  const { rows } = from
    ? await query(
        databaseUrl,
        'select id, date, merchant, description, amount from bank_transactions where date >= $1 order by date desc',
        [from],
      )
    : await query(
        databaseUrl,
        'select id, date, merchant, description, amount from bank_transactions order by date desc',
      )

  return rows.map((row) => ({
    id: row.id,
    // `date` llega como Date en hora local: se formatea a mano para no restar un día.
    date: row.date instanceof Date ? toIsoDate(row.date) : String(row.date).slice(0, 10),
    merchant: row.merchant,
    description: row.description,
    amount: Number(row.amount),
  }))
}

function toIsoDate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export async function getStats(databaseUrl) {
  const { rows } = await query(
    databaseUrl,
    `select count(*)::int as count, max(date) as last_date, max(synced_at) as last_sync from bank_transactions`,
  )
  const row = rows[0] ?? {}
  return {
    count: row.count ?? 0,
    lastDate: row.last_date ? toIsoDate(new Date(row.last_date)) : null,
    lastSync: row.last_sync ? new Date(row.last_sync).toISOString() : null,
  }
}

/**
 * Todo el estado del usuario de una vez. La app lo pide entero al arrancar: son pocos
 * kilobytes y evita una cascada de peticiones antes de poder pintar nada.
 *
 * Las claves ausentes salen como `null` para que el cliente aplique su valor por defecto:
 * así distinguimos "el usuario no lo ha configurado nunca" de "lo ha puesto vacío".
 *
 * @returns {Promise<{ trips, manualCategories, categories, monthlyGoal, relevantThreshold, systemPrompt }>}
 */
export async function readUserState(databaseUrl) {
  const [state, trips, manual] = await Promise.all([
    query(databaseUrl, 'select key, value from app_state'),
    query(databaseUrl, 'select id, name, start_date, end_date from trips order by start_date'),
    query(databaseUrl, 'select transaction_id, category_id from transaction_categories'),
  ])

  const byKey = new Map(state.rows.map((row) => [row.key, row.value]))
  const asDate = (value) => (value instanceof Date ? toIsoDate(value) : String(value).slice(0, 10))

  return {
    trips: trips.rows.map((row) => ({
      id: row.id,
      name: row.name,
      start: asDate(row.start_date),
      end: asDate(row.end_date),
    })),
    manualCategories: Object.fromEntries(manual.rows.map((row) => [row.transaction_id, row.category_id])),
    categories: byKey.get('categories') ?? null,
    monthlyGoal: byKey.get('monthlyGoal') ?? null,
    relevantThreshold: byKey.get('relevantThreshold') ?? null,
    systemPrompt: byKey.get('systemPrompt') ?? null,
  }
}

/**
 * Sesión del consentimiento de Enable Banking. Vive en `app_state` y **no** en un fichero
 * porque el sistema de ficheros de un servicio desplegado es efímero: en Render solo
 * persiste con un disco, y los discos exigen plan pagado. Aquí sobrevive a los
 * despliegues y a que el servicio se duerma.
 *
 * No es una credencial: guarda el `sessionId` —una referencia al consentimiento que
 * custodia Enable Banking—, los uids de cuenta y las fechas. Toda petición al banco se
 * autentica firmando un JWT con la clave privada RSA, que nunca sale del entorno del
 * proceso. Sin esa clave el `sessionId` no abre nada, así que esto son datos, que es lo
 * que va en la base de datos.
 *
 * Deliberadamente fuera de `STATE_KEYS`: `PUT /api/state` no debe poder tocarla.
 */
const BANK_SESSION_KEY = 'bankSession'

export async function readBankSession(databaseUrl) {
  const { rows } = await query(databaseUrl, 'select value from app_state where key = $1', [BANK_SESSION_KEY])
  return rows[0]?.value ?? null
}

export async function writeBankSession(databaseUrl, session) {
  await query(
    databaseUrl,
    `insert into app_state (key, value, updated_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [BANK_SESSION_KEY, JSON.stringify(session)],
  )
}

export async function clearBankSession(databaseUrl) {
  await query(databaseUrl, 'delete from app_state where key = $1', [BANK_SESSION_KEY])
}

/** Claves de `app_state` que la app puede escribir. Lista blanca: el resto se ignora. */
const STATE_KEYS = ['categories', 'monthlyGoal', 'relevantThreshold', 'systemPrompt']

/**
 * Guarda el subconjunto del estado que venga en `patch`. Cada campo es un reemplazo
 * completo, igual que en el cliente: los setters de la app entregan siempre el valor
 * entero, no un delta.
 *
 * Todo en una transacción: `trips` y `transaction_categories` se vacían y reescriben, y
 * un fallo a mitad dejaría al usuario sin viajes.
 *
 * @returns {Promise<string[]>} campos escritos.
 */
export async function writeUserState(databaseUrl, patch) {
  const client = await getPool(databaseUrl).connect()
  const written = []
  try {
    await client.query('begin')

    for (const key of STATE_KEYS) {
      if (patch[key] === undefined) continue
      await client.query(
        `insert into app_state (key, value, updated_at) values ($1, $2::jsonb, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [key, JSON.stringify(patch[key])],
      )
      written.push(key)
    }

    if (Array.isArray(patch.trips)) {
      await client.query('delete from trips')
      for (const trip of patch.trips) {
        await client.query(
          'insert into trips (id, name, start_date, end_date, updated_at) values ($1, $2, $3, $4, now())',
          [trip.id, trip.name, trip.start, trip.end],
        )
      }
      written.push('trips')
    }

    if (patch.manualCategories && typeof patch.manualCategories === 'object') {
      await client.query('delete from transaction_categories')
      const entries = Object.entries(patch.manualCategories).filter(([, categoryId]) => categoryId)
      if (entries.length > 0) {
        await client.query(
          `insert into transaction_categories (transaction_id, category_id, updated_at)
           select * from unnest($1::text[], $2::text[]), lateral (select now()) as s(updated_at)`,
          [entries.map(([id]) => id), entries.map(([, categoryId]) => categoryId)],
        )
      }
      written.push('manualCategories')
    }

    await client.query('commit')
    return written
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
