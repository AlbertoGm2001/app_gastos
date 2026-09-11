import type { Category } from '../types'

/**
 * Contexto que se lee ANTES de categorizar cualquier movimiento.
 *
 * Cumple dos funciones a la vez:
 *  1. Hoy: las líneas que empiezan por "- " con formato
 *     `palabra, otra palabra -> Nombre de categoría` se aplican como reglas
 *     con prioridad sobre las palabras clave de cada categoría.
 *  2. Cuando se conecte la IA: el texto completo se le pasa como system prompt,
 *     de modo que las reglas y el contexto personal viajan con la petición.
 *
 * Todo lo que se aprenda sobre la situación del usuario se añade aquí.
 */
export const DEFAULT_SYSTEM_PROMPT = `Eres el clasificador de gastos de Alberto. Asigna a cada movimiento
bancario la categoría más adecuada usando este contexto sobre su situación.

CONTEXTO PERSONAL
- Tiene coche eléctrico: no reposta gasolina en su día a día. Cualquier gasto en
  gasolinera o peaje pertenece a un viaje puntual, no al gasto corriente de coche.
- Los viajes NO son una categoría: se dan de alta por fechas en la pestaña Viajes, y
  todo lo que caiga entre su fecha de inicio y de fin se asigna a ese viaje.
- Juega mucho al pádel: clubes, pistas y federaciones son deporte, no ocio.
- Usa Bizum con frecuencia para repartir gastos con amigos. Los Bizum y las
  transferencias no tienen categoría propia: salvo que el concepto diga de qué son,
  se quedan sin categorizar.
- Las transferencias a su propio nombre con concepto de ahorro o inversión no son gasto.
- Su nómina la paga Instituto de Valoraciones / Valum Sociedad de Tasación, a fin de mes.
- Es el titular de la cuenta: toda transferencia enviada a sí mismo o recibida de sí mismo
  (Alberto Garcia Martin) es un traspaso entre cuentas propias. Ni es gasto ni es reembolso.
- Los ingresos RESTAN del gasto de su categoría, porque casi siempre son reembolsos
  (Bizum de amigos al repartir una cuenta, devoluciones de compras). Por eso los ingresos
  que NO compensan un gasto —nómina, traspasos entre cuentas propias— tienen que caer en
  una categoría marcada como "no contar como gasto", o falsearían el gasto de la suya.

REGLAS
- ahorro, inversion -> Inversión y ahorro
- alberto garcia martin -> Inversión y ahorro

CRITERIOS GENERALES
- Ante la duda entre dos categorías, elige la más específica.
- Si el concepto no da información suficiente, déjalo sin categorizar antes que forzar una categoría.`

export interface PromptRule {
  keywords: string[]
  categoryName: string
}

const RULE_LINE = /^\s*-\s*(.+?)\s*->\s*(.+?)\s*$/

/**
 * Extrae del prompt las líneas `- palabras -> Categoría`. Las reglas cuya
 * categoría no existe se descartan en silencio: el prompt es texto libre y no
 * debe romper la clasificación por una errata.
 */
export function parsePromptRules(prompt: string, categories: Category[]): PromptRule[] {
  const known = new Set(categories.map((c) => c.name.trim().toLowerCase()))
  const rules: PromptRule[] = []

  for (const line of prompt.split('\n')) {
    const match = line.match(RULE_LINE)
    if (!match) continue
    const categoryName = match[2].trim()
    if (!known.has(categoryName.toLowerCase())) continue
    const keywords = match[1]
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    if (keywords.length > 0) rules.push({ keywords, categoryName })
  }

  return rules
}
