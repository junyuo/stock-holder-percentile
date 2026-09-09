import type { PercentileResult } from '../types'
import { topHeadline, topRangeText } from '../lib/topPercentage'
import { formatPr } from '../lib/format'
import { PercentileRange } from './PercentileRange'

export function ResultHeadline({ result }: { result: PercentileResult }) {
  return <div className="summary-message">
    <div className="summary-kicker">{result.estimatedPercentile === null ? '最高持股級距 · 無上限' : '持股位置 · 模型推估'}</div>
    <h3>{topHeadline(result)}</h3>
    {result.estimatedPercentile !== null && <p>你的持股量推估高於 {formatPr(result.estimatedPercentile)}% 的集保股東</p>}
    <PercentileRange value={result.estimatedPercentile} lower={result.lowerPercentile} upper={result.upperPercentile} />
    {result.estimatedPercentile !== null && <p className="top-range-copy">{topRangeText(result.lowerPercentile, result.upperPercentile)}</p>}
    <p>{result.estimatedPercentile === null ? '此級距沒有精確上限，因此不顯示單點推估。' : 'PR 與前 X% 為持股級距內的模型估計，並非個別股東精確排名。'}</p>
  </div>
}
