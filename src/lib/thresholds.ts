import { calculatePercentile, HOLDING_BUCKETS, PercentileError } from './percentile'
import { toTopPercentage } from './topPercentage'
import type { HoldingRow } from '../types'

export const DEFAULT_TOP_TARGETS = [50, 25, 10, 5, 1] as const

export interface HoldingThreshold {
  topPercentage: number
  targetPercentile: number
  holdingLevel: number
  minimumShares: number
  estimatedShares: number | null
  isOpenEnded: boolean
}

export function calculateHoldingThreshold(rows: HoldingRow[], topPercentage: number): HoldingThreshold {
  const targetPercentile = toTopPercentage(topPercentage)
  // Reuse the forward model's validation and its exact denominator (levels 1–15).
  const { totalHolders } = calculatePercentile(rows, 1)
  if (!Number.isSafeInteger(totalHolders)) throw new PercentileError('NO_DATA', '股東總數超出安全整數範圍。')
  let below = 0
  for (const bucket of HOLDING_BUCKETS) {
    const row = rows.find((item) => item.holdingLevel === bucket.level)!
    const upper = (below + row.holderCount) / totalHolders * 100
    if (row.holderCount > 0 && targetPercentile <= upper) {
      const base = { topPercentage, targetPercentile, holdingLevel: bucket.level, minimumShares: bucket.min }
      if (bucket.max === null) return { ...base, estimatedShares: null, isOpenEnded: true }
      const position = Math.min(1, Math.max(0, (targetPercentile / 100 * totalHolders - below) / row.holderCount))
      let shares = Math.min(bucket.max, Math.ceil(bucket.min + position * (bucket.max - bucket.min)))
      const forward = calculatePercentile(rows, shares).estimatedPercentile!
      if (forward + 1e-10 < targetPercentile && shares < bucket.max) shares += 1
      if (calculatePercentile(rows, shares).estimatedPercentile! + 1e-10 < targetPercentile) {
        throw new PercentileError('NO_DATA', '持股門檻無法通過反向驗證。')
      }
      return { ...base, estimatedShares: shares, isOpenEnded: false }
    }
    below += row.holderCount
  }
  throw new PercentileError('NO_DATA', '沒有可推估的持股門檻。')
}

export function calculateHoldingThresholds(rows: HoldingRow[]): HoldingThreshold[] {
  return DEFAULT_TOP_TARGETS.map((top) => calculateHoldingThreshold(rows, top))
}
