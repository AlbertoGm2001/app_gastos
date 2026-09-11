import { useState } from 'react'

interface Props {
  /** `false` cuando el servidor no tiene credenciales en el entorno: no hay nada que probar. */
  configured: boolean
  onSubmit: (username: string, password: string) => Promise<void>
}

const INPUT_STYLE = {
  borderColor: 'var(--border-hairline)',
  background: 'var(--surface-page)',
  color: 'var(--text-primary)',
}

/**
 * Pantalla de acceso. Deliberadamente no dice nada de la app —ni importes, ni cuentas, ni
 * el banco— porque es lo único que ve quien no ha entrado.
 */
export function LoginScreen({ configured, onSubmit }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(username, password)
    } catch (e) {
      setError((e as Error).message)
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--surface-page)' }}>
      <div
        className="w-full max-w-sm rounded-xl border p-6"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      >
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Gastos Santander
        </h1>
        <p className="mt-1 mb-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Entra para ver tus movimientos.
        </p>

        {!configured ? (
          <p className="text-sm" style={{ color: 'var(--status-critical)' }}>
            El servidor no tiene credenciales configuradas. Define <code>AUTH_USERNAME</code> y{' '}
            <code>AUTH_PASSWORD</code> en <code>.env.local</code> y reinicia <code>npm run dev</code>.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Usuario
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                className="rounded-lg border px-3 py-2 text-sm"
                style={INPUT_STYLE}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="rounded-lg border px-3 py-2 text-sm"
                style={INPUT_STYLE}
              />
            </label>

            {error && (
              <p className="text-xs" style={{ color: 'var(--status-critical)' }} role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--series-1)', color: '#ffffff' }}
            >
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
