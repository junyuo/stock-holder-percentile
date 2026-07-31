export interface Manifest {
  latestDataDate: string
  generatedAt: string
  stockCount: number
  schemaVersion: string
  sourceHash: string
}

export interface StockSummary {
  stockCode: string
  stockName: string | null
  dataDate: string
}

export interface HoldingRow {
  holdingLevel: number
  holderCount: number
  shareCount: number
  custodyPercentage: number
}

export interface StockData {
  schemaVersion: string
  dataDate: string
  generatedAt: string
  stockCode: string
  stockName: string | null
  sourceUrl: string
  rows: HoldingRow[]
}

export interface BucketDefinition {
  level: number
  min: number
  max: number | null
  label: string
}

export interface PercentileResult {
  bucket: BucketDefinition
  row: HoldingRow
  userShares: number
  totalHolders: number
  holdersBelow: number
  lowerPercentile: number
  upperPercentile: number
  estimatedPercentile: number | null
  bucketPosition: number | null
}
