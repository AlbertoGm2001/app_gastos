import { useRef, useState } from 'react'
import { formatEUR } from '../lib/aggregate'
import { ImportError, dedupeKey, parseTransactionsFile, type ParsedImport } from '../lib/importTransactions'
import type { Transaction } from '../types'

interface Props {
  existingTransactions: Transaction[]
  onImport: (transactions: Transaction[]) => void
}

interface Preview extends ParsedImport {
  duplicateCount: number
  newTransactions: Transaction[]
}

export function ImportTransactions({ existingTransactions, onImport }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError(null)
    setSuccessMessage(null)
    setLoading(true)
    try {
      const parsed = await parseTransactionsFile(file)
      const existingKeys = new Set(existingTransactions.map(dedupeKey))
      const newTransactions = parsed.transactions.filter((t) => !existingKeys.has(dedupeKey(t)))
      setPreview({ ...parsed, duplicateCount: parsed.transactions.length - newTransactions.length, newTransactions })
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'No se ha podido leer el archivo. Comprueba que sea un Excel o CSV válido.')
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function confirmImport() {
    if (!preview) return
    onImport(preview.newTransactions)
    setSuccessMessage(`Importados ${preview.newTransactions.length} movimientos nuevos de "${preview.fileName}".`)
    setPreview(null)
  }

  return (
    <div>
      <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        Exporta tus movimientos desde la banca online de Santander (Excel o CSV) y súbelos aquí. Se detectan las
        columnas de fecha, concepto e importe automáticamente y se evitan duplicados frente a lo ya importado.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        id="import-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <label
        htmlFor="import-file-input"
        className="inline-block cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-white"
        style={{ background: 'var(--series-1)' }}
      >
        {loading ? 'Leyendo archivo…' : 'Seleccionar archivo'}
      </label>

      {error && (
        <p className="mt-3 rounded-md border px-3 py-2 text-xs" style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}>
          {error}
        </p>
      )}

      {successMessage && (
        <p className="mt-3 rounded-md border px-3 py-2 text-xs" style={{ borderColor: 'var(--status-good)', color: 'var(--success-text)' }}>
          {successMessage}
        </p>
      )}

      {preview && (
        <div className="mt-4 rounded-lg border p-4" style={{ borderColor: 'var(--border-hairline)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {preview.fileName}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {preview.transactions.length} movimientos detectados · {preview.newTransactions.length} nuevos ·{' '}
            {preview.duplicateCount} ya existían
            {preview.skippedRows > 0 && ` · ${preview.skippedRows} filas no reconocidas`}
          </p>

          <div className="mt-3 max-h-56 overflow-y-auto">
            <table className="w-full text-left text-xs" style={{ color: 'var(--text-primary)' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="py-1 pr-4 font-medium">Fecha</th>
                  <th className="py-1 pr-4 font-medium">Concepto</th>
                  <th className="py-1 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {preview.transactions.slice(0, 8).map((t) => (
                  <tr key={t.id} className="border-t" style={{ borderColor: 'var(--gridline)' }}>
                    <td className="py-1 pr-4" style={{ color: 'var(--text-secondary)' }}>
                      {t.date}
                    </td>
                    <td className="py-1 pr-4">{t.description}</td>
                    <td className="py-1 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatEUR(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.transactions.length > 8 && (
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                y {preview.transactions.length - 8} más…
              </p>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={confirmImport}
              disabled={preview.newTransactions.length === 0}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--series-1)' }}
            >
              Importar {preview.newTransactions.length} movimientos nuevos
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-md border px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-secondary)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
