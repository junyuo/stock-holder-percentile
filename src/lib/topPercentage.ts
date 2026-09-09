import type { PercentileResult } from '../types'
import { formatTopPercentage } from './format'

export function toTopPercentage(percentile: number): number {
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 100) throw new RangeError('PR 必須介於 0～100。')
  return 100 - percentile
}

export function toTopRange(lower: number, upper: number) {
  if (lower > upper) throw new RangeError('PR 下界不可大於上界。')
  return { lower: toTopPercentage(upper), upper: toTopPercentage(lower) }
}

export function topRangeText(lower: number, upper: number): string {
  const range = toTopRange(lower, upper)
  return `約位於前 ${formatTopPercentage(range.lower)}%～${formatTopPercentage(range.upper)}%`
}

export function topHeadline(result: Pick<PercentileResult, 'lowerPercentile' | 'upperPercentile' | 'estimatedPercentile'>): string {
  return result.estimatedPercentile === null
    ? topRangeText(result.lowerPercentile, result.upperPercentile)
    : `約前 ${formatTopPercentage(toTopPercentage(result.estimatedPercentile))}% 持有者`
}
