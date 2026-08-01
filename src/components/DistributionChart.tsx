import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber, formatPercent } from '../lib/format'
import { HOLDING_BUCKETS } from '../lib/percentile'
import type { HoldingRow } from '../types'

type Metric = 'holders' | 'shares' | 'custody'

const metricLabel: Record<Metric, string> = {
  holders: '股東人數',
  shares: '持有股數',
  custody: '集保庫存比例',
}

interface Props {
  rows: HoldingRow[]
  activeLevel: number
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: ChartDatum }>
  metric: Metric
}

interface ChartDatum {
  level: number
  label: string
  value: number
  plottedValue: number
}

function ChartTooltip({ active, payload, metric }: TooltipProps) {
  const datum = payload?.[0]?.payload
  if (!active || !datum) return null
  return (
    <div className="chart-tooltip">
      <strong>{datum.label}</strong>
      <span>
        {metricLabel[metric]}：
        {metric === 'custody' ? `${formatPercent(datum.value, 2)}%` : formatNumber(datum.value)}
      </span>
    </div>
  )
}

export function DistributionChart({ rows, activeLevel }: Props) {
  const [metric, setMetric] = useState<Metric>('holders')
  const useLogScale = metric !== 'custody'
  const data = useMemo<ChartDatum[]>(
    () =>
      [...rows].sort((a, b) => b.holdingLevel - a.holdingLevel).map((row) => {
        const bucket = HOLDING_BUCKETS[row.holdingLevel - 1]
        const value =
          metric === 'holders'
            ? row.holderCount
            : metric === 'shares'
              ? row.shareCount
              : row.custodyPercentage
        return {
          level: row.holdingLevel,
          label: bucket.label,
          value,
          plottedValue: useLogScale ? Math.max(1, value) : value,
        }
      }),
    [metric, rows, useLogScale],
  )

  return (
    <section className="panel distribution-panel" aria-labelledby="distribution-title">
      <div className="section-heading chart-heading">
        <div>
          <div className="section-kicker">由下而上，持股數由少至多</div>
          <h2 id="distribution-title">分布結構</h2>
        </div>
        {useLogScale && <span className="scale-note">對數刻度</span>}
      </div>
      <div className="metric-tabs" role="group" aria-label="切換分布指標">
        {(Object.keys(metricLabel) as Metric[]).map((key) => (
          <button
            type="button"
            className={metric === key ? 'is-active' : ''}
            onClick={() => setMetric(key)}
            aria-pressed={metric === key}
            key={key}
          >
            {metricLabel[key]}
          </button>
        ))}
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 6" horizontal={false} stroke="#E2DED5" />
            <XAxis
              type="number"
              scale={useLogScale ? 'log' : 'auto'}
              domain={useLogScale ? [1, 'auto'] : [0, 'auto']}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) =>
                metric === 'custody' ? `${value}%` : new Intl.NumberFormat('zh-TW', { notation: 'compact' }).format(value)
              }
              fontSize={11}
            />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              width={132}
              fontSize={10}
            />
            <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ fill: '#F0ECE3' }} />
            <Bar dataKey="plottedValue" radius={[0, 6, 6, 0]}>
              {data.map((item) => (
                <Cell fill={item.level === activeLevel ? '#17806D' : '#8C9AA0'} key={item.level} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-axis-note">每列為一個 TDCC 持股級距；第 15 級為 1,000,001 股以上。</p>
    </section>
  )
}
