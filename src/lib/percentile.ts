import type { BucketDefinition, HoldingRow, PercentileResult } from '../types'

export const MAX_LOTS = 1_000_000_000

export const HOLDING_BUCKETS: readonly BucketDefinition[] = [
  { level: 1, min: 1, max: 999, label: '1～999 股' },
  { level: 2, min: 1_000, max: 5_000, label: '1,000～5,000 股' },
  { level: 3, min: 5_001, max: 10_000, label: '5,001～10,000 股' },
  { level: 4, min: 10_001, max: 15_000, label: '10,001～15,000 股' },
  { level: 5, min: 15_001, max: 20_000, label: '15,001～20,000 股' },
  { level: 6, min: 20_001, max: 30_000, label: '20,001～30,000 股' },
  { level: 7, min: 30_001, max: 40_000, label: '30,001～40,000 股' },
  { level: 8, min: 40_001, max: 50_000, label: '40,001～50,000 股' },
  { level: 9, min: 50_001, max: 100_000, label: '50,001～100,000 股' },
  { level: 10, min: 100_001, max: 200_000, label: '100,001～200,000 股' },
  { level: 11, min: 200_001, max: 400_000, label: '200,001～400,000 股' },
  { level: 12, min: 400_001, max: 600_000, label: '400,001～600,000 股' },
  { level: 13, min: 600_001, max: 800_000, label: '600,001～800,000 股' },
  { level: 14, min: 800_001, max: 1_000_000, label: '800,001～1,000,000 股' },
  { level: 15, min: 1_000_001, max: null, label: '1,000,001 股以上' },
]

export class PercentileError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_INPUT'
      | 'TOO_LARGE'
      | 'NO_DATA'
      | 'ZERO_HOLDERS'
      | 'INVALID_BUCKET'
      | 'BUCKET_GAP',
    message: string,
  ) {
    super(message)
    this.name = 'PercentileError'
  }
}

const clamp = (value: number) => Math.min(100, Math.max(0, value))

export function lotsToShares(value: string | number): number {
  const lots = typeof value === 'number' ? value : Number(value.trim())
  if (!Number.isFinite(lots) || lots <= 0) {
    throw new PercentileError('INVALID_INPUT', '持有張數必須是大於 0 的有限數字。')
  }
  if (lots > MAX_LOTS) {
    throw new PercentileError('TOO_LARGE', `持有張數不可超過 ${MAX_LOTS.toLocaleString('zh-TW')} 張。`)
  }

  const shares = lots * 1_000
  if (!Number.isSafeInteger(shares)) {
    throw new PercentileError('INVALID_INPUT', '換算後必須是整數股，最小輸入單位為 0.001 張。')
  }
  return shares
}

export function calculatePercentile(rows: HoldingRow[], userShares: number): PercentileResult {
  if (!Number.isSafeInteger(userShares) || userShares <= 0) {
    throw new PercentileError('INVALID_INPUT', '持股數必須是大於 0 的整數。')
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new PercentileError('NO_DATA', '沒有可用的股權分散資料。')
  }

  const configuredLevels = new Set(HOLDING_BUCKETS.map((bucket) => bucket.level))
  const relevantRows = rows
    .filter((row) => configuredLevels.has(row.holdingLevel))
    .sort((a, b) => a.holdingLevel - b.holdingLevel)

  if (
    relevantRows.length !== HOLDING_BUCKETS.length ||
    relevantRows.some((row, index) => row.holdingLevel !== HOLDING_BUCKETS[index].level)
  ) {
    throw new PercentileError('INVALID_BUCKET', '持股級距資料不完整或格式無法解析。')
  }
  if (relevantRows.some((row) => !Number.isSafeInteger(row.holderCount) || row.holderCount < 0)) {
    throw new PercentileError('NO_DATA', '股東人數資料格式錯誤。')
  }

  const totalHolders = relevantRows.reduce((sum, row) => sum + row.holderCount, 0)
  if (totalHolders <= 0) {
    throw new PercentileError('ZERO_HOLDERS', '這一期資料的股東人數合計為 0。')
  }

  const bucketIndex = HOLDING_BUCKETS.findIndex(
    (bucket) => userShares >= bucket.min && (bucket.max === null || userShares <= bucket.max),
  )
  if (bucketIndex < 0) {
    throw new PercentileError('BUCKET_GAP', '持股數沒有落在任何已知級距，請回報資料異常。')
  }

  const bucket = HOLDING_BUCKETS[bucketIndex]
  const row = relevantRows[bucketIndex]
  const holdersBelow = relevantRows
    .slice(0, bucketIndex)
    .reduce((sum, current) => sum + current.holderCount, 0)
  const lowerPercentile = clamp((holdersBelow / totalHolders) * 100)
  const upperPercentile = clamp(((holdersBelow + row.holderCount) / totalHolders) * 100)

  if (bucket.max === null) {
    return {
      bucket,
      row,
      userShares,
      totalHolders,
      holdersBelow,
      lowerPercentile,
      upperPercentile,
      estimatedPercentile: null,
      bucketPosition: null,
    }
  }

  const bucketPosition = Math.min(1, Math.max(0, (userShares - bucket.min) / (bucket.max - bucket.min)))
  const estimatedPercentile = clamp(
    ((holdersBelow + row.holderCount * bucketPosition) / totalHolders) * 100,
  )

  return {
    bucket,
    row,
    userShares,
    totalHolders,
    holdersBelow,
    lowerPercentile,
    upperPercentile,
    estimatedPercentile,
    bucketPosition,
  }
}
