/**
 * Traduce un movimiento de Enable Banking al `Transaction` de la app (src/types.ts).
 *
 * Dos cosas que no son obvias en la respuesta del banco:
 *  - el importe llega SIEMPRE positivo y el signo lo da `credit_debit_indicator`
 *    ('DBIT' = cargo, 'CRDT' = abono), al contrario que en el extracto .xls;
 *  - `entry_reference` NO sirve como id. En el Santander es `fecha.índice-dentro-del-día`
 *    ("2026-08-20.1"), o sea posicional: se desplaza en cuanto el banco reordena un día o
 *    consolida un pendiente. El id lo asigna `assignContentIds()` sobre el lote completo,
 *    a partir del contenido del movimiento (ver `server/dedupKey.mjs`).
 */

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

function pickDate(raw) {
  const date = raw.booking_date ?? raw.value_date ?? raw.transaction_date
  return date ? String(date).slice(0, 10) : null
}

function pickAmount(raw) {
  const amount = Number(raw.transaction_amount?.amount ?? raw.amount)
  if (!Number.isFinite(amount)) return null
  const isDebit = String(raw.credit_debit_indicator ?? '').toUpperCase() === 'DBIT'
  return isDebit ? -Math.abs(amount) : Math.abs(amount)
}

/**
 * Concepto legible. Se prioriza la contraparte (comercio, ordenante) y se cae al
 * texto libre de la remesa, que es lo único que traen las tarjetas de muchos bancos.
 */
function pickDescription(raw, amount) {
  const remittance = Array.isArray(raw.remittance_information)
    ? raw.remittance_information.map(clean).filter(Boolean).join(' ')
    : clean(raw.remittance_information)
  const counterparty = amount < 0 ? clean(raw.creditor?.name) : clean(raw.debtor?.name)
  const merchantName = clean(raw.merchant_category_code ? raw.creditor?.name : '')
  return clean([counterparty || merchantName, remittance].filter(Boolean).join(' — ')) || 'Movimiento sin concepto'
}

/**
 * Sin `id`: lo pone `assignContentIds()` cuando ya está el lote entero, porque necesita
 * contar ocurrencias entre movimientos idénticos del mismo día.
 *
 * @returns {{ date, merchant, description, amount, accountUid, raw } | null}
 */
export function mapTransaction(raw, accountUid) {
  const date = pickDate(raw)
  const amount = pickAmount(raw)
  if (!date || amount === null) return null

  const description = pickDescription(raw, amount)
  return {
    date,
    // La app trata merchant y description como el mismo texto (el extracto solo trae
    // una columna); se mantiene así para que el clasificador vea lo mismo en ambos.
    merchant: description,
    description,
    amount,
    accountUid,
    raw,
  }
}
