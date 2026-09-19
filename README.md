# Ranger Epic

Ranger Epic 是以 LINE Rangers 動畫資源製作的回合制網頁 RPG 雛形，玩法方向參考經典的三人小隊冒險 RPG，但戰鬥數值與角色定位在這個專案中獨立設計。

## 目前內容

- 開始遊戲畫面
- 關卡選擇地圖，共 6 個暫定關卡
- 6 名我方 Ranger 可自由選擇 3 名出戰
- 6 名暫定敵方角色
- 基本回合制戰鬥
- 普通攻擊與角色專屬技能
- HP、傷害數字、護盾、治療、增益、暈眩
- 直接讀取 mti0224/rangerbook_res 的 SAM、plist、PNG
- 瀏覽器端解析 LINE Rangers SAM 動畫並用 Canvas 繪製
- 待機、攻擊、技能、受擊動畫名稱有 fallback 機制

## 我方角色定位

James：守護者。高生命，技能攻擊後替全隊提供護盾。

Cony：決鬥者。偏向高單體輸出。

Moon：魔導士。技能可對敵方全體造成傷害。

Brown：鬥士。生命與攻擊均衡，技能有機會暈眩。

Jessica：治療師。技能恢復全隊生命。

Sally：支援者。技能強化全隊下一次攻擊。

## 敵人

Nut、Abby、Jerome、Bomby、Aron、Thor。

目前敵人採簡易 AI，依序行動並隨機選擇存活的我方 Ranger 作為目標。

## 執行方式

這是純靜態網站，不需要 npm 或 build step。使用任意 HTTP server 開啟即可；也可以直接啟用 GitHub Pages。

若使用 Python，可在 repository 根目錄執行：

    python3 -m http.server 8080

然後開啟 http://localhost:8080

## 資源來源與技術

遊戲不複製角色圖片到本 repository，而是從 rangerbook_res 的 raw GitHub URL 載入角色資源。

角色本體會依序嘗試：

- unit-id-body.sam / plist / png
- unit-id-body.16.sam / plist / png

瀏覽器解析 SAM 的 frame、matrix、color 與 plist atlas rect，再繪製到 Canvas，因此可以直接使用原始 LINE Rangers 動畫資料。

## 下一步候選

- 把一般攻擊的 bul / bul2 / bul3 投射物也接進戰鬥
- 加入技能特效與命中特效
- 改成更接近 Angry Birds Epic 的拖曳目標操作
- 角色技能冷卻、狀態效果與敵人特殊 AI
- 關卡解鎖與 LocalStorage 存檔
- 裝備與職業系統
- BGM / SE
- 手機版戰鬥 UI 再優化

目前版本定位為 playable prototype，重點是先驗證 Ranger 原始動畫資源能否直接作為網頁 RPG 的戰鬥角色使用。
