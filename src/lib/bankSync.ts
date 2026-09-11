/**
 * Cliente de la API local (server/api.mjs) para la conexión bancaria.
 *
 * La app no habla nunca con Enable Banking directamente: la clave privada con la que se
 * firma cada petición vive en Node y la API del banco no sirve CORS. Todo pasa por /api.
 */
import type { Transaction } from '../types'

export interface BankDbStats {
  count: number
  lastDate: string | null
  lastSync: string | null
}

export interface BankStatus {
  /** Hay application id y clave privada configurados en .env.local. */
  configured: boolean
  /** Hay una sesión con consentimiento vivo. */
  connected: boolean
  aspsp: string | null
  validUntil: string | null
  accounts: number
  connectedAt: string | null
  db: BankDbStats | null
  /** Mensaje si la base de datos no está accesible; el resto del estado sigue siendo válido. */
  dbError: string | null
}

export interface SyncResult {
  fetched: number
  inserted: number
  /** Movimientos de banco borrados al reemplazar el tramo, antes de reinsertarlo. */
  replaced: number
  /** Movimientos de extracto descartados por caer en el tramo que cubre el banco. */
  statementRemoved: number
  bankRange: { from: string; to: string } | null
  skipped: number
  dateFrom: string | null
  transactions: Transaction[]
}

export interface Aspsp {
  name: string
  country: string
  logo: string | null
  maximumConsentValidity: number | null
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { error?: string }).error ?? `Error ${response.status}`)
  return data as T
}

export const getBankStatus = () => call<BankStatus>('/api/bank/status')

export const listAspsps = (country = 'ES') =>
  call<{ aspsps: Aspsp[] }>(`/api/bank/aspsps?country=${encodeURIComponent(country)}`).then((r) => r.aspsps)

/** Devuelve la URL del banco a la que hay que enviar al usuario para el SCA. */
export const connectBank = (aspspName: string, country = 'ES') =>
  call<{ url: string }>('/api/bank/connect', { method: 'POST', body: JSON.stringify({ aspspName, country }) })

/**
 * Sincroniza con el banco. Sin `dateFrom` se pide la ventana máxima de histórico (89
 * días), que es lo más seguro: re-consolida los movimientos que estaban pendientes.
 *
 * Con `dateFrom` solo se trae desde esa fecha. Es más rápido, pero deja fuera los
 * pendientes anteriores a ella, que el banco todavía puede cambiar al consolidarlos.
 */
export const syncBank = (dateFrom?: string) =>
  call<SyncResult>('/api/bank/sync', {
    method: 'POST',
    body: JSON.stringify(dateFrom ? { dateFrom } : {}),
  })

export const disconnectBank = () => call<{ connected: boolean }>('/api/bank/disconnect', { method: 'POST' })

export const fetchStoredTransactions = () =>
  call<{ transactions: Transaction[] }>('/api/transactions').then((r) => r.transactions)

/**
 * Sube a la base de datos los movimientos de un extracto importado en el navegador, como
 * `source = 'statement'`, y devuelve el dataset completo ya actualizado.
 *
 * Antes estos movimientos se quedaban en memoria y en localStorage, así que se perdían al
 * recargar o al cambiar el origen del dev server. Ya no existe ningún movimiento que viva
 * solo en el navegador.
 */
export const importStatementTransactions = (transactions: Transaction[]) =>
  call<{ transactions: Transaction[] }>('/api/transactions/import', {
    method: 'POST',
    body: JSON.stringify({ transactions }),
  }).then((r) => r.transactions)
