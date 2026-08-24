import { MAX_COLORED_CATEGORIES, NEUTRAL_COLOR } from './palette'
import { UNCATEGORIZED_ID } from '../types'
import type { Category, CategorizedTransaction } from '../types'

export interface CategoryTotal {
  categoryId: string
  name: string
  color: string
  total: number
  count: number
  pct: number
}

const UNCATEGORIZED_LABEL = 'Sin categorizar'

export function filterByRange<T extends { date: string }>(items: T[], start: string, end: string): T[] {
  return items.filter((item) => item.date >= start && item.date <= end)
}

export function aggregateByCategory(
  transactions: CategorizedTransaction[],
  categories: Category[],
): { totals: CategoryTotal[]; grandTotal: number } {
  const expenses = transactions.filter((t) => t.amount < 0)
  const byId = new Map<string, { total: number; count: number }>()

  for (const tx of expenses) {
    const key = tx.categoryId
    const current = byId.get(key) ?? { total: 0, count: 0 }
    current.total += -tx.amount
    current.count += 1
    byId.set(key, current)
  }

  const grandTotal = [...byId.values()].reduce((sum, v) => sum + v.total, 0)

  const totals: CategoryTotal[] = categories
    .filter((c) => byId.has(c.id))
    .map((c, index) => {
      const agg = byId.get(c.id)!
      return {
        categoryId: c.id,
        name: c.name,
        color: index < MAX_COLORED_CATEGORIES ? c.color : NEUTRAL_COLOR,
        total: agg.total,
        count: agg.count,
        pct: grandTotal > 0 ? (agg.total / grandTotal) * 100 : 0,
      }
    })

  if (byId.has(UNCATEGORIZED_ID)) {
    const agg = byId.get(UNCATEGORIZED_ID)!
    totals.push({
      categoryId: UNCATEGORIZED_ID,
      name: UNCATEGORIZED_LABEL,
      color: NEUTRAL_COLOR,
      total: agg.total,
      count: agg.count,
      pct: grandTotal > 0 ? (agg.total / grandTotal) * 100 : 0,
    })
  }

  totals.sort((a, b) => b.total - a.total)

  return { totals, grandTotal }
}

export function formatEUR(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
}
