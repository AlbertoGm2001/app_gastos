import { MAX_COLORED_CATEGORIES, NEUTRAL_COLOR, colorForSlot } from './palette'
import { UNCATEGORIZED_ID } from '../types'
import type { Category, CategorizedTransaction } from '../types'

export interface CategoryTotal {
  categoryId: string
  name: string
  color: string
  total: number
  count: number
  pct: number
  /** Presupuesto fijo del periodo (el mensual de la categoría, prorrateado a los días del rango). */
  budget: number
  /** Parte del gasto cubierta por el presupuesto fijo. */
  fixed: number
  /** Gasto por encima del presupuesto fijo. */
  extra: number
}

export interface SpendSummary {
  totals: CategoryTotal[]
  grandTotal: number
  /** Suma de la parte fija de todas las categorías. */
  fixedTotal: number
  /** Suma de la parte extraordinaria de todas las categorías. */
  extraTotal: number
  /** Presupuesto fijo total previsto para el periodo. */
  budgetTotal: number
}

const UNCATEGORIZED_LABEL = 'Sin categorizar'

/** Días medios por mes (365,25 / 12), usado para prorratear presupuestos mensuales. */
export const AVG_DAYS_PER_MONTH = 30.4375

export function filterByRange<T extends { date: string }>(items: T[], start: string, end: string): T[] {
  return items.filter((item) => item.date >= start && item.date <= end)
}

/** Ids de las categorías marcadas como "no contar como gasto" (inversión, ahorro…). */
export function excludedCategoryIds(categories: Category[]): Set<string> {
  return new Set(categories.filter((c) => c.excludeFromSpending).map((c) => c.id))
}

/** Movimientos que sí cuentan como gasto: fuera lo marcado como inversión/ahorro. */
export function excludeNonSpending<T extends { categoryId: string }>(
  transactions: T[],
  categories: Category[],
): T[] {
  const excluded = excludedCategoryIds(categories)
  return excluded.size === 0 ? transactions : transactions.filter((t) => !excluded.has(t.categoryId))
}

/** Total movido a categorías excluidas del gasto (salidas de dinero, en positivo). */
export function sumNonSpending(transactions: CategorizedTransaction[], categories: Category[]): number {
  const excluded = excludedCategoryIds(categories)
  return transactions
    .filter((t) => t.amount < 0 && excluded.has(t.categoryId))
    .reduce((sum, t) => sum + -t.amount, 0)
}

/** Ingresos del periodo que no restan de ninguna categoría (nómina, traspasos propios). */
export function sumExcludedIncome(
  transactions: CategorizedTransaction[],
  categories: Category[],
): number {
  const excluded = excludedCategoryIds(categories)
  return transactions
    .filter((t) => t.amount > 0 && excluded.has(t.categoryId))
    .reduce((sum, t) => sum + t.amount, 0)
}

/** Días que abarca el rango, ambos extremos incluidos. */
export function daysInRange(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(1, ms / 86_400_000 + 1)
}

/** Prorratea un presupuesto mensual a los días del periodo analizado. */
export function prorateBudget(monthlyBudget: number, days: number): number {
  return (monthlyBudget * days) / AVG_DAYS_PER_MONTH
}

export function aggregateByCategory(
  transactions: CategorizedTransaction[],
  categories: Category[],
  days: number,
): SpendSummary {
  const excluded = excludedCategoryIds(categories)
  // Neto: los ingresos de una categoría (reembolsos, Bizum recibidos, devoluciones)
  // restan de su gasto. Los ingresos que no compensan gasto —nómina, traspasos
  // propios— deben vivir en una categoría marcada como "no contar como gasto".
  const relevant = transactions.filter((t) => !excluded.has(t.categoryId))
  const byId = new Map<string, { total: number; count: number }>()

  for (const tx of relevant) {
    const key = tx.categoryId
    const current = byId.get(key) ?? { total: 0, count: 0 }
    current.total += -tx.amount
    current.count += 1
    byId.set(key, current)
  }

  // Una categoría con neto <= 0 no es gasto: se queda fuera del reparto.
  for (const [key, value] of byId) {
    if (value.total <= 0) byId.delete(key)
  }

  const grandTotal = [...byId.values()].reduce((sum, v) => sum + v.total, 0)

  const totals: CategoryTotal[] = categories
    .filter((c) => !c.excludeFromSpending && byId.has(c.id))
    .map((c) => {
      const agg = byId.get(c.id)!
      const budget = prorateBudget(c.fixedBudget ?? 0, days)
      const fixed = Math.min(agg.total, budget)
      return {
        categoryId: c.id,
        name: c.name,
        color: c.color,
        total: agg.total,
        count: agg.count,
        pct: grandTotal > 0 ? (agg.total / grandTotal) * 100 : 0,
        budget,
        fixed,
        extra: agg.total - fixed,
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
      budget: 0,
      fixed: 0,
      extra: agg.total,
    })
  }

  totals.sort((a, b) => b.total - a.total)

  // La paleta se reparte por peso del gasto, no por el orden de la lista de
  // categorías: así la porción más grande nunca acaba en el gris de descarte.
  for (const [index, total] of totals.entries()) {
    total.color = index < MAX_COLORED_CATEGORIES ? colorForSlot(index) : NEUTRAL_COLOR
  }

  // El presupuesto total incluye también las categorías sin gasto en el periodo:
  // son presupuesto previsto que no se ha consumido.
  const budgetTotal = categories
    .filter((c) => !c.excludeFromSpending)
    .reduce((sum, c) => sum + prorateBudget(c.fixedBudget ?? 0, days), 0)

  return {
    totals,
    grandTotal,
    fixedTotal: totals.reduce((sum, t) => sum + t.fixed, 0),
    extraTotal: totals.reduce((sum, t) => sum + t.extra, 0),
    budgetTotal,
  }
}

