import type { Transaction } from '../types'

interface Seed {
  merchant: string
  description: string
  min: number
  max: number
  perMonth: number
}

/**
 * Comercios y rangos de importe pensados para que coincidan con las keywords
 * por defecto de src/lib/categories.ts, más un puñado de movimientos "raros"
 * que la IA no sabrá encajar (para poblar "Sin categorizar" de forma realista).
 */
const SEEDS: Seed[] = [
  { merchant: 'MERCADONA', description: 'COMPRA TARJETA MERCADONA MADRID', min: 12, max: 85, perMonth: 8 },
  { merchant: 'CARREFOUR', description: 'COMPRA TARJETA CARREFOUR', min: 15, max: 110, perMonth: 3 },
  { merchant: 'LIDL', description: 'COMPRA TARJETA LIDL', min: 10, max: 60, perMonth: 3 },
  { merchant: 'REPSOL', description: 'COMPRA TARJETA REPSOL ESTACION SERVICIO', min: 35, max: 70, perMonth: 3 },
  { merchant: 'EMT MADRID', description: 'RECIBO EMT MADRID ABONO TRANSPORTE', min: 20, max: 54.6, perMonth: 1 },
  { merchant: 'UBER', description: 'COMPRA TARJETA UBER *TRIP', min: 6, max: 22, perMonth: 4 },
  { merchant: 'RESTAURANTE LA TASCA', description: 'COMPRA TARJETA RESTAURANTE LA TASCA', min: 18, max: 65, perMonth: 4 },
  { merchant: 'CAFETERIA CENTRAL', description: 'COMPRA TARJETA CAFETERIA CENTRAL', min: 2, max: 8, perMonth: 10 },
  { merchant: 'CINE YELMO', description: 'COMPRA TARJETA CINES YELMO', min: 9, max: 24, perMonth: 1 },
  { merchant: 'FARMACIA LOPEZ', description: 'COMPRA TARJETA FARMACIA LOPEZ', min: 5, max: 40, perMonth: 2 },
  { merchant: 'IBERDROLA', description: 'RECIBO IBERDROLA CLIENTES SA', min: 45, max: 95, perMonth: 1 },
  { merchant: 'VODAFONE ESPANA', description: 'RECIBO VODAFONE ESPANA SAU', min: 35, max: 55, perMonth: 1 },
  { merchant: 'COMUNIDAD PROPIETARIOS', description: 'RECIBO COMUNIDAD PROPIETARIOS', min: 40, max: 40, perMonth: 1 },
  { merchant: 'AMAZON', description: 'COMPRA TARJETA AMAZON EU SARL', min: 8, max: 130, perMonth: 5 },
  { merchant: 'ZARA', description: 'COMPRA TARJETA ZARA ESPANA', min: 20, max: 90, perMonth: 1 },
  { merchant: 'IKEA', description: 'COMPRA TARJETA IKEA IBERICA', min: 15, max: 220, perMonth: 1 },
  { merchant: 'NETFLIX', description: 'RECIBO NETFLIX.COM', min: 12.99, max: 12.99, perMonth: 1 },
  { merchant: 'SPOTIFY', description: 'RECIBO SPOTIFY SPAIN', min: 10.99, max: 10.99, perMonth: 1 },
  { merchant: 'BIZUM JUAN PEREZ', description: 'BIZUM ENVIADO A JUAN PEREZ', min: 10, max: 60, perMonth: 2 },
  { merchant: 'COMISION MANTENIMIENTO', description: 'COMISION MANTENIMIENTO CUENTA', min: 4, max: 4, perMonth: 1 },
  { merchant: 'TRANSFERENCIA VARIOS', description: 'TRANSFERENCIA A FAVOR DE TERCEROS', min: 20, max: 150, perMonth: 1 },
]

function daysAgo(days: number): Date {
  const d = new Date(BASE_DATE)
  d.setDate(d.getDate() - days)
  return d
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function seededRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

// Fecha de referencia fija para que los datos de ejemplo sean reproducibles.
const BASE_DATE = new Date('2026-08-24')
const RANGE_DAYS = 180

export function generateMockTransactions(): Transaction[] {
  const rand = seededRandom(42)
  const transactions: Transaction[] = []
  let counter = 0

  for (const seed of SEEDS) {
    const totalOccurrences = Math.round((seed.perMonth * RANGE_DAYS) / 30)
    for (let i = 0; i < totalOccurrences; i += 1) {
      const dayOffset = Math.floor(rand() * RANGE_DAYS)
      const amount = seed.min + rand() * (seed.max - seed.min)
      transactions.push({
        id: `tx-${counter++}`,
        date: toIso(daysAgo(dayOffset)),
        merchant: seed.merchant,
        description: seed.description,
        amount: -Math.round(amount * 100) / 100,
      })
    }
  }

  // Nómina mensual (ingreso), para dar contexto aunque no cuente como gasto.
  for (let month = 0; month < Math.ceil(RANGE_DAYS / 30); month += 1) {
    transactions.push({
      id: `tx-${counter++}`,
      date: toIso(daysAgo(month * 30 + 1)),
      merchant: 'EMPRESA SA',
      description: 'TRANSFERENCIA NOMINA EMPRESA SA',
      amount: 1850,
    })
  }

  return transactions.sort((a, b) => (a.date < b.date ? 1 : -1))
}
