import { useMemo } from 'react'
import { calculateHoldingThresholds } from '../lib/thresholds'
import { formatNumber } from '../lib/format'
import type { HoldingRow } from '../types'

export function HoldingThresholds({ rows, currentShares }: { rows: HoldingRow[]; currentShares: number }) {
  const thresholds = useMemo(() => calculateHoldingThresholds(rows), [rows])
  return (
    <section className="panel threshold-panel" aria-labelledby="threshold-title">
      <div className="section-kicker">持股位置的另一種讀法</div>
      <h2 id="threshold-title">持股門檻</h2>
      <p className="panel-intro">看看不同股東位置，對應多少推估持股量。</p>
      <table className="threshold-table">
        <thead><tr><th scope="col">股東位置</th><th scope="col">推估持股門檻</th><th scope="col">你的統計位置</th></tr></thead>
        <tbody>{thresholds.map((item) => {
          const reached = item.estimatedShares !== null && currentShares >= item.estimatedShares
          return <tr key={item.topPercentage} className={reached ? 'is-reached' : ''}>
            <th scope="row">前 {item.topPercentage}%</th>
            <td>{item.isOpenEnded ? '至少 ' : '約 '}{formatNumber((item.estimatedShares ?? item.minimumShares) / 1000, 3)} 張</td>
            <td>{item.estimatedShares === null ? '無法判定是否達到' : reached ? '✓ 模型推估已達到' : `約還差 ${formatNumber((item.estimatedShares - currentShares) / 1000, 3)} 張`}</td>
          </tr>
        })}</tbody>
      </table>
      <p className="chart-axis-note">有限級距依均勻分布模型反算並向上取整至 1 股，實際門檻可能不同。差距僅為統計比較。</p>
      {thresholds.some((item) => item.isOpenEnded) && <p className="chart-axis-note">最高級距無上限，無法精確推估。「至少 1,000.001 張」僅代表門檻所在級距的下限，並不保證達到該位置。</p>}
    </section>
  )
}
