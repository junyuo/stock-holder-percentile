import { useEffect, useRef, useState } from 'react'
import { createShareUrl, generateShareImage, type ShareResultData } from '../lib/shareImage'
import { formatDataDate, formatNumber, formatPr } from '../lib/format'
import { topHeadline } from '../lib/topPercentage'

export function ShareResult({ data, result }: ShareResultData) {
  const [message, setMessage] = useState('')
  const [fallback, setFallback] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const url = createShareUrl(window.location.href, data.stockCode, result.userShares)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  function feedback(value: string) {
    if (timer.current) clearTimeout(timer.current)
    setMessage(value)
    timer.current = setTimeout(() => setMessage(''), 6000)
  }
  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setFallback(false)
      feedback('已複製分析連結')
    } catch {
      setFallback(true)
      feedback('無法自動複製，請選取下方連結手動複製。')
    }
  }
  async function download() {
    setBusy(true)
    try {
      const blob = await generateShareImage({ data, result })
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `${data.stockCode}-${data.dataDate}-PR.png`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      feedback('已產生 PNG 並開始下載')
    } catch (error) {
      feedback(error instanceof Error ? error.message : '圖片下載失敗，請再試一次。')
    } finally { setBusy(false) }
  }
  async function share() {
    try {
      await navigator.share({ title: `${data.stockCode} 集保持股 PR 分析`, text: topHeadline(result), url })
      feedback('已開啟系統分享')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setFallback(true)
      feedback('系統分享無法使用，請複製連結或下載圖片。')
    }
  }
  return <section className="panel share-panel" aria-labelledby="share-title">
    <div>
      <div className="section-kicker">讓統計更容易交流</div>
      <h2 id="share-title">分享分析</h2>
      <p className="panel-intro">分享內容包含證券代號與持有張數。連結會使用開啟時的最新資料重新分析。</p>
      <div className="share-actions">
        <button type="button" onClick={() => void copyLink()}>複製分析連結</button>
        <button type="button" disabled={busy} onClick={() => void download()}>{busy ? '圖片產生中…' : '下載結果圖片 PNG'}</button>
        {typeof navigator.share === 'function' && <button type="button" onClick={() => void share()}>系統分享</button>}
      </div>
      <p className="share-feedback" role="status" aria-live="polite">{message}</p>
      {fallback && <label className="share-fallback">手動複製分析連結<input aria-label="分析連結" readOnly value={url} onFocus={(event) => event.currentTarget.select()} /></label>}
    </div>
    <div className="share-preview" aria-label="分享內容預覽">
      <span>{data.stockCode} · {data.stockName ?? '證券名稱未提供'}</span>
      <strong>{topHeadline(result)}</strong>
      <span>{result.estimatedPercentile === null ? '無單點推估' : `模型推估 PR ${formatPr(result.estimatedPercentile)}`}</span>
      <span>合理範圍 PR {formatPr(result.lowerPercentile)}～{formatPr(result.upperPercentile)}</span>
      <small>{formatNumber(result.userShares / 1000, 3)} 張 · TDCC {formatDataDate(data.dataDate)}</small>
    </div>
  </section>
}
