import { useState } from 'react'
import { formatEUR } from '../lib/aggregate'
import { isSignificant } from '../lib/goal'
import { UNCATEGORIZED_ID } from '../types'
import type { Category, CategorizedTransaction } from '../types'

interface Props {
  transactions: CategorizedTransaction[]
  categories: Category[]
  onReassign: (transactionId: string, categoryId: string) => void
  /** Filtro de categoría con el que abrir la tabla (al llegar desde una alerta). */
  initialCategoryFilter?: string
  /**
   * Umbral de relevancia en euros (Configuración → `gastos.relevantThreshold`). Es el
   * mismo que usa el aviso del Panel, así que "significativo" significa lo mismo en los
   * dos sitios.
   */
  relevantThreshold: number
}

type SortKey = 'date' | 'amount'
type SortDir = 'asc' | 'desc'
type Flow = 'all' | 'expenses' | 'income'

const LIMIT = 40

const FLOW_OPTIONS: Array<[Flow, string]> = [
  ['all', 'Todos'],
  ['expenses', 'Gastos'],
  ['income', 'Ingresos'],
]

interface SortHeaderProps {
  label: string
  sortBy: SortKey
  align?: 'right'
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}

function SortHeader({ label, sortBy, align, sortKey, sortDir, onSort }: SortHeaderProps) {
  const active = sortKey === sortBy
  return (
    <th className={`py-2 ${align === 'right' ? 'pr-6 text-right' : 'pr-4'} font-medium`}>
      <button
        type="button"
        onClick={() => onSort(sortBy)}
        className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}
        style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 500 }}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        <span aria-hidden style={{ opacity: active ? 1 : 0.35 }}>
          {active && sortDir === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  )
}

export function TransactionsList({
  transactions,
  categories,
  onReassign,
  initialCategoryFilter = '',
  relevantThreshold,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [flow, setFlow] = useState<Flow>('all')
  const [onlySignificant, setOnlySignificant] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>(initialCategoryFilter)
  const [lastInitial, setLastInitial] = useState(initialCategoryFilter)

  // Si se vuelve a entrar desde la alerta, el filtro se reaplica.
  if (initialCategoryFilter !== lastInitial) {
    setLastInitial(initialCategoryFilter)
    setCategoryFilter(initialCategoryFilter)
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    // Por defecto, lo más útil: fechas de la más reciente, importes del más alto.
    setSortDir('desc')
  }

  // Ámbito: categoría y relevancia. Los contadores de gastos/ingresos lo describen, así que
  // se calculan aquí y no después de aplicar el flujo, que es justo lo que esos botones filtran.
  const inScope = transactions.filter((t) => {
    if (categoryFilter && t.categoryId !== categoryFilter) return false
    if (onlySignificant && !isSignificant(t.amount, relevantThreshold)) return false
    return true
  })
  const expenseCount = inScope.filter((t) => t.amount < 0).length
  const incomeCount = inScope.length - expenseCount

  const all = inScope.filter((t) => {
    if (flow === 'expenses') return t.amount < 0
    if (flow === 'income') return t.amount > 0
    return true
  })

  const sorted = [...all].sort((a, b) => {
    const factor = sortDir === 'asc' ? 1 : -1
    // Por magnitud, no por el número con signo: ordenar por importe busca los
    // movimientos más grandes, sean cobros o pagos.
    if (sortKey === 'amount') return factor * (Math.abs(a.amount) - Math.abs(b.amount))
    if (a.date === b.date) return 0
    return factor * (a.date < b.date ? -1 : 1)
  })
  const visible = sorted.slice(0, LIMIT)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {FLOW_OPTIONS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFlow(id)}
              className="rounded-md border px-2.5 py-1 text-xs font-medium"
              style={{
                borderColor: flow === id ? 'var(--series-1)' : 'var(--border-hairline)',
                color: flow === id ? 'var(--series-1)' : 'var(--text-secondary)',
                background: 'transparent',
              }}
              aria-pressed={flow === id}
            >
              {label}
            </button>
          ))}
        </div>
        {/*
          Mismo umbral que el aviso del Panel (Configuración → gasto relevante), así que la
          etiqueta lleva el valor real en vez de un 30 fijo: si el usuario lo cambia, el
          botón lo refleja.
        */}
        <button
          type="button"
          onClick={() => setOnlySignificant((previous) => !previous)}
          className="rounded-md border px-2.5 py-1 text-xs font-medium"
          style={{
            borderColor: onlySignificant ? 'var(--series-1)' : 'var(--border-hairline)',
            color: onlySignificant ? 'var(--series-1)' : 'var(--text-secondary)',
            background: 'transparent',
          }}
          aria-pressed={onlySignificant}
          title={`Solo movimientos de más de ${relevantThreshold} € en magnitud, cargos o abonos`}
        >
          Significativos &gt;{relevantThreshold} €
        </button>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border px-2 py-1 text-xs"
          style={{
            borderColor: 'var(--border-hairline)',
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
          }}
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          <option value={UNCATEGORIZED_ID}>Sin categorizar</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {expenseCount} gasto{expenseCount === 1 ? '' : 's'} · {incomeCount} ingreso
          {incomeCount === 1 ? '' : 's'}
          {categoryFilter ? ' en esta categoría' : ' en el periodo'}
          {onlySignificant && ` por encima de ${relevantThreshold} €`}
        </span>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ color: 'var(--text-primary)' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            <SortHeader label="Fecha" sortBy="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th className="py-2 pr-4 font-medium">Comercio</th>
            <SortHeader
              label="Importe"
              sortBy="amount"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <th className="py-2 pr-4 font-medium">Categoría</th>
            <th className="py-2 font-medium">Origen</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((tx) => (
            <tr key={tx.id} className="border-t" style={{ borderColor: 'var(--gridline)' }}>
              <td className="py-2 pr-4 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                {tx.date}
              </td>
              <td className="py-2 pr-4">{tx.merchant}</td>
              <td
                className="py-2 pr-6 text-right whitespace-nowrap"
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: tx.amount > 0 ? 'var(--status-good)' : undefined,
                }}
              >
                {tx.amount > 0 ? `+${formatEUR(tx.amount)}` : formatEUR(-tx.amount)}
              </td>
              <td className="py-2 pr-4">
                <select
                  value={tx.categoryId}
                  onChange={(e) => onReassign(tx.id, e.target.value)}
                  className="rounded border px-2 py-1 text-xs"
                  // Fondo explícito: con background transparent el desplegable
                  // desplegado pinta las opciones blanco sobre blanco.
                  style={{
                    borderColor: 'var(--border-hairline)',
                    background: 'var(--surface-1)',
                    color: 'var(--text-primary)',
                  }}
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
      {all.length > LIMIT && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Mostrando {LIMIT} de {all.length} movimientos, según el filtro y el orden seleccionados.
        </p>
      )}
      </div>
    </div>
  )
}
