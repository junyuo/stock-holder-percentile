import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { HolderPyramid } from './components/HolderPyramid'
import { ResultHeadline } from './components/ResultHeadline'
import { HoldingThresholds } from './components/HoldingThresholds'
import { ShareResult } from './components/ShareResult'
import { DataError, loadAnalysisData, loadIndexData, type DataIndex } from './lib/data'
import { formatDataDate, formatNumber, formatPr, formatHolderPercentage, formatTaipeiTime } from './lib/format'
import { calculatePercentile, lotsToShares, PercentileError } from './lib/percentile'
import type { PercentileResult, StockData, StockSummary } from './types'

interface AnalysisState {
  data: StockData
  result: PercentileResult
  lots: number
}

const TDCC_SOURCE = 'https://openapi.tdcc.com.tw/swagger-ui/index.html?configUrl=%2Ftdcc-opendata-api-docs%2Fswagger-config'
const EMPTY_STOCKS: StockSummary[] = []

const PercentileGauge = lazy(() =>
  import('./components/PercentileGauge').then((module) => ({ default: module.PercentileGauge })),
)
const DistributionChart = lazy(() =>
  import('./components/DistributionChart').then((module) => ({ default: module.DistributionChart })),
)

function actionableMessage(error: unknown): { title: string; action: string } {
  if (error instanceof PercentileError) {
    const actions: Record<PercentileError['code'], string> = {
      INVALID_INPUT: '請輸入大於 0 的張數；零股可用 0.001 張為單位換算。',
      TOO_LARGE: '請確認是否誤把「股數」填入「張數」欄位。',
      NO_DATA: '請稍後再試，或查看官方資料來源是否已發布最新一期。',
      ZERO_HOLDERS: '這份資料無法計算 PR，請改查其他股票或等待資料更新。',
      INVALID_BUCKET: '請稍後再試；若持續發生，請附上股票代號回報資料異常。',
      BUCKET_GAP: '請確認張數，或回報此筆資料讓維護者檢查級距。',
    }
    return { title: error.message, action: actions[error.code] }
  }
  if (error instanceof DataError) {
    const actions: Record<DataError['code'], string> = {
      NETWORK: '請檢查網路後重試；既有官方資料不會因下載失敗而被刪除。',
      NOT_FOUND: '請確認股票代號，或從股票名稱提示中選擇仍有本期資料的證券。',
      INVALID_JSON: '請重新整理頁面；若仍發生，請回報資料檔異常。',
      DATE_MISMATCH: '你的股票代號和持有張數已保留，可稍後再按一次查詢。',
    }
    return { title: error.message, action: actions[error.code] }
  }
  return { title: '發生未預期的錯誤。', action: '請重新整理頁面後再試一次。' }
}

