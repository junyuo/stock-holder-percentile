import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { HolderPyramid } from './components/HolderPyramid'
import { DataError, loadIndexData, loadStockData } from './lib/data'
import { formatDataDate, formatNumber, formatPercent, formatTaipeiTime } from './lib/format'
import { calculatePercentile, lotsToShares, PercentileError } from './lib/percentile'
import type { Manifest, PercentileResult, StockData, StockSummary } from './types'

interface AnalysisState {
  data: StockData
  result: PercentileResult
  lots: number
}

const TDCC_SOURCE = 'https://openapi.tdcc.com.tw/swagger-ui/index.html?configUrl=%2Ftdcc-opendata-api-docs%2Fswagger-config'

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
      DATE_MISMATCH: '為避免以不同日期混算，請等待下一次資料更新完成。',
    }
    return { title: error.message, action: actions[error.code] }
  }
  return { title: '發生未預期的錯誤。', action: '請重新整理頁面後再試一次。' }
}

function App() {
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), [])
  const [stockCode, setStockCode] = useState(initialQuery.get('stock')?.trim().toUpperCase() ?? '')
  const [lots, setLots] = useState(initialQuery.get('lots')?.trim() ?? '')
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [stocks, setStocks] = useState<StockSummary[]>([])
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null)
  const [loading, setLoading] = useState(false)
  const [indexLoading, setIndexLoading] = useState(true)
  const [error, setError] = useState<{ title: string; action: string } | null>(null)
  const autoRan = useRef(false)

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
    loadIndexData()
      .then(({ manifest: nextManifest, stocks: nextStocks }) => {
        setManifest(nextManifest)
        setStocks(nextStocks)
      })
      .catch((caught) => setError(actionableMessage(caught)))
      .finally(() => setIndexLoading(false))
  }, [])

  async function runAnalysis(code: string, lotsInput: string, updateUrl = true) {
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
    if (!manifest) {
      setError({ title: '資料索引尚未載入完成。', action: '請稍候一秒再試一次。' })
      return
    }
    if (!stockMap.has(trimmedCode)) {
      setError({ title: `查無股票代號「${trimmedCode}」。`, action: '請確認代號，或從股票名稱提示中選擇。' })
      return
    }

    try {
      setLoading(true)
      const userShares = lotsToShares(lotsInput)
      const data = await loadStockData(trimmedCode, manifest.latestDataDate)
      const result = calculatePercentile(data.rows, userShares)
      const numericLots = userShares / 1_000
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
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!manifest || !stocks.length || autoRan.current) return
    const queryStock = initialQuery.get('stock')
    const queryLots = initialQuery.get('lots')
    if (queryStock && queryLots) {
      const timeout = window.setTimeout(() => {
        autoRan.current = true
        void runAnalysis(queryStock, queryLots, false)
      }, 0)
      return () => window.clearTimeout(timeout)
    }
  // runAnalysis is intentionally triggered once after index data is ready.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, stocks.length])

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
            <div className="result-summary panel-dark">
              <div className="summary-topline">
                <div>
                  <span className="stock-code">{analysis.data.stockCode}</span>
                  <h2>{analysis.data.stockName ?? '證券名稱未提供'}</h2>
                </div>
                <div className="data-date">資料日期 {formatDataDate(analysis.data.dataDate)}</div>
              </div>
              <div className="summary-primary">
                <Suspense fallback={<div className="summary-gauge-loading">正在準備 PR 圖表…</div>}>
                  <PercentileGauge
                    value={analysis.result.estimatedPercentile}
                    lower={analysis.result.lowerPercentile}
                    upper={analysis.result.upperPercentile}
                  />
                </Suspense>
                <div className="summary-message">
                  {displayPercentile == null ? (
                    <>
                      <div className="summary-kicker">最高持股級距 · 無上限</div>
                      <h3>你的持股量位於 PR {Math.round(analysis.result.lowerPercentile)}～{Math.round(analysis.result.upperPercentile)}</h3>
                      <p>此級距沒有精確上限，因此不顯示單點推估。</p>
                    </>
                  ) : (
                    <>
                      <div className="summary-kicker">模型推估</div>
                      <h3>你的持股量推估高於 <em>{Math.round(displayPercentile)}%</em> 的集保股東</h3>
                      <p>合理估計範圍為 PR {Math.round(analysis.result.lowerPercentile)}～{Math.round(analysis.result.upperPercentile)}</p>
                    </>
                  )}
                </div>
                <dl className="summary-stats">
                  <div><dt>持有張數</dt><dd>{formatNumber(analysis.lots, 3)} 張</dd></div>
                  <div><dt>換算股數</dt><dd>{formatNumber(analysis.result.userShares)} 股</dd></div>
                  <div><dt>所在級距</dt><dd>{analysis.result.bucket.label}</dd></div>
                  <div><dt>級距股東</dt><dd>{formatNumber(analysis.result.row.holderCount)} 人</dd></div>
                </dl>
              </div>
            </div>

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
                <li><span className="insight-content">此級距共有 <strong>{formatNumber(analysis.result.row.holderCount)}</strong> 位集保股東，占全部股東 {formatPercent((analysis.result.row.holderCount / analysis.result.totalHolders) * 100)}%。</span></li>
                {displayPercentile == null ? (
                  <li><span className="insight-content">最高級距沒有上限，只能確定合理範圍為 PR {Math.round(analysis.result.lowerPercentile)}～{Math.round(analysis.result.upperPercentile)}。</span></li>
                ) : (
                  <li><span className="insight-content">以級距內均勻分布模型推估，你的持股量約高於 <strong>{formatPercent(displayPercentile, 0)}%</strong> 的集保股東。</span></li>
                )}
                <li><span className="insight-content">人數占比與持股占比是不同概念；圖表可切換查看兩種結構。</span></li>
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
                <span>最新資料：{formatDataDate(manifest?.latestDataDate ?? '')}</span>
                <span>最近更新：{formatTaipeiTime(manifest?.generatedAt ?? '')}（Asia/Taipei）</span>
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
