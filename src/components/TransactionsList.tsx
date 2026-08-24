import { formatEUR } from '../lib/aggregate'
import { UNCATEGORIZED_ID } from '../types'
import type { Category, CategorizedTransaction } from '../types'

interface Props {
  transactions: CategorizedTransaction[]
  categories: Category[]
  onReassign: (transactionId: string, categoryId: string) => void
}

export function TransactionsList({ transactions, categories, onReassign }: Props) {
  const expenses = transactions.filter((t) => t.amount < 0).slice(0, 40)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ color: 'var(--text-primary)' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            <th className="py-2 pr-4 font-medium">Fecha</th>
            <th className="py-2 pr-4 font-medium">Comercio</th>
            <th className="py-2 pr-6 text-right font-medium">Importe</th>
            <th className="py-2 pr-4 font-medium">Categoría</th>
            <th className="py-2 font-medium">Origen</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((tx) => (
            <tr key={tx.id} className="border-t" style={{ borderColor: 'var(--gridline)' }}>
              <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>
                {tx.date}
              </td>
              <td className="py-2 pr-4">{tx.merchant}</td>
              <td className="py-2 pr-6 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatEUR(-tx.amount)}
              </td>
              <td className="py-2 pr-4">
                <select
                  value={tx.categoryId}
                  onChange={(e) => onReassign(tx.id, e.target.value)}
                  className="rounded border px-2 py-1 text-xs"
                  style={{ borderColor: 'var(--border-hairline)', background: 'transparent', color: 'var(--text-primary)' }}
                >
                  <option value={UNCATEGORIZED_ID}>Sin categorizar</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {tx.source === 'manual' ? 'Manual' : 'IA'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {transactions.filter((t) => t.amount < 0).length > 40 && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Mostrando los 40 movimientos más recientes del periodo.
        </p>
      )}
    </div>
  )
}
