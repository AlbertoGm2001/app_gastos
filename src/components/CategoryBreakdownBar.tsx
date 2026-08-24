import { useState } from 'react'
import { formatEUR, type CategoryTotal } from '../lib/aggregate'

interface Props {
  totals: CategoryTotal[]
  grandTotal: number
}

export function CategoryBreakdownBar({ totals, grandTotal }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = totals.find((t) => t.categoryId === activeId)

  if (grandTotal === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No hay gastos en el periodo seleccionado.
      </p>
    )
  }

  return (
    <div>
      <div className="relative">
        <div
          className="flex h-6 w-full overflow-hidden rounded"
          style={{ background: 'var(--surface-page)', gap: '2px' }}
          role="img"
          aria-label="Reparto de gastos por categoría"
        >
          {totals.map((t, i) => {
            const widthPct = (t.total / grandTotal) * 100
            if (widthPct <= 0) return null
            const showInlineLabel = widthPct > 12
            return (
              <button
                key={t.categoryId}
                type="button"
                className="relative flex items-center justify-center overflow-hidden text-xs font-medium text-white outline-none focus-visible:ring-2"
                style={{
                  width: `${widthPct}%`,
                  background: t.color,
                  borderRadius: i === 0 || i === totals.length - 1 ? '4px' : 0,
                }}
                onMouseEnter={() => setActiveId(t.categoryId)}
                onMouseLeave={() => setActiveId(null)}
                onFocus={() => setActiveId(t.categoryId)}
                onBlur={() => setActiveId(null)}
                aria-label={`${t.name}: ${formatEUR(t.total)}, ${t.pct.toFixed(1)}%`}
              >
                {showInlineLabel && <span className="truncate px-1">{t.pct.toFixed(0)}%</span>}
              </button>
            )
          })}
        </div>

        {active && (
          <div
            className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 rounded-md border px-3 py-2 text-xs shadow-lg"
            style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)', minWidth: 160 }}
          >
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {formatEUR(active.total)}
            </p>
            <p style={{ color: 'var(--text-secondary)' }}>
              {active.name} · {active.pct.toFixed(1)}% · {active.count} mov.
            </p>
          </div>
        )}
      </div>

      <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
        {totals.map((t) => (
          <li key={t.categoryId} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: t.color }}
            />
            <span style={{ color: 'var(--text-primary)' }}>{t.name}</span>
            <span style={{ color: 'var(--text-muted)' }}>{t.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
