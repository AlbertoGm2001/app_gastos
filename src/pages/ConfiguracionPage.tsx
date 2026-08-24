import { CategoryManager } from '../components/CategoryManager'
import type { Category } from '../types'

interface Props {
  categories: Category[]
  onCategoriesChange: (categories: Category[]) => void
  onResetData: () => void
}

export function ConfiguracionPage({ categories, onCategoriesChange, onResetData }: Props) {
  return (
    <div className="space-y-6">
      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Categorías de gasto
        </h2>
        <p className="mt-1 mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Estas son las categorías que se usan para clasificar tus movimientos y calcular el % de gasto. Las
          palabras clave alimentan hoy al clasificador simulado; cuando se conecte la IA real, seguirán sirviendo
          de contexto/entrenamiento.
        </p>
        <CategoryManager categories={categories} onChange={onCategoriesChange} />
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Conexión bancaria
        </h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Todavía no hay ninguna cuenta conectada. Mientras se implementa la integración (Open Banking / PSD2)
          con Santander, puedes importar tus movimientos reales exportando un Excel o CSV desde la banca online
          y subiéndolo en la pestaña <strong>Movimientos</strong>.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 cursor-not-allowed rounded-md border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-muted)' }}
        >
          Conectar cuenta Santander (próximamente)
        </button>
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Datos de ejemplo
        </h2>
        <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Restaura los movimientos y las categorías a sus valores por defecto. Perderás las reclasificaciones
          manuales y los cambios en categorías.
        </p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('¿Restablecer movimientos y categorías de ejemplo? Se perderán tus cambios.')) {
              onResetData()
            }
          }}
          className="rounded-md border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}
        >
          Restablecer datos de ejemplo
        </button>
      </section>
    </div>
  )
}
