export const formatNumber = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat('zh-TW', { maximumFractionDigits }).format(value)

export const formatPercent = (value: number, digits = 1) =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)

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
