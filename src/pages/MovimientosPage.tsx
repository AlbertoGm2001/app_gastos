import { ImportTransactions } from '../components/ImportTransactions'
import { TransactionsList } from '../components/TransactionsList'
import type { Category, CategorizedTransaction, Transaction } from '../types'

interface Props {
  transactions: CategorizedTransaction[]
  allTransactions: Transaction[]
  categories: Category[]
  onReassign: (transactionId: string, categoryId: string) => void
  onImport: (transactions: Transaction[]) => void
  initialCategoryFilter?: string
  /** Umbral de gasto relevante, para el filtro de movimientos significativos. */
  relevantThreshold: number
}

export function MovimientosPage({
  transactions,
  allTransactions,
  categories,
  onReassign,
  onImport,
  initialCategoryFilter,
  relevantThreshold,
}: Props) {
  return (
    <div className="space-y-6">
      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Importar movimientos
        </h2>
        <ImportTransactions existingTransactions={allTransactions} onImport={onImport} />
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Movimientos
        </h2>
        <TransactionsList
          transactions={transactions}
          categories={categories}
          onReassign={onReassign}
          initialCategoryFilter={initialCategoryFilter}
          relevantThreshold={relevantThreshold}
        />
      </section>
    </div>
  )
}
