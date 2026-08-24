import { useMemo, useState } from 'react'
import { DateRangeFilter } from './components/DateRangeFilter'
import { Sidebar, type PageId } from './components/Sidebar'
import { generateMockTransactions } from './data/mockTransactions'
import { useLocalStorage } from './hooks/useLocalStorage'
import { aggregateByCategory, filterByRange } from './lib/aggregate'
import { buildDefaultCategories } from './lib/categories'
import { categorizeTransactions } from './lib/categorize'
import { buildPresets } from './lib/dateRange'
import { ConfiguracionPage } from './pages/ConfiguracionPage'
import { DashboardPage } from './pages/DashboardPage'
import { MovimientosPage } from './pages/MovimientosPage'
import type { Category, Transaction } from './types'

const TODAY = new Date('2026-08-24')

const PAGE_TITLES: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Panel', subtitle: 'Reparto del gasto por categoría en el periodo seleccionado.' },
  movimientos: { title: 'Movimientos', subtitle: 'Detalle de tus movimientos y categoría asignada.' },
  configuracion: { title: 'Configuración', subtitle: 'Categorías, conexión bancaria y datos de la app.' },
}

function App() {
  const [page, setPage] = useState<PageId>('dashboard')
  const [categories, setCategories] = useLocalStorage<Category[]>('gastos.categories', buildDefaultCategories)
  const [transactions, setTransactions] = useLocalStorage<Transaction[]>('gastos.transactions', generateMockTransactions)
  const [range, setRange] = useState(buildPresets(TODAY)[2]) // últimos 30 días

  const categorized = useMemo(() => categorizeTransactions(transactions, categories), [transactions, categories])
  const inRange = useMemo(() => filterByRange(categorized, range.start, range.end), [categorized, range])
  const { totals, grandTotal } = useMemo(() => aggregateByCategory(inRange, categories), [inRange, categories])
  const expenseCount = inRange.filter((t) => t.amount < 0).length

  function reassign(transactionId: string, categoryId: string) {
    setTransactions((prev) => prev.map((t) => (t.id === transactionId ? { ...t, manualCategoryId: categoryId } : t)))
  }

  function importTransactions(imported: Transaction[]) {
    setTransactions((prev) => [...prev, ...imported].sort((a, b) => (a.date < b.date ? 1 : -1)))
  }

  function resetData() {
    setCategories(buildDefaultCategories())
    setTransactions(generateMockTransactions())
  }

  const { title, subtitle } = PAGE_TITLES[page]
  const showDateFilter = page === 'dashboard' || page === 'movimientos'

  return (
    <div className="flex min-h-screen flex-col sm:flex-row" style={{ background: 'var(--surface-page)' }}>
      <Sidebar active={page} onNavigate={setPage} />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        </header>

        <div
          className="mb-6 rounded-lg border px-4 py-3 text-xs"
          style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}
        >
          Datos de ejemplo — la conexión real con Santander (PSD2/Open Banking) y la clasificación por IA todavía
          no están conectadas. El clasificador actual es una simulación por palabras clave en{' '}
          <code>src/lib/categorize.ts</code>, pensada como punto de sustitución cuando llegue el backend.
        </div>

        {showDateFilter && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <DateRangeFilter value={range} onChange={setRange} today={TODAY} />
          </div>
        )}

        {page === 'dashboard' && (
          <DashboardPage range={range} totals={totals} grandTotal={grandTotal} expenseCount={expenseCount} />
        )}

        {page === 'movimientos' && (
          <MovimientosPage
            transactions={inRange}
            allTransactions={transactions}
            categories={categories}
            onReassign={reassign}
            onImport={importTransactions}
          />
        )}

        {page === 'configuracion' && (
          <ConfiguracionPage categories={categories} onCategoriesChange={setCategories} onResetData={resetData} />
        )}
      </main>
    </div>
  )
}

export default App
