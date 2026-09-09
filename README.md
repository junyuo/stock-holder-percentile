# 集保持股 PR 分析

以臺灣集中保管結算所（TDCC）官方「集保戶股權分散表」為基礎的純前端資料視覺化網站。使用者輸入台灣證券代號與持有張數後，可查看所在持股級距、PR 合理上下界、有限級距內的模型推估值，以及股東人數與持股結構。

本工具不會宣稱個別股東的精確名次，也不提供投資建議。

## 持股位置、門檻與分享

- 「約前 X%」= 100 − 推估 PR；Top 範圍 = 100 − PR 上界 ～ 100 − PR 下界。10% 以上也保留最多一位小數，避免丟失資訊；極小非零比例顯示 `<0.001%`。
- 持股門檻提供前 50%、25%、10%、5%、1%。使用既有均勻分布模型的反函式：`min + ((targetPR / 100 * totalHolders - holdersBelow) / bucketHolders) * (max - min)`，限制位置在 0～1、向上取整到一股，再回帶 PR 驗證（容許 1e-10 浮點誤差）。零人數級距跳過，共用邊界優先取較低級距上限。
- 有限門檻顯示模型推估已達到或張數差距。若目標落入無上限級距，僅顯示「至少 1,000.001 張」與無法精確推估；這是級距下限，不是達標保證，也不顯示已達到。
- 分享區可複製目前**分析結果**的 `?stock=…&lots=…` 連結，或下載 1200×630 PNG。支援 Web Share API 時另提供系統連結分享。Clipboard 失敗會顯示可選取的連結；取消系統分享不視為錯誤。
- PNG 使用瀏覽器 Canvas 與系統中文字型繪製，不下載字型、不上傳持股資訊。分享前可預覽股票、張數、Top 與 PR。
- 小數張換算容許乘法本身的機器浮點誤差，例如 `1.001 張 → 1,001 股`；仍拒絕非整股與不合法數值，PR 的級距及線性模型不變。
- 連結包含證券代號與持有張數，開啟時以最新資料重算，資料更新後不保證結果相同。PNG 固定保留產生當時的資料日期與統計結果。
- `public/og-image.png` 是固定品牌預覽圖；靜態 GitHub Pages 不會依 query 為社群爬蟲產生個人化 OG。個別結果需下載 PNG 後自行附圖分享。Fork 至其他網址時請同步修改 `index.html` 的 OG 圖片絕對網址。

新增演算法位於 `src/lib/thresholds.ts`、`topPercentage.ts`，分享繪圖位於 `shareImage.ts`。所有結果仍是級距統計或模型推估。系統分享與剪貼簿依瀏覽器／安全來源與權限而異；未支援時仍可下載 PNG 或手動複製連結。

## 功能截圖

建議在第一次部署後，將桌面版與手機版截圖放在 `docs/screenshots/`，並在此補上圖片：

- `docs/screenshots/desktop-overview.png`
- `docs/screenshots/mobile-overview.png`

## 技術架構

- React、Vite、TypeScript
- Tailwind CSS（Vite plugin）與產品化 CSS
- Recharts
- Vitest、ESLint
- GitHub Actions 自動更新資料與部署 GitHub Pages
- 無後端、無資料庫、無前端密鑰

前端第一次只載入 `manifest.json` 與 `stocks.json`；使用者查詢時才下載 `latest/{stockCode}.json`，不會載入歷史資料。

```text
public/data/
├── manifest.json
├── stocks.json
└── latest/
    ├── 0050.json
    └── 2330.json
```

## PR 計算方式

TDCC 只公布持股級距，沒有每位股東的精確持股數，因此結果是區間與模型推估。

- PR 下界 = 所有較低級距股東人數 ÷ 總股東人數 × 100
- PR 上界 =（較低級距股東人數 + 目前級距股東人數）÷ 總股東人數 × 100
- 推估 PR = 在有限級距內假設持股均勻分布，依使用者在級距中的位置線性內插

推估位置會限制在 0～1，所有 PR 會限制在 0～100。對 `1,000,001 股以上` 的無上限級距，網站只呈現 PR 上下界，不顯示單點推估。

第 16 級「差異數調整」與第 17 級「合計」不是可供使用者定位的持股級距，因此不納入 PR 分母或圖表；前 15 級的股東人數加總作為總股東人數。

## 資料來源

- [TDCC OpenAPI：集保戶股權分散表（`/v1/opendata/1-5`）](https://openapi.tdcc.com.tw/v1/opendata/1-5)
- [TDCC OpenAPI：證券基本資料（`/v1/opendata/1-1`）](https://openapi.tdcc.com.tw/v1/opendata/1-1)
- [政府資料開放平臺資料集說明](https://data.gov.tw/dataset/11452)
- 授權：政府資料開放授權條款第 1 版

股票名稱優先使用 TDCC 官方證券基本資料，不需第三方行情或付費服務。

## 本機執行

需要 Node.js 20.19 以上。

```bash
npm install
npm run dev
```

品質檢查：

```bash
npm run lint
npm run test
npm run data:validate
npm run build
```

更新官方資料：

```bash
npm run data:update
```

資料更新器會先在暫存目錄完成下載、正規化、日期／級距／型別驗證，再替換 `public/data`。下載或驗證失敗時保留既有正常資料。

## GitHub Pages 部署

1. 將 repository 預設分支設為 `main`。
2. 在 GitHub repository 的 **Settings → Pages → Build and deployment** 選擇 **GitHub Actions**。
3. Push 到 `main`，或手動執行「部署 GitHub Pages」workflow。

`vite.config.ts` 會在 GitHub Actions 由 `GITHUB_REPOSITORY` 自動推導 `/<repository-name>/` base path；本機開發使用 `/`。`public/404.html` 提供 GitHub Pages 的 SPA fallback。

## GitHub Actions 資料更新

`.github/workflows/update-data.yml`：

- 每週六 08:30（Asia/Taipei；cron 為 UTC 00:30）執行
- 支援 `workflow_dispatch` 手動執行
- 檢查 HTTP 狀態、Content-Type、JSON 陣列、欄位型別、單一資料日期與 15 個分析級距
- 使用 `/v1/opendata/1-1` 建立代號／名稱對照
- 只有正規化後的來源內容雜湊改變時才重建資料
- 只有 `public/data` 有差異時才 commit 與 push
- 失敗時回傳非零狀態與正體中文錯誤，既有資料保持不變

若預設分支有保護規則，需允許 GitHub Actions 建立資料更新 commit，或調整為由 bot 建立 PR。

## 已知限制

- PR 反映的是集保級距統計，不是個別股東名次。
- 有限級距內的均勻分布只是透明且簡單的估計模型，實際分布可能不均。
- 最高持股級距沒有上限，因此不提供單點推估。
- 資料可能包含融資融券、借券、擔保品、登錄與其他專戶。
- 股票名稱與分散資料來自不同的 TDCC 官方資料集，更新時間可能略有差異；名稱缺漏時仍保留代號。
- GitHub Pages 上的資料新鮮度取決於 TDCC 發布與排程 workflow 是否成功。

## 免責聲明

本工具使用臺灣集中保管結算所公開的集保戶股權分散資料。由於原始資料採持股級距統計，PR 為區間與模型推估值，並非個別股東的精確排名。資料可能包含融資融券、借券、擔保品及其他專戶。資料僅供研究與資訊視覺化，不構成任何投資建議。
