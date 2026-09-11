import { colorForSlot } from './palette'
import { TRIP_CATEGORY_PREFIX } from '../types'
import type { CategorizedTransaction, Category, Trip } from '../types'

export function tripCategoryId(tripId: string): string {
  return `${TRIP_CATEGORY_PREFIX}${tripId}`
}

export function isTripCategory(categoryId: string): boolean {
  return categoryId.startsWith(TRIP_CATEGORY_PREFIX)
}

/**
 * Los viajes se exponen al resto de la app como categorías virtuales: así el
 * panel, los gráficos y los desplegables los tratan igual que a las demás sin
 * saber nada de viajes.
 */
export function tripsAsCategories(trips: Trip[]): Category[] {
  return trips.map((trip, index) => ({
    id: tripCategoryId(trip.id),
    name: trip.name,
    color: colorForSlot(index),
    keywords: [],
    fixedBudget: 0,
    excludeFromSpending: false,
  }))
}

/** Viaje que cubre esa fecha. Si hay solapamiento gana el que empezó antes. */
export function tripForDate(trips: Trip[], date: string): Trip | undefined {
  return [...trips]
    .sort((a, b) => (a.start === b.start ? 0 : a.start < b.start ? -1 : 1))
    .find((trip) => date >= trip.start && date <= trip.end)
}

export function nextTripId(existing: Trip[]): string {
  let n = existing.length
  while (existing.some((t) => t.id === `trip-${n}`)) n += 1
  return `trip-${n}`
}

export interface TripSummary {
  expenses: number
  income: number
  net: number
  count: number
  days: number
  /** Movimientos asignados al viaje cuya fecha cae fuera de su rango. */
  outsideRange: number
}

/**
 * Resume un viaje por lo que hay **asignado** a él, no por su rango de fechas:
 * así los totales siguen a la clasificación. Si sacas un movimiento del viaje a
 * mano deja de contar, y si le asignas uno de otra fecha, entra.
 */
export function summarizeTrip(trip: Trip, transactions: CategorizedTransaction[]): TripSummary {
  const categoryId = tripCategoryId(trip.id)
  const inTrip = transactions.filter((t) => t.categoryId === categoryId)
  const expenses = inTrip.filter((t) => t.amount < 0).reduce((sum, t) => sum + -t.amount, 0)
  const income = inTrip.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
  const days = Math.max(
    1,
    (new Date(trip.end).getTime() - new Date(trip.start).getTime()) / 86_400_000 + 1,
  )
  const outsideRange = inTrip.filter((t) => t.date < trip.start || t.date > trip.end).length

  return { expenses, income, net: expenses - income, count: inTrip.length, days, outsideRange }
}
