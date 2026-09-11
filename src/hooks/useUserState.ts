/**
 * Estado del usuario respaldado en Postgres, con localStorage solo como caché de arranque.
 *
 * Sustituye a los seis `useLocalStorage` que había en App.tsx. El motivo del cambio está
 * en `src/lib/userState.ts`: era el único dato irrecuperable de la app y estaba en el sitio
 * más frágil, atado al origen del navegador.
 *
 * Cómo escribe: cada setter actualiza el estado local al momento —la interfaz no espera a
 * la red— y agenda un guardado con un pequeño retardo. Así escribir en el campo del system
 * prompt no lanza una petición por tecla.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CACHE_KEY,
  defaultUserState,
  fetchUserState,
  readLegacyLocalState,
  saveUserState,
  withDefaults,
  type UserState,
} from '../lib/userState'

/** Retardo del guardado. Suficiente para agrupar tecleo seguido sin que se note al salir. */
const SAVE_DEBOUNCE_MS = 600

type Status = 'loading' | 'ready' | 'error'

function readCache(): UserState {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? { ...defaultUserState(), ...(JSON.parse(raw) as UserState) } : defaultUserState()
  } catch {
    return defaultUserState()
  }
}

function writeCache(state: UserState) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(state))
  } catch {
    // almacenamiento no disponible (modo privado, cuota) — la fuente de verdad es Postgres
  }
}

export function useUserState() {
  const [state, setState] = useState<UserState>(readCache)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  // Lo pendiente de guardar, acumulado entre setters para mandarlo en una sola petición.
  const pending = useRef<Partial<UserState>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Hasta que termine la carga inicial no se guarda nada: si no, el estado por defecto
  // pisaría en Postgres lo que el usuario ya tenía.
  const loaded = useRef(false)

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length === 0) return
    saveUserState(patch).catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const remote = await fetchUserState()

        // Migración única del estado que quedó en localStorage antes de que esto viviera en
        // Postgres. Solo se sube donde el servidor no tiene nada: los `null` de la respuesta
        // son "sin configurar nunca", distinto de un valor puesto a vacío a propósito.
        //
        // Es importante subirlo TODO y no solo los viajes: si el servidor no tiene el
        // objetivo mensual, el estado local arrancaría con el valor por defecto y el primer
        // guardado pisaría en Postgres el que el usuario tenía puesto.
        const legacy = readLegacyLocalState()
        const missing: Partial<UserState> = {}
        if (legacy) {
          if (legacy.trips && remote.trips.length === 0) missing.trips = legacy.trips
          if (legacy.manualCategories && Object.keys(remote.manualCategories).length === 0) {
            missing.manualCategories = legacy.manualCategories
          }
          if (legacy.categories && remote.categories === null) missing.categories = legacy.categories
          if (legacy.monthlyGoal !== undefined && remote.monthlyGoal === null) {
            missing.monthlyGoal = legacy.monthlyGoal
          }
          if (legacy.relevantThreshold !== undefined && remote.relevantThreshold === null) {
            missing.relevantThreshold = legacy.relevantThreshold
          }
          if (legacy.systemPrompt !== undefined && remote.systemPrompt === null) {
            missing.systemPrompt = legacy.systemPrompt
          }
          if (Object.keys(missing).length > 0) await saveUserState(missing)
        }

        const merged = { ...withDefaults(remote), ...missing }
        if (!alive) return
        loaded.current = true
        setState(merged)
        writeCache(merged)
        setStatus('ready')
      } catch (e) {
        if (!alive) return
        setError((e as Error).message)
        setStatus('error')
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [])

  // Un guardado pendiente no debe perderse porque se cierre la pestaña.
  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('beforeunload', onHide)
    return () => window.removeEventListener('beforeunload', onHide)
  }, [flush])

  /** Setter de un campo. Acepta valor o función, como `useState`. */
  const update = useCallback(
    <K extends keyof UserState>(key: K) =>
      (value: UserState[K] | ((previous: UserState[K]) => UserState[K])) => {
        setState((previous) => {
          const next =
            typeof value === 'function' ? (value as (p: UserState[K]) => UserState[K])(previous[key]) : value
          const merged = { ...previous, [key]: next }
          writeCache(merged)
          if (loaded.current) {
            pending.current[key] = next
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS)
          }
          return merged
        })
      },
    [flush],
  )

  return { state, status, error, update, flush }
}
