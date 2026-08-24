import { UNCATEGORIZED_ID } from '../types'
import type { Category, CategorizedTransaction, Transaction } from '../types'

/**
 * Clasificador simulado. Hace de placeholder de la futura integración con IA
 * (o con la propia categorización del Santander): coincidencia por palabra
 * clave sobre comercio + descripción. Sustituir por una llamada real
 * (LLM / servicio de categorización) manteniendo la misma firma.
 */
function classify(transaction: Transaction, categories: Category[]): string {
  const haystack = `${transaction.merchant} ${transaction.description}`.toLowerCase()
  const match = categories.find(
    (category) => category.keywords.length > 0 && category.keywords.some((kw) => haystack.includes(kw.toLowerCase())),
  )
  return match?.id ?? UNCATEGORIZED_ID
}

export function categorizeTransactions(transactions: Transaction[], categories: Category[]): CategorizedTransaction[] {
  return transactions.map((transaction) => {
    if (transaction.manualCategoryId) {
      return { ...transaction, categoryId: transaction.manualCategoryId, source: 'manual' as const }
    }
    return { ...transaction, categoryId: classify(transaction, categories), source: 'ai' as const }
  })
}
