import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { formatPr } from '../lib/format'

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
    <div className="summary-gauge" role="img" aria-label={value === null ? `最高級距無上限，PR 合理範圍 ${formatPr(lower)}～${formatPr(upper)}，無單點推估` : `模型推估 PR ${formatPr(value)}`}>
      <div className="gauge-wrap" aria-hidden="true">
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
              isAnimationActive={false}
            >
              <Cell fill="#C6A15B" />
              <Cell fill="#4A4F52" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="gauge-center">
          <span>PR</span>
          <strong>{value === null ? '區間' : formatPr(value)}</strong>
        </div>
      </div>
      {value === null ? (
        <p className="gauge-copy">此級距無上限，僅能判定 PR {formatPr(lower)}～{formatPr(upper)}</p>
      ) : (
        <p className="gauge-copy">約超過 {formatPr(value)}% 的集保股東</p>
      )}
    </div>
  )
}
