export interface Category {
  id: string
  name: string
  color: string
  /** Palabras clave usadas por el clasificador (placeholder de la futura IA). */
  keywords: string[]
  /**
   * Presupuesto de gasto fijo en euros/mes. El gasto del periodo hasta este importe
   * (prorrateado a los dias del rango) cuenta como fijo; el exceso, como extraordinario.
   */
  fixedBudget?: number
  /**
   * Si es true, los movimientos de esta categoría no cuentan como gasto: quedan
   * fuera de totales, reparto, evolución mensual y mayores gastos. Pensado para
   * inversión, ahorro y traspasos entre cuentas propias, que son dinero movido,
   * no dinero gastado.
   */
  excludeFromSpending?: boolean
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

/**
 * Un viaje da de alta un tramo de fechas. Todo movimiento dentro de él —gasto o
 * ingreso— se asigna al viaje, que se comporta como una categoría más en el
 * panel. Manda sobre las reglas y palabras clave, y solo lo sobreescribe una
 * reclasificación manual.
 */
export interface Trip {
  id: string
  name: string
  start: string // ISO yyyy-MM-dd, inclusive
  end: string // ISO yyyy-MM-dd, inclusive
}

export const UNCATEGORIZED_ID = 'uncategorized'

/** Prefijo de las categorías virtuales que representan viajes. */
export const TRIP_CATEGORY_PREFIX = 'trip:'
