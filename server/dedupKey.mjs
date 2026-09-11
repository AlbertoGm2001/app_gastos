/**
 * Identidad de un movimiento por contenido, no por lo que diga el banco.
 *
 * El `entry_reference` del Santander es `fecha.índice-dentro-del-día` ("2026-08-20.1"):
 * posicional, no estable. En cuanto el banco reordena un día o consolida un pendiente e
 * inserta una fila en medio, todos los índices posteriores se desplazan y cada movimiento
 * cambia de id. Usarlo como clave primaria duplicaba movimientos en cada sync y hacía
 * perder las reclasificaciones manuales, que van indexadas por id en localStorage.
 *
 * La identidad es por tanto `fecha + importe + concepto normalizado + nº de ocurrencia`.
 * La ocurrencia importa: hay duplicados legítimos (dos peajes iguales el mismo día) que
 * no se pueden colapsar.
 *
 * OJO: `src/lib/dedup.ts` es el espejo de este fichero para el navegador. Los ids tienen
 * que salir idénticos en los dos lados, así que cualquier cambio aquí va también allí.
 * Están duplicados a propósito: `src/` no puede importar de `server/`.
 */
import { createHash } from 'node:crypto'

/**
 * El extracto .xls y la API del banco escriben el mismo concepto distinto
 * ("Pago Movil En Moeve" vs "PAGO MOVIL EN MOEVE"). Se normaliza a mayúsculas sin
 * acentos y sin puntuación para que las dos fuentes den la misma clave.
 */
export function normalizeDescription(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/** Clave de contenido, sin la ocurrencia. Dos movimientos con la misma son intercambiables. */
export function contentKey({ date, amount, description }) {
  return `${date}|${Number(amount).toFixed(2)}|${normalizeDescription(description)}`
}

/**
 * Asigna ids de contenido a un lote. El resultado no depende del orden de entrada:
 * dos movimientos con la misma clave son intercambiables, así que repartir entre ellos
 * las ocurrencias 0 y 1 da siempre el mismo conjunto de ids.
 *
 * @param {Array<{ date: string, amount: number, description: string }>} transactions
 * @param {string} prefix `eb` (banco), `stmt` (extracto) o `local` (importado en el navegador)
 */
export function assignContentIds(transactions, prefix) {
  const seen = new Map()
  return transactions.map((transaction) => {
    const key = contentKey(transaction)
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)
    return { ...transaction, id: contentId(prefix, transaction, occurrence) }
  })
}

export function contentId(prefix, transaction, occurrence) {
  const hash = createHash('sha1').update(contentKey(transaction)).digest('hex').slice(0, 12)
  return `${prefix}-${transaction.date}-${hash}-${occurrence}`
}
