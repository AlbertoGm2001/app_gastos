export interface DateRange {
  start: string // ISO yyyy-MM-dd, inclusive
  end: string // ISO yyyy-MM-dd, inclusive
  presetId: string
  label: string
}

function toIso(d: Date): string {
  // Componentes locales, no toISOString(): en UTC+X el día se desplazaría al anterior.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysAgo(n: number, from: Date): Date {
  const d = new Date(from)
  d.setDate(d.getDate() - n)
  return d
}

export function buildPresets(today: Date, firstDate?: string): DateRange[] {
  const todayIso = toIso(today)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const yearStart = new Date(today.getFullYear(), 0, 1)

  const presets: DateRange[] = [
    { presetId: 'today', label: 'Hoy', start: todayIso, end: todayIso },
    { presetId: '7d', label: 'Últimos 7 días', start: toIso(daysAgo(6, today)), end: todayIso },
    { presetId: '30d', label: 'Últimos 30 días', start: toIso(daysAgo(29, today)), end: todayIso },
    { presetId: '90d', label: 'Últimos 90 días', start: toIso(daysAgo(89, today)), end: todayIso },
    { presetId: 'mtd', label: 'Este mes', start: toIso(monthStart), end: todayIso },
    { presetId: 'ytd', label: 'Este año', start: toIso(yearStart), end: todayIso },
  ]

  if (firstDate) {
    presets.push({ presetId: 'all', label: 'Todo el histórico', start: firstDate, end: todayIso })
  }

  return presets
}

export function customRange(start: string, end: string): DateRange {
  return { presetId: 'custom', label: 'Personalizado', start, end }
}
