import { useState } from 'react'
import { nextCategoryId } from '../lib/categories'
import { MAX_COLORED_CATEGORIES, colorForSlot } from '../lib/palette'
import type { Category } from '../types'

interface Props {
  categories: Category[]
  onChange: (categories: Category[]) => void
}

export function CategoryManager({ categories, onChange }: Props) {
  const [newName, setNewName] = useState('')

  function addCategory() {
    const name = newName.trim()
    if (!name) return
    const id = nextCategoryId(categories)
    const color = colorForSlot(categories.length)
    onChange([...categories, { id, name, color, keywords: [], fixedBudget: 0, excludeFromSpending: false }])
    setNewName('')
  }

  function removeCategory(id: string) {
    onChange(categories.filter((c) => c.id !== id))
  }

  function updateKeywords(id: string, raw: string) {
    const keywords = raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    onChange(categories.map((c) => (c.id === id ? { ...c, keywords } : c)))
  }

  function renameCategory(id: string, name: string) {
    onChange(categories.map((c) => (c.id === id ? { ...c, name } : c)))
  }

  function toggleExcluded(id: string, excludeFromSpending: boolean) {
    onChange(categories.map((c) => (c.id === id ? { ...c, excludeFromSpending } : c)))
  }

  function updateBudget(id: string, raw: string) {
    const parsed = Number(raw.replace(',', '.'))
    const fixedBudget = raw.trim() === '' || !Number.isFinite(parsed) || parsed < 0 ? 0 : parsed
    onChange(categories.map((c) => (c.id === id ? { ...c, fixedBudget } : c)))
  }

  return (
    <div className="space-y-3">
      {categories.length > MAX_COLORED_CATEGORIES && (
        <p className="text-xs" style={{ color: 'var(--status-warning)' }}>
          Los gráficos reservan {MAX_COLORED_CATEGORIES} colores para las categorías con más gasto; las
          demás comparten un gris neutro para mantener la paleta legible.
        </p>
      )}

      {categories.map((c, index) => (
        <div key={c.id} className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-2 h-3 w-3 shrink-0 rounded-sm"
            style={{ background: index < MAX_COLORED_CATEGORIES ? c.color : 'var(--text-muted)' }}
          />
          <div className="flex-1 space-y-1">
            <input
              value={c.name}
              onChange={(e) => renameCategory(c.id, e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm font-medium"
              style={{ borderColor: 'var(--border-hairline)', background: 'transparent', color: 'var(--text-primary)' }}
            />
            <div className="flex items-center gap-2">
              <label className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }} htmlFor={`budget-${c.id}`}>
                Gasto fijo
              </label>
              <input
                id={`budget-${c.id}`}
                type="number"
                min={0}
                step={5}
                value={c.fixedBudget ?? 0}
                onChange={(e) => updateBudget(c.id, e.target.value)}
                className="w-28 rounded border px-2 py-1 text-xs"
                style={{
                  borderColor: 'var(--border-hairline)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                € / mes
              </span>
              <label className="ml-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={c.excludeFromSpending ?? false}
                  onChange={(e) => toggleExcluded(c.id, e.target.checked)}
                />
                No contar como gasto
              </label>
            </div>
            <input
              value={c.keywords.join(', ')}
              onChange={(e) => updateKeywords(c.id, e.target.value)}
              placeholder="palabras clave separadas por coma (usadas por la clasificación automática)"
              className="w-full rounded border px-2 py-1 text-xs"
              style={{ borderColor: 'var(--border-hairline)', background: 'transparent', color: 'var(--text-secondary)' }}
            />
          </div>
          <button
            type="button"
            onClick={() => removeCategory(c.id)}
            className="mt-1 text-xs"
            style={{ color: 'var(--status-critical)' }}
            aria-label={`Eliminar categoría ${c.name}`}
          >
            Eliminar
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          placeholder="Nueva categoría"
          className="flex-1 rounded border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--border-hairline)', background: 'transparent', color: 'var(--text-primary)' }}
        />
        <button
          type="button"
          onClick={addCategory}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: 'var(--series-1)' }}
        >
          Añadir
        </button>
      </div>
    </div>
  )
}
