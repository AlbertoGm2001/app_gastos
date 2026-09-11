import { useState } from 'react'
import { formatEUR } from '../lib/aggregate'
import { nextTripId, summarizeTrip } from '../lib/trips'
import type { CategorizedTransaction, Trip } from '../types'

interface Props {
  trips: Trip[]
  transactions: CategorizedTransaction[]
  onChange: (trips: Trip[]) => void
}

const FIELD_STYLE = {
  borderColor: 'var(--border-hairline)',
  background: 'var(--surface-1)',
  color: 'var(--text-primary)',
}

export function ViajesPage({ trips, transactions, onChange }: Props) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState<string | null>(null)

  function addTrip() {
    const trimmed = name.trim()
    if (!trimmed) return setError('Ponle un nombre al viaje.')
    if (!start || !end) return setError('Indica la fecha de inicio y la de fin.')
    if (end < start) return setError('La fecha de fin no puede ser anterior a la de inicio.')

    // Un movimiento solo puede pertenecer a un viaje, así que no se admiten solapes.
    const overlap = trips.find((t) => start <= t.end && end >= t.start)
    if (overlap) {
      setError(`Las fechas se solapan con "${overlap.name}" (${overlap.start} → ${overlap.end}).`)
      return
    }

    onChange([...trips, { id: nextTripId(trips), name: trimmed, start, end }])
    setName('')
    setStart('')
    setEnd('')
    setError(null)
  }

  function removeTrip(id: string) {
    onChange(trips.filter((t) => t.id !== id))
  }

  const sorted = [...trips].sort((a, b) => (a.start === b.start ? 0 : a.start < b.start ? 1 : -1))

  return (
    <div className="space-y-6">
      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Dar de alta un viaje
        </h2>
        <p className="mt-1 mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Todos los movimientos entre las dos fechas —gastos e ingresos— se asignan a este viaje, que pasa a
          comportarse como una categoría más en el Panel. Los totales de abajo siguen a la clasificación, no a
          las fechas: si sacas un movimiento del viaje desde <strong>Movimientos</strong>, deja de sumar, y si le
          asignas uno de otra fecha, entra.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Nombre
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTrip()}
              placeholder="Semana Santa en Málaga"
              className="w-64 rounded border px-2 py-1.5 text-sm"
              style={FIELD_STYLE}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Inicio
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm"
              style={FIELD_STYLE}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Fin
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm"
              style={FIELD_STYLE}
            />
          </label>
          <button
            type="button"
            onClick={addTrip}
            className="rounded-md px-3 py-2 text-sm font-medium text-white"
            style={{ background: 'var(--series-1)' }}
          >
            Añadir viaje
          </button>
        </div>

        {error && (
          <p className="mt-3 text-xs" style={{ color: 'var(--status-critical)' }}>
            {error}
          </p>
        )}
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Viajes ({trips.length})
        </h2>

        {trips.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Todavía no hay viajes. Da de alta el primero arriba y sus movimientos se agruparán solos.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" style={{ color: 'var(--text-primary)' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="py-2 pr-4 font-medium">Viaje</th>
                  <th className="py-2 pr-4 font-medium">Fechas</th>
                  <th className="py-2 pr-4 font-medium">Días</th>
                  <th className="py-2 pr-4 font-medium">Movimientos</th>
                  <th className="py-2 pr-6 text-right font-medium">Gastos</th>
                  <th className="py-2 pr-6 text-right font-medium">Ingresos</th>
                  <th className="py-2 pr-6 text-right font-medium">Coste neto</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((trip) => {
                  const summary = summarizeTrip(trip, transactions)
                  return (
                    <tr key={trip.id} className="border-t" style={{ borderColor: 'var(--gridline)' }}>
                      <td className="py-2 pr-4 font-medium">{trip.name}</td>
                      <td className="py-2 pr-4 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        {trip.start} → {trip.end}
                      </td>
                      <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>
                        {summary.days}
                      </td>
                      <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>
                        {summary.count}
                        {summary.outsideRange > 0 && (
                          <span
                            className="ml-1 text-xs"
                            style={{ color: 'var(--text-muted)' }}
                            title={`${summary.outsideRange} asignados a mano fuera de las fechas del viaje`}
                          >
                            ({summary.outsideRange} fuera de fechas)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-6 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatEUR(summary.expenses)}
                      </td>
                      <td
                        className="py-2 pr-6 text-right"
                        style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}
                      >
                        {summary.income > 0 ? formatEUR(summary.income) : '—'}
                      </td>
                      <td className="py-2 pr-6 text-right font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatEUR(summary.net)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeTrip(trip.id)}
                          className="text-xs"
                          style={{ color: 'var(--status-critical)' }}
                          aria-label={`Eliminar viaje ${trip.name}`}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
