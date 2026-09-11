/**
 * Migración única a la deduplicación por contenido.
 *
 *   node scripts/migrate-dedup.mjs [--dry-run]
 *
 * Arregla los datos que dejó la deduplicación anterior, que emparejaba solo por la clave
 * primaria y confiaba en que el `entry_reference` del banco era estable:
 *
 *  1. rellena `source` ('bank' / 'statement'), que antes se deducía del prefijo del id;
 *  2. reescribe los ids del banco a la forma de contenido (ver `server/dedupKey.mjs`),
 *     porque los antiguos eran `eb-<fecha>.<índice-del-día>`, posicionales;
 *  3. reescribe los ids del extracto, que eran `stmt-NNNN` posicionales en el fichero;
 *  4. colapsa los movimientos que quedasen repetidos dentro de una misma fuente;
 *  5. borra los movimientos de extracto que caen en el tramo que cubre el banco, que es
 *     la duplicación que se veía en la app: el mismo movimiento por las dos vías.
 *
 * Es idempotente: volver a ejecutarla no cambia nada.
 *
 * OJO con las reclasificaciones manuales: viven en localStorage indexadas por id, y esta
 * migración cambia ids. `mergeTransactions()` las rearrastra por contenido al arrancar la
 * app, así que no se pierden, pero hace falta abrir la app una vez para que lo haga.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { contentId, contentKey } from '../server/dedupKey.mjs'
import { createPool, ensureSchema } from '../server/db.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY_RUN = process.argv.includes('--dry-run')

function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) throw new Error('No existe .env.local. Cópialo de .env.local.example y rellénalo.')
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (match) process.env[match[1]] ??= match[2].trim()
  }
}

const pad = (n) => String(n).padStart(2, '0')
const toIsoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

loadEnvLocal()
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('Falta DATABASE_URL en .env.local')

await ensureSchema(databaseUrl)

const pool = createPool(databaseUrl)
const client = await pool.connect()

try {
  await client.query('begin')

  const { rows } = await client.query(
    'select id, date, description, amount, source from bank_transactions order by date, id',
  )
  const before = rows.length

  // `ensureSchema` ya ha rellenado `source`; esto solo cubre filas insertadas entre medias.
  const withSource = rows.map((row) => ({
    ...row,
    date: row.date instanceof Date ? toIsoDate(row.date) : String(row.date).slice(0, 10),
    amount: Number(row.amount),
    source: row.source ?? (row.id.startsWith('eb-') ? 'bank' : 'statement'),
  }))

  // Id nuevo para cada fila, contando ocurrencias por (fuente, clave de contenido): dos
  // movimientos idénticos el mismo día son dos gastos reales y tienen que sobrevivir los dos.
  const seen = new Map()
  const planned = []
  const collapsed = []
  const takenIds = new Set()

  for (const row of withSource) {
    const key = `${row.source}|${contentKey(row)}`
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)
    const newId = contentId(row.source === 'bank' ? 'eb' : 'stmt', row, occurrence)

    // Si dos filas antiguas colapsan en el mismo id nuevo eran duplicados de verdad
    // dentro de la misma fuente: se queda una.
    if (takenIds.has(newId)) collapsed.push(row)
    else {
      takenIds.add(newId)
      planned.push({ ...row, newId })
    }
  }

  const renamed = planned.filter((row) => row.newId !== row.id)

  if (!DRY_RUN) {
    for (const row of collapsed) {
      await client.query('delete from bank_transactions where id = $1', [row.id])
    }
    // Dos pasadas con un id temporal: renombrar directo puede chocar con una fila que
    // todavía no se ha renombrado.
    for (const row of renamed) {
      await client.query('update bank_transactions set id = $1, source = $2 where id = $3', [
        `migrating-${row.newId}`,
        row.source,
        row.id,
      ])
    }
    for (const row of renamed) {
      await client.query('update bank_transactions set id = $1 where id = $2', [
        row.newId,
        `migrating-${row.newId}`,
      ])
    }
    await client.query('update bank_transactions set source = $1 where id like $2 and source is distinct from $1', [
      'bank',
      'eb-%',
    ])
  }

  // El solape entre fuentes: en el tramo que cubre el banco, el banco manda.
  const { rows: rangeRows } = await client.query(
    "select min(date) as lo, max(date) as hi from bank_transactions where source = 'bank'",
  )
  const { lo, hi } = rangeRows[0] ?? {}
  let overlapRemoved = 0
  if (lo && hi) {
    const result = DRY_RUN
      ? await client.query(
          "select count(*)::int as n from bank_transactions where source = 'statement' and date >= $1 and date <= $2",
          [lo, hi],
        )
      : await client.query(
          "delete from bank_transactions where source = 'statement' and date >= $1 and date <= $2",
          [lo, hi],
        )
    overlapRemoved = DRY_RUN ? result.rows[0].n : (result.rowCount ?? 0)
  }

  const { rows: afterRows } = await client.query(
    "select count(*)::int as total, count(*) filter (where source = 'bank')::int as bank," +
      " count(*) filter (where source = 'statement')::int as statement, min(date) as lo, max(date) as hi" +
      ' from bank_transactions',
  )
  const after = afterRows[0]

  if (DRY_RUN) await client.query('rollback')
  else await client.query('commit')

  console.log(DRY_RUN ? '— simulación, no se ha escrito nada —' : '— migración aplicada —')
  console.log(`ids reescritos:          ${renamed.length}`)
  console.log(`duplicados internos:     ${collapsed.length} colapsados`)
  console.log(
    `solape con el banco:     ${overlapRemoved} movimientos de extracto ${DRY_RUN ? 'a borrar' : 'borrados'}` +
      (lo && hi ? ` (${toIsoDate(new Date(lo))} .. ${toIsoDate(new Date(hi))})` : ''),
  )
  // En simulación no se ha borrado nada, así que el total hay que proyectarlo.
  const projected = DRY_RUN ? after.total - overlapRemoved - collapsed.length : after.total
  console.log(
    `total: ${before} → ${projected} (${after.bank} de banco, ${after.statement - (DRY_RUN ? overlapRemoved : 0)} de extracto)` +
      (after.lo ? `, ${toIsoDate(new Date(after.lo))} .. ${toIsoDate(new Date(after.hi))}` : ''),
  )
} catch (error) {
  await client.query('rollback').catch(() => {})
  throw error
} finally {
  client.release()
  await pool.end()
}
