import type { PercentileResult, StockData } from '../types'
import { formatDataDate, formatNumber, formatPr } from './format'
import { topHeadline, topRangeText } from './topPercentage'

export interface ShareResultData {
  data: Pick<StockData, 'stockCode' | 'stockName' | 'dataDate'>
  result: PercentileResult
}

export function createShareUrl(base: string, stockCode: string, shares: number): string {
  const url = new URL(base)
  url.search = ''
  url.hash = ''
  url.searchParams.set('stock', stockCode)
  url.searchParams.set('lots', String(shares / 1000))
  return url.href
}

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif'

export function drawShareCard(canvas: HTMLCanvasElement, payload?: ShareResultData): void {
  canvas.width = 1200
  canvas.height = 630
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('此瀏覽器無法產生圖片，請改用複製連結。')
  ctx.fillStyle = '#f7f4ed'
  ctx.fillRect(0, 0, 1200, 630)
  ctx.fillStyle = '#8b671f'
  ctx.fillRect(60, 62, 7, 35)
  const text = (label: string, x: number, y: number, size: number, color = '#25282a', weight = 500) => {
    ctx.fillStyle = color
    ctx.font = `${weight} ${size}px ${FONT}`
    // Fit long security names and extreme lot values without clipping.
    for (let step = size; ctx.measureText(label).width > 1080 && step > 12; step -= 1) {
      ctx.font = `${weight} ${step - 1}px ${FONT}`
    }
    ctx.fillText(label, x, y)
  }
  text('集保持股 PR 分析', 85, 90, 26, '#8b671f', 700)
  if (payload) {
    const { data, result } = payload
    text(`${data.stockCode}  ${data.stockName ?? '證券名稱未提供'}`, 60, 150, 30)
    text(topHeadline(result), 60, 260, 66, '#25282a', 800)
    text(`${formatNumber(result.userShares / 1000, 3)} 張`, 60, 323, 36, '#8b671f', 700)
    text(result.estimatedPercentile === null ? '最高級距無上限 · 無單點推估' : `模型推估 PR ${formatPr(result.estimatedPercentile)}`, 60, 385, 27)
    text(`合理範圍 PR ${formatPr(result.lowerPercentile)}～${formatPr(result.upperPercentile)} · ${topRangeText(result.lowerPercentile, result.upperPercentile)}`, 60, 430, 23)
    text(`TDCC 資料日期：${formatDataDate(data.dataDate)}`, 60, 488, 22, '#70736f')
  } else {
    text('看懂你的持股位置', 60, 255, 76, '#25282a', 800)
    text('前 X% 持有者 · PR 合理區間 · 持股門檻', 60, 340, 34, '#8b671f', 700)
    text('以 TDCC 官方集保級距資料，理解股東與持股結構', 60, 430, 27)
    text('區間統計與模型推估，並非精確排名', 60, 488, 22, '#70736f')
  }
  ctx.fillStyle = '#e5e0d6'
  ctx.fillRect(60, 524, 1080, 1)
  text('stock-holder-percentile', 60, 563, 21, '#70736f')
  text('資料僅供統計分析，不構成投資建議', 60, 598, 19, '#70736f')
}

export async function generateShareImage(payload: ShareResultData): Promise<Blob> {
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  drawShareCard(canvas, payload)
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('圖片產生失敗，請重試或改用複製連結。')),
    'image/png',
  ))
}
