import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DATA_DIR = path.join(process.cwd(), 'public', 'data')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  const manifest = JSON.parse(await readFile(path.join(DATA_DIR, 'manifest.json'), 'utf8'))
  const stocks = JSON.parse(await readFile(path.join(DATA_DIR, 'stocks.json'), 'utf8'))
  assert(manifest.schemaVersion === '1.0.0', 'manifest schemaVersion 不符')
  assert(/^\d{8}$/.test(manifest.latestDataDate), 'manifest latestDataDate 格式錯誤')
  assert(typeof manifest.generatedAt === 'string' && manifest.generatedAt.endsWith('+08:00'), 'generatedAt 必須使用 Asia/Taipei +08:00')
  assert(Array.isArray(stocks) && stocks.length === manifest.stockCount, 'stocks 數量與 manifest 不一致')
  assert(new Set(stocks.map((stock) => stock.stockCode)).size === stocks.length, 'stocks 出現重複代號')

  for (const stock of stocks) {
    assert(stock.dataDate === manifest.latestDataDate, `${stock.stockCode} 索引日期不一致`)
    const file = path.join(DATA_DIR, 'latest', `${stock.stockCode}.json`)
    await access(file)
    const data = JSON.parse(await readFile(file, 'utf8'))
    assert(data.stockCode === stock.stockCode, `${stock.stockCode} 個股檔代號不一致`)
    assert(data.dataDate === manifest.latestDataDate, `${stock.stockCode} 個股檔日期不一致`)
    assert(Array.isArray(data.rows) && data.rows.length === 15, `${stock.stockCode} 必須有 15 個分析級距`)
    assert(data.rows.every((row, index) => row.holdingLevel === index + 1), `${stock.stockCode} 級距順序錯誤`)
    assert(data.rows.every((row) => Number.isSafeInteger(row.holderCount) && row.holderCount >= 0), `${stock.stockCode} 股東人數錯誤`)
    assert(data.rows.reduce((sum, row) => sum + row.holderCount, 0) > 0, `${stock.stockCode} 股東總數為 0`)
  }
  console.log(`資料驗證通過：${manifest.latestDataDate}，${stocks.length} 檔證券。`)
} catch (error) {
  console.error(`資料驗證失敗：${error.message}`)
  process.exitCode = 1
}
