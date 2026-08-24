import { formatEUR, type CategoryTotal } from '../lib/aggregate'

interface Props {
  totals: CategoryTotal[]
}

export function CategoryTable({ totals }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ color: 'var(--text-primary)' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            <th className="py-2 pr-4 font-medium">Categoría</th>
            <th className="py-2 pr-4 font-medium">Movimientos</th>
            <th className="py-2 pr-6 text-right font-medium">Importe</th>
            <th className="py-2 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.categoryId} className="border-t" style={{ borderColor: 'var(--gridline)' }}>
              <td className="py-2 pr-4">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />
                  {t.name}
                </span>
              </td>
              <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>
                {t.count}
              </td>
              <td className="py-2 pr-6 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatEUR(t.total)}
              </td>
              <td className="py-2 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                {t.pct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
