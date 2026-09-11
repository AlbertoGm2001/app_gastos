/**
 * Inserta viajes en la base de datos desde un JSON.
 *
 *   node scripts/seed-trips.mjs viajes.json
 *   echo '[{"id":"trip-0","name":"Bali","start":"2026-07-02","end":"2026-07-14"}]' | node scripts/seed-trips.mjs
 *
 * Se escribió para recuperar los viajes que quedaron varados en el localStorage del origen
 * `http://localhost:5173` cuando el dev server pasó a HTTPS (ver la sección de HTTPS en
 * CLAUDE.md). Sirve igual para restaurar un respaldo.
 *
 * Es un upsert por id: no borra los viajes que ya haya.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool, ensureSchema } from '../server/db.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) throw new Error('No existe .env.local. Cópialo de .env.local.example y rellénalo.')
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (match) process.env[match[1]] ??= match[2].trim()
  }
}

async function readInput() {
  const arg = process.argv[2]
  if (arg) return fs.readFileSync(path.resolve(arg), 'utf8')
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

loadEnvLocal()
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('Falta DATABASE_URL en .env.local')

const trips = JSON.parse(await readInput())
if (!Array.isArray(trips)) throw new Error('Se esperaba un array de viajes.')

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
for (const trip of trips) {
  if (!trip.id || !trip.name || !ISO_DATE.test(trip.start) || !ISO_DATE.test(trip.end)) {
    throw new Error(`Viaje inválido: ${JSON.stringify(trip)}`)
  }
  if (trip.end < trip.start) throw new Error(`El viaje "${trip.name}" acaba antes de empezar.`)
}

await ensureSchema(databaseUrl)
const pool = createPool(databaseUrl)

try {
  for (const trip of trips) {
    await pool.query(
      `insert into trips (id, name, start_date, end_date, updated_at) values ($1, $2, $3, $4, now())
       on conflict (id) do update set
         name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date, updated_at = now()`,
      [trip.id, trip.name, trip.start, trip.end],
    )
  }
  const { rows } = await pool.query('select id, name, start_date, end_date from trips order by start_date')
  console.log(`${trips.length} viajes insertados. En la base de datos hay ${rows.length}:`)
  // `date` llega como Date en hora local: se formatea por componentes, no con
  // toISOString(), que pasa a UTC y en España resta un día.
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) =>
    d instanceof Date
      ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      : String(d).slice(0, 10)
  for (const row of rows) {
    console.log(`  ${row.name.padEnd(20)} ${iso(row.start_date)} .. ${iso(row.end_date)}`)
  }
} finally {
  await pool.end()
}
