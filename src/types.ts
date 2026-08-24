export interface Category {
  id: string
  name: string
  color: string
  /** Palabras clave usadas por el clasificador (placeholder de la futura IA). */
  keywords: string[]
}

export interface Transaction {
  id: string
  date: string // ISO yyyy-MM-dd
  merchant: string
  description: string
  amount: number // negativo = gasto, positivo = ingreso
  /** Categoría asignada manualmente por el usuario, si sobreescribe a la IA. */
  manualCategoryId?: string
}

export interface CategorizedTransaction extends Transaction {
  categoryId: string
  /** 'ai' si la vino de la clasificación automática, 'manual' si el usuario la corrigió. */
  source: 'ai' | 'manual'
}

export const UNCATEGORIZED_ID = 'uncategorized'
