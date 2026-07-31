import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { formatPercent } from '../lib/format'

interface Props {
  value: number | null
  lower: number
  upper: number
}

export function PercentileGauge({ value, lower, upper }: Props) {
  const displayValue = value ?? (lower + upper) / 2
  const chartData = [
    { name: 'PR', value: displayValue },
    { name: 'remaining', value: 100 - displayValue },
  ]

  return (
    <section className="panel gauge-panel" aria-labelledby="gauge-title">
      <div className="section-kicker">你的統計位置</div>
      <h2 id="gauge-title">持股 PR</h2>
      <div className="gauge-wrap" aria-label={`PR ${Math.round(displayValue)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              innerRadius="76%"
              outerRadius="94%"
              stroke="none"
              isAnimationActive
            >
              <Cell fill="#41d5ae" />
              <Cell fill="#dce8e7" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="gauge-center">
          <span>PR</span>
          <strong>{value === null ? '區間' : Math.round(value)}</strong>
        </div>
      </div>
      {value === null ? (
        <p className="gauge-copy">此級距無上限，僅能判定 PR {Math.round(lower)}～{Math.round(upper)}</p>
      ) : (
        <p className="gauge-copy">約超過 {formatPercent(value, 0)}% 的集保股東</p>
      )}
    </section>
  )
}
