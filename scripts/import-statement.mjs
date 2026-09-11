/**
 * Importa un extracto .xls/.xlsx/.csv del Santander a la base de datos.
 *
 *   node scripts/import-statement.mjs [ruta-al-extracto]
 *
 * Sin argumento usa el extracto más reciente que encuentre en la raíz del proyecto.
 *
 * Sustituye a los antiguos generate-transactions.mjs + seed-db.mjs: ya no se genera
 * ningún fichero de datos dentro de src/, porque la base de datos es la fuente de verdad
 * y el extracto lleva importes y nombres de terceros que no deben acabar en el repo.
 *
 * Es un reemplazo, no una suma: borra los movimientos que vengan de extracto y vuelve a
 * insertarlos. Los que trae el banco por Enable Banking no se tocan.
 *
 * Tras importar se borra lo que caiga en el tramo que ya cubre el banco: ahí manda el
 * banco, y el extracto solo aporta el histórico anterior (la API del Santander corta
 * alrededor de los 90 días, así que los meses viejos solo existen en el extracto).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import {
  deleteStatementOverlap,
  deleteStatementTransactions,
  ensureSchema,
  getStats,
  upsertTransactions,
} from '../server/db.mjs'
import { assignContentIds } from '../server/dedupKey.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Lee DATABASE_URL de .env.local: el script se lanza a mano, sin el dev server de Vite. */
function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) throw new Error('No existe .env.local. Cópialo de .env.local.example y rellénalo.')
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (match) process.env[match[1]] ??= match[2].trim()
  }
}

function findLatestStatement() {
  const candidates = fs
    .readdirSync(ROOT)
    .filter((f) => /^transactions.*\.(xls|xlsx|csv)$/i.test(f))
    .map((f) => ({ f, mtime: fs.statSync(path.join(ROOT, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (candidates.length === 0) {
    throw new Error('No se ha encontrado ningún fichero transactions*.xls|xlsx|csv en la raíz del proyecto.')
  }
  return path.join(ROOT, candidates[0].f)
}

const pad = (n) => String(n).padStart(2, '0')

function parseDate(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`
  }
  const s = String(raw ?? '').trim()
  const eu = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (eu) {
    const year = eu[3].length === 2 ? `20${eu[3]}` : eu[3]
    return `${year}-${eu[2].padStart(2, '0')}-${eu[1].padStart(2, '0')}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null
}

function parseAmount(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw ?? '')
    .trim()
    .replace(/[€\s]/g, '')
  if (!s) return null
  // Formato español: el último separador con dos decimales es la coma decimal.
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number.parseFloat(s)
  return Number.isNaN(n) ? null : n
}

const normalize = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const DATE_HEADERS = ['fecha operacion', 'fecha', 'f. operacion', 'fecha valor']
const DESC_HEADERS = ['concepto', 'descripcion', 'detalle']
const AMOUNT_HEADERS = ['importe eur', 'importe', 'importe euros']

function findHeader(rows) {
  const match = (row, cands) => row.findIndex((c) => cands.some((k) => c === k || c.includes(k)))
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    // sheet_to_json devuelve arrays dispersos: Array.from rellena los huecos con undefined reales.
    const row = Array.from(rows[i] ?? [], normalize)
    const dateCol = match(row, DATE_HEADERS)
    const descCol = match(row, DESC_HEADERS)
    const amountCol = match(row, AMOUNT_HEADERS)
    if (dateCol !== -1 && descCol !== -1 && amountCol !== -1) return { i, dateCol, descCol, amountCol }
  }
  throw new Error('No se han encontrado las columnas de fecha, concepto e importe en el extracto.')
}

loadEnvLocal()
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('Falta DATABASE_URL en .env.local')

const source = process.argv[2] ? path.resolve(process.argv[2]) : findLatestStatement()
const workbook = XLSX.read(fs.readFileSync(source), { type: 'buffer', cellDates: true })
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
  header: 1,
  raw: true,
  blankrows: false,
})
const header = findHeader(rows)

const transactions = []
let skipped = 0
for (let i = header.i + 1; i < rows.length; i += 1) {
  const row = rows[i]
  if (!row || row.length === 0) continue
  const date = parseDate(row[header.dateCol])
  const amount = parseAmount(row[header.amountCol])
  const description = String(row[header.descCol] ?? '').trim()
  if (!date || amount === null || !description) {
    skipped += 1
    continue
  }
  transactions.push({
    date,
    // El extracto solo trae una columna de texto: merchant y description son lo mismo.
    merchant: description,
    description,
    amount,
    accountUid: null,
    raw: null,
  })
}

transactions.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
// El id sale del contenido, no de la posición en el fichero: reimportar el mismo extracto
// da los mismos ids, y así una reclasificación manual sobrevive a la reimportación.
const identified = assignContentIds(transactions, 'stmt')

await ensureSchema(databaseUrl)
const removed = await deleteStatementTransactions(databaseUrl)
const { inserted } = await upsertTransactions(databaseUrl, identified, 'statement')
const overlap = await deleteStatementOverlap(databaseUrl)
const stats = await getStats(databaseUrl)

console.log(`extracto: ${path.basename(source)}`)
console.log(`${identified.length} movimientos importados (${skipped} filas ignoradas), ${removed} reemplazados`)
if (overlap.removed > 0) {
  console.log(`${overlap.removed} descartados por solapar con el banco (${overlap.from} .. ${overlap.to})`)
}
console.log(`total en la base de datos: ${stats.count} (${inserted} filas nuevas, último: ${stats.lastDate})`)
process.exit(0)
