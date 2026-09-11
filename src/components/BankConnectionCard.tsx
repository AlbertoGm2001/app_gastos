import { useCallback, useEffect, useState } from 'react'
import {
  connectBank,
  disconnectBank,
  getBankStatus,
  listAspsps,
  syncBank,
  type Aspsp,
  type BankStatus,
} from '../lib/bankSync'
import type { Transaction } from '../types'

interface Props {
  /** Los movimientos que devuelve Neon tras sincronizar, ya listos para fusionar. */
  onSynced: (transactions: Transaction[]) => void
}

const COUNTRY = 'ES'

/**
 * Bancos que se preseleccionan si aparecen en la lista, por orden de preferencia. Se
 * busca primero coincidencia exacta: en producción la lista trae también "Santander CIB"
 * (banca corporativa), y no es la cuenta que queremos. En sandbox no hay Santander, solo
 * Sabadell, BBVA y el mock.
 */
const PREFERRED = ['Banco Santander', 'Mock ASPSP']

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * El banco nos devuelve a /?eb=ok|error tras el SCA (lo redirige server/api.mjs), así que
 * el resultado de la autorización se lee de la URL al montar, no de un estado previo.
 */
function readRedirectOutcome(): { message: string | null; error: string | null } {
  const params = new URLSearchParams(window.location.search)
  const outcome = params.get('eb')
  if (outcome === 'ok') return { message: 'Banco conectado. Ya puedes sincronizar movimientos.', error: null }
  if (outcome === 'error') {
    return { message: null, error: params.get('reason') ?? 'La autorización en el banco no se completó.' }
  }
  return { message: null, error: null }
}

/** "hace 3 h", para decir desde cuándo vale la última comprobación del consentimiento. */
function hace(iso: string | null): string | null {
  if (!iso) return null
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(minutos) || minutos < 0) return null
  if (minutos < 1) return 'ahora mismo'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  return horas < 24 ? `hace ${horas} h` : `hace ${Math.floor(horas / 24)} d`
}

