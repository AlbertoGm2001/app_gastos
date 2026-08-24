interface Props {
  label: string
  value: string
  hint?: string
}

export function StatTile({ label, value, hint }: Props) {
  return (
    <div
      className="flex-1 rounded-xl border p-4"
      style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
    >
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}
