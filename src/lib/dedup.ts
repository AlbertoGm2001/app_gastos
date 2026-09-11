/**
 * Identidad de un movimiento por contenido. Espejo de `server/dedupKey.mjs`.
 *
 * Están duplicados a propósito: `src/` no puede importar de `server/` (son dos runtimes
 * distintos y la API local vive solo en Node). Los ids tienen que salir idénticos en los
 * dos lados, así que **cualquier cambio en la normalización va en los dos ficheros**.
 *
 * El navegador lo necesita para dos cosas: dar id a los movimientos que se importan a
 * mano desde un .xls, y arrastrar las reclasificaciones manuales cuando un movimiento
 * cambia de id en la base de datos.
 */
import type { Transaction } from '../types'

type Contented = Pick<Transaction, 'date' | 'amount' | 'description'>

/**
 * El extracto .xls y la API del banco escriben el mismo concepto distinto
 * ("Pago Movil En Moeve" vs "PAGO MOVIL EN MOEVE"). Se normaliza a mayúsculas sin
 * acentos y sin puntuación para que las dos fuentes den la misma clave.
 */
export function normalizeDescription(value: string | undefined | null): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/** Clave de contenido, sin la ocurrencia. Dos movimientos con la misma son intercambiables. */
export function contentKey({ date, amount, description }: Contented): string {
  return `${date}|${amount.toFixed(2)}|${normalizeDescription(description)}`
}

/** SHA-1 de 12 hex, igual que `createHash('sha1')` en Node, pero con WebCrypto. */
async function sha1Short(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}

/**
 * Asigna ids de contenido a un lote. El resultado no depende del orden de entrada:
 * dos movimientos con la misma clave son intercambiables, así que repartir entre ellos
 * las ocurrencias 0 y 1 da siempre el mismo conjunto de ids.
 *
 * Es asíncrona porque WebCrypto no tiene hash sincrónico en el navegador.
 */
export async function assignContentIds<T extends Contented>(
  transactions: T[],
  prefix: string,
): Promise<(T & { id: string })[]> {
  const seen = new Map<string, number>()
  return Promise.all(
    transactions.map(async (transaction) => {
      const key = contentKey(transaction)
      const occurrence = seen.get(key) ?? 0
      seen.set(key, occurrence + 1)
      return { ...transaction, id: `${prefix}-${transaction.date}-${await sha1Short(key)}-${occurrence}` }
    }),
  )
}

/** Prefijo de los movimientos importados a mano en el navegador, que no están en la BDD. */
export const LOCAL_ID_PREFIX = 'local-'

/** Agrupa por clave de contenido preservando el orden dentro de cada grupo. */
export function groupByContent<T extends Contented>(transactions: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const transaction of transactions) {
    const key = contentKey(transaction)
    const group = groups.get(key)
    if (group) group.push(transaction)
    else groups.set(key, [transaction])
  }
  return groups
}

/**
 * Los movimientos de `incoming` que `existing` no cubre ya.
 *
 * Es una diferencia de **multiconjuntos**, no de conjuntos: si el mismo día pasaste dos
 * veces por el mismo peaje son dos gastos reales, así que importar un fichero con dos
 * cargos iguales sobre una base que solo tiene uno debe dejar entrar el segundo. Comparar
 * con un `Set` de claves —como se hacía antes— se comía el segundo.
 */
export function subtractExisting<T extends Contented>(incoming: T[], existing: Contented[]): T[] {
  const covered = new Map<string, number>()
  for (const transaction of existing) {
    const key = contentKey(transaction)
    covered.set(key, (covered.get(key) ?? 0) + 1)
  }
  return incoming.filter((transaction) => {
    const key = contentKey(transaction)
    const remaining = covered.get(key) ?? 0
    if (remaining === 0) return true
    covered.set(key, remaining - 1)
    return false
  })
}
