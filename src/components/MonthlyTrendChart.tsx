import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { REST_SERIES_ID, formatEUR, type MonthlySeries } from '../lib/aggregate'

interface Props {
  data: MonthlySeries
  selectedCategoryId: string | null
  onSelectCategory: (categoryId: string | null) => void
  selectedMonth: string | null
  onSelectMonth: (month: string | null) => void
}

type Mode = 'stacked' | 'lines'

interface TooltipEntry {
  dataKey?: string | number
  name?: string
  value?: number
  color?: string
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  series: MonthlySeries['series']
}) {
  if (!active || !payload || payload.length === 0) return null
  const nameById = new Map(series.map((s) => [s.categoryId, s.name]))
  const rows = payload.filter((p) => (p.value ?? 0) > 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const total = rows.reduce((sum, p) => sum + (p.value ?? 0), 0)

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-sm"
      style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
    >
      <p className="mb-1 font-semibold">{label}</p>
      {rows.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
            {nameById.get(String(p.dataKey)) ?? p.name}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatEUR(p.value ?? 0)}</span>
        </p>
      ))}
      <p className="mt-1 flex items-center justify-between gap-4 border-t pt-1 font-semibold" style={{ borderColor: 'var(--gridline)' }}>
        <span>Total</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatEUR(total)}</span>
      </p>
    </div>
  )
}

interface MonthTickProps {
  x?: number
  y?: number
  payload?: { value?: string; index?: number }
  rows: MonthlySeries['rows']
  selectedMonth: string | null
  onToggleMonth: (month: string) => void
}

/** Tick clicable: cada etiqueta del eje X filtra el panel por su mes. */
function MonthTick({ x, y, payload, rows, selectedMonth, onToggleMonth }: MonthTickProps) {
  const row = rows[payload?.index ?? -1]
  const month = typeof row?.month === 'string' ? row.month : null
  const active = month !== null && month === selectedMonth
  return (
    <text
      x={x}
      y={y}
      dy={14}
      textAnchor="middle"
      fontSize={12}
      fontWeight={active ? 600 : 400}
      fill={active ? 'var(--series-1)' : 'var(--text-muted)'}
      style={{ cursor: month ? 'pointer' : 'default' }}
      onClick={() => month && onToggleMonth(month)}
    >
      {payload?.value}
    </text>
  )
}

export function MonthlyTrendChart({
  data,
  selectedCategoryId,
  onSelectCategory,
  selectedMonth,
  onSelectMonth,
}: Props) {
  const [mode, setMode] = useState<Mode>('stacked')

  // "Resto" agrupa varias categorías: no es un filtro que se pueda aplicar.
  const toggle = (categoryId: string) => {
    if (categoryId === REST_SERIES_ID) return
    onSelectCategory(selectedCategoryId === categoryId ? null : categoryId)
  }

  if (data.rows.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        No hay gasto que representar todavía.
      </p>
    )
  }

  const axisStyle = { fill: 'var(--text-muted)', fontSize: 12 }
  const euroTick = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))

  const toggleMonth = (month: string) => onSelectMonth(selectedMonth === month ? null : month)

  return (
    <div>
      <div className="mb-3 flex gap-1">
        {(
          [
            ['stacked', 'Apilado'],
            ['lines', 'Líneas'],
          ] as Array<[Mode, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className="rounded-md border px-2.5 py-1 text-xs font-medium"
            style={{
              borderColor: mode === id ? 'var(--series-1)' : 'var(--border-hairline)',
              color: mode === id ? 'var(--series-1)' : 'var(--text-secondary)',
              background: 'transparent',
            }}
            aria-pressed={mode === id}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          {mode === 'stacked' ? (
            <BarChart data={data.rows} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--gridline)" vertical={false} />
              <XAxis
                dataKey="label"
                // interval=0: todos los meses visibles, si no recharts omite etiquetas
                // por espacio y esos meses quedarían sin poder pulsarse.
                interval={0}
                tick={<MonthTick rows={data.rows} selectedMonth={selectedMonth} onToggleMonth={toggleMonth} />}
                stroke="var(--gridline)"
                tickLine={false}
              />
              <YAxis tick={axisStyle} stroke="var(--gridline)" tickLine={false} tickFormatter={euroTick} width={44} />
              <Tooltip
                // Sin pointerEvents:none el rectángulo del cursor tapa las barras y se come el clic.
                cursor={{ fill: 'var(--gridline)', opacity: 0.35, pointerEvents: 'none' }}
                content={<ChartTooltip series={data.series} />}
              />
              {data.series.map((s) => (
                <Bar
                  key={s.categoryId}
                  dataKey={s.categoryId}
                  stackId="gasto"
                  fill={s.color}
                  name={s.name}
                >
                  {/* El onClick va en cada Cell: en recharts 3 el de <Bar> no llega al SVG. */}
                  {data.rows.map((row) => (
                    <Cell
                      key={`${s.categoryId}-${row.month}`}
                      cursor={s.categoryId === REST_SERIES_ID ? 'default' : 'pointer'}
                      onClick={() => toggle(s.categoryId)}
                    />
                  ))}
                </Bar>
              ))}
            </BarChart>
          ) : (
            <LineChart data={data.rows} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--gridline)" vertical={false} />
              <XAxis
                dataKey="label"
                // interval=0: todos los meses visibles, si no recharts omite etiquetas
                // por espacio y esos meses quedarían sin poder pulsarse.
                interval={0}
                tick={<MonthTick rows={data.rows} selectedMonth={selectedMonth} onToggleMonth={toggleMonth} />}
                stroke="var(--gridline)"
                tickLine={false}
              />
              <YAxis tick={axisStyle} stroke="var(--gridline)" tickLine={false} tickFormatter={euroTick} width={44} />
              <Tooltip cursor={{ stroke: 'var(--gridline)' }} content={<ChartTooltip series={data.series} />} />
              {data.series.map((s) => (
                <Line
                  key={s.categoryId}
                  type="linear"
                  dataKey={s.categoryId}
                  stroke={s.color}
                  name={s.name}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {data.series.map((s) => {
          const active = selectedCategoryId === s.categoryId
          const isRest = s.categoryId === REST_SERIES_ID
          return (
            <li key={s.categoryId}>
              <button
                type="button"
                onClick={() => toggle(s.categoryId)}
                disabled={isRest}
                className="flex items-center gap-1.5 rounded px-1 py-0.5"
                style={{
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: active ? 600 : 400,
                  cursor: isRest ? 'default' : 'pointer',
                }}
                aria-pressed={active}
              >
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
