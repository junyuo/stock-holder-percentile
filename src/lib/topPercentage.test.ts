import { describe, it, expect } from 'vitest'
import { toTopPercentage, toTopRange, topHeadline } from './topPercentage'
import { formatTopPercentage, formatPr } from './format'

describe('前 X% 格式與區間', () => {
  it.each([[90, '10'], [95, '5'], [99.5, '0.5'], [62.3, '37.7'], [91.6, '8.4'], [99.35, '0.65']])('%s PR', (pr, expected) => {
    expect(formatTopPercentage(toTopPercentage(pr as number))).toBe(expected)
  })
  it('反轉上下界', () => expect(toTopRange(89, 94)).toEqual({ lower: 6, upper: 11 }))
  it('極小非零值不顯示成零', () => {
    expect(formatTopPercentage(0.00001)).toBe('<0.001')
    expect(formatTopPercentage(0.008)).toBe('0.008')
    expect(formatPr(99.99999)).toBe('>99.999')
  })
  it('最高級距只呈現範圍', () => {
    expect(topHeadline({ lowerPercentile: 98.8, upperPercentile: 100, estimatedPercentile: null })).toBe('約位於前 0%～1.2%')
  })
  it.each([NaN, Infinity, -1, 101])('拒絕非法 PR %s', (value) => expect(() => toTopPercentage(value)).toThrow())
  it('拒絕反向邊界', () => expect(() => toTopRange(99, 90)).toThrow())
})
