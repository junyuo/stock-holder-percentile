import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAnalysisData, loadIndexData, type DataIndex } from './data'
import type { StockData } from '../types'

function makeIndex(date: string, generatedAt: string, hashDigit: string, codes = ['0050']): DataIndex {
  return {
    manifest: {
      latestDataDate: date,
      generatedAt,
      schemaVersion: '1.0.0',
      stockCount: codes.length,
      sourceHash: hashDigit.repeat(64),
    },
    stocks: codes.map((stockCode) => ({ stockCode, stockName: null, dataDate: date })),
  }
}

const oldIndex = makeIndex('20260821', '2026-08-22T09:00:00+08:00', 'a')
const newIndex = makeIndex('20260828', '2026-09-05T12:43:11+08:00', 'b', ['0050', '00999'])

function makeStock({ manifest }: DataIndex, stockCode = '0050'): StockData {
  return {
    stockCode,
    stockName: null,
    dataDate: manifest.latestDataDate,
    generatedAt: manifest.generatedAt,
    schemaVersion: manifest.schemaVersion,
    sourceUrl: 'https://example.com/',
    rows: [{ holdingLevel: 1, holderCount: 1, shareCount: 1, custodyPercentage: 100 }],
  }
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const response of responses) fetchMock.mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const json = (value: unknown) => Response.json(value)
const relativeUrl = (input: RequestInfo | URL) => new URL(String(input), 'https://example.com')
afterEach(() => vi.unstubAllGlobals())

describe('資料版本載入', () => {
  it('先重新驗證 manifest，再依 sourceHash 下載清單與個股', async () => {
    const fetchMock = mockFetch(json(oldIndex.manifest), json(oldIndex.stocks), json(makeStock(oldIndex)))
    const index = await loadIndexData()
    const result = await loadAnalysisData('0050', index)

    expect(result.index).toEqual(oldIndex)
    expect(result.data).toEqual(makeStock(oldIndex))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [manifest, stocks, stock] = fetchMock.mock.calls
    expect(relativeUrl(manifest[0]).pathname).toMatch(/\/data\/manifest\.json$/)
    expect(manifest[1]?.cache).toBe('no-cache')
    expect(relativeUrl(stocks[0]).pathname).toMatch(/\/data\/stocks\.json$/)
    expect(relativeUrl(stock[0]).pathname).toMatch(/\/data\/latest\/0050\.json$/)
    expect(relativeUrl(stocks[0]).searchParams.get('v')).toBe(oldIndex.manifest.sourceHash)
    expect(relativeUrl(stock[0]).searchParams.get('v')).toBe(oldIndex.manifest.sourceHash)
  })

  it.each(['舊分頁', '同日重產', '暫時 404', 'schema 版本不符'])('可從「%s」恢復，三個重取請求共用新快取參數', async (scenario) => {
    const next = scenario === '同日重產'
      ? makeIndex(oldIndex.manifest.latestDataDate, '2026-08-22T10:00:00+08:00', 'c')
      : newIndex
    const stock = makeStock(next)
    const first = scenario === '暫時 404' ? new Response(null, { status: 404 }) : json(
      scenario === 'schema 版本不符' ? { ...makeStock(oldIndex), schemaVersion: '0.9.0' } : stock,
    )
    const fetchMock = mockFetch(first, json(next.manifest), json(next.stocks), json(stock))

    await expect(loadAnalysisData('0050', oldIndex)).resolves.toEqual({ index: next, data: stock })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const [, ...retryCalls] = fetchMock.mock.calls
    const retryKeys = retryCalls.map(([url]) => relativeUrl(url).searchParams.get('retry'))
    expect(retryKeys[0]).toBeTruthy()
    expect(new Set(retryKeys).size).toBe(1)
    for (const [, options] of retryCalls) expect(options?.cache).toBe('no-store')
    expect(relativeUrl(retryCalls[2][0]).searchParams.get('v')).toBe(next.manifest.sourceHash)
  })

  it.each(['日期', '筆數'])('初始化的清單%s不符時重取整組索引一次', async (field) => {
    const mismatched = field === '日期' ? oldIndex.stocks : newIndex.stocks.slice(0, 1)
    const candidate = field === '日期' ? { ...newIndex.manifest, stockCount: 1 } : newIndex.manifest
    const fetchMock = mockFetch(json(candidate), json(mismatched), json(newIndex.manifest), json(newIndex.stocks))

    await expect(loadIndexData()).resolves.toEqual(newIndex)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('用重取後的清單查詢新增的代號', async () => {
    const stock = makeStock(newIndex, '00999')
    const fetchMock = mockFetch(json(newIndex.manifest), json(newIndex.stocks), json(stock))
    await expect(loadAnalysisData('00999', oldIndex)).resolves.toEqual({ index: newIndex, data: stock })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('重取後仍無該代號時回傳查無代號', async () => {
    const fetchMock = mockFetch(json(newIndex.manifest), json(newIndex.stocks))
    await expect(loadAnalysisData('9999', oldIndex)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(['不一致', '404'])('重取後個股仍%s，只嘗試一次並回傳同步錯誤', async (failure) => {
    const response = failure === '404' ? new Response(null, { status: 404 }) : json(makeStock(oldIndex))
    const fetchMock = mockFetch(json(makeStock(newIndex)), json(newIndex.manifest), json(newIndex.stocks), response)
    await expect(loadAnalysisData('0050', oldIndex)).rejects.toMatchObject({ code: 'DATE_MISMATCH' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('第二次索引仍不一致時不請求個股檔，也不再重試', async () => {
    const fetchMock = mockFetch(json(newIndex.manifest), json(oldIndex.stocks), json(newIndex.manifest), json(oldIndex.stocks))
    await expect(loadAnalysisData('0050', null)).rejects.toMatchObject({ code: 'DATE_MISMATCH' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.some(([url]) => relativeUrl(url).pathname.includes('/latest/'))).toBe(false)
  })

  it.each([
    ['INVALID_JSON', () => new Response('{')],
    ['INVALID_JSON', () => json(makeStock(oldIndex, '2330'))],
    ['NETWORK', () => new Response(null, { status: 503 })],
  ] as const)('保留 %s 分類，遇到非版本錯誤不重試', async (code, response) => {
    const fetchMock = mockFetch(response())
    await expect(loadAnalysisData('0050', oldIndex)).rejects.toMatchObject({ code })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('拒絕重複代號', async () => {
    const fetchMock = mockFetch(json(newIndex.manifest), json([newIndex.stocks[0], newIndex.stocks[0]]))
    await expect(loadIndexData()).rejects.toMatchObject({ code: 'INVALID_JSON' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
