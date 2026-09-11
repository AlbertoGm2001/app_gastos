/**
 * Restaura reclasificaciones manuales en la base de datos, emparejando por contenido.
 *
 *   node scripts/import-manual-categories.mjs reclasificaciones.json [--apply]
 *
 * Sin `--apply` solo informa: qué empareja, qué no y a qué categoría iría cada cosa.
 * Las reclasificaciones que ya existan no se pisan salvo con `--overwrite`: son la elección
 * más reciente del usuario y este script restaura material antiguo.
 *
 * Formato de entrada: un array de
 *   { "date": "2026-08-20", "amount": -12.45, "description": "...", "category": "..." }
 *
 * `category` puede ser un id (`cat-3`, `trip:trip-0`, `uncategorized`) o el **nombre** de
 * una categoría, que se resuelve contra las categorías que hay ahora en `app_state`.
 * Conviene usar el nombre: los ids de categoría no son estables entre versiones de la app
 * —`cat-5` significó "Compras" y hoy es "Suscripciones"— y copiarlos a ciegas manda los
 * movimientos a categorías equivocadas.
 *
 * El emparejamiento es por contenido (fecha + importe + concepto normalizado + ocurrencia),
 * no por id: los ids de movimiento cambiaron al pasar a la deduplicación por contenido, y
 * los de la app vieja (`tx-0000`) ya no existen. Ver `server/dedupKey.mjs`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool, ensureSchema, readUserState } from '../server/db.mjs'
import { contentKey } from '../server/dedupKey.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPLY = process.argv.includes('--apply')
/** Pisar reclasificaciones que ya existan. Por defecto se respetan: son más recientes. */
const OVERWRITE = process.argv.includes('--overwrite')

function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) throw new Error('No existe .env.local. Cópialo de .env.local.example y rellénalo.')
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (match) process.env[match[1]] ??= match[2].trim()
  }
}

const pad = (n) => String(n).padStart(2, '0')
const isoDate = (value) =>
  value instanceof Date ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` : String(value).slice(0, 10)

loadEnvLocal()
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('Falta DATABASE_URL en .env.local')

const inputPath = process.argv[2]
if (!inputPath || inputPath.startsWith('--')) throw new Error('Uso: node scripts/import-manual-categories.mjs <fichero.json> [--apply]')
const entries = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
if (!Array.isArray(entries)) throw new Error('Se esperaba un array.')

await ensureSchema(databaseUrl)
const pool = createPool(databaseUrl)

try {
  const state = await readUserState(databaseUrl)
  const categories = state.categories ?? []
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
  const validIds = new Set([...categories.map((c) => c.id), 'uncategorized', ...state.trips.map((t) => `trip:${t.id}`)])

  /** Resuelve `category` a un id válido, o null si no se puede. */
  function resolveCategory(value) {
    const raw = String(value ?? '').trim()
    if (!raw) return null
    if (validIds.has(raw)) return raw
    return byName.get(raw.toLowerCase()) ?? null
  }

  // Movimientos actuales agrupados por clave de contenido, para emparejar por ocurrencia.
  const { rows } = await pool.query('select id, date, amount, description from bank_transactions')
  const groups = new Map()
  for (const row of rows) {
    const key = contentKey({ date: isoDate(row.date), amount: Number(row.amount), description: row.description })
    const group = groups.get(key)
    if (group) group.push(row.id)
    else groups.set(key, [row.id])
  }

  // Lo que ya hay. Por defecto NO se pisa: una reclasificación existente es la elección más
  // reciente del usuario, y este script restaura material antiguo.
  const existing = new Map(
    (await pool.query('select transaction_id, category_id from transaction_categories')).rows.map((r) => [
      r.transaction_id,
      r.category_id,
    ]),
  )

  const used = new Map()
  const resolved = []
  const noCategory = []
  const noTransaction = []
  const conflicts = []

  for (const entry of entries) {
    const categoryId = resolveCategory(entry.category)
    if (!categoryId) {
      noCategory.push(entry)
      continue
    }
    const key = contentKey({
      date: String(entry.date).slice(0, 10),
      amount: Number(entry.amount),
      description: entry.description ?? '',
    })
    const candidates = groups.get(key) ?? []
    const occurrence = used.get(key) ?? 0
    const transactionId = candidates[occurrence]
    if (!transactionId) {
      noTransaction.push(entry)
      continue
    }
    used.set(key, occurrence + 1)

    const current = existing.get(transactionId)
    if (current !== undefined && current !== categoryId) {
      conflicts.push({ transactionId, current, incoming: categoryId, entry })
      if (!OVERWRITE) continue
    }
    resolved.push({ transactionId, categoryId, entry })
  }

  if (APPLY && resolved.length > 0) {
    await pool.query(
      `insert into transaction_categories (transaction_id, category_id, updated_at)
       select * from unnest($1::text[], $2::text[]), lateral (select now()) as s(updated_at)
       on conflict (transaction_id) do update set category_id = excluded.category_id, updated_at = now()`,
      [resolved.map((r) => r.transactionId), resolved.map((r) => r.categoryId)],
    )
  }

  const nameOf = (id) =>
    id === 'uncategorized'
      ? 'Sin categoría'
      : id.startsWith('trip:')
        ? `Viaje: ${state.trips.find((t) => `trip:${t.id}` === id)?.name ?? id}`
        : (categories.find((c) => c.id === id)?.name ?? id)

  console.log(APPLY ? '— aplicado —' : '— simulación, usa --apply para escribir —')
  console.log(`entradas:            ${entries.length}`)
  console.log(`emparejadas:         ${resolved.length}`)
  console.log(`sin categoría válida: ${noCategory.length}`)
  console.log(`sin movimiento:      ${noTransaction.length}`)
  if (conflicts.length > 0) {
    console.log(
      `en conflicto:        ${conflicts.length} ${OVERWRITE ? '(pisadas por --overwrite)' : '(respetadas, usa --overwrite para pisarlas)'}`,
    )
  }

  const byCategory = new Map()
  for (const r of resolved) byCategory.set(r.categoryId, (byCategory.get(r.categoryId) ?? 0) + 1)
  console.log('\nreparto:')
  for (const [id, count] of [...byCategory].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)}  ${nameOf(id)}`)
  }

  if (conflicts.length > 0) {
    console.log(`\n${OVERWRITE ? 'pisadas' : 'respetadas'} (ya tenían otra categoría):`)
    for (const c of conflicts.slice(0, 12)) {
      console.log(
        `  ${String(c.entry.description ?? '').slice(0, 40).padEnd(42)} ${nameOf(c.current).padEnd(22)} ${OVERWRITE ? '->' : '<-'} ${nameOf(c.incoming)}`,
      )
    }
    if (conflicts.length > 12) console.log(`  … y ${conflicts.length - 12} más`)
  }

  for (const [label, list] of [
    ['sin categoría válida', noCategory],
    ['sin movimiento en la base de datos', noTransaction],
  ]) {
    if (list.length === 0) continue
    console.log(`\n${label}:`)
    for (const entry of list.slice(0, 12)) {
      console.log(`  ${entry.date}  ${String(entry.amount).padStart(9)}  ${String(entry.category).padEnd(18)} ${String(entry.description ?? '').slice(0, 45)}`)
    }
    if (list.length > 12) console.log(`  … y ${list.length - 12} más`)
  }

  const total = await pool.query('select count(*)::int as n from transaction_categories')
  console.log(`\nreclasificaciones en la base de datos: ${total.rows[0].n}`)
} finally {
  await pool.end()
}
