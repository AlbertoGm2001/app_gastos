import { useEffect, useRef, useState } from 'react'
import { buildPresets, customRange, type DateRange } from '../lib/dateRange'

interface Props {
  value: DateRange
  onChange: (range: DateRange) => void
  today: Date
}

export function DateRangeFilter({ value, onChange, today }: Props) {
  const [open, setOpen] = useState(false)
  const [customStart, setCustomStart] = useState(value.start)
  const [customEnd, setCustomEnd] = useState(value.end)
  const rootRef = useRef<HTMLDivElement>(null)
  const presets = buildPresets(today)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
        style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-primary)', background: 'var(--surface-1)' }}
      >
        <span>{value.label}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {value.start} → {value.end}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-10 mt-1 w-64 rounded-lg border shadow-lg"
          style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
        >
          <ul className="py-1">
            {presets.map((preset) => {
              const selected = value.presetId === preset.presetId
              return (
                <li key={preset.presetId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(preset)
                      setOpen(false)
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:opacity-80"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <span>{preset.label}</span>
                    {selected && (
                      <span aria-hidden style={{ fontWeight: 700, fontSize: 16, color: 'var(--series-1)' }}>
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="border-t p-3" style={{ borderColor: 'var(--border-hairline)' }}>
            <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Rango personalizado
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm"
                style={{ borderColor: 'var(--border-hairline)', background: 'transparent', color: 'var(--text-primary)' }}
              />
              <span style={{ color: 'var(--text-muted)' }}>→</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm"
                style={{ borderColor: 'var(--border-hairline)', background: 'transparent', color: 'var(--text-primary)' }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                onChange(customRange(customStart, customEnd))
                setOpen(false)
              }}
              className="mt-2 w-full rounded-md py-1.5 text-sm font-medium text-white"
              style={{ background: 'var(--series-1)' }}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
