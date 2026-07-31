import type { Manifest, StockData, StockSummary } from '../types'

const BASE = import.meta.env.BASE_URL

export class DataError extends Error {
  constructor(
    public readonly code: 'NETWORK' | 'NOT_FOUND' | 'INVALID_JSON' | 'DATE_MISMATCH',
    message: string,
  ) {
    super(message)
    this.name = 'DataError'
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}data/${path}`, { headers: { Accept: 'application/json' } })
  } catch {
    throw new DataError('NETWORK', '資料下載失敗，請檢查網路連線後再試一次。')
  }

  if (response.status === 404) {
    throw new DataError('NOT_FOUND', '找不到這個股票代號的最新資料。')
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

export async function loadIndexData(): Promise<{ manifest: Manifest; stocks: StockSummary[] }> {
  const [manifest, stocks] = await Promise.all([
    fetchJson<Manifest>('manifest.json'),
    fetchJson<StockSummary[]>('stocks.json'),
  ])
  if (!manifest.latestDataDate || !Array.isArray(stocks)) {
    throw new DataError('INVALID_JSON', '資料索引格式錯誤。')
  }
  return { manifest, stocks }
}

export async function loadStockData(stockCode: string, manifestDate: string): Promise<StockData> {
  const data = await fetchJson<StockData>(`latest/${encodeURIComponent(stockCode)}.json`)
  if (
    data.stockCode !== stockCode ||
    !Array.isArray(data.rows) ||
    data.rows.some(
      (row) =>
        !Number.isInteger(row.holdingLevel) ||
        !Number.isSafeInteger(row.holderCount) ||
        !Number.isSafeInteger(row.shareCount) ||
        !Number.isFinite(row.custodyPercentage),
    )
  ) {
    throw new DataError('INVALID_JSON', '個股資料格式錯誤。')
  }
  if (data.dataDate !== manifestDate) {
    throw new DataError('DATE_MISMATCH', '個股資料日期與資料索引不一致，系統已停止計算。')
  }
  return data
}
