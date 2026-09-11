import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatEUR, type CategoryTotal } from '../lib/aggregate'
import type { Category } from '../types'

interface Row {
  categoryId: string
  name: string
  color: string
  spent: number
  /** Límite de gasto fijo mensual de la categoría (0 = sin límite fijado). */
  budget: number
  over: number
}

interface Props {
  totals: CategoryTotal[]
  categories: Category[]
  selectedCategoryId: string | null
  onSelectCategory: (categoryId: string | null) => void
}

const OVER_COLOR = 'var(--status-critical)'

function BudgetTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Row }> }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-sm"
      style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
    >
      <p className="font-semibold">{row.name}</p>
      <p className="mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
        Gastado {formatEUR(row.spent)}
      </p>
      {row.budget > 0 ? (
        <p style={{ fontVariantNumeric: 'tabular-nums', color: row.over > 0 ? OVER_COLOR : 'var(--status-good)' }}>
          Límite {formatEUR(row.budget)}
          {row.over > 0 ? ` · ${formatEUR(row.over)} por encima` : ` · ${formatEUR(row.budget - row.spent)} de margen`}
        </p>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>Sin límite de gasto fijo</p>
      )}
    </div>
  )
}

/**
 * Barra + marca del límite en un solo shape.
 *
 * Con dos series <Bar> recharts las agrupa en bandas distintas dentro de la
 * categoría, así que la marca acababa dibujada sobre la fila de al lado. Aquí la
 * posición del límite se deriva de la escala de la propia barra
 * (width px equivalen a `spent` euros), de modo que línea y barra comparten fila.
 */
function BarWithBudget(props: unknown) {
  const { x, y, width, height, payload, fill, fillOpacity } = props as {
    x?: number
    y?: number
    width?: number
    height?: number
    payload?: Row
    fill?: string
    fillOpacity?: number
  }
  if (!payload || x === undefined || y === undefined || width === undefined || height === undefined) {
    return <g />
  }

  const pxPerEuro = payload.spent > 0 ? width / payload.spent : 0
  const budgetX = payload.budget > 0 && pxPerEuro > 0 ? x + payload.budget * pxPerEuro : null
  const midY = y + height / 2
  const top = y - 5
  const bottom = y + height + 5
  const barEnd = x + width
  // Barras minúsculas: el valor va fuera para que la fila siga siendo legible.
  const labelX = Math.max(barEnd, budgetX ?? barEnd) + 6

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={3} fill={fill} fillOpacity={fillOpacity} />

      {budgetX !== null && budgetX > barEnd + 2 && (
        // Conector: ata la línea del límite a su barra cuando aún queda margen.
        <line
          x1={barEnd}
          x2={budgetX}
          y1={midY}
          y2={midY}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.6}
        />
      )}

      {budgetX !== null && (
        <>
          <line x1={budgetX} x2={budgetX} y1={top} y2={bottom} stroke="var(--surface-1)" strokeWidth={4} />
          <line
            x1={budgetX}
            x2={budgetX}
            y1={top}
            y2={bottom}
            stroke="var(--text-primary)"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        </>
      )}

      <text
        x={labelX}
        y={midY}
        dominantBaseline="middle"
        fontSize={11}
        fill="var(--text-secondary)"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatEUR(payload.spent)}
      </text>
    </g>
  )
}

export function CategoryBudgetChart({ totals, categories, selectedCategoryId, onSelectCategory }: Props) {
  const budgetById = new Map(categories.map((c) => [c.id, c.fixedBudget ?? 0]))

  const all: Row[] = totals.map((t) => {
    const budget = budgetById.get(t.categoryId) ?? 0
    return {
      categoryId: t.categoryId,
      name: t.name,
      color: t.color,
      spent: t.total,
      budget,
      over: budget > 0 ? Math.max(0, t.total - budget) : 0,
    }
  })

  // Solo las categorías con límite entran en el gráfico: mezclarlas con las que no
  // lo tienen aplastaba la escala y dejaba las barras pequeñas ilegibles.
  const rows = all.filter((r) => r.budget > 0)
  const withoutBudget = all.filter((r) => r.budget === 0)

  if (rows.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Ninguna categoría con gasto este mes tiene un límite fijado. Ponlo en{' '}
        <strong>Configuración → Categorías</strong> y aparecerán aquí.
      </p>
    )
  }

  const toggle = (categoryId: string) =>
    onSelectCategory(selectedCategoryId === categoryId ? null : categoryId)

  // El dominio tiene que cubrir también los límites: si no, la línea de una
  // categoría poco gastada pero con presupuesto alto caería fuera del área.
  const maxValue = Math.max(...rows.map((r) => Math.max(r.spent, r.budget)), 0)
  const height = Math.max(220, rows.length * 34 + 40)
  const axisStyle = { fill: 'var(--text-muted)', fontSize: 12 }
  const euroTick = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',')}k` : String(Math.round(v))

  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 92, bottom: 4, left: 8 }}>
            <XAxis
              type="number"
              domain={[0, maxValue * 1.04]}
              tick={axisStyle}
              stroke="var(--gridline)"
              tickLine={false}
              tickFormatter={euroTick}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={axisStyle}
              stroke="var(--gridline)"
              tickLine={false}
              width={150}
            />
            <Tooltip cursor={{ fill: 'var(--gridline)', opacity: 0.35, pointerEvents: 'none' }} content={<BudgetTooltip />} />

            <Bar dataKey="spent" barSize={18} isAnimationActive={false} shape={BarWithBudget}>
              {rows.map((r) => (
                <Cell
                  key={r.categoryId}
                  fill={r.over > 0 ? OVER_COLOR : r.color}
                  fillOpacity={selectedCategoryId && selectedCategoryId !== r.categoryId ? 0.3 : 1}
                  cursor="pointer"
                  onClick={() => toggle(r.categoryId)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span
          aria-hidden
          className="mr-2 inline-block align-middle"
          style={{ height: 12, width: 0, borderLeft: '1.5px dashed var(--text-primary)' }}
        />
        Límite de gasto fijo mensual de cada categoría. Las barras en rojo lo superan.
      </p>

      {withoutBudget.length > 0 && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Sin límite fijado:{' '}
          {withoutBudget.map((r, i) => (
            <span key={r.categoryId}>
              {i > 0 && ' · '}
              <button
                type="button"
                onClick={() => toggle(r.categoryId)}
                style={{ color: 'var(--text-secondary)' }}
              >
                {r.name} {formatEUR(r.spent)}
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
