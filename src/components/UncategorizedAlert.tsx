import { formatEUR } from '../lib/aggregate'
import type { UncategorizedSummary } from '../lib/goal'

interface Props {
  summary: UncategorizedSummary
  threshold: number
  onReview: () => void
}

function plural(n: number, singular: string, pluralWord: string): string {
  return `${n} ${n === 1 ? singular : pluralWord}`
}

export function UncategorizedAlert({ summary, threshold, onReview }: Props) {
  const { expenseCount, expenseTotal, incomeCount, incomeTotal } = summary
  const total = expenseCount + incomeCount
  if (total === 0) return null

  const parts: string[] = []
  if (expenseCount > 0) parts.push(plural(expenseCount, 'gasto', 'gastos'))
  if (incomeCount > 0) parts.push(plural(incomeCount, 'ingreso', 'ingresos'))

  return (
    <div
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
      style={{ borderColor: 'var(--status-warning)', background: 'var(--surface-1)' }}
      role="status"
    >
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Hay {parts.join(' y ')} significativo{total === 1 ? '' : 's'} sin clasificar
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          {expenseCount > 0 && <>Los gastos suman {formatEUR(expenseTotal)}. </>}
          {incomeCount > 0 && (
            <>
              Los ingresos suman {formatEUR(incomeTotal)} y, al no estar clasificados, no restan de ninguna
              categoría.{' '}
            </>
          )}
          Cada uno supera los {formatEUR(threshold)} que has fijado como movimiento relevante.
        </p>
      </div>
      <button
        type="button"
        onClick={onReview}
        className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-white"
        style={{ background: 'var(--series-1)' }}
      >
        Revisarlos
      </button>
    </div>
  )
}
