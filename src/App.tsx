import { useEffect, useMemo, useState } from 'react'
import { DateRangeFilter } from './components/DateRangeFilter'
import { Sidebar, type PageId } from './components/Sidebar'
import { useUserState } from './hooks/useUserState'
import { daysInRange, filterByRange } from './lib/aggregate'
import { fetchStoredTransactions, importStatementTransactions } from './lib/bankSync'
import { buildDefaultCategories } from './lib/categories'
import { DEFAULT_MONTHLY_GOAL, DEFAULT_RELEVANT_THRESHOLD } from './lib/goal'
import { DEFAULT_SYSTEM_PROMPT } from './lib/systemPrompt'
import { categorizeTransactions } from './lib/categorize'
import { buildPresets } from './lib/dateRange'
import { tripsAsCategories } from './lib/trips'
import { ConfiguracionPage } from './pages/ConfiguracionPage'
import { DashboardPage } from './pages/DashboardPage'
import { MovimientosPage } from './pages/MovimientosPage'
import { ViajesPage } from './pages/ViajesPage'
import { UNCATEGORIZED_ID } from './types'
import type { Transaction } from './types'

const todayIso = (): string => new Date().toISOString().slice(0, 10)

/**
 * Último día con movimientos: ancla los presets de fecha a los datos reales. Sin
 * movimientos todavía (primer arranque, o base de datos caída) cae en la fecha de hoy.
 */
function lastDateOf(transactions: Transaction[]): string {
  return transactions.reduce((max, t) => (t.date > max ? t.date : max), transactions[0]?.date ?? todayIso())
}

function firstDateOf(transactions: Transaction[]): string {
  return transactions.reduce((min, t) => (t.date < min ? t.date : min), transactions[0]?.date ?? todayIso())
}

const PAGE_TITLES: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Panel', subtitle: 'Reparto del gasto por categoría en el periodo seleccionado.' },
  movimientos: { title: 'Movimientos', subtitle: 'Detalle de tus movimientos y categoría asignada.' },
  viajes: {
    title: 'Viajes',
    subtitle: 'Da de alta un viaje por fechas y sus movimientos se agrupan solos.',
  },
  configuracion: {
    title: 'Configuración',
    subtitle: 'Categorías, presupuesto de gastos fijos, conexión bancaria y datos de la app.',
  },
}

