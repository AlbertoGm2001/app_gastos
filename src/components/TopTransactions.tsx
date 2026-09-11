import { formatEUR } from '../lib/aggregate'
import { UNCATEGORIZED_ID } from '../types'
import type { Category, CategorizedTransaction } from '../types'

interface Props {
  transactions: CategorizedTransaction[]
  categories: Category[]
  topN: number
  onTopNChange: (n: number) => void
  onSelectCategory: (categoryId: string | null) => void
  selectedCategoryId: string | null
  /** Colores tal y como los reparte el gráfico, para que los puntos coincidan. */
  colorByCategoryId: Map<string, string>
}

const OPTIONS = [5, 10, 20, 50, 100]

export function TopTransactions({
  transactions,
  categories,
  topN,
  onTopNChange,
  onSelectCategory,
  selectedCategoryId,
  colorByCategoryId,
}: Props) {
  const nameById = new Map(categories.map((c) => [c.id, c.name]))
  const expenses = [...transactions]
    .filter((t) => t.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, topN)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="text-xs" style={{ color: 'var(--text-muted)' }} htmlFor="top-n">
          Mostrar los
        </label>
        <select
          id="top-n"
          value={topN}
          onChange={(e) => onTopNChange(Number(e.target.value))}
          className="rounded border px-2 py-1 text-xs"
          style={{
            borderColor: 'var(--border-hairline)',
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
          }}
        >
          {OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          movimientos de mayor importe
          {selectedCategoryId && ' de la categoría seleccionada'}
        </span>
      </div>

      {expenses.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          No hay movimientos que mostrar con los filtros actuales.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" style={{ color: 'var(--text-primary)' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="py-2 pr-4 font-medium">#</th>
                <th className="py-2 pr-4 font-medium">Fecha</th>
                <th className="py-2 pr-4 font-medium">Concepto</th>
                <th className="py-2 pr-4 font-medium">Categoría</th>
                <th className="py-2 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((tx, index) => (
                <tr key={tx.id} className="border-t" style={{ borderColor: 'var(--gridline)' }}>
                  <td className="py-2 pr-4" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {index + 1}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {tx.date}
                  </td>
                  <td className="py-2 pr-4">{tx.merchant}</td>
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      onClick={() => onSelectCategory(selectedCategoryId === tx.categoryId ? null : tx.categoryId)}
                      className="flex items-center gap-1.5 text-xs whitespace-nowrap"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: colorByCategoryId.get(tx.categoryId) ?? 'var(--text-muted)' }}
                      />
                      {tx.categoryId === UNCATEGORIZED_ID ? 'Sin categorizar' : (nameById.get(tx.categoryId) ?? 'Sin categorizar')}
                    </button>
                  </td>
                  <td className="py-2 text-right font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatEUR(-tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
