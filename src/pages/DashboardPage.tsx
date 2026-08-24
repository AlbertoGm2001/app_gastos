import { CategoryBreakdownBar } from '../components/CategoryBreakdownBar'
import { CategoryTable } from '../components/CategoryTable'
import { StatTile } from '../components/StatTile'
import { formatEUR, type CategoryTotal } from '../lib/aggregate'
import type { DateRange } from '../lib/dateRange'

interface Props {
  range: DateRange
  totals: CategoryTotal[]
  grandTotal: number
  expenseCount: number
}

export function DashboardPage({ range, totals, grandTotal, expenseCount }: Props) {
  const days = Math.max(1, (new Date(range.end).getTime() - new Date(range.start).getTime()) / 86_400_000 + 1)
  const topCategory = totals[0]

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <StatTile label="Total gastado" value={formatEUR(grandTotal)} hint={`${range.start} → ${range.end}`} />
        <StatTile label="Movimientos" value={String(expenseCount)} hint={`${(expenseCount / days).toFixed(1)} / día`} />
        <StatTile
          label="Categoría principal"
          value={topCategory ? topCategory.name : '—'}
          hint={topCategory ? `${topCategory.pct.toFixed(1)}% del total` : undefined}
        />
      </div>

      <section
        className="mb-6 rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Reparto del gasto por categoría
        </h2>
        <CategoryBreakdownBar totals={totals} grandTotal={grandTotal} />
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Detalle por categoría
        </h2>
        <CategoryTable totals={totals} />
      </section>
    </div>
  )
}
