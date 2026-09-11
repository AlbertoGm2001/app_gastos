import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatEUR, type CategoryTotal } from '../lib/aggregate'

interface Props {
  totals: CategoryTotal[]
  grandTotal: number
  selectedCategoryId: string | null
  onSelectCategory: (categoryId: string | null) => void
}

interface TooltipEntry {
  payload?: CategoryTotal
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  const slice = payload?.[0]?.payload
  if (!active || !slice) return null
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-sm"
      style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
    >
      <p className="font-semibold">{slice.name}</p>
      <p className="mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatEUR(slice.total)} · {slice.pct.toFixed(1)}% · {slice.count} mov.
      </p>
    </div>
  )
}

export function CategoryPieChart({ totals, grandTotal, selectedCategoryId, onSelectCategory }: Props) {
  if (totals.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        No hay gasto en el periodo seleccionado.
      </p>
    )
  }

  // Un clic sobre la categoría ya activa la deselecciona: el filtro es un toggle.
  const toggle = (categoryId: string) => onSelectCategory(selectedCategoryId === categoryId ? null : categoryId)
  const dim = (categoryId: string) => (selectedCategoryId && selectedCategoryId !== categoryId ? 0.25 : 1)
  const highlighted = selectedCategoryId ? totals.find((t) => t.categoryId === selectedCategoryId) : undefined

  return (
    <div>
      <div className="relative" style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={totals}
              dataKey="total"
              nameKey="name"
              innerRadius="58%"
              outerRadius="86%"
              paddingAngle={1}
              stroke="var(--surface-1)"
              strokeWidth={2}
              isAnimationActive={false}
              onClick={(entry: unknown) => {
                const slice = entry as { payload?: CategoryTotal; categoryId?: string }
                const id = slice.payload?.categoryId ?? slice.categoryId
                if (id) toggle(id)
              }}
            >
              {totals.map((t) => (
                <Cell
                  key={t.categoryId}
                  fill={t.color}
                  fillOpacity={dim(t.categoryId)}
                  style={{ cursor: 'pointer', outline: 'none' }}
                />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {highlighted ? highlighted.name : 'Total gastado'}
          </p>
          <p className="text-xl font-semibold" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {formatEUR(highlighted ? highlighted.total : grandTotal)}
          </p>
          {highlighted && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {highlighted.pct.toFixed(1)}% del total
            </p>
          )}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {totals.map((t) => {
          const active = selectedCategoryId === t.categoryId
          return (
            <li key={t.categoryId}>
              <button
                type="button"
                onClick={() => toggle(t.categoryId)}
                className="flex items-center gap-1.5 rounded px-1 py-0.5"
                style={{
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: active ? 600 : 400,
                  opacity: dim(t.categoryId),
                }}
                aria-pressed={active}
              >
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />
                {t.name}
                <span style={{ color: 'var(--text-muted)' }}>{t.pct.toFixed(1)}%</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
