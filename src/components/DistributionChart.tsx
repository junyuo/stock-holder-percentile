import { useMemo } from 'react'
import { formatNumber, formatPercent } from '../lib/format'
import { HOLDING_BUCKETS } from '../lib/percentile'
import type { HoldingRow } from '../types'

interface Props {
  rows: HoldingRow[]
  activeLevel: number
}

interface DistributionDatum extends HoldingRow {
  label: string
  holderPercentage: number
  holderWidth: string
  custodyWidth: string
}

function barWidth(value: number, maximum: number): string {
  if (value <= 0 || maximum <= 0) return '0'
  return `max(1px, ${(value / maximum) * 100}%)`
}

function formatHolderPercentage(value: number): string {
  if (value === 0) return '0.0%'
  if (value < 0.001) return '<0.001%'
  return `${formatPercent(value, value < 0.1 ? 3 : 1)}%`
}

export function DistributionChart({ rows, activeLevel }: Props) {
  const data = useMemo<DistributionDatum[]>(() => {
    const totalHolders = rows.reduce((sum, row) => sum + row.holderCount, 0)
    const percentages = rows.map((row) => ({
      row,
      holderPercentage: totalHolders > 0 ? (row.holderCount / totalHolders) * 100 : 0,
    }))
    const maximum = Math.max(
      0,
      ...percentages.flatMap(({ row, holderPercentage }) => [holderPercentage, row.custodyPercentage]),
    )

    return percentages
      .sort((a, b) => b.row.holdingLevel - a.row.holdingLevel)
      .map(({ row, holderPercentage }) => ({
        ...row,
        label: HOLDING_BUCKETS[row.holdingLevel - 1].label,
        holderPercentage,
        holderWidth: barWidth(holderPercentage, maximum),
        custodyWidth: barWidth(row.custodyPercentage, maximum),
      }))
  }, [rows])

  return (
    <section className="panel distribution-panel" aria-labelledby="distribution-title">
      <div className="section-heading chart-heading">
        <div>
          <div className="section-kicker">由下而上，持股數由少至多</div>
          <h2 id="distribution-title">股東與持股結構</h2>
        </div>
        <span className="scale-note">共用線性刻度</span>
      </div>

      <div className="distribution-legend" aria-hidden="true">
        <span className="distribution-legend-holders">股東人數占比</span>
        <span>持股級距</span>
        <span className="distribution-legend-custody">集保庫存占比</span>
      </div>

      <div className="distribution-list">
        {data.map((item) => {
          const active = item.holdingLevel === activeLevel
          const holderPercentageLabel = formatHolderPercentage(item.holderPercentage)
          const accessibleLabel = `${item.label}，股東人數 ${formatNumber(item.holderCount)} 人，占 ${holderPercentageLabel}；持有股數 ${formatNumber(item.shareCount)} 股，占集保庫存 ${formatPercent(item.custodyPercentage, 2)}%${active ? '，你在這裡' : ''}`

          return (
            <article
              className={`distribution-row ${active ? 'is-active' : ''}`}
              aria-label={accessibleLabel}
              tabIndex={0}
              key={item.holdingLevel}
            >
              <div className="distribution-side distribution-holders">
                <span className="distribution-mobile-label">股東人數</span>
                <div className="distribution-value">
                  <strong>{holderPercentageLabel}</strong>
                  <span>{formatNumber(item.holderCount)} 人</span>
                </div>
                <div className="distribution-track" aria-hidden="true">
                  <span className="distribution-bar" style={{ width: item.holderWidth }} />
                </div>
              </div>

              <div className="distribution-bucket">
                <span>{item.label}</span>
                {active && <strong>你在這裡</strong>}
              </div>

              <div className="distribution-side distribution-custody">
                <span className="distribution-mobile-label">持股占比</span>
                <div className="distribution-track" aria-hidden="true">
                  <span className="distribution-bar" style={{ width: item.custodyWidth }} />
                </div>
                <div className="distribution-value">
                  <strong>{formatPercent(item.custodyPercentage, 2)}%</strong>
                  <span>{formatNumber(item.shareCount)} 股</span>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <p className="chart-axis-note">
        左右長條使用相同線性刻度，便於比較人數與持股集中度；第 15 級為 1,000,001 股以上。
      </p>
    </section>
  )
}
