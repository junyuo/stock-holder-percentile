interface Props {
  value: number | null
  lower: number
  upper: number
}

const clamp = (value: number) => Math.min(100, Math.max(0, value))

export function PercentileRange({ value, lower, upper }: Props) {
  const safeLower = clamp(Math.min(lower, upper))
  const safeUpper = clamp(Math.max(lower, upper))
  const safeValue = value === null ? null : clamp(value)
  const exactWidth = safeUpper - safeLower
  const visualWidth = Math.max(1.5, exactWidth)
  const visualCenter = (safeLower + safeUpper) / 2
  const visualStart = Math.min(100 - visualWidth, Math.max(0, visualCenter - visualWidth / 2))
  const roundedLower = Math.round(safeLower)
  const roundedUpper = Math.round(safeUpper)
  const roundedValue = safeValue === null ? null : Math.round(safeValue)
  const accessibleLabel =
    roundedValue === null
      ? `PR 合理範圍為 ${roundedLower} 到 ${roundedUpper}，最高持股級距無上限，不顯示單點推估`
      : `PR 合理範圍為 ${roundedLower} 到 ${roundedUpper}，模型推估為 ${roundedValue}`

  return (
    <div className="pr-range" role="img" aria-label={accessibleLabel}>
      <div className="pr-range-axis" aria-hidden="true">
        <span>PR 0</span>
        <span>PR 100</span>
      </div>
      <div className="pr-range-track" aria-hidden="true">
        <span
          className="pr-range-band"
          style={{ left: `${visualStart}%`, width: `${visualWidth}%` }}
        />
        {safeValue !== null && <span className="pr-range-point" style={{ left: `${safeValue}%` }} />}
      </div>
      <div className="pr-range-labels" aria-hidden="true">
        <span>
          <small><span className="pr-range-long-label">PR 下界</span><span className="pr-range-short-label">下界</span></small>
          <strong>PR {roundedLower}</strong>
        </span>
        <span>
          <small><span className="pr-range-long-label">模型推估</span><span className="pr-range-short-label">推估</span></small>
          <strong>{roundedValue === null ? '無單點推估' : `PR ${roundedValue}`}</strong>
        </span>
        <span>
          <small><span className="pr-range-long-label">PR 上界</span><span className="pr-range-short-label">上界</span></small>
          <strong>PR {roundedUpper}</strong>
        </span>
      </div>
    </div>
  )
}
