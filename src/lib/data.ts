import type { Manifest, StockData, StockSummary } from '../types'

const BASE = import.meta.env.BASE_URL
const DATA_DATE = /^\d{8}$/
const SOURCE_HASH = /^[a-f0-9]{64}$/

export interface DataIndex {
  manifest: Manifest
  stocks: StockSummary[]
}

export class DataError extends Error {
  constructor(
    public readonly code: 'NETWORK' | 'NOT_FOUND' | 'INVALID_JSON' | 'DATE_MISMATCH',
    message: string,
  ) {
    super(message)
    this.name = 'DataError'
  }
}

function versionMismatch(): DataError {
  return new DataError('DATE_MISMATCH', '資料版本暫未同步，請稍後重試。')
}

async function fetchJson<T>(path: string, version?: string, refreshKey?: string): Promise<T> {
  const params = new URLSearchParams()
  if (version) params.set('v', version)
  if (refreshKey) params.set('retry', refreshKey)
  const query = params.size ? `?${params}` : ''
  let response: Response
  try {
    response = await fetch(`${BASE}data/${path}${query}`, {
      headers: { Accept: 'application/json' },
      cache: refreshKey ? 'no-store' : version ? 'default' : 'no-cache',
    })
  } catch {
    throw new DataError('NETWORK', '資料下載失敗，請檢查網路連線後再試一次。')
  }

  if (response.status === 404) {
    // Every requested file belongs to the current dataset.
    throw versionMismatch()
  }
  if (!response.ok) {
    throw new DataError('NETWORK', `資料服務暫時無法使用（HTTP ${response.status}）。`)
  }
  try {
    return (await response.json()) as T
  } catch {
    throw new DataError('INVALID_JSON', '資料格式錯誤，請稍後再試或回報問題。')
  }
}

async function fetchIndex(refreshKey?: string): Promise<DataIndex> {
  const manifest = await fetchJson<Manifest>('manifest.json', undefined, refreshKey)
  if (
    !manifest ||
    typeof manifest.latestDataDate !== 'string' || !DATA_DATE.test(manifest.latestDataDate) ||
    typeof manifest.generatedAt !== 'string' || !Number.isFinite(Date.parse(manifest.generatedAt)) ||
    !Number.isSafeInteger(manifest.stockCount) || manifest.stockCount <= 0 ||
    manifest.schemaVersion !== '1.0.0' ||
    typeof manifest.sourceHash !== 'string' || !SOURCE_HASH.test(manifest.sourceHash)
  ) {
    throw new DataError('INVALID_JSON', '資料索引格式錯誤。')
  }

  const stocks = await fetchJson<StockSummary[]>('stocks.json', manifest.sourceHash, refreshKey)
  if (!Array.isArray(stocks) || stocks.some((stock) =>
    !stock || typeof stock.stockCode !== 'string' || !stock.stockCode ||
    (typeof stock.stockName !== 'string' && stock.stockName !== null) ||
    typeof stock.dataDate !== 'string' || !DATA_DATE.test(stock.dataDate),
  )) {
    throw new DataError('INVALID_JSON', '股票清單格式錯誤。')
  }
  if (new Set(stocks.map((stock) => stock.stockCode)).size !== stocks.length) {
    throw new DataError('INVALID_JSON', '股票清單有重複代號。')
  }
  if (stocks.length !== manifest.stockCount || stocks.some((stock) => stock.dataDate !== manifest.latestDataDate)) {
    throw versionMismatch()
  }
  return { manifest, stocks }
}

async function fetchStock(stockCode: string, index: DataIndex, refreshKey?: string): Promise<StockData> {
  if (!index.stocks.some((stock) => stock.stockCode === stockCode)) {
    throw new DataError('NOT_FOUND', `查無股票代號「${stockCode}」。`)
  }
  const { manifest } = index
  const data = await fetchJson<StockData>(`latest/${encodeURIComponent(stockCode)}.json`, manifest.sourceHash, refreshKey)
  if (
    !data ||
    data.stockCode !== stockCode ||
    typeof data.dataDate !== 'string' || !DATA_DATE.test(data.dataDate) ||
    typeof data.generatedAt !== 'string' || !Number.isFinite(Date.parse(data.generatedAt)) ||
    typeof data.schemaVersion !== 'string' || !data.schemaVersion ||
    !Array.isArray(data.rows) ||
    data.rows.some(
      (row) =>
        !row || !Number.isInteger(row.holdingLevel) ||
        !Number.isSafeInteger(row.holderCount) ||
        !Number.isSafeInteger(row.shareCount) ||
        !Number.isFinite(row.custodyPercentage),
    )
  ) {
    throw new DataError('INVALID_JSON', '個股資料格式錯誤。')
  }
  if (
    data.dataDate !== manifest.latestDataDate ||
    data.generatedAt !== manifest.generatedAt ||
    data.schemaVersion !== manifest.schemaVersion
  ) {
    throw versionMismatch()
  }
  return data
}

export async function loadIndexData(): Promise<DataIndex> {
  try {
    return await fetchIndex()
  } catch (error) {
    if (!(error instanceof DataError) || error.code !== 'DATE_MISMATCH') throw error
    return fetchIndex(crypto.randomUUID())
  }
}

export async function loadAnalysisData(stockCode: string, currentIndex: DataIndex | null) {
  try {
    const index = currentIndex ?? await fetchIndex()
    return { index, data: await fetchStock(stockCode, index) }
  } catch (error) {
    if (!(error instanceof DataError) || (error.code !== 'DATE_MISMATCH' && error.code !== 'NOT_FOUND')) throw error
    const refreshKey = crypto.randomUUID()
    const index = await fetchIndex(refreshKey)
    return { index, data: await fetchStock(stockCode, index, refreshKey) }
  }
}
