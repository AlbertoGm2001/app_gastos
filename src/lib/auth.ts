/**
 * Cliente de la autenticación. La sesión vive en una cookie `HttpOnly` que pone el
 * servidor (server/auth.mjs): aquí no se guarda ni el usuario ni la contraseña, y no hay
 * nada que leer en localStorage. Por eso el estado de sesión siempre se pregunta al
 * servidor —`/api/auth/session`— en vez de recordarse en el navegador.
 */

export interface AuthSession {
  /** El servidor tiene AUTH_USERNAME y AUTH_PASSWORD puestos. Si es `false`, no sirve nada. */
  configured: boolean
  authenticated: boolean
  username: string | null
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

export const fetchSession = () => call<AuthSession>('/api/auth/session')

export const login = (username: string, password: string) =>
  call<{ authenticated: boolean; username: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const logout = () => call<{ authenticated: false }>('/api/auth/logout', { method: 'POST' })
