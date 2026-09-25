# RangerEpic 角色／職業資料架構

## 目的

RangerEpic 後續不再把 LINE Rangers 的 `uXXXX...` 視為「一隻獨立角色」。

正式概念拆成四層：

```text
Character
  └─ Class
      └─ Asset Variant
          └─ Battle Unit
```

- **Character**：玩家認知上的角色，例如熊大、兔兔、饅頭人。
- **Class**：該角色可以切換的職業。技能、被動、定位與戰鬥數值最終都應屬於這一層或由這一層引用。
- **Asset Variant**：只負責畫面資源，指向 LINE Rangers 既有的 `uXXXX...` 動畫／圖片。
- **Battle Unit**：進入一場戰鬥後產生的實例，包含隊伍、HP、狀態效果等執行期資料。

## Phase 1：相容層（目前）

目前所有既有存檔、隊伍、裝備與後台資料仍以 Ranger ID 為 key，避免這次重構破壞使用者資料。

例如：

```text
u1546e-brown
```

現在會解析成：

```text
characterId   = brown
classId       = legacy:u1546e-brown
assetVariantId= u1546e-brown
legacyRangerId= u1546e-brown
```

因此「鬼首領熊大」不再等同於 Character 本身，而是熊大底下的一個暫時相容職業／造型。

合作角色或尚未整理進核心名單的 Ranger 暫時會得到：

```text
characterId = legacy:<rangerId>
```

所以不會因為新架構而消失。

## Phase 2：正式職業資料

下一階段會把 class 從 Ranger JSON 抽離，變成我們自行設計的遊戲資料，例如：

```json
{
  "id": "brown_guardian",
  "characterId": "brown",
  "name": "守護者",
  "assetVariantId": "u1546e-brown",
  "stats": {},
  "skills": [],
  "passives": []
}
```

此時可以把同一個 Asset Variant 換給不同職業，也可以替同一職業更換外觀，而不影響技能與數值。

## Phase 3：Angry Birds Epic 式戰鬥資料

確認職業架構後，再移除現有 LINE Rangers 原型戰鬥欄位，例如：

- 命中／閃避
- 技能命中／技能閃避
- 技能抗性
- 現有 Ranger Role 與對應被動規則
- Navik 原型裝備數值公式

這些不應在 Phase 1 就刪除，否則會一次破壞戰鬥、AI、裝備、關卡與 Editor。

## 相容性原則

1. `rangerId` 暫時保留為 legacy alias。
2. 新戰鬥程式應優先知道 `characterId`、`classId`、`assetVariantId`。
3. 圖片／SAM 載入只使用 `assetVariantId`。
4. 新玩法資料不可再直接依賴 Ranger 原始數值。
5. 現有 localStorage 不要求玩家重置。
