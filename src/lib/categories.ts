import { colorForSlot } from './palette'
import type { Category } from '../types'

/**
 * Categorías por defecto ajustadas a los conceptos que emite el extracto de
 * Santander (Pago Movil En…, Compra Internet En…, Bizum A Favor De…, Recibo…).
 *
 * El orden importa dos veces: define la prioridad del clasificador (gana la
 * primera categoría cuya keyword aparece en el concepto) y el reparto de
 * colores de la paleta, así que las más específicas van antes que las genéricas.
 */
const DEFAULT_DEFINITIONS: Array<
  Pick<Category, 'name' | 'keywords' | 'fixedBudget' | 'excludeFromSpending'>
> = [
  {
    name: 'Deporte y pádel',
    keywords: [
      'padel', 'playtomic', 'tentapadel', 'club deportivo', 'federacion madr', 'golf park',
      'iconico sports', 'cityplay', 'gimnasio', 'decathlon', 'myprotein', 'ballershop', 'sports',
    ],
    fixedBudget: 200,
  },
  {
    name: 'Coche y transporte',
    keywords: [
      // Combustible y peajes NO están aquí a propósito: el coche es eléctrico, así que
      // repostar es cosa de un viaje puntual. Esa regla vive en el system prompt.
      'telpark', 'parking', 'renting', 'mutua', 'neumaticos', 'dgt', 'hertz', 'uber', 'cabify',
      'taxi', 'emt', 'metro', 'renfe', 'itv', 'taller', 'charging together', 'lavado',
    ],
    fixedBudget: 200,
  },
  {
    name: 'Restauración y bares',
    keywords: [
      'restaurante', 'rest ', 'taberna', 'bar ', 'cafeteria', 'cerveceria', 'asador', 'parrilla',
      'foster', 'friday', 'dominos', 'pizza', 'burger', 'mcdonald', 'mc donald', 'starbucks', 'croquetas',
      'aramark', 'boqueron', 'cafeteria',
      'sushi', 'tak house', 'naoki', 'fu toki', 'khataris', 'casa chalao', 'occo', 'brunch',
      'restaurant', 'pizzeria', 'kebab', 'churreria', 'arroces', 'hosteleria', 'tapas', 'bbq',
      'grill', 'marisqueria', 'chiringuito', 'heladeria', 'cafe ',
    ],
    fixedBudget: 100,
  },
  {
    name: 'Supermercados',
    keywords: [
      'ahorramas', 'supercor', 'mercadona', 'carrefour', 'lidl', 'alcampo', 'eroski', 'hipercor',
      'alimentacion', 'supermercado', 'fruteria', 'panaderia', 'carniceria',
    ],
    fixedBudget: 25,
  },
  {
    name: 'Compras',
    keywords: [
      'amazon', 'zara', 'cortefiel', 'aristocrazy', 'alehop', 'ikea', 'el corte ingles', 'fnac',
      'primark', 'mediamarkt', 'floristeria', 'aromas', 'sfera', 'mango', 'jack jones', 'latostadora',
      'shein', 'aliexpress', 'springfield',
    ],
    fixedBudget: 0,
  },
  {
    name: 'Suscripciones',
    keywords: [
      'apple.com/bill', 'spotify', 'netflix', 'hbo', 'disney', 'icloud', 'youtube premium',
      'chatgpt', 'openai', 'amazon prime', 'dazn',
    ],
    fixedBudget: 15,
  },
  {
    name: 'Nómina e ingresos',
    keywords: [
      'abono nomina', 'nomina', 'instituto de valoraciones', 'valum sociedad de tasacion',
      'liquidacion por bonificacion', 'paga extra', 'finiquito', 'prestacion',
    ],
    fixedBudget: 0,
    // Los ingresos que no compensan un gasto no pueden restar de ninguna categoría.
    excludeFromSpending: true,
  },
  {
    name: 'Inversión y ahorro',
    keywords: [
      'ahorro', 'inversion', 'invierte', 'myinvestor', 'indexa', 'trade republic', 'degiro',
      'scalable', 'interactive brokers', 'etf', 'fondo de inversion', 'plan de pensiones',
      'broker', 'renta 4', 'openbank invest',
    ],
    fixedBudget: 0,
    excludeFromSpending: true,
  },
  {
    name: 'Hogar y suministros',
    keywords: [
      'endesa', 'iberdrola', 'naturgy', 'agua', 'vodafone', 'movistar', 'orange', 'comunidad',
      'recaudacion ayu', 'ayuntamiento', 'alquiler', 'hipoteca', 'seguro hogar',
    ],
    fixedBudget: 0,
  },
  {
    name: 'Salud y cuidado',
    keywords: ['farmacia', 'clinica', 'dentista', 'optica', 'hospital', 'seguro medico', 'barber', 'peluqueria'],
    fixedBudget: 0,
  },
  {
    name: 'Ocio y juego',
    keywords: [
      'bet365', 'winamax', 'cine', 'teatro', 'concierto', 'museo', 'arte', 'discoteca', 'fourvenues',
      'xceed', 'festival', 'entradas',
    ],
    fixedBudget: 0,
  },
  {
    name: 'Efectivo',
    keywords: ['retirada de efectivo', 'cajero'],
    fixedBudget: 0,
  },
  { name: 'Otros', keywords: [], fixedBudget: 0 },
]

export function buildDefaultCategories(): Category[] {
  return DEFAULT_DEFINITIONS.map((def, index) => ({
    id: `cat-${index}`,
    name: def.name,
    keywords: def.keywords,
    fixedBudget: def.fixedBudget ?? 0,
    excludeFromSpending: def.excludeFromSpending ?? false,
    color: colorForSlot(index),
  }))
}

export function nextCategoryId(existing: Category[]): string {
  let n = existing.length
  while (existing.some((c) => c.id === `cat-${n}`)) n += 1
  return `cat-${n}`
}
