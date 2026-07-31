import { describe, expect, it } from 'vitest'
import type { HoldingRow } from '../types'
import { calculatePercentile, lotsToShares, PercentileError } from './percentile'

const rows: HoldingRow[] = Array.from({ length: 15 }, (_, index) => ({
  holdingLevel: index + 1,
  holderCount: 100,
  shareCount: (index + 1) * 100_000,
  custodyPercentage: 100 / 15,
}))

describe('lotsToShares', () => {
  it('支援小數張與零股換算', () => {
    expect(lotsToShares('0.5')).toBe(500)
    expect(lotsToShares('0.001')).toBe(1)
  })

  it.each(['', '-1', 'NaN', 'Infinity', '0', '0.0005'])(
    '拒絕不合法輸入 %s',
    (value) => expect(() => lotsToShares(value)).toThrow(PercentileError),
  )
})

describe('calculatePercentile', () => {
  it('計算第一個級距', () => {
    const result = calculatePercentile(rows, 500)
    expect(result.bucket.level).toBe(1)
    expect(result.lowerPercentile).toBe(0)
    expect(result.estimatedPercentile).toBeCloseTo(3.33, 1)
  })

  it('計算中間級距', () => {
    const result = calculatePercentile(rows, 45_000)
    expect(result.bucket.level).toBe(8)
    expect(result.lowerPercentile).toBeCloseTo(46.67, 1)
    expect(result.estimatedPercentile).toBeCloseTo(50, 1)
  })

  it('在級距邊界套用 0 與 1 的內插位置', () => {
    expect(calculatePercentile(rows, 40_001).bucketPosition).toBe(0)
    expect(calculatePercentile(rows, 50_000).bucketPosition).toBe(1)
    expect(calculatePercentile(rows, 50_001).bucket.level).toBe(9)
  })

  it('最高無上限級距只回傳上下界', () => {
    const result = calculatePercentile(rows, 2_000_000)
    expect(result.bucket.level).toBe(15)
    expect(result.estimatedPercentile).toBeNull()
    expect(result.lowerPercentile).toBeCloseTo(93.33, 1)
    expect(result.upperPercentile).toBe(100)
  })

  it('無資料時失敗', () => {
    expect(() => calculatePercentile([], 1_000)).toThrowError(/沒有可用/)
  })

  it('總股東人數為 0 時失敗', () => {
    const emptyRows = rows.map((row) => ({ ...row, holderCount: 0 }))
    expect(() => calculatePercentile(emptyRows, 1_000)).toThrowError(/合計為 0/)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    '拒絕不合法股數 %s',
    (shares) => expect(() => calculatePercentile(rows, shares)).toThrow(PercentileError),
  )

  it('拒絕缺漏級距', () => {
    expect(() => calculatePercentile(rows.slice(1), 1_000)).toThrowError(/級距資料不完整/)
  })
})
