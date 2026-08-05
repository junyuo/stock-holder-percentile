import { formatNumber, formatPercent } from '../lib/format'
import { HOLDING_BUCKETS } from '../lib/percentile'
import type { HoldingRow } from '../types'

interface Props {
  rows: HoldingRow[]
  activeLevel: number
}

function formatHolderPercentage(value: number): string {
  if (value === 0) return '0.0%'
  if (value < 0.001) return '<0.001%'
  return `${formatPercent(value, value < 0.1 ? 3 : 1)}%`
}

export function HolderPyramid({ rows, activeLevel }: Props) {
  const total = rows.reduce((sum, row) => sum + row.holderCount, 0)
  const maxLog = Math.max(...rows.map((row) => Math.log10(row.holderCount + 1)), 1)
  const descending = [...rows].sort((a, b) => b.holdingLevel - a.holdingLevel)

  return (
    <section className="panel pyramid-panel" aria-labelledby="pyramid-title">
      <div className="section-heading">
        <div>
          <div className="section-kicker">由高至低排列</div>
          <h2 id="pyramid-title">股東金字塔</h2>
        </div>
        <span className="scale-note">寬度採對數比例</span>
      </div>
      <div className="pyramid-list">
        {descending.map((row) => {
          const bucket = HOLDING_BUCKETS[row.holdingLevel - 1]
          const active = row.holdingLevel === activeLevel
          const width = Math.max(18, (Math.log10(row.holderCount + 1) / maxLog) * 100)
          return (
            <div className={`pyramid-row ${active ? 'is-active' : ''}`} key={row.holdingLevel}>
              <div className="pyramid-label">
                <span>{bucket.label}</span>
                {active && <strong>你在這裡</strong>}
              </div>
              <div className="pyramid-track">
                <div className="pyramid-bar" style={{ width: `${width}%` }} />
              </div>
              <div className="pyramid-value">
                <strong>{formatNumber(row.holderCount)}</strong>
                <span>{formatHolderPercentage((row.holderCount / total) * 100)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
