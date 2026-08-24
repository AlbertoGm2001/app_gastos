import { colorForSlot } from './palette'
import type { Category } from '../types'

const DEFAULT_DEFINITIONS: Array<Pick<Category, 'name' | 'keywords'>> = [
  { name: 'Alimentación', keywords: ['mercadona', 'carrefour', 'lidl', 'dia', 'alcampo', 'eroski', 'supermercado'] },
  { name: 'Transporte', keywords: ['repsol', 'cepsa', 'renfe', 'emt', 'metro', 'uber', 'cabify', 'parking', 'autopista'] },
  { name: 'Ocio y restauración', keywords: ['restaurante', 'bar ', 'cafeteria', 'cine', 'ocio'] },
  { name: 'Salud', keywords: ['farmacia', 'clinica', 'dentista', 'seguro medico', 'optica'] },
  { name: 'Hogar y suministros', keywords: ['endesa', 'iberdrola', 'naturgy', 'agua', 'vodafone', 'movistar', 'orange', 'comunidad'] },
  { name: 'Compras', keywords: ['amazon', 'zara', 'el corte ingles', 'decathlon', 'ikea', 'fnac'] },
  { name: 'Suscripciones', keywords: ['netflix', 'spotify', 'hbo', 'disney', 'icloud', 'youtube premium'] },
  { name: 'Otros', keywords: [] },
]

export function buildDefaultCategories(): Category[] {
  return DEFAULT_DEFINITIONS.map((def, index) => ({
    id: `cat-${index}`,
    name: def.name,
    keywords: def.keywords,
    color: colorForSlot(index),
  }))
}

export function nextCategoryId(existing: Category[]): string {
  let n = existing.length
  while (existing.some((c) => c.id === `cat-${n}`)) n += 1
  return `cat-${n}`
}
