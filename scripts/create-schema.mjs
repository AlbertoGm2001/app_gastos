/**
 * Crea (o pone al día) la estructura de la base de datos que apunte DATABASE_URL.
 *
 *   npm run db:schema                      # usa DATABASE_URL de .env.local
 *   npm run db:schema -- "postgres://..."  # o una cadena concreta, p.ej. la de Neon
 *
 * No hace nada que la app no haga sola: `ensureSchema()` corre igualmente en la primera
 * petición a la API (`server/api.mjs`). Existe para poder preparar una base de datos nueva
 * —el Neon desplegado— sin arrancar el dev server contra ella, y para ver impreso qué
 * tablas han quedado en vez de suponerlo.
 *
 * Es idempotente: son todos `create table if not exists` / `add column if not exists`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool, ensureSchema } from '../server/db.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (match) process.env[match[1]] ??= match[2].trim()
  }
}

loadEnvLocal()
const databaseUrl = process.argv[2] || process.env.DATABASE_URL
if (!databaseUrl) throw new Error('Falta DATABASE_URL: pásala como argumento o ponla en .env.local')

// La cadena lleva la contraseña: se enseña solo el destino, que es lo que hay que confirmar.
const target = databaseUrl.replace(/\/\/[^@]*@/, '//***@')
console.log(`Creando esquema en ${target}`)

await ensureSchema(databaseUrl)

const pool = createPool(databaseUrl)
try {
  const { rows } = await pool.query(
    `select c.relname as table,
            (select count(*) from pg_attribute a
              where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`,
  )
  for (const row of rows) console.log(`  ${row.table} (${row.columns} columnas)`)
  console.log('Listo.')
} finally {
  await pool.end()
}
