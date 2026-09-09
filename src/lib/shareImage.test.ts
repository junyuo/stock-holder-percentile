import { expect, it } from 'vitest'
import { createShareUrl } from './shareImage'

it('使用分析結果產生 base path 下的乾淨連結', () => {
  expect(createShareUrl('https://junyuo.github.io/stock-holder-percentile/?stock=2330&lots=2&unused=1#old', '0050', 50000)).toBe('https://junyuo.github.io/stock-holder-percentile/?stock=0050&lots=50')
})
it('保留零股精度', () => {
  expect(new URL(createShareUrl('https://example.com/site/', '0050', 1)).searchParams.get('lots')).toBe('0.001')
})