export function BankConnectionCard({ onSynced }: Props) {
  const [status, setStatus] = useState<BankStatus | null>(null)
  const [aspsps, setAspsps] = useState<Aspsp[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState<'status' | 'aspsps' | 'connect' | 'sync' | 'verify' | null>('status')
  const [error, setError] = useState<string | null>(() => readRedirectOutcome().error)
  const [message, setMessage] = useState<string | null>(() => readRedirectOutcome().message)

  const refreshStatus = useCallback(async () => {
    setBusy('status')
    try {
      setStatus(await getBankStatus())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }, [])

  /**
   * Comprueba contra Enable Banking que el consentimiento siga vivo. Va en un botón y no
   * al montar la tarjeta porque no está descartado que la llamada cuente para el límite de
   * 4 accesos diarios, y el servidor la limita de todos modos a una cada 6 horas.
   */
  const verifyConsent = useCallback(async () => {
    setBusy('verify')
    setError(null)
    try {
      const fresh = await getBankStatus(true)
      setStatus(fresh)
      if (fresh.revoked) setError('El banco ya no reconoce el consentimiento. Hay que volver a autorizar.')
      else if (fresh.verifyError) setError(`No se ha podido comprobar: ${fresh.verifyError}`)
      else if (fresh.verifyThrottled)
        setMessage('Ya se comprobó hace menos de 6 h; se reutiliza esa respuesta para no gastar accesos.')
      else setMessage('Consentimiento confirmado por el banco.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    let alive = true
    // Primera carga del estado. No se reutiliza refreshStatus para no tocar el estado de
    // forma sincrónica dentro del efecto (el `busy` inicial ya es 'status').
    getBankStatus()
      .then((s) => alive && setStatus(s))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setBusy(null))

    // El parámetro ?eb ya se ha leído en el estado inicial: se limpia para que el mensaje
    // no reaparezca al recargar.
    if (new URLSearchParams(window.location.search).has('eb')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
    return () => {
      alive = false
    }
  }, [])

  async function loadAspsps() {
    setBusy('aspsps')
    setError(null)
    try {
      const list = await listAspsps(COUNTRY)
      setAspsps(list)
      const preferred = PREFERRED.map(
        (name) => list.find((a) => a.name === name) ?? list.find((a) => a.name.includes(name)),
      ).find(Boolean)
      setSelected(preferred?.name ?? list[0]?.name ?? '')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function handleConnect() {
    setBusy('connect')
    setError(null)
    try {
      const { url } = await connectBank(selected, COUNTRY)
      // El SCA se hace en la web del banco; volverá al redirect whitelisted de la app.
      window.location.href = url
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  async function handleSync() {
    setBusy('sync')
    setError(null)
    setMessage(null)
    try {
      const result = await syncBank()
      onSynced(result.transactions)
      setMessage(
        `${result.fetched} movimientos leídos desde ${result.dateFrom ?? 'el inicio'}: ` +
          `${result.inserted} nuevos, ${result.replaced} reemplazados` +
          (result.statementRemoved > 0 ? `, ${result.statementRemoved} del extracto descartados` : '') +
          (result.skipped > 0 ? `, ${result.skipped} ignorados` : '') +
          '.',
      )
      setStatus(await getBankStatus())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('¿Olvidar la conexión con el banco? Los movimientos ya guardados se mantienen.')) return
    await disconnectBank()
    setMessage(null)
    await refreshStatus()
  }

  // El cálculo lo hace el servidor: aquí solo se pinta. Antes se restaba también en el
  // cliente y las dos cuentas podían discrepar si el reloj del navegador iba desviado.
  const remaining = status?.expiresInDays ?? null
  const consentExpired = status?.revoked === true || (remaining !== null && remaining <= 0)

  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
    >
      <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        Conexión bancaria
      </h2>
      <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        Los movimientos se leen del banco vía Enable Banking (PSD2) y se guardan en Postgres. El navegador nunca
        ve la clave de la aplicación: la firma la hace la API local que arranca con <code>npm run dev</code>.
      </p>

      {status && !status.configured && (
        <p className="mb-3 rounded border px-3 py-2 text-xs" style={{ borderColor: 'var(--status-warning)', color: 'var(--status-warning)' }}>
          Falta configurar <code>ENABLE_BANKING_APPLICATION_ID</code> y la clave privada (
          <code>ENABLE_BANKING_KEY_PATH</code> con la ruta al <code>.pem</code>, o{' '}
          <code>ENABLE_BANKING_PRIVATE_KEY</code> con el PEM entero) en <code>.env.local</code>. Copia{' '}
          <code>.env.local.example</code> y rellénalo con los datos del Control Panel de Enable Banking.
        </p>
      )}

      {status?.dbError && (
        <p className="mb-3 rounded border px-3 py-2 text-xs" style={{ borderColor: 'var(--status-warning)', color: 'var(--status-warning)' }}>
          La base de datos no responde: {status.dbError}. ¿Está arrancado el contenedor? <code>npm run db:up</code>
        </p>
      )}

      <dl className="mb-4 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2" style={{ color: 'var(--text-secondary)' }}>
        <div className="flex justify-between gap-2">
          <dt style={{ color: 'var(--text-muted)' }}>Estado</dt>
          <dd style={{ color: status?.connected ? 'var(--status-good)' : 'var(--text-muted)' }}>
            {status?.connected ? `Conectado a ${status.aspsp ?? 'el banco'}` : 'Sin conectar'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt style={{ color: 'var(--text-muted)' }}>Consentimiento</dt>
          <dd style={{ color: consentExpired ? 'var(--status-critical)' : undefined }}>
            {status?.revoked === true
              ? 'Revocado en el banco'
              : remaining === null
                ? '—'
                : consentExpired
                  ? 'Caducado'
                  : `${remaining} días`}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt style={{ color: 'var(--text-muted)' }}>Comprobado</dt>
          <dd className="flex items-center gap-2">
            <span style={{ color: 'var(--text-muted)' }}>
              {/* Sin comprobar, los días que faltan son una deducción de la fecha guardada:
                  no detectan una revocación hecha desde la banca online. */}
              {hace(status?.verifiedAt ?? null) ?? 'nunca'}
            </span>
            <button
              type="button"
              onClick={verifyConsent}
              disabled={busy !== null || !status?.connected}
              className="rounded border px-2 py-0.5 text-xs disabled:opacity-50"
              style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-secondary)' }}
            >
              {busy === 'verify' ? 'Comprobando…' : 'Comprobar'}
            </button>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt style={{ color: 'var(--text-muted)' }}>Movimientos guardados</dt>
          <dd style={{ fontVariantNumeric: 'tabular-nums' }}>{status?.db?.count ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt style={{ color: 'var(--text-muted)' }}>Última sincronización</dt>
          <dd>{formatDateTime(status?.db?.lastSync ?? null)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSync}
          disabled={!status?.connected || busy !== null}
          className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: 'var(--status-good)', color: 'var(--status-good)' }}
        >
          {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar movimientos'}
        </button>

        {aspsps.length === 0 ? (
          <button
            type="button"
            onClick={loadAspsps}
            disabled={busy !== null || !status?.configured}
            className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-primary)' }}
          >
            {busy === 'aspsps' ? 'Cargando bancos…' : status?.connected ? 'Cambiar de banco' : 'Elegir banco'}
          </button>
        ) : (
          <>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm"
              style={{
                borderColor: 'var(--border-hairline)',
                background: 'var(--surface-1)',
                color: 'var(--text-primary)',
              }}
              aria-label="Banco al que conectarse"
            >
              {aspsps.map((aspsp) => (
                <option key={aspsp.name} value={aspsp.name}>
                  {aspsp.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleConnect}
              disabled={!selected || busy !== null}
              className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--text-primary)', color: 'var(--text-primary)' }}
            >
              {busy === 'connect' ? 'Abriendo el banco…' : 'Autorizar en el banco'}
            </button>
          </>
        )}

        {status?.connected && (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy !== null}
            className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-muted)' }}
          >
            Desconectar
          </button>
        )}
      </div>

      {message && (
        <p className="mt-3 text-xs" style={{ color: 'var(--status-good)' }}>
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 text-xs" style={{ color: 'var(--status-critical)' }}>
          {error}
        </p>
      )}

      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        El consentimiento caduca (cada banco fija su máximo): cuando lo haga, vuelve a autorizar. La importación
        manual del extracto en <strong>Movimientos</strong> sigue funcionando como respaldo.
      </p>
    </section>
  )
}
