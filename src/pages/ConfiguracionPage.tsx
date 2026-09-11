import { formatEUR } from '../lib/aggregate'
import { totalFixedBudget } from '../lib/goal'
import { BankConnectionCard } from '../components/BankConnectionCard'
import { CategoryManager } from '../components/CategoryManager'
import { SystemPromptEditor } from '../components/SystemPromptEditor'
import type { Category, Transaction } from '../types'

interface Props {
  categories: Category[]
  onCategoriesChange: (categories: Category[]) => void
  systemPrompt: string
  onSystemPromptChange: (prompt: string) => void
  monthlyGoal: number
  onMonthlyGoalChange: (goal: number) => void
  relevantThreshold: number
  onRelevantThresholdChange: (threshold: number) => void
  /** Movimientos que llegan del banco tras sincronizar. */
  onSynced: (transactions: Transaction[]) => void
  onResetData: () => void
}

export function ConfiguracionPage({
  categories,
  onCategoriesChange,
  systemPrompt,
  onSystemPromptChange,
  monthlyGoal,
  onMonthlyGoalChange,
  relevantThreshold,
  onRelevantThresholdChange,
  onSynced,
  onResetData,
}: Props) {
  const fixedTotal = totalFixedBudget(categories)

  return (
    <div className="space-y-6">
      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Objetivo de gasto mensual
        </h2>
        <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Es el techo de gasto que te marcas cada mes. El Panel se organiza alrededor de él: cuánto llevas,
          cuánto te queda por día y a cuánto vas a cerrar el mes si sigues a este ritmo.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            step={50}
            value={monthlyGoal}
            onChange={(e) => {
              const parsed = Number(e.target.value)
              onMonthlyGoalChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
            }}
            className="w-36 rounded border px-2 py-1.5 text-sm"
            style={{
              borderColor: 'var(--border-hairline)',
              background: 'var(--surface-1)',
              color: 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
            aria-label="Objetivo de gasto mensual en euros"
          />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            € / mes
          </span>
        </div>

        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          La suma de los límites de gasto fijo por categoría es {formatEUR(fixedTotal)} al mes
          {fixedTotal > monthlyGoal && monthlyGoal > 0 && (
            <span style={{ color: 'var(--status-warning)' }}>
              {' '}— más que tu objetivo, así que cumplirlo exige quedarte por debajo de algún límite.
            </span>
          )}
          {fixedTotal <= monthlyGoal && (
            <>
              , lo que deja {formatEUR(monthlyGoal - fixedTotal)} de margen para gasto extraordinario.
            </>
          )}
        </p>
      </section>
      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Límite de gasto relevante
        </h2>
        <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          A partir de este importe, un movimiento se considera relevante. El Panel avisa cuando hay gastos o
          ingresos relevantes sin clasificar, porque son los que más distorsionan el gasto neto por categoría.
          Las nóminas no cuentan: al reconocerlas, el clasificador las manda a su propia categoría.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            step={5}
            value={relevantThreshold}
            onChange={(e) => {
              const parsed = Number(e.target.value)
              onRelevantThresholdChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
            }}
            className="w-28 rounded border px-2 py-1.5 text-sm"
            style={{
              borderColor: 'var(--border-hairline)',
              background: 'var(--surface-1)',
              color: 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
            aria-label="Límite de gasto relevante en euros"
          />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            €
          </span>
        </div>
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          System prompt de categorización
        </h2>
        <p className="mt-1 mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Este texto se lee <strong>antes</strong> de clasificar cada movimiento. Recoge el contexto sobre tu
          situación y las reglas que tienen prioridad sobre las palabras clave de las categorías.
        </p>
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Las líneas con el formato <code>- palabra, otra palabra -&gt; Nombre de categoría</code> se aplican hoy
          mismo al clasificador. El resto es contexto en prosa que viajará como system prompt cuando se conecte
          la IA. Al guardar se reclasifican todos los movimientos que no hayas corregido a mano.
        </p>
        <SystemPromptEditor value={systemPrompt} categories={categories} onChange={onSystemPromptChange} />
      </section>
      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Categorías y presupuesto de gasto fijo
        </h2>
        <p className="mt-1 mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Estas son las categorías que se usan para clasificar tus movimientos y calcular el % de gasto. Las
          palabras clave alimentan hoy al clasificador simulado; cuando se conecte la IA real, seguirán sirviendo
          de contexto/entrenamiento.
        </p>
        <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          El campo <strong>Gasto fijo</strong> es el importe mensual que das por descontado en esa categoría (el
          alquiler, la luz, la compra habitual…). En el Panel se prorratea a los días del periodo: lo que gastes
          por debajo de ese importe cuenta como <strong>gasto fijo</strong> y lo que lo supere, como{' '}
          <strong>gasto extraordinario</strong>. Déjalo en 0 si la categoría es siempre extraordinaria.
        </p>
        <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Marca <strong>No contar como gasto</strong> en las categorías que mueven dinero sin gastarlo
          (inversión, ahorro, traspasos a cuentas tuyas): sus movimientos quedan fuera de totales, reparto,
          evolución mensual y mayores gastos, y se resumen aparte en el Panel.
        </p>
        <CategoryManager categories={categories} onChange={onCategoriesChange} />
      </section>

      <BankConnectionCard onSynced={onSynced} />

      <section
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Restablecer datos
        </h2>
        <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Vuelve al extracto cargado con la app y a las categorías por defecto. Perderás las reclasificaciones
          manuales, los cambios en categorías, los presupuestos y los movimientos importados después.
        </p>
        <button
          type="button"
          onClick={() => {
            // El diálogo enumera exactamente lo que se pierde: antes decía solo
            // "movimientos y categorías" y además borraba los viajes sin avisar.
            if (
              window.confirm(
                'Se restablecerán las categorías por defecto, el system prompt, el objetivo mensual y el umbral, ' +
                  'y se perderán tus reclasificaciones manuales.\n\n' +
                  'Los movimientos se recargan de la base de datos y los viajes se conservan.\n\n' +
                  '¿Continuar?',
              )
            ) {
              onResetData()
            }
          }}
          className="rounded-md border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}
        >
          Restablecer datos
        </button>
      </section>
    </div>
  )
}