function App() {
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), [])
  const [stockCode, setStockCode] = useState(initialQuery.get('stock')?.trim().toUpperCase() ?? '')
  const [lots, setLots] = useState(initialQuery.get('lots')?.trim() ?? '')
  const [index, setIndex] = useState<DataIndex | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null)
  const [loading, setLoading] = useState(false)
  const [indexLoading, setIndexLoading] = useState(true)
  const [error, setError] = useState<{ title: string; action: string } | null>(null)
  const autoRan = useRef(false)
  const initialIndexRequest = useRef<Promise<DataIndex> | null>(null)
  const analysisInProgress = useRef(false)

  const stocks = index?.stocks ?? EMPTY_STOCKS
  const stockMap = useMemo(
    () => new Map(stocks.map((stock) => [stock.stockCode, stock])),
    [stocks],
  )
  const normalizedCode = stockCode.trim().toUpperCase()
  const selectedStock = stockMap.get(normalizedCode)
  const suggestions = useMemo(() => {
    const query = normalizedCode.toLocaleLowerCase('zh-TW')
    if (!query) return stocks.slice(0, 12)
    return stocks
      .filter(
        (stock) =>
          stock.stockCode.toLocaleLowerCase('zh-TW').startsWith(query) ||
          stock.stockName?.toLocaleLowerCase('zh-TW').includes(query),
      )
      .slice(0, 20)
  }, [normalizedCode, stocks])

  useEffect(() => {
    let active = true
    initialIndexRequest.current ??= loadIndexData()
    initialIndexRequest.current
      .then((nextIndex) => {
        if (active) setIndex(nextIndex)
      })
      .catch((caught) => {
        if (active) setError(actionableMessage(caught))
      })
      .finally(() => {
        if (active) {
          initialIndexRequest.current = null
          setIndexLoading(false)
        }
      })
    return () => { active = false }
  }, [])

  async function runAnalysis(code: string, lotsInput: string, updateUrl = true) {
    if (analysisInProgress.current) return
    autoRan.current = true
    setError(null)
    setAnalysis(null)
    const trimmedCode = code.trim().toUpperCase()
    if (!trimmedCode) {
      setError({ title: '請輸入股票代號。', action: '例如：0050、2330。' })
      return
    }
    if (!lotsInput.trim()) {
      setError({ title: '請輸入持有張數。', action: '可輸入整數或小數，例如 50 或 0.5。' })
      return
    }
    analysisInProgress.current = true
    try {
      setLoading(true)
      const userShares = lotsToShares(lotsInput)
      const { index: nextIndex, data } = await loadAnalysisData(trimmedCode, index)
      const result = calculatePercentile(data.rows, userShares)
      const numericLots = userShares / 1_000
      setIndex(nextIndex)
      setAnalysis({ data, result, lots: numericLots })
      setStockCode(trimmedCode)
      setLots(String(numericLots))
      if (updateUrl) {
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.set('stock', trimmedCode)
        nextUrl.searchParams.set('lots', String(numericLots))
        history.replaceState(null, '', nextUrl)
      }
      requestAnimationFrame(() => document.getElementById('analysis-result')?.scrollIntoView({ behavior: 'smooth' }))
    } catch (caught) {
      setError(actionableMessage(caught))
    } finally {
      analysisInProgress.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    if (indexLoading || !index || autoRan.current) return
    const queryStock = initialQuery.get('stock')
    const queryLots = initialQuery.get('lots')
    if (queryStock && queryLots) {
      const timeout = window.setTimeout(() => {
        if (!autoRan.current) void runAnalysis(queryStock, queryLots, false)
      }, 0)
      return () => window.clearTimeout(timeout)
    }
  // runAnalysis is intentionally triggered once after index data is ready.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, indexLoading, initialQuery])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void runAnalysis(stockCode, lots)
  }

  function useExample() {
    setStockCode('0050')
    setLots('50')
    void runAnalysis('0050', '50')
  }

  const displayPercentile = analysis?.result.estimatedPercentile
  const dataDate = analysis ? formatDataDate(analysis.data.dataDate) : ''
  const dataUpdatedAt = analysis ? formatTaipeiTime(analysis.data.generatedAt) : ''
  const dataRows = analysis?.data.rows
    .filter((row) => row.holdingLevel >= 1 && row.holdingLevel <= 15)
    .sort((a, b) => a.holdingLevel - b.holdingLevel)

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="集保持股 PR 分析首頁">
          <span className="brand-mark">PR</span>
          <span>集保持股分析</span>
        </a>
        <a className="source-pill" href={TDCC_SOURCE} target="_blank" rel="noreferrer">
          <span className="status-dot" /> TDCC 官方開放資料
        </a>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">TAIWAN HOLDER DISTRIBUTION</div>
            <h1>看懂你的持股，<span>落在股東分布的哪裡。</span></h1>
            <p>用 TDCC 官方集保級距資料，快速理解你的持股位置、合理 PR 範圍與股東結構。</p>
            <div className="hero-note">
              <span>區間統計</span>
              <span>每週更新</span>
              <span>不構成投資建議</span>
            </div>
          </div>

          <div className="hero-action">
            <form className="search-card" onSubmit={handleSubmit} noValidate>
              <div className="search-card-heading">
                <div className="section-kicker">開始分析</div>
                <h2>輸入你的持股資料</h2>
              </div>
              <label>
                <span>股票代號</span>
                <input
                  value={stockCode}
                  onChange={(event) => setStockCode(event.target.value.toUpperCase())}
                  placeholder="例如 0050"
                  list="stock-suggestions"
                  autoComplete="off"
                  inputMode="text"
                  maxLength={12}
                />
                <datalist id="stock-suggestions">
                  {suggestions.map((stock) => (
                    <option value={stock.stockCode} key={stock.stockCode}>{stock.stockName ?? '名稱未提供'}</option>
                  ))}
                </datalist>
                <small>{selectedStock?.stockName ?? (indexLoading ? '正在載入股票清單…' : '輸入代號後顯示名稱')}</small>
              </label>
              <label>
                <span>持有張數</span>
                <div className="input-suffix">
                  <input
                    value={lots}
                    onChange={(event) => setLots(event.target.value)}
                    placeholder="例如 50 或 0.5"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                  <span>張</span>
                </div>
                <small>1 張 = 1,000 股，最小 0.001 張</small>
              </label>
              <button className="primary-button" type="submit" disabled={loading || indexLoading}>
                {loading ? '分析中…' : '查看我的統計位置'}
              </button>
              <button className="example-button" type="button" onClick={useExample} disabled={loading || indexLoading}>
                試試範例：0050／50 張
              </button>
            </form>

            {error && (
              <div className="error-banner" role="alert">
                <strong>{error.title}</strong>
                <span>{error.action}</span>
              </div>
            )}
          </div>
        </section>

        {analysis && dataRows && (
          <section id="analysis-result" className="results" aria-live="polite">
            <div className="result-summary panel">
              <div className="summary-topline">
                <div>
                  <span className="stock-code">{analysis.data.stockCode}</span>
                  <h2>{analysis.data.stockName ?? '證券名稱未提供'}</h2>
                </div>
                <div className="summary-dates">
                  <span>集保統計日期 <time dateTime={dataDate.replaceAll('/', '-')}>{dataDate}</time></span>
                  <span>資料最後更新 <time dateTime={analysis.data.generatedAt}>{dataUpdatedAt}</time><span className="summary-timezone">（台北時間）</span></span>
                </div>
              </div>
              <div className="summary-primary">
                <Suspense fallback={<div className="summary-gauge-loading">正在準備 PR 圖表…</div>}>
                  <PercentileGauge
                    value={analysis.result.estimatedPercentile}
                    lower={analysis.result.lowerPercentile}
                    upper={analysis.result.upperPercentile}
                  />
                </Suspense>
                <ResultHeadline result={analysis.result} />
                <dl className="summary-stats">
                  <div><dt>持有張數</dt><dd>{formatNumber(analysis.lots, 3)} 張</dd></div>
                  <div><dt>換算股數</dt><dd>{formatNumber(analysis.result.userShares)} 股</dd></div>
                  <div className="summary-stat-wide"><dt>所在級距</dt><dd>{analysis.result.bucket.label}</dd></div>
                  <div><dt>級距股東</dt><dd>{formatNumber(analysis.result.row.holderCount)} 人</dd></div>
                </dl>
              </div>
            </div>

            <HoldingThresholds rows={analysis.data.rows} currentShares={analysis.result.userShares} />
            <ShareResult key={`${analysis.data.stockCode}-${analysis.result.userShares}-${analysis.data.dataDate}`} data={analysis.data} result={analysis.result} />

            <section className="panel insight-panel" aria-labelledby="insight-title">
              <div className="section-heading">
                <div>
                  <div className="section-kicker">根據本期統計</div>
                  <h2 id="insight-title">白話解讀</h2>
                </div>
                <span className="scale-note">四個重點</span>
              </div>
              <ol>
                <li><span className="insight-content">你目前位於 <strong>{analysis.result.bucket.label}</strong> 級距。</span></li>
                <li><span className="insight-content">此級距共有 <strong>{formatNumber(analysis.result.row.holderCount)}</strong> 位集保股東，占全部股東 {formatHolderPercentage((analysis.result.row.holderCount / analysis.result.totalHolders) * 100)}。</span></li>
                {displayPercentile == null ? (
                  <li><span className="insight-content">最高級距沒有上限，只能確定合理範圍為 PR {formatPr(analysis.result.lowerPercentile)}～{formatPr(analysis.result.upperPercentile)}。</span></li>
                ) : (
                  <li><span className="insight-content">以級距內均勻分布模型推估，你的持股量約高於 <strong>{formatPr(displayPercentile)}%</strong> 的集保股東。</span></li>
                )}
                <li><span className="insight-content">人數占比與持股占比是不同概念；雙向結構圖同時呈現兩者。</span></li>
              </ol>
            </section>

            <HolderPyramid rows={dataRows} activeLevel={analysis.result.bucket.level} />
            <Suspense fallback={<div className="panel chart-loading">正在準備分布圖表…</div>}>
              <DistributionChart rows={dataRows} activeLevel={analysis.result.bucket.level} />
            </Suspense>

            <section className="method-panel" aria-labelledby="method-title">
              <div>
                <div className="section-kicker">方法與資料品質</div>
                <h2 id="method-title">如何理解這個 PR？</h2>
              </div>
              <div className="method-grid">
                <article>
                  <span>01</span>
                  <h3>PR 下界</h3>
                  <p>所有較低持股級距的人數 ÷ 總股東人數。</p>
                </article>
                <article>
                  <span>02</span>
                  <h3>PR 上界</h3>
                  <p>較低級距加上目前級距人數 ÷ 總股東人數。</p>
                </article>
                <article>
                  <span>03</span>
                  <h3>推估 PR</h3>
                  <p>有限級距內假設均勻分布，依持股數線性內插；無上限級距不估單點。</p>
                </article>
              </div>
              <div className="freshness-row">
                <span>本次資料日期：{dataDate}</span>
                <span>資料產製時間：{dataUpdatedAt}（Asia/Taipei）</span>
                <span>資料狀態：通過格式與級距驗證</span>
              </div>
            </section>
          </section>
        )}
      </main>

      <footer>
        <div className="footer-brand">集保持股 PR 分析</div>
        <p>本工具使用臺灣集中保管結算所公開的集保戶股權分散資料。由於原始資料採持股級距統計，PR 為區間與模型推估值，並非個別股東的精確排名。資料可能包含融資融券、借券、擔保品及其他專戶。資料僅供研究與資訊視覺化，不構成任何投資建議。</p>
        <div className="footer-links">
          <a href={TDCC_SOURCE} target="_blank" rel="noreferrer">TDCC 原始資料與 API</a>
          <a href="#method-title">PR 計算方法</a>
          <span>Asia/Taipei</span>
        </div>
      </footer>
    </div>
  )
}

export default App
