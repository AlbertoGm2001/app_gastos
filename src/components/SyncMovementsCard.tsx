/**
 * Sincronización desde el Panel, con fecha de inicio elegible.
 *
 * Existe además del botón de Configuración → Conexión bancaria, que sigue sincronizando la
 * ventana máxima de histórico. La diferencia es el `dateFrom`: aquí se elige desde cuándo
 * traer, y por defecto sale el día siguiente al último movimiento guardado, que es lo que
 * hace falta para tapar el hueco sin volver a pedir lo que ya está.
 */
import { useState } from 'react'
import { syncBank } from '../lib/bankSync'
import type { Transaction } from '../types'

interface Props {
  /** Fecha del último movimiento guardado (ISO aaaa-mm-dd). */
  lastDate: string
  onSynced: (transactions: Transaction[]) => void
}

const DAY_MS = 86400000
const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** Día siguiente a `date`, en ISO. Se calcula en local para no cruzar husos. */
function nextDay(date: string): string {
  return isoDay(new Date(new Date(`${date}T00:00:00`).getTime() + DAY_MS))
}

/**
 * Fecha con la que arranca el selector: el día siguiente al último movimiento, que es lo
 * que tapa el hueco sin volver a pedir lo que ya está.
 *
 * Acotada a hoy: si el último movimiento es de hoy, el día siguiente sería mañana, y una
 * fecha futura no la acepta ni el input ni el servidor.
 */
function defaultDateFrom(lastDate: string): string {
  const next = nextDay(lastDate)
  const today = isoDay(new Date())
  return next > today ? today : next
}

/** Días completos entre `date` y hoy. 0 si es hoy o el futuro. */
function daysSince(date: string): number {
  const ms = new Date(`${isoDay(new Date())}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()
  return ms > 0 ? Math.round(ms / DAY_MS) : 0
}

function formatLong(date: string): string {
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function SyncMovementsCard({ lastDate, onSynced }: Props) {
  const [dateFrom, setDateFrom] = useState(() => defaultDateFrom(lastDate))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSeen, setLastSeen] = useState(lastDate)

  // Tras sincronizar, el último movimiento se mueve y la fecha por defecto tiene que
  // seguirlo. Mismo patrón que el filtro inicial de TransactionsList.
  if (lastDate !== lastSeen) {
    setLastSeen(lastDate)
    setDateFrom(defaultDateFrom(lastDate))
  }

  const pending = daysSince(lastDate)
  const today = isoDay(new Date())

  async function handleSync() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await syncBank(dateFrom)
      onSynced(result.transactions)
      setMessage(
        result.fetched === 0
          ? `Sin movimientos nuevos desde el ${formatLong(dateFrom)}.`
          : `${result.fetched} movimientos leídos: ${result.inserted} nuevos` +
            (result.replaced > 0 ? `, ${result.replaced} actualizados` : '') +
            (result.statementRemoved > 0 ? `, ${result.statementRemoved} del extracto descartados` : '') +
            '.',
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Sincronizar movimientos
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: pending > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {pending === 0
              ? `Al día: el último movimiento es de hoy, ${formatLong(lastDate)}.`
              : `Sin movimientos desde el ${formatLong(lastDate)} (hace ${pending} día${pending === 1 ? '' : 's'}).`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs" style={{ color: 'var(--text-muted)' }} htmlFor="sync-date-from">
            Desde
          </label>
          <input
            id="sync-date-from"
            type="date"
            value={dateFrom}
            max={today}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{
              borderColor: 'var(--border-hairline)',
              background: 'var(--surface-1)',
              color: 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
          <button
            type="button"
            onClick={handleSync}
            disabled={busy || !dateFrom}
            className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--status-good)', color: 'var(--status-good)' }}
          >
            {busy ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/*
        El aviso solo sale si se pide desde una fecha posterior al último movimiento: es
        justo el caso en que un pendiente anterior podría consolidarse y colarse duplicado.
      */}
      {dateFrom > lastDate && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Los movimientos anteriores al {formatLong(dateFrom)} no se vuelven a pedir. Si el banco aún tenía
          alguno pendiente, elige una fecha más atrás para que se consolide.
        </p>
      )}

      {message && (
        <p className="mt-2 text-xs" style={{ color: 'var(--status-good)' }}>
          {message}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs" style={{ color: 'var(--status-critical)' }}>
          {error}
        </p>
      )}
    </section>
  )
}
