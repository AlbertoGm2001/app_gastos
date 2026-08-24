import type { ReactNode } from 'react'

export type PageId = 'dashboard' | 'movimientos' | 'configuracion'

interface NavItem {
  id: PageId
  label: string
  icon: ReactNode
}

const ICONS = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2" y="9" width="3.5" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7.25" y="5" width="3.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12.5" y="2" width="3.5" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  movimientos: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 5h12M3 9h12M3 13h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  configuracion: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 2.5v1.6M9 13.9v1.6M15.5 9h-1.6M4.1 9H2.5M13.2 4.8l-1.13 1.13M5.93 12.07L4.8 13.2M13.2 13.2l-1.13-1.13M5.93 5.93 4.8 4.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Panel', icon: ICONS.dashboard },
  { id: 'movimientos', label: 'Movimientos', icon: ICONS.movimientos },
  { id: 'configuracion', label: 'Configuración', icon: ICONS.configuracion },
]

interface Props {
  active: PageId
  onNavigate: (page: PageId) => void
}

export function Sidebar({ active, onNavigate }: Props) {
  return (
    <nav
      className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b p-2 sm:h-screen sm:w-56 sm:flex-col sm:gap-1 sm:overflow-visible sm:border-b-0 sm:border-r sm:p-4"
      style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-1)' }}
      aria-label="Navegación principal"
    >
      <div className="hidden px-2 pb-4 sm:block">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Gastos Santander
        </p>
      </div>
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={isActive ? 'page' : undefined}
            className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              color: isActive ? 'var(--series-1)' : 'var(--text-secondary)',
              background: isActive ? 'color-mix(in srgb, var(--series-1) 12%, transparent)' : 'transparent',
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
