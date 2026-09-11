import { parsePromptRules } from './systemPrompt'
import { tripCategoryId, tripForDate } from './trips'
import { UNCATEGORIZED_ID } from '../types'
import type { Category, CategorizedTransaction, Transaction, Trip } from '../types'

/** Minúsculas y sin acentos: los conceptos del banco mezclan ambos ("Pádel" / "Padel"). */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Clasificador simulado. Hace de placeholder de la futura integración con IA
 * (o con la propia categorización del Santander). Orden de prioridad:
 *   1. Categoría asignada a mano por el usuario.
 *   2. Viaje que cubre la fecha del movimiento (hecho objetivo, gana a todo lo demás).
 *   3. Reglas del system prompt de Configuración.
 *   4. Palabras clave de cada categoría.
 * Sustituir por una llamada real (LLM), a la que se le pasará el prompt completo
 * como contexto, manteniendo esta firma.
 */
function classify(transaction: Transaction, categories: Category[], rules: CompiledRule[]): string {
  const haystack = fold(`${transaction.merchant} ${transaction.description}`)

  for (const rule of rules) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) return rule.categoryId
  }

  const match = categories.find(
    (category) => category.keywords.length > 0 && category.keywords.some((kw) => haystack.includes(fold(kw))),
  )
  return match?.id ?? UNCATEGORIZED_ID
}

interface CompiledRule {
  keywords: string[]
  categoryId: string
}

function compileRules(systemPrompt: string, categories: Category[]): CompiledRule[] {
  const idByName = new Map(categories.map((c) => [fold(c.name), c.id]))
  return parsePromptRules(systemPrompt, categories)
    .map((rule) => ({
      keywords: rule.keywords.map(fold),
      categoryId: idByName.get(fold(rule.categoryName)) ?? '',
    }))
    .filter((rule) => rule.categoryId !== '')
}

export function categorizeTransactions(
  transactions: Transaction[],
  categories: Category[],
  systemPrompt: string,
  trips: Trip[] = [],
): CategorizedTransaction[] {
  const rules = compileRules(systemPrompt, categories)
  return transactions.map((transaction) => {
    if (transaction.manualCategoryId) {
      return { ...transaction, categoryId: transaction.manualCategoryId, source: 'manual' as const }
    }
    const trip = tripForDate(trips, transaction.date)
    if (trip) {
      return { ...transaction, categoryId: tripCategoryId(trip.id), source: 'ai' as const }
    }
    return { ...transaction, categoryId: classify(transaction, categories, rules), source: 'ai' as const }
  })
}
