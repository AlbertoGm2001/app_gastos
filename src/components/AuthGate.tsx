import { useCallback, useEffect, useState } from 'react'
import { fetchSession, login, type AuthSession } from '../lib/auth'
import { LoginScreen } from './LoginScreen'

interface Props {
  children: React.ReactNode
}

/**
 * Puerta de entrada: los hijos no se montan hasta que hay sesión.
 *
 * Envuelve a `<App />` en main.tsx en vez de comprobarse dentro de App, y es a propósito:
 * App pide los movimientos y el estado del usuario en sus efectos de montaje, y esas
 * rutas responden 401 sin sesión. Si App se montara antes de entrar, su primer render ya
 * arrastraría dos errores de carga.
 */
export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchSession()
      .then((s) => alive && setSession(s))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [])

  const submit = useCallback(async (username: string, password: string) => {
    await login(username, password)
    setSession(await fetchSession())
  }, [])

  if (error) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4 text-center text-sm"
        style={{ background: 'var(--surface-page)', color: 'var(--status-critical)' }}
      >
        No se ha podido contactar con el servidor: {error}
      </div>
    )
  }

  // Un instante en blanco, no una pantalla de acceso que aparezca y desaparezca sola: la
  // comprobación es una petición local y termina en milisegundos.
  if (!session) return <div style={{ minHeight: '100vh', background: 'var(--surface-page)' }} />

  if (!session.authenticated) return <LoginScreen configured={session.configured} onSubmit={submit} />

  return children
}
