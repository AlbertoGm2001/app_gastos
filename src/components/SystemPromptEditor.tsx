import { useState } from 'react'
import { DEFAULT_SYSTEM_PROMPT, parsePromptRules } from '../lib/systemPrompt'
import type { Category } from '../types'

interface Props {
  value: string
  categories: Category[]
  onChange: (prompt: string) => void
}

export function SystemPromptEditor({ value, categories, onChange }: Props) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)

  // Si el prompt cambia fuera del editor (restablecer datos), refrescamos el borrador.
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }

  const rules = parsePromptRules(draft, categories)
  const dirty = draft !== value
  const ruleLines = draft.split('\n').filter((l) => /^\s*-\s*.+->/.test(l)).length
  const ignored = ruleLines - rules.length

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={16}
        spellCheck={false}
        className="w-full rounded border px-3 py-2 font-mono text-xs"
        style={{
          borderColor: 'var(--border-hairline)',
          background: 'transparent',
          color: 'var(--text-primary)',
          lineHeight: 1.6,
        }}
        aria-label="System prompt de categorización"
      />

      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        {rules.length} regla{rules.length === 1 ? '' : 's'} activa{rules.length === 1 ? '' : 's'}
        {ignored > 0 && (
          <span style={{ color: 'var(--status-warning)' }}>
            {' '}· {ignored} línea{ignored === 1 ? '' : 's'} con formato de regla apunta{ignored === 1 ? '' : 'n'} a
            una categoría que no existe y se ignora{ignored === 1 ? '' : 'n'}
          </span>
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(draft)}
          disabled={!dirty}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--series-1)' }}
        >
          Guardar y reclasificar
        </button>
        <button
          type="button"
          onClick={() => setDraft(value)}
          disabled={!dirty}
          className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-secondary)' }}
        >
          Descartar cambios
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(DEFAULT_SYSTEM_PROMPT)
            onChange(DEFAULT_SYSTEM_PROMPT)
          }}
          className="rounded-md border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-secondary)' }}
        >
          Restaurar por defecto
        </button>
      </div>
    </div>
  )
}