export function formatEUR(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
}

export interface MonthlySeries {
  /** Meses presentes en los datos, en orden ascendente ('2026-01', '2026-02'…). */
  months: string[]
  /** Una fila por mes: { month, label, total, [categoryId]: importe }. */
  rows: Array<Record<string, string | number>>
  /** Categorías con gasto en algún mes, en orden de gasto total descendente. */
  series: Array<{ categoryId: string; name: string; color: string }>
}

const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** '2026-03' → 'marzo 2026', para chips y encabezados. */
export function formatMonthLong(month: string): string {
  const [year, m] = month.split('-')
  return `${MONTH_NAMES[Number(m) - 1]} ${year}`
}

/** Primer y último día (ISO) del mes indicado. */
export function monthBounds(month: string): { start: string; end: string } {
  const [year, m] = month.split('-').map(Number)
  const lastDay = new Date(year, m, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` }
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-')
  return `${MONTH_LABELS[Number(m) - 1]} ${year.slice(2)}`
}

/**
 * Serie mensual de gasto por categoría, pensada para el gráfico de evolución.
 * Incluye todos los meses entre el primero y el último con datos, aunque alguno
 * intermedio no tenga gasto, para que el eje temporal no mienta.
 */
export const REST_SERIES_ID = 'rest'

export function monthlyByCategory(
  transactions: CategorizedTransaction[],
  categories: Category[],
  maxSeries = MAX_COLORED_CATEGORIES - 1,
): MonthlySeries {
  const excluded = excludedCategoryIds(categories)
  // Mismo criterio que el reparto: gasto neto, los ingresos de la categoría restan.
  const relevant = transactions.filter((t) => !excluded.has(t.categoryId))
  if (relevant.length === 0) return { months: [], rows: [], series: [] }

  const byMonth = new Map<string, Map<string, number>>()
  const categoryTotals = new Map<string, number>()

  for (const tx of relevant) {
    const month = tx.date.slice(0, 7)
    const bucket = byMonth.get(month) ?? new Map<string, number>()
    bucket.set(tx.categoryId, (bucket.get(tx.categoryId) ?? 0) + -tx.amount)
    byMonth.set(month, bucket)
    categoryTotals.set(tx.categoryId, (categoryTotals.get(tx.categoryId) ?? 0) + -tx.amount)
  }

  for (const [key, total] of categoryTotals) {
    if (total <= 0) categoryTotals.delete(key)
  }
  if (categoryTotals.size === 0) return { months: [], rows: [], series: [] }

  const sorted = [...byMonth.keys()].sort()
  const months: string[] = []
  const [firstYear, firstMonth] = sorted[0].split('-').map(Number)
  const [lastYear, lastMonth] = sorted[sorted.length - 1].split('-').map(Number)
  for (let y = firstYear, m = firstMonth; y < lastYear || (y === lastYear && m <= lastMonth); ) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }

  const nameById = new Map(categories.map((c) => [c.id, c.name]))

  const ranked = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([categoryId]) => categoryId)
  const shown = ranked.slice(0, maxSeries)
  const rest = ranked.slice(maxSeries)

  const series = shown.map((categoryId, index) => ({
    categoryId,
    name: categoryId === UNCATEGORIZED_ID ? UNCATEGORIZED_LABEL : (nameById.get(categoryId) ?? UNCATEGORIZED_LABEL),
    color: colorForSlot(index),
  }))

  // Las categorías fuera del top se agrupan: apilar más de 8 tonos es ilegible.
  if (rest.length > 0) {
    series.push({ categoryId: REST_SERIES_ID, name: `Resto (${rest.length})`, color: NEUTRAL_COLOR })
  }

  const rows = months.map((month) => {
    const bucket = byMonth.get(month)
    const row: Record<string, string | number> = { month, label: monthLabel(month) }
    let total = 0
    // Un mes puede quedar en negativo dentro de una categoría (el reembolso llegó
    // después que el gasto): se pinta 0, la barra no baja del eje.
    for (const categoryId of shown) {
      const value = Math.max(0, bucket?.get(categoryId) ?? 0)
      row[categoryId] = value
      total += value
    }
    if (rest.length > 0) {
      const restTotal = rest.reduce((sum, id) => sum + Math.max(0, bucket?.get(id) ?? 0), 0)
      row[REST_SERIES_ID] = restTotal
      total += restTotal
    }
    row.total = total
    return row
  })

  return { months, rows, series }
}
