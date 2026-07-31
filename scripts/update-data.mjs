import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DISTRIBUTION_URL = 'https://openapi.tdcc.com.tw/v1/opendata/1-5'
const SECURITIES_URL = 'https://openapi.tdcc.com.tw/v1/opendata/1-1'
const SCHEMA_VERSION = '1.0.0'
const PROJECT_ROOT = process.cwd()
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public')
const DATA_DIR = path.join(PUBLIC_DIR, 'data')
const NEXT_DIR = path.join(PUBLIC_DIR, '.data-next')
const BACKUP_DIR = path.join(PUBLIC_DIR, '.data-backup')

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function cleanRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key.replace(/^\uFEFF/, ''), value]))
}

function integer(value, field) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} 必須是安全整數，收到：${value}`)
  return parsed
}

function decimal(value, field) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${field} 必須是有限數字，收到：${value}`)
  return parsed
}

function taipeiTimestamp() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}+08:00`
}

async function fetchOfficialJson(url, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'stock-holder-percentile-data-updater/1.0' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.toLowerCase().includes('json')) {
        throw new Error(`Content-Type 為 ${contentType || '未提供'}，預期 JSON`)
      }
      const value = await response.json()
      if (!Array.isArray(value) || value.length === 0) throw new Error('預期非空 JSON 陣列')
      return value
    } catch (error) {
      const reason = error?.name === 'AbortError' ? '下載逾時（120 秒）' : error.message
      if (attempt === 3) throw new Error(`${label}下載或格式驗證失敗（已重試 3 次）：${reason}`)
      console.warn(`${label}第 ${attempt} 次嘗試失敗：${reason}；稍後重試。`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 2_000))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error(`${label}下載失敗`)
}

async function readJsonFile(file, label) {
  let parsed
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    throw new Error(`${label}讀取失敗：${error.message}`)
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`${label}格式錯誤：預期非空 JSON 陣列`)
  return parsed
}

async function sourceData() {
  const distributionFile = argument('--distribution-file')
  const securitiesFile = argument('--securities-file')
  const distribution = distributionFile
    ? await readJsonFile(distributionFile, 'TDCC 股權分散資料')
    : await fetchOfficialJson(DISTRIBUTION_URL, 'TDCC 股權分散資料')
  const securities = securitiesFile
    ? await readJsonFile(securitiesFile, 'TDCC 證券基本資料')
    : await fetchOfficialJson(SECURITIES_URL, 'TDCC 證券基本資料')
  return { distribution, securities }
}

function transform(distributionRaw, securitiesRaw) {
  const names = new Map()
  for (const raw of securitiesRaw) {
    const record = cleanRecord(raw)
    const code = String(record['證券代號'] ?? '').trim().toUpperCase()
    const name = String(record['證券名稱'] ?? '').trim()
    if (code && name && !names.has(code)) names.set(code, name)
  }

  const grouped = new Map()
  const dates = new Set()
  for (const raw of distributionRaw) {
    const record = cleanRecord(raw)
    const stockCode = String(record['證券代號'] ?? '').trim().toUpperCase()
    const dataDate = String(record['資料日期'] ?? '').trim()
    const holdingLevel = integer(record['持股分級'], '持股分級')
    if (!/^[0-9A-Z]{1,12}$/.test(stockCode)) throw new Error(`證券代號格式錯誤：${stockCode || '(空白)'}`)
    if (!/^\d{8}$/.test(dataDate)) throw new Error(`資料日期格式錯誤：${dataDate || '(空白)'}`)
    if (holdingLevel < 1 || holdingLevel > 17) throw new Error(`${stockCode} 持股分級超出 1～17：${holdingLevel}`)
    dates.add(dataDate)
    if (!grouped.has(stockCode)) grouped.set(stockCode, { stockCode, dataDate, rows: [] })
    const group = grouped.get(stockCode)
    if (group.dataDate !== dataDate) throw new Error(`${stockCode} 出現不同資料日期：${group.dataDate}、${dataDate}`)
    if (holdingLevel <= 15) {
      const holderCount = integer(record['人數'], `${stockCode} 人數`)
      const shareCount = integer(record['股數'], `${stockCode} 股數`)
      const custodyPercentage = decimal(record['占集保庫存數比例%'], `${stockCode} 集保比例`)
      if (holderCount < 0 || shareCount < 0 || custodyPercentage < 0 || custodyPercentage > 100) {
        throw new Error(`${stockCode} 第 ${holdingLevel} 級出現負數或超過 100% 的資料`)
      }
      group.rows.push({ holdingLevel, holderCount, shareCount, custodyPercentage })
    }
  }

  if (dates.size !== 1) throw new Error(`資料日期不一致：${[...dates].join('、')}`)
  const latestDataDate = [...dates][0]
  const stocks = []
  for (const group of grouped.values()) {
    group.rows.sort((a, b) => a.holdingLevel - b.holdingLevel)
    if (group.rows.length !== 15 || group.rows.some((row, index) => row.holdingLevel !== index + 1)) {
      throw new Error(`${group.stockCode} 持股級距缺漏或重複，預期第 1～15 級各一筆`)
    }
    const totalHolders = group.rows.reduce((sum, row) => sum + row.holderCount, 0)
    if (totalHolders <= 0) continue
    stocks.push({
      stockCode: group.stockCode,
      stockName: names.get(group.stockCode) ?? null,
      dataDate: group.dataDate,
      rows: group.rows,
    })
  }
  stocks.sort((a, b) => a.stockCode.localeCompare(b.stockCode, 'en'))
  if (stocks.length === 0) throw new Error('驗證後沒有任何股東人數大於 0 的證券資料')

  const sourceHash = createHash('sha256')
    .update(JSON.stringify(stocks))
    .digest('hex')
  return { latestDataDate, stocks, sourceHash }
}

async function existingHash() {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, 'manifest.json'), 'utf8')).sourceHash
  } catch {
    return null
  }
}

async function writeDataset({ latestDataDate, stocks, sourceHash }) {
  const generatedAt = taipeiTimestamp()
  await rm(NEXT_DIR, { recursive: true, force: true })
  await mkdir(path.join(NEXT_DIR, 'latest'), { recursive: true })

  const manifest = {
    latestDataDate,
    generatedAt,
    stockCount: stocks.length,
    schemaVersion: SCHEMA_VERSION,
    sourceHash,
  }
  const stockIndex = stocks.map(({ stockCode, stockName, dataDate }) => ({ stockCode, stockName, dataDate }))
  await Promise.all([
    writeFile(path.join(NEXT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(NEXT_DIR, 'stocks.json'), `${JSON.stringify(stockIndex)}\n`),
    ...stocks.map((stock) => {
      const output = {
        schemaVersion: SCHEMA_VERSION,
        dataDate: stock.dataDate,
        generatedAt,
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        sourceUrl: DISTRIBUTION_URL,
        rows: stock.rows,
      }
      return writeFile(path.join(NEXT_DIR, 'latest', `${stock.stockCode}.json`), `${JSON.stringify(output)}\n`)
    }),
  ])

  const sample = JSON.parse(await readFile(path.join(NEXT_DIR, 'latest', `${stocks[0].stockCode}.json`), 'utf8'))
  if (sample.rows.length !== 15 || sample.dataDate !== latestDataDate) throw new Error('輸出驗證失敗：個股資料不完整')

  await rm(BACKUP_DIR, { recursive: true, force: true })
  let hadExisting = false
  try {
    await access(DATA_DIR)
    hadExisting = true
    await rename(DATA_DIR, BACKUP_DIR)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  try {
    await rename(NEXT_DIR, DATA_DIR)
    await rm(BACKUP_DIR, { recursive: true, force: true })
  } catch (error) {
    await rm(DATA_DIR, { recursive: true, force: true })
    if (hadExisting) await rename(BACKUP_DIR, DATA_DIR)
    throw new Error(`寫入失敗，已保留既有正常資料：${error.message}`)
  }

  console.log(`資料更新完成：${latestDataDate}，${stocks.length} 檔證券，Asia/Taipei ${generatedAt}`)
}

try {
  const { distribution, securities } = await sourceData()
  console.log(`下載完成：股權分散 ${distribution.length} 筆；證券基本資料 ${securities.length} 筆`)
  const transformed = transform(distribution, securities)
  if ((await existingHash()) === transformed.sourceHash) {
    console.log(`資料內容未改變（${transformed.latestDataDate}），不更新檔案。`)
  } else {
    await writeDataset(transformed)
  }
} catch (error) {
  console.error(`資料更新失敗：${error.message}`)
  console.error('既有 public/data 未刪除；請檢查 TDCC API 狀態、HTTP 回應與欄位格式。')
  process.exitCode = 1
}
