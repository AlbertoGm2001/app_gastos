/** Paleta categórica validada (8 tonos, orden fijo — ver skill dataviz). */
export const CATEGORY_COLOR_SLOTS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
] as const

export const MAX_COLORED_CATEGORIES = CATEGORY_COLOR_SLOTS.length

/** Gris neutro para categorías que exceden el techo de 8 tonos y para "sin categorizar". */
export const NEUTRAL_COLOR = 'var(--text-muted)'

export function colorForSlot(slotIndex: number): string {
  return slotIndex < MAX_COLORED_CATEGORIES ? CATEGORY_COLOR_SLOTS[slotIndex] : NEUTRAL_COLOR
}