function App() {
  const [page, setPage] = useState<PageId>('dashboard')
  // Todo el estado del usuario vive en Postgres (ver src/lib/userState.ts): es el único
  // dato irrecuperable de la app y en localStorage estaba atado al origen del navegador.
  const { state, status: stateStatus, error: stateError, update } = useUserState()
  const { trips, categories, monthlyGoal, relevantThreshold, systemPrompt, manualCategories } = state
  const setTrips = update('trips')
  const setCategories = update('categories')
  const setMonthlyGoal = update('monthlyGoal')
  const setRelevantThreshold = update('relevantThreshold')
  const setSystemPrompt = update('systemPrompt')

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [dataStatus, setDataStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [dataError, setDataError] = useState<string | null>(null)
  // Filtro con el que abrir Movimientos al llegar desde la alerta del Panel.
  const [movimientosFilter, setMovimientosFilter] = useState('')
  const lastDate = useMemo(() => lastDateOf(transactions), [transactions])
  const firstDate = useMemo(() => firstDateOf(transactions), [transactions])
  const today = useMemo(() => new Date(`${lastDate}T00:00:00`), [lastDate])
  const [range, setRange] = useState(() => buildPresets(new Date())[2]) // últimos 30 días
  // Mientras el usuario no toque el filtro, el rango se re-ancla a los datos que lleguen
  // de la base de datos; después manda su elección.
  const [rangePinned, setRangePinned] = useState(false)

  /**
   * La base de datos es la fuente de verdad, sin fusión con nada: los movimientos salen de
   * `bank_transactions` y las reclasificaciones manuales de `transaction_categories`, que
   * se aplican encima en `withManualCategories`.
   */
  useEffect(() => {
    let alive = true
    fetchStoredTransactions()
      .then((stored) => {
        if (!alive) return
        setTransactions(stored)
        setDataStatus('ready')
        if (!rangePinned && stored.length > 0) {
          setRange(buildPresets(new Date(`${lastDateOf(stored)}T00:00:00`))[2])
        }
      })
      .catch((error: Error) => {
        if (!alive) return
        setDataError(error.message)
        setDataStatus('error')
      })
    return () => {
      alive = false
    }
    // Solo en el arranque: las sincronizaciones posteriores entran por applySynced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Los viajes se comportan como categorías más: se concatenan para que panel,
  // gráficos y desplegables los traten igual que a las demás.
  const allCategories = useMemo(() => [...categories, ...tripsAsCategories(trips)], [categories, trips])

  // Las reclasificaciones manuales están en su propia tabla, no pegadas al movimiento: la
  // sincronización reemplaza tramos enteros de `bank_transactions` y se las llevaría.
  const withManualCategories = useMemo(
    () =>
      transactions.map((t) =>
        manualCategories[t.id] ? { ...t, manualCategoryId: manualCategories[t.id] } : t,
      ),
    [transactions, manualCategories],
  )
  const categorized = useMemo(
    () => categorizeTransactions(withManualCategories, categories, systemPrompt, trips),
    [withManualCategories, categories, systemPrompt, trips],
  )
  const inRange = useMemo(() => filterByRange(categorized, range.start, range.end), [categorized, range])
  const days = useMemo(() => daysInRange(range.start, range.end), [range])

  function reassign(transactionId: string, categoryId: string) {
    update('manualCategories')((previous) => ({ ...previous, [transactionId]: categoryId }))
  }

  /**
   * Importación manual de un .xls desde el navegador. Va a la base de datos como movimientos
   * de extracto, no a memoria: antes vivían solo en localStorage y se perdían al recargar o
   * al cambiar de origen. `npm run db:import` sigue siendo el camino principal.
   */
  function importTransactions(imported: Transaction[]) {
    void importStatementTransactions(imported)
      .then(setTransactions)
      .catch((error: Error) => setDataError(error.message))
  }

  /** Movimientos que llegan de la base de datos tras sincronizar con el banco. */
  function applySynced(synced: Transaction[]) {
    setTransactions(synced)
  }

  /**
   * Restablece la clasificación: categorías, system prompt y ajustes vuelven a sus
   * valores por defecto y se descartan las reclasificaciones manuales.
   *
   * **Los viajes no se tocan.** Antes también se borraban, sin que el diálogo lo dijera,
   * y son el dato más laborioso de rehacer: se dan de alta a mano por fechas y no se
   * pueden regenerar desde la base de datos ni desde el extracto. Para borrarlos está la
   * pestaña Viajes, donde se ve lo que se borra.
   */
  function resetData() {
    setCategories(buildDefaultCategories())
    // Los movimientos no se tocan: son datos de la base de datos, no ajustes. Lo que se
    // descarta son las reclasificaciones manuales y la configuración.
    update('manualCategories')({})
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
    setMonthlyGoal(DEFAULT_MONTHLY_GOAL)
    setRelevantThreshold(DEFAULT_RELEVANT_THRESHOLD)
  }

  const { title, subtitle } = PAGE_TITLES[page]
  const showDateFilter = page === 'dashboard' || page === 'movimientos'
  /**
   * Las páginas no se montan hasta que la primera carga termina: el Panel inicializa su
   * mes seleccionado a partir de `today`, y si montara con la lista vacía se anclaría al
   * mes en curso —que aún no tiene movimientos— en vez de al último mes con datos.
   */
  const showPages = dataStatus !== 'loading' && stateStatus !== 'loading'

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
          {(dataStatus === 'loading' || stateStatus === 'loading') && 'Cargando datos de la base de datos…'}
          {stateStatus === 'error' && (
            <span style={{ color: 'var(--status-critical)' }}>
              No se ha podido leer tu configuración (viajes, categorías): {stateError}. Los cambios que hagas
              ahora no se guardarán.
            </span>
          )}
          {dataStatus === 'error' && (
            <span style={{ color: 'var(--status-critical)' }}>
              No se han podido leer los movimientos: {dataError}. ¿Está arrancada la base de datos?{' '}
              <code>npm run db:up</code>
            </span>
          )}
          {dataStatus === 'ready' && transactions.length === 0 && (
            <>
              Todavía no hay movimientos. Conecta el banco en{' '}
              <strong>Configuración → Conexión bancaria</strong>, o importa un extracto con{' '}
              <code>node scripts/import-statement.mjs &lt;extracto.xls&gt;</code>.
            </>
          )}
          {dataStatus === 'ready' && transactions.length > 0 && (
            <>
              {transactions.length} movimientos, del {firstDate} al {lastDate}. Para traer los nuevos del banco,
              usa <strong>Configuración → Conexión bancaria → Sincronizar movimientos</strong>. La clasificación
              se hace hoy por palabras clave en <code>src/lib/categorize.ts</code>, punto de sustitución para la
              IA.
            </>
          )}
        </div>

        {showDateFilter && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <DateRangeFilter
              value={range}
              onChange={(next) => {
                setRangePinned(true)
                setRange(next)
              }}
              today={today}
              firstDate={firstDate}
            />
          </div>
        )}

        {showPages && page === 'dashboard' && (
          <DashboardPage
            range={range}
            days={days}
            transactions={inRange}
            allTransactions={categorized}
            categories={allCategories}
            monthlyGoal={monthlyGoal}
            today={today}
            relevantThreshold={relevantThreshold}
            onReviewUncategorized={() => {
              setMovimientosFilter(UNCATEGORIZED_ID)
              setPage('movimientos')
            }}
            lastDate={lastDate}
            onSynced={applySynced}
          />
        )}

        {showPages && page === 'movimientos' && (
          <MovimientosPage
            transactions={inRange}
            allTransactions={transactions}
            categories={allCategories}
            onReassign={reassign}
            onImport={importTransactions}
            initialCategoryFilter={movimientosFilter}
            relevantThreshold={relevantThreshold}
          />
        )}

        {showPages && page === 'viajes' && (
          <ViajesPage trips={trips} transactions={categorized} onChange={setTrips} />
        )}

        {showPages && page === 'configuracion' && (
          <ConfiguracionPage
            categories={categories}
            onCategoriesChange={setCategories}
            systemPrompt={systemPrompt}
            onSystemPromptChange={setSystemPrompt}
            monthlyGoal={monthlyGoal}
            onMonthlyGoalChange={setMonthlyGoal}
            relevantThreshold={relevantThreshold}
            onRelevantThresholdChange={setRelevantThreshold}
            onSynced={applySynced}
            onResetData={resetData}
          />
        )}
      </main>
    </div>
  )
}

export default App
