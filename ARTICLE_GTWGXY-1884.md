# GTWGXY-1884 實戰 Demo：`/tickets` WAF 請求量過高的重現、F12 證據與解法

## 這篇文章要回答什麼？

前一篇 [GTWGXY-1884：`/tickets` WAF 請求量降低筆記](LinkedPage:1qRcp-rHGL) 說明了問題根因與 production 修正；這篇補上一個可以自己跑的最小 demo，讓團隊用瀏覽器直接看到「為什麼首頁還沒點擊，就已經打出大量詳細頁請求」。

Demo 專案：<https://github.com/gh286991/tickets-waf-request-demo>

## Demo 怎麼跑？

```bash
git clone https://github.com/gh286991/tickets-waf-request-demo.git
cd tickets-waf-request-demo
npm start
```

然後開啟兩個網址：

- 錯誤版：<http://127.0.0.1:4173/?mode=before>
- 修正版：<http://127.0.0.1:4173/?mode=after>

這個 demo 使用同一批 40 張卡片，故意做出兩種資料流程：

1. 錯誤版在首頁載入時背景請求 36 個商品詳細頁、5 個 records 詳細頁，以及 session、tabs、list。
2. 修正版模擬 SSR 已準備初始資料，瀏覽器只初始化 profile 與 apiSource；使用者點卡片時才請求該卡片詳細頁。

## 用 F12 / DevTools 找出問題

1. 開啟錯誤版，按 `F12`（macOS 可按 `⌥⌘I`）。
2. 切到 **Network**，重新整理頁面。
3. 在 Filter 輸入 `product` 或 `records`。
4. 可以看到大量尚未點擊的詳細頁請求，URL 會帶有 `prefetch=1`。
5. 切到修正版再重新整理；初始載入不再出現背景詳細頁請求。
6. 點第一張卡片，這時才會新增一筆 `/product/1?source=click`。

頁面下方的 **Server-side request log** 也會列出同一輪的請求分布，方便把 F12 畫面與伺服器實際收到的請求互相核對。

## 真實重現結果

| 流程 | 動態請求總數 | 背景詳細頁 | 請求內容 |
| --- | ---: | ---: | --- |
| 錯誤版 | 44 | 41 | product 36、records 5、session 1、tabs 1、list 1 |
| 修正版初次載入 | 2 | 0 | profile 1、apiSource 1 |
| 修正版點第一張卡片後 | 3 | 1 | 初始 2 筆 + 1 筆 detail |

這個數字直接對應 production 問題：大量連結預載與重複的初始資料請求，會讓同一 IP 在短時間內累積 WAF 計數。

## 截圖一：錯誤版

錯誤版的重點是：首頁還沒有任何點擊，已經先產生 41 筆背景詳細頁請求；下方 log 可看到 product、records、session、tabs、list 的分布。

截圖檔案：`01-before-network.png`（已上傳到本頁的 AFFiNE 圖片區塊）

GitHub 原始檔：<https://raw.githubusercontent.com/gh286991/tickets-waf-request-demo/main/docs/screenshots/01-before-network.png>

## 截圖二：修正版

修正版初次載入只有 profile 與 apiSource 兩筆動態請求，背景詳細頁是 0；點擊卡片後才會出現單一 detail 請求。

截圖檔案：`02-after-network.png`（已上傳到本頁的 AFFiNE 圖片區塊）

GitHub 原始檔：<https://raw.githubusercontent.com/gh286991/tickets-waf-request-demo/main/docs/screenshots/02-after-network.png>

## 解法如何對應到 tickets production 修正？

| Demo 的觀察 | production 的處理 |
| --- | --- |
| 高數量卡片在未點擊前就打詳細頁 | 對卡片、物品紀錄與詳細頁 Link 設定 `prefetch={false}` |
| query string 改變時登入流程再次執行 | `useAuth` 只依賴 `OTT`，tab／sort／page 不重跑 session |
| 清單與分類各自讀一次 session | 由 `useAuth` 統一驗證，清單 hook 不再重複讀 session |
| 初始化把第一頁強制寫成 `page=1` | 第一頁不寫入 `page=1`，避免多一次 URL/RSC 導頁 |
| session、tabs、list 分散由瀏覽器取得 | Server Component 初始預取，再以 React Query hydration 交給 client |
| Redis 無法驗證時仍可能走 cookie-only | SSR 個人資料路徑 `allowRedisDowngrade: false`，驗證失敗時 fail closed |

## 取捨與注意事項

關閉預載後，詳細頁第一次點擊可能稍慢；這是用單次互動延遲換取更穩定的 WAF 請求量。實際上線後仍要用 CDN/WAF log 觀察 `/tickets` 五分鐘窗口內的分布，特別是登入、首頁與物品紀錄路徑。

這個 demo 是可重現的請求模型，不會連到 production API，也不會使用真實帳號資料。它的目的，是讓新人或值班同仁先在本機看懂請求爆量的形狀，再回頭閱讀 production 變更。

## 相關提交

- `33d54aa`（2026-07-20）：第一版降低 WAF 請求量與量測報告。
- `1db3869`（2026-07-21）：補強 SSR 上游失敗記錄、可重試 UI 與回歸測試。
- Demo repo commit `4bad8fa`：建立可重現的 before/after demo 與截圖。
