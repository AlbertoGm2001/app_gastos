import { useMemo, useState } from 'react'
import { CategoryBudgetChart } from '../components/CategoryBudgetChart'
import { CategoryPieChart } from '../components/CategoryPieChart'
import { MonthlyGoalCard } from '../components/MonthlyGoalCard'
import { UncategorizedAlert } from '../components/UncategorizedAlert'
import { MonthlyTrendChart } from '../components/MonthlyTrendChart'
import { StatTile } from '../components/StatTile'
import { SyncMovementsCard } from '../components/SyncMovementsCard'
import { TopTransactions } from '../components/TopTransactions'
import {
  aggregateByCategory,
  daysInRange,
  excludeNonSpending,
  formatEUR,
  formatMonthLong,
  monthBounds,
  monthlyByCategory,
  sumNonSpending,
} from '../lib/aggregate'
import type { DateRange } from '../lib/dateRange'
import { goalProgress, significantUncategorized } from '../lib/goal'
import { UNCATEGORIZED_ID } from '../types'
import type { Category, CategorizedTransaction, Transaction } from '../types'

interface Props {
  range: DateRange
  days: number
  /** Movimientos del periodo seleccionado, ya categorizados. */
  transactions: CategorizedTransaction[]
  /** Todo el histórico categorizado: alimenta la evolución mensual. */
  allTransactions: CategorizedTransaction[]
  categories: Category[]
  /** Objetivo de gasto mensual configurado por el usuario. */
  monthlyGoal: number
  /** Fecha de referencia: último día con datos. */
  today: Date
  /** Importe a partir del cual un gasto sin clasificar merece aviso. */
  relevantThreshold: number
  /** Lleva a Movimientos con el filtro de sin clasificar puesto. */
  onReviewUncategorized: () => void
  /** Último día con movimientos guardados (ISO), para la tarjeta de sincronización. */
  lastDate: string
  /** Movimientos que devuelve la base de datos tras sincronizar con el banco. */
  onSynced: (transactions: Transaction[]) => void
}

function isoMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function DashboardPage({
  range,
  days,
  transactions,
  allTransactions,
  categories,
  monthlyGoal,
  today,
  relevantThreshold,
  onReviewUncategorized,
  lastDate,
  onSynced,
}: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  // El panel arranca en el mes en curso: su razón de ser es el objetivo mensual.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(() => isoMonth(today))
  const [topN, setTopN] = useState(10)

  // Inversión y ahorro salen del panel de gasto: se muestran aparte, en su tarjeta.
  const spendableHistory = useMemo(
    () => excludeNonSpending(allTransactions, categories),
    [allTransactions, categories],
  )

  // Al elegir un mes en el gráfico, ese mes sustituye al filtro de fechas: el
  // gráfico mensual muestra todo el histórico, así que su selección también.
  const inScope = useMemo(
    () => (selectedMonth ? allTransactions.filter((t) => t.date.startsWith(selectedMonth)) : transactions),
    [allTransactions, transactions, selectedMonth],
  )
  const spendable = useMemo(() => excludeNonSpending(inScope, categories), [inScope, categories])
  const investedTotal = useMemo(() => sumNonSpending(inScope, categories), [inScope, categories])

  // El presupuesto fijo se prorratea sobre los días que realmente abarca el ámbito.
  const lastDataDate = useMemo(
    () => allTransactions.reduce((max, t) => (t.date > max ? t.date : max), ''),
    [allTransactions],
  )
  const scopeDays = useMemo(() => {
    if (!selectedMonth) return days
    const { start, end } = monthBounds(selectedMonth)
    return daysInRange(start, lastDataDate && lastDataDate < end ? lastDataDate : end)
  }, [selectedMonth, days, lastDataDate])
  const scopeLabel = selectedMonth ? formatMonthLong(selectedMonth) : `${range.start} → ${range.end}`

  // El reparto por categoría se calcula siempre sobre todo el periodo: es el
  // mando del filtro, así que no puede encogerse al pulsar una porción.
  const { totals, grandTotal } = useMemo(
    () => aggregateByCategory(spendable, categories, scopeDays),
    [spendable, categories, scopeDays],
  )

  const selected = selectedCategoryId ? totals.find((t) => t.categoryId === selectedCategoryId) : undefined

  // El resto del panel (totales, evolución, tabla y top N) sí obedece al filtro.
  const filtered = useMemo(
    () => (selectedCategoryId ? spendable.filter((t) => t.categoryId === selectedCategoryId) : spendable),
    [spendable, selectedCategoryId],
  )
  const filteredHistory = useMemo(
    () =>
      selectedCategoryId
        ? spendableHistory.filter((t) => t.categoryId === selectedCategoryId)
        : spendableHistory,
    [spendableHistory, selectedCategoryId],
  )

  const filteredSummary = useMemo(
    () => aggregateByCategory(filtered, categories, scopeDays),
    [filtered, categories, scopeDays],
  )
  const monthly = useMemo(() => monthlyByCategory(filteredHistory, categories), [filteredHistory, categories])

  // Progreso contra el objetivo: siempre sobre el mes completo, sin filtro de categoría.
  const monthSpend = useMemo(
    () => aggregateByCategory(spendable, categories, scopeDays).grandTotal,
    [spendable, categories, scopeDays],
  )
  const progress = useMemo(() => {
    if (!selectedMonth) return null
    const { start, end } = monthBounds(selectedMonth)
    const daysInMonth = daysInRange(start, end)
    return goalProgress(monthlyGoal, monthSpend, Math.min(scopeDays, daysInMonth), daysInMonth)
  }, [selectedMonth, monthlyGoal, monthSpend, scopeDays])
  const monthInProgress = selectedMonth === isoMonth(today)

  // El aviso mira el ámbito completo, sin filtro de categoría: si filtras por una,
  // los sin clasificar desaparecerían justo cuando más conviene verlos.
  const pending = useMemo(
    () => significantUncategorized(inScope, relevantThreshold),
    [inScope, relevantThreshold],
  )
  const colorByCategoryId = useMemo(() => new Map(totals.map((t) => [t.categoryId, t.color])), [totals])

  const { fixedTotal, extraTotal } = filteredSummary
  const shownTotal = filteredSummary.grandTotal
  const fixedPct = shownTotal > 0 ? (fixedTotal / shownTotal) * 100 : 0
  const extraPct = shownTotal > 0 ? (extraTotal / shownTotal) * 100 : 0
  const selectedName =
    selected?.name ?? (selectedCategoryId === UNCATEGORIZED_ID ? 'Sin categorizar' : undefined)

  return (
    <div>
      <div className="mb-4">
        <SyncMovementsCard lastDate={lastDate} onSynced={onSynced} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="text-xs" style={{ color: 'var(--text-muted)' }} htmlFor="panel-category">
          Categoría
        </label>
        <select
          id="panel-category"
          value={selectedCategoryId ?? ''}
          onChange={(e) => setSelectedCategoryId(e.target.value || null)}
          className="rounded border px-2 py-1 text-xs"
          style={{
            borderColor: 'var(--border-hairline)',
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="">Todas las categorías</option>
          {/* Solo las que tienen gasto neto en el periodo: el resto dejaría el panel vacío. */}
          {totals.map((t) => (
            <option key={t.categoryId} value={t.categoryId}>
              {t.name}
            </option>
          ))}
        </select>

        {(selectedCategoryId || selectedMonth) && (
          <>
          <span style={{ color: 'var(--text-secondary)' }}>Filtrando por</span>
          {selectedCategoryId && (
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
              style={{ borderColor: 'var(--series-1)', color: 'var(--series-1)' }}
            >
              {selectedName ?? 'Categoría'}
              <span aria-hidden>✕</span>
              <span className="sr-only">Quitar filtro de categoría</span>
            </button>
          )}
          {selectedMonth && (
            <button
              type="button"
              onClick={() => setSelectedMonth(null)}
              className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
              style={{ borderColor: 'var(--series-1)', color: 'var(--series-1)' }}
            >
              {formatMonthLong(selectedMonth)}
              <span aria-hidden>✕</span>
              <span className="sr-only">Quitar filtro de mes</span>
            </button>
          )}
          {selectedMonth && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              el mes seleccionado sustituye al filtro de fechas
            </span>
          )}
          </>
        )}
      </div>

      <UncategorizedAlert
        summary={pending}
        threshold={relevantThreshold}
        onReview={onReviewUncategorized}
      />

      {progress && selectedMonth && (
        <MonthlyGoalCard
          progress={progress}
          monthLabel={formatMonthLong(selectedMonth)}
          inProgress={monthInProgress}
        />
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <StatTile
          label={selectedCategoryId ? `Gastado en ${selectedName}` : 'Total gastado'}
          value={formatEUR(shownTotal)}
          hint={scopeLabel}
        />
        <StatTile label="Gasto fijo" value={formatEUR(fixedTotal)} hint={`${fixedPct.toFixed(1)}% del total`} />
        <StatTile
          label="Gasto extraordinario"
          value={formatEUR(extraTotal)}
          hint={`${extraPct.toFixed(1)}% del total`}
        />
        {investedTotal > 0 && !selectedCategoryId && (
          <StatTile
            label="Inversión y ahorro"
            value={formatEUR(investedTotal)}
            hint="No cuenta como gasto"
          />
        )}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section
          className="flex flex-col rounded-xl border p-5"
          style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Reparto del gasto por categoría
          </h2>
          <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Pulsa una porción o una categoría para filtrar el resto del panel.
          </p>
          <CategoryPieChart
            totals={totals}
            grandTotal={grandTotal}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
          />
        </section>

        <section
          className="flex flex-col rounded-xl border p-5"
          style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {selectedMonth ? 'Gasto por categoría frente a su límite' : 'Evolución mensual del gasto por categoría'}
          </h2>
          <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            {selectedMonth ? (
              <>
                {formatMonthLong(selectedMonth)} · quita el filtro de mes para volver a la evolución de todo el
                histórico.
              </>
            ) : (
              <>
                Todo el histórico del extracto, mes a mes — no depende del filtro de fechas de arriba. Pulsa un
                segmento para filtrar por categoría o el nombre de un mes para filtrar por ese mes.
              </>
            )}
          </p>
          {selectedMonth ? (
            <CategoryBudgetChart
              totals={totals}
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
            />
          ) : (
            <MonthlyTrendChart
              data={monthly}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
              selectedMonth={selectedMonth}
              onSelectMonth={setSelectedMonth}
            />
          )}
        </section>
      </div>

      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Mayores gastos del periodo
        </h2>
        <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          {scopeLabel}
        </p>
        <TopTransactions
          transactions={filtered}
          categories={categories}
          topN={topN}
          onTopNChange={setTopN}
          onSelectCategory={setSelectedCategoryId}
          selectedCategoryId={selectedCategoryId}
          colorByCategoryId={colorByCategoryId}
        />
      </section>
    </div>
  )
}
