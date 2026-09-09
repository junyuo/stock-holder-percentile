export const formatNumber = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat('zh-TW', { maximumFractionDigits }).format(value)

export const formatPercent = (value: number, digits = 1) =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)

export function formatHolderPercentage(value: number): string {
  if (value === 0) return '0.0%'
  if (value < 0.001) return '<0.001%'
  return `${formatPercent(value, value < 0.1 ? 3 : 1)}%`
}

export function formatTopPercentage(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new RangeError('比例必須介於 0～100。')
  if (value > 0 && value < 0.001) return '<0.001'
  return formatNumber(value, value >= 1 ? 1 : value >= 0.1 ? 2 : 3)
}

export function formatPr(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('PR 必須是有限數字。')
  const bounded = Math.min(100, Math.max(0, value))
  if (bounded > 99.999 && bounded < 100) return '>99.999'
  if (bounded > 0 && bounded < 0.001) return '<0.001'
  return formatNumber(bounded, bounded > 99 || bounded < 1 ? 3 : 2)
}

export function formatDataDate(value: string): string {
  if (!/^\d{8}$/.test(value)) return value
  return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6, 8)}`
}

export function formatTaipeiTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
