/**
 * Estado del usuario: viajes, categorías, reclasificaciones manuales y ajustes.
 *
 * Vive en Postgres, no en localStorage. Es el único dato de la app que **no se puede
 * regenerar**: los movimientos se vuelven a bajar del banco o se reimportan del extracto,
 * pero un viaje dado de alta a mano no sale de ninguna parte. En localStorage estaba
 * además atado al origen del navegador, así que pasar el dev server de `http` a `https`
 * —obligatorio para Enable Banking— lo dejó varado e invisible para la app.
 *
 * localStorage sigue usándose, pero solo como **caché de arranque**: pinta al instante
 * mientras llega la respuesta del servidor, y nunca es la fuente de verdad.
 */
import type { Category, Trip } from '../types'
import { buildDefaultCategories } from './categories'
import { DEFAULT_MONTHLY_GOAL, DEFAULT_RELEVANT_THRESHOLD } from './goal'
import { DEFAULT_SYSTEM_PROMPT } from './systemPrompt'

export interface UserState {
  trips: Trip[]
  /** id de movimiento → id de categoría asignada a mano. */
  manualCategories: Record<string, string>
  categories: Category[]
  monthlyGoal: number
  relevantThreshold: number
  systemPrompt: string
}

/** Lo que devuelve el servidor: `null` en lo que el usuario no ha configurado nunca. */
export interface UserStateResponse {
  trips: Trip[]
  manualCategories: Record<string, string>
  categories: Category[] | null
  monthlyGoal: number | null
  relevantThreshold: number | null
  systemPrompt: string | null
}

export const CACHE_KEY = 'gastos.userState'

export function defaultUserState(): UserState {
  return {
    trips: [],
    manualCategories: {},
    categories: buildDefaultCategories(),
    monthlyGoal: DEFAULT_MONTHLY_GOAL,
    relevantThreshold: DEFAULT_RELEVANT_THRESHOLD,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { error?: string }).error ?? `Error ${response.status}`)
  return data as T
}

/**
 * Estado tal cual lo tiene el servidor, con los `null` intactos. El hook los necesita para
 * saber qué está sin configurar y poder subir ahí lo que quedó en localStorage.
 */
export const fetchUserState = () => call<UserStateResponse>('/api/state')

/** Aplica los valores por defecto a lo que el usuario no ha configurado nunca. */
export function withDefaults(remote: UserStateResponse): UserState {
  const defaults = defaultUserState()
  return {
    trips: remote.trips ?? defaults.trips,
    manualCategories: remote.manualCategories ?? defaults.manualCategories,
    categories: remote.categories ?? defaults.categories,
    monthlyGoal: remote.monthlyGoal ?? defaults.monthlyGoal,
    relevantThreshold: remote.relevantThreshold ?? defaults.relevantThreshold,
    systemPrompt: remote.systemPrompt ?? defaults.systemPrompt,
  }
}

export const saveUserState = (patch: Partial<UserState>) =>
  call<{ written: string[] }>('/api/state', { method: 'PUT', body: JSON.stringify(patch) })

/**
 * Estado que quedó en localStorage antes de que esto viviera en Postgres, para subirlo una
 * sola vez. Lee las claves antiguas (`gastos.trips`, `gastos.categories`, …) y saca las
 * reclasificaciones manuales de `gastos.transactions`, donde iban pegadas a cada movimiento.
 *
 * Devuelve `null` si no hay nada que migrar.
 */
export function readLegacyLocalState(): Partial<UserState> | null {
  const read = <T>(key: string): T | undefined => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : undefined
    } catch {
      return undefined
    }
  }

  const legacy: Partial<UserState> = {}
  const trips = read<Trip[]>('gastos.trips')
  const categories = read<Category[]>('gastos.categories')
  const monthlyGoal = read<number>('gastos.monthlyGoal')
  const relevantThreshold = read<number>('gastos.relevantThreshold')
  const systemPrompt = read<string>('gastos.systemPrompt')

  if (trips?.length) legacy.trips = trips
  if (categories?.length) legacy.categories = categories
  if (typeof monthlyGoal === 'number') legacy.monthlyGoal = monthlyGoal
  if (typeof relevantThreshold === 'number') legacy.relevantThreshold = relevantThreshold
  if (typeof systemPrompt === 'string' && systemPrompt) legacy.systemPrompt = systemPrompt

  const transactions = read<{ id: string; manualCategoryId?: string }[]>('gastos.transactions')
  const manual = Object.fromEntries(
    (transactions ?? [])
      .filter((t) => t.manualCategoryId)
      .map((t) => [t.id, t.manualCategoryId as string]),
  )
  if (Object.keys(manual).length > 0) legacy.manualCategories = manual

  return Object.keys(legacy).length > 0 ? legacy : null
}
