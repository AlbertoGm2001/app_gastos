import { useEffect, useState } from 'react'

export function useLocalStorage<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial()
    } catch {
      return initial()
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // almacenamiento no disponible (modo privado, cuota, etc.) — se ignora
    }
  }, [key, value])

  return [value, setValue] as const
}
