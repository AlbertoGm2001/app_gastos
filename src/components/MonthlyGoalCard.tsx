import { formatEUR } from '../lib/aggregate'
import type { GoalProgress } from '../lib/goal'

interface Props {
  progress: GoalProgress
  monthLabel: string
  /** false cuando el mes ya terminó: no tiene sentido proyectar ni repartir lo que queda. */
  inProgress: boolean
}

function statusColor(progress: GoalProgress, inProgress: boolean): string {
  if (progress.overspent > 0) return 'var(--status-critical)'
  if (inProgress && progress.projected > progress.goal) return 'var(--status-warning)'
  return 'var(--status-good)'
}

export function MonthlyGoalCard({ progress, monthLabel, inProgress }: Props) {
  const color = statusColor(progress, inProgress)
  const barPct = Math.min(100, progress.pct)
  const projectedPct = progress.goal > 0 ? Math.min(100, (progress.projected / progress.goal) * 100) : 0

  const headline =
    progress.overspent > 0
      ? `Te has pasado ${formatEUR(progress.overspent)}`
      : `Te quedan ${formatEUR(progress.remaining)}`

  return (
    <section
      className="mb-6 rounded-xl border p-5"
      style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Objetivo de gasto · {monthLabel}
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {formatEUR(progress.spent)} de {formatEUR(progress.goal)} · {progress.pct.toFixed(0)}%
        </p>
      </div>

      <p className="mt-2 text-2xl font-semibold" style={{ color }}>
        {headline}
      </p>

      <div
        className="relative mt-3 h-3 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--gridline)' }}
        role="img"
        aria-label={`${progress.pct.toFixed(0)}% del objetivo mensual consumido`}
      >
        <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: color }} />
        {inProgress && projectedPct > barPct && (
          // Marca de proyección: dónde acabará el mes si se mantiene el ritmo.
          <div
            className="absolute top-0 h-full"
            style={{ left: `${projectedPct}%`, width: 2, background: 'var(--text-primary)', opacity: 0.55 }}
            title={`Proyección a fin de mes: ${formatEUR(progress.projected)}`}
          />
        )}
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div>
          <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Día del mes
          </dt>
          <dd style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {progress.daysElapsed} de {progress.daysInMonth}
          </dd>
        </div>
        {inProgress && (
          <>
            <div>
              <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Puedes gastar al día
              </dt>
              <dd style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {formatEUR(progress.dailyAllowance)}
              </dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Proyección a fin de mes
              </dt>
              <dd style={{ fontVariantNumeric: 'tabular-nums', color }}>
                {formatEUR(progress.projected)}
                {progress.projected > progress.goal && (
                  <span className="ml-1 text-xs">
                    (+{formatEUR(progress.projected - progress.goal)} sobre el objetivo)
                  </span>
                )}
              </dd>
            </div>
          </>
        )}
      </dl>
    </section>
  )
}
