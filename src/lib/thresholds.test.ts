import { describe, expect, it } from 'vitest'
import { calculateHoldingThreshold, calculateHoldingThresholds } from './thresholds'
import { calculatePercentile, HOLDING_BUCKETS, lotsToShares } from './percentile'
import type { HoldingRow } from '../types'

const rows: HoldingRow[] = HOLDING_BUCKETS.map((bucket) => ({ holdingLevel: bucket.level, holderCount: 100, shareCount: 100000, custodyPercentage: 1 }))
const fixture = (counts: number[]) => rows.map((row, i) => ({ ...row, holderCount: counts[i] ?? 0 }))

describe('持股門檻反函式', () => {
  it.each([[50, 8], [25, 12], [10, 14], [5, 15], [1, 15]])('前 %s%% 位於第 %s 級', (top, level) => {
    expect(calculateHoldingThreshold(rows, top).holdingLevel).toBe(level)
  })
  it('有限級距內插並向上取整', () => {
    expect(calculateHoldingThreshold(rows, 50).estimatedShares).toBe(45001)
  })
  it('每個預設門檻回帶後不低於目標，且不修改來源', () => {
    const data = fixture([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 500, 800, 400, 800, 0])
    const before = JSON.stringify(data)
    for (const threshold of calculateHoldingThresholds(data)) {
      const shares = threshold.estimatedShares!
      expect(Number.isSafeInteger(shares)).toBe(true)
      expect(lotsToShares(String(shares / 1000))).toBe(shares)
      expect(calculatePercentile(data, shares).estimatedPercentile! + 1e-10).toBeGreaterThanOrEqual(threshold.targetPercentile)
      expect(shares).toBeLessThanOrEqual(HOLDING_BUCKETS[threshold.holdingLevel - 1].max!)
    }
    expect(JSON.stringify(data)).toBe(before)
  })
  it('最高級距不猜測上限或單點', () => {
    expect(calculateHoldingThreshold(rows, 1)).toMatchObject({ estimatedShares: null, minimumShares: 1000001, isOpenEnded: true })
  })
  it('忽略零人數級距', () => {
    expect(calculateHoldingThreshold(fixture([0, 0, 100]), 50)).toMatchObject({ holdingLevel: 3, estimatedShares: 7501 })
  })
  it('共用邊界選較低級距的上限', () => {
    expect(calculateHoldingThreshold(fixture([50, 0, 50]), 50).estimatedShares).toBe(999)
  })
  it('支援 PR 0 與 100', () => {
    const data = fixture([100])
    expect(calculateHoldingThreshold(data, 100).estimatedShares).toBe(1)
    expect(calculateHoldingThreshold(data, 0).estimatedShares).toBe(999)
  })
  it('浮點邊界與最少一股驗證', () => {
    const data = fixture([7, 13, 29, 71, 3])
    for (const top of [0.001, 0.1, 1, 5, 10, 25, 33.3333333333, 50, 99.999]) {
      const threshold = calculateHoldingThreshold(data, top)
      const shares = threshold.estimatedShares!
      expect(calculatePercentile(data, shares).estimatedPercentile! + 1e-10).toBeGreaterThanOrEqual(threshold.targetPercentile)
      if (shares > 1) expect(calculatePercentile(data, shares - 1).estimatedPercentile!).toBeLessThanOrEqual(threshold.targetPercentile + 1e-10)
    }
  })
  it.each([NaN, Infinity, -1, 101])('拒絕非法目標 %s', (top) => expect(() => calculateHoldingThreshold(rows, top)).toThrow())
  it('拒絕空白、零人數、缺漏、重複、非法人數與總數溢位', () => {
    for (const invalid of [[], fixture([]), rows.slice(1), [...rows.slice(1), rows[1]], fixture([-1]), fixture([NaN]), fixture([1.5]), fixture([Number.MAX_SAFE_INTEGER, 1])]) {
      expect(() => calculateHoldingThreshold(invalid, 10)).toThrow()
    }
  })
  it('不把官方合計列算入分母', () => {
    expect(calculateHoldingThreshold([...rows, { ...rows[0], holdingLevel: 17, holderCount: 1500 }], 50)).toEqual(calculateHoldingThreshold(rows, 50))
  })
})
