import { UNCATEGORIZED_ID } from '../types'
import type { Category } from '../types'

/** Objetivo de gasto mensual por defecto, en euros. */
export const DEFAULT_MONTHLY_GOAL = 1500

export interface GoalProgress {
  goal: number
  spent: number
  /** Lo que queda por gastar hasta el objetivo (0 si ya se superó). */
  remaining: number
  /** Cuánto se ha pasado del objetivo (0 si aún no). */
  overspent: number
  pct: number
  daysElapsed: number
  daysInMonth: number
  /** Gasto estimado a cierre de mes al ritmo actual. */
  projected: number
  /** Lo que se puede gastar cada día restante sin pasarse. */
  dailyAllowance: number
}

export function goalProgress(
  goal: number,
  spent: number,
  daysElapsed: number,
  daysInMonth: number,
): GoalProgress {
  const daysLeft = Math.max(0, daysInMonth - daysElapsed)
  const projected = daysElapsed > 0 ? (spent / daysElapsed) * daysInMonth : 0
  return {
    goal,
    spent,
    remaining: Math.max(0, goal - spent),
    overspent: Math.max(0, spent - goal),
    pct: goal > 0 ? (spent / goal) * 100 : 0,
    daysElapsed,
    daysInMonth,
    projected,
    dailyAllowance: daysLeft > 0 ? Math.max(0, goal - spent) / daysLeft : 0,
  }
}

/** Suma de los presupuestos fijos mensuales de las categorías que cuentan como gasto. */
export function totalFixedBudget(categories: Category[]): number {
  return categories
    .filter((c) => !c.excludeFromSpending)
    .reduce((sum, c) => sum + (c.fixedBudget ?? 0), 0)
}

/** Importe a partir del cual un movimiento se considera relevante, en euros. */
export const DEFAULT_RELEVANT_THRESHOLD = 30

/**
 * Un movimiento es relevante si su importe supera el umbral **en magnitud**: buscamos los
 * movimientos grandes, sean cargos o abonos.
 *
 * Vive aquí y no en cada sitio que lo necesita para que el aviso del Panel y el filtro de
 * Movimientos no puedan discrepar sobre qué cuenta como relevante.
 */
export const isSignificant = (amount: number, threshold: number) => Math.abs(amount) > threshold

export interface UncategorizedSummary {
  expenseCount: number
  expenseTotal: number
  incomeCount: number
  incomeTotal: number
}

/**
 * Movimientos sin clasificar que superan el umbral de relevancia: son los que más
 * distorsionan el gasto neto por categoría, así que merecen un aviso.
 *
 * Las nóminas quedan fuera por construcción: al reconocerlas el clasificador
 * pasan a "Nómina e ingresos", y esto solo mira lo que sigue sin categorizar.
 */
export function significantUncategorized(
  transactions: Array<{ categoryId: string; amount: number }>,
  threshold: number,
): UncategorizedSummary {
  const pending = transactions.filter(
    (t) => t.categoryId === UNCATEGORIZED_ID && isSignificant(t.amount, threshold),
  )
  const expenses = pending.filter((t) => t.amount < 0)
  const income = pending.filter((t) => t.amount > 0)

  return {
    expenseCount: expenses.length,
    expenseTotal: expenses.reduce((sum, t) => sum + -t.amount, 0),
    incomeCount: income.length,
    incomeTotal: income.reduce((sum, t) => sum + t.amount, 0),
  }
}
