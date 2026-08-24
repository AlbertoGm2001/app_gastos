export interface DateRange {
  start: string // ISO yyyy-MM-dd, inclusive
  end: string // ISO yyyy-MM-dd, inclusive
  presetId: string
  label: string
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number, from: Date): Date {
  const d = new Date(from)
  d.setDate(d.getDate() - n)
  return d
}

export function buildPresets(today: Date): DateRange[] {
  const todayIso = toIso(today)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  return [
    { presetId: 'today', label: 'Hoy', start: todayIso, end: todayIso },
    { presetId: '7d', label: 'Últimos 7 días', start: toIso(daysAgo(6, today)), end: todayIso },
    { presetId: '30d', label: 'Últimos 30 días', start: toIso(daysAgo(29, today)), end: todayIso },
    { presetId: '90d', label: 'Últimos 90 días', start: toIso(daysAgo(89, today)), end: todayIso },
    { presetId: 'mtd', label: 'Este mes', start: toIso(monthStart), end: todayIso },
  ]
}

export function customRange(start: string, end: string): DateRange {
  return { presetId: 'custom', label: 'Personalizado', start, end }
}
