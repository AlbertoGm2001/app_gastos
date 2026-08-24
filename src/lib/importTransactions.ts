import * as XLSX from 'xlsx'
import type { Transaction } from '../types'

export interface ParsedImport {
  fileName: string
  transactions: Transaction[]
  skippedRows: number
  headerRowPreview: string[]
}

export class ImportError extends Error {}

const DATE_HEADERS = ['fecha', 'fecha operacion', 'f. operacion', 'fecha valor']
const DESC_HEADERS = ['concepto', 'descripcion', 'detalle', 'observaciones']
const AMOUNT_HEADERS = ['importe', 'importe eur', 'importe (eur)', 'cargo/abono', 'importe euros']

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function matchColumn(headerRow: string[], candidates: string[]): number {
  return headerRow.findIndex((cell) => candidates.some((c) => cell === c || cell.includes(c)))
}

function findHeader(rows: unknown[][]) {
  const scanLimit = Math.min(rows.length, 30)
  for (let i = 0; i < scanLimit; i += 1) {
    const row = (rows[i] ?? []).map(normalize)
    const dateCol = matchColumn(row, DATE_HEADERS)
    const descCol = matchColumn(row, DESC_HEADERS)
    const amountCol = matchColumn(row, AMOUNT_HEADERS)
    if (dateCol !== -1 && descCol !== -1 && amountCol !== -1) {
      return { rowIndex: i, dateCol, descCol, amountCol }
    }
  }
  return null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function parseDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`
  }
  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw)
    if (!parsed) return null
    return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`
  }
  const s = String(raw ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const eu = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (eu) {
    const day = eu[1].padStart(2, '0')
    const month = eu[2].padStart(2, '0')
    const year = eu[3].length === 2 ? `20${eu[3]}` : eu[3]
    return `${year}-${month}-${day}`
  }
  return null
}

function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw ?? '').trim()
  if (!s) return null
  s = s.replace(/[€\s]/g, '')
  const isParenNegative = /^\(.*\)$/.test(s)
  if (isParenNegative) s = s.slice(1, -1)
  const isTrailingNegative = /-$/.test(s)
  if (isTrailingNegative) s = s.slice(0, -1)
  // Formato español: punto de miles, coma decimal (1.234,56)
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const num = Number.parseFloat(s)
  if (Number.isNaN(num)) return null
  return isParenNegative || isTrailingNegative ? -Math.abs(num) : num
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `import-${Math.random().toString(36).slice(2)}`
}

export async function parseTransactionsFile(file: File): Promise<ParsedImport> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new ImportError('El archivo no contiene ninguna hoja legible.')

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false })

  const header = findHeader(rows)
  if (!header) {
    throw new ImportError(
      'No se han encontrado columnas de Fecha, Concepto e Importe. Exporta el extracto de movimientos ' +
        'desde la banca online de Santander (formato Excel o CSV) sin modificar las cabeceras.',
    )
  }

  const transactions: Transaction[] = []
  let skippedRows = 0

  for (let i = header.rowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    const date = parseDate(row[header.dateCol])
    const amount = parseAmount(row[header.amountCol])
    const description = String(row[header.descCol] ?? '').trim()

    if (!date || amount === null || !description) {
      skippedRows += 1
      continue
    }

    transactions.push({
      id: makeId(),
      date,
      merchant: description,
      description,
      amount,
    })
  }

  if (transactions.length === 0) {
    throw new ImportError('Se ha detectado la cabecera pero ninguna fila con fecha, concepto e importe válidos.')
  }

  return {
    fileName: file.name,
    transactions,
    skippedRows,
    headerRowPreview: (rows[header.rowIndex] ?? []).map((c) => String(c ?? '')),
  }
}

export function dedupeKey(t: Pick<Transaction, 'date' | 'description' | 'amount'>): string {
  return `${t.date}|${t.description.trim().toLowerCase()}|${t.amount.toFixed(2)}`
}
