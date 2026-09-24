# LineRanger Turn-Based：專案架構與角色資料指南

> 本文件說明專案的主要架構，以及角色基本數值、技能、能力、動畫與原作參考資料應在哪裡新增或修改。

## 1. 專案架構

```text
LINE Rangers / Lerico / WarmyCat
            ↓
        scripts/
            ↓
   public/rangers/<id>/
            ↓
         src/lib/
       ↙          ↘
 src/editor/     src/play/
```

主要目錄：

- `public/rangers/`：每隻 Ranger 的資產與 JSON 資料
- `src/lib/`：Editor 與遊戲共用核心
- `src/editor/`：Ranger Editor
- `src/play/`：正式遊戲、Battle、AI、HUD
- `scripts/`：資產匯入、資料同步、平衡模擬與測試
- `data/`：Lerico / WarmyCat 快取及被刪除 Ranger 的備份
- `docs/`：專案文件

重要核心檔案：

- `src/lib/rangerConfig.ts`：Ranger 資料格式
- `src/lib/rangerAssets.ts`：SAM / PLIST / PNG / projectile 載入
- `src/lib/skills.ts`：技能與 Skill Effect 定義
- `src/lib/passives.ts`：角色個別 Passive 定義
- `src/lib/rangerClass.ts`：Element、Category、Role
- `src/lib/roleTraits.ts`：Role 共用能力
- `src/lib/formation.ts`：前排／後排加成
- `src/lib/actionPlan.ts`、`src/lib/shotRules.ts`：攻擊動畫與投射物規則
- `src/play/battle.ts`：實際戰鬥規則與數值計算
- `src/play/ai.ts`：AI
- `src/play/battleScene.ts`：戰鬥演出
- `src/play/battleHud.ts`：Canvas HUD

## 2. 每隻 Ranger 的資料

每隻角色位於：

```text
public/rangers/<ranger-id>/
```

常見內容：

```text
body.sam
body.plist
body.png
bul / bul2 / bul3 ...
thumb.png
icons/
ranger.json
stats.json
gamedata.json
```

三個 JSON 的責任不同：

| 檔案 | 用途 | 一般是否手動修改 |
|---|---|---|
| `ranger.json` | 本回合制遊戲真正使用的角色資料 | **是** |
| `stats.json` | Lerico 的 LINE Rangers 原作資料 | 否，會被同步覆寫 |
| `gamedata.json` | WarmyCat/RangerBook 的動畫與投射物 metadata | 否，會被同步覆寫 |

簡單記法：

```text
ranger.json   = 我們的遊戲設計
stats.json    = 原作角色參考資料
gamedata.json = 原作動畫／投射物參考資料
```

## 3. 基本數值要在哪裡改？

真正參與本遊戲戰鬥的角色數值在：

```text
public/rangers/<id>/ranger.json
└── stats
```

例如：

```json
"stats": {
  "hp": 5540,
  "atk": 430,
  "def": 305,
  "spd": 105,
  "crit": 12,
  "critDmg": 155,
  "evade": 8,
  "hit": 8,
  "skillEvade": 10,
  "skillHit": 10,
  "skillRes": 19,
  "skillDmgRes": 0
}
```

Editor：

```text
Ranger Editor → General → Stats
```

欄位：

- `hp`：HP
- `atk`：ATK
- `def`：DEF
- `spd`：Speed／行動順序
- `crit`：暴擊率
- `critDmg`：暴擊傷害
- `evade` / `hit`：普通攻擊迴避／命中
- `skillEvade` / `skillHit`：技能迴避／命中
- `skillRes`：技能狀態抗性
- `skillDmgRes`：技能傷害抗性

實際計算在 `src/play/battle.ts`。

## 4. Element、Category、Role

角色自己的設定在 `ranger.json`：

```json
"element": "water",
"category": "str",
"role": "fighter"
```

支援：

```text
Element: fire / water / wood / light / dark
Category: str / agi / int
Role: tank / fighter / shooter / assassin / mage / support
```

如果只改某一隻角色的 Role，改 `ranger.json`。

如果要改「所有同 Role 角色」的共用能力，改：

```text
src/lib/roleTraits.ts
```

如果要改屬性剋制倍率或 Role/Category 基本定義，改：

```text
src/lib/rangerClass.ts
```

前排／後排額外加成則在：

```text
src/lib/formation.ts
```

## 5. 技能資料

真正的 Skill Gameplay 在：

```text
ranger.json
└── skills
    ├── skill1
    └── skill2
```

例如：

```json
"skill2": {
  "kind": "attack",
  "cost": 3,
  "area": "single_any",
  "effects": [
    { "type": "damage", "pct": 330 },
    { "type": "breakInvincible" },
    { "type": "silence", "turns": 1 }
  ]
}
```

- `kind`：`attack` 或 `buff`
- `cost`：消耗的隊伍 Energy
- `area`：技能目標範圍
- `effects`：真正套用的戰鬥效果

攻擊範圍目前包括：

```text
single_front
single_any
row
row_any
all
```

輔助範圍：

```text
self
own_row
ally_single
ally_all
```

Editor：

```text
Ranger Editor → Skill 1 / Skill 2 → Battle Ability
```

現有 Effect 種類定義在：

```text
src/lib/skills.ts
```

Effect 的實際計算在：

```text
src/play/battle.ts
```

若只是調整已有的 Damage%、Turn、Cost、Area 等，只改 `ranger.json` 即可。

若要加入全新的 Mechanic，例如復活、反射傷害、複製 Buff，則需要：

1. 在 `src/lib/skills.ts` 新增 Effect Type
2. 在 `EFFECTS` 定義參數與 Editor UI
3. 在 `src/play/battle.ts` 實作戰鬥邏輯
4. 必要時在 `src/play/ai.ts` 增加 AI 評分
5. 必要時補 `src/play/i18n.ts` / UI 文字

## 6. 角色個別能力／Passive

本遊戲自己的角色個別能力放在：

```text
ranger.json
└── passives
```

例如：

```json
"passives": [
  { "type": "lifesteal", "pct": 15 },
  { "type": "atkUp", "pct": 10 }
]
```

目前 Passive Type 定義於：

```text
src/lib/passives.ts
```

目前包含：

```text
execute
lifesteal
tough
atkUp
critUp
speedUp
healUp
```

Editor：

```text
Ranger Editor → General → Special Passives
```

新增全新 Passive 時，除了修改 `passives.ts`，也必須在 `battle.ts` 或相關公式中實作效果。

## 7. LINE Rangers 原作 Ability 在哪裡？

原作 Ability 位於：

```text
public/rangers/<id>/stats.json
└── abilities
```

由：

```text
scripts/fetch-lerico.mjs
```

自動從 Lerico API 取得。

`stats.json` 還包含：

```text
name
grade
tier
element
category
原作 stats
combat
cost
skills
abilities
raw
```

重要：

> `stats.json` 是原作參考資料，不是目前回合制遊戲直接使用的戰鬥設定。

目前原作 Ability 也**不會自動變成本遊戲的戰鬥能力**。如果要讓某個 Ability 實際生效，應將它轉換成：

- `ranger.json.passives`
- Skill `effects`
- 或新增 Battle Mechanic

不要只手動修改 `stats.json`，因為下次 Refresh Data 可能會被覆寫。

## 8. `gamedata.json` 的用途

`gamedata.json` 由：

```text
scripts/fetch-gamedata.mjs
```

從 WarmyCat / RangerBook 資料整理產生。

主要包含：

```text
render.shadowCenter
render.faceCenter
attackRangePt
moves.normal
moves.skill1
moves.skill2
animationPart
start
moveSpeed
angle
motion
hitPointRate
skill basis / area
```

主要給：

```text
rangerAssets.ts
actionPlan.ts
shotRules.ts
```

判斷子彈起點、速度、軌跡、命中位置與動畫。

通常不要直接修改。如果某隻 Ranger 的動畫需要特殊修正，優先在 `ranger.json.actions` 使用 manual override。

## 9. Gameplay Skill 與動畫設定要分開

```text
ranger.json.skills
```

回答：

> 這個技能在戰鬥規則上做什麼？

例如：

```text
300% Damage
Stun 1 Turn
Cost 3
```

而：

```text
ranger.json.actions
```

回答：

> 這個技能在畫面上怎麼演？

例如：

```text
cast clip
release clip
release frame
projectile
muzzle
impact
approach movement
```

因此：

```text
skills  = Gameplay
actions = Animation / Presentation
```

## 10. 新增 Ranger 的建議流程

1. 在 Editor 輸入 Ranger ID，或執行 `npm run fetch-ranger -- <ranger-id>`
2. 下載 SAM / PLIST / PNG / projectile 到 `public/rangers/<id>/`
3. Refresh Data，建立／更新 `stats.json`、`gamedata.json`、`icons/`
4. 在 Ranger Editor 設定 Name、Element、Category、Role、Stats
5. 設定 Skill 1、Skill 2、Passives
6. 設定 Clips、Anchors、Projectile、Portrait、Cut-in
7. 使用 Preview 測試普攻與兩個技能
8. 儲存 `ranger.json`
9. 設定 `"approved": true`，角色才會出現在 Team Builder

## 11. 快速索引

| 想修改的內容 | 應修改的位置 |
|---|---|
| 某隻角色 HP / ATK / DEF / SPD | `public/rangers/<id>/ranger.json` |
| 某隻角色 Skill | `public/rangers/<id>/ranger.json` |
| 某隻角色 Passive | `public/rangers/<id>/ranger.json` |
| 所有 Tank/Fighter 等共用能力 | `src/lib/roleTraits.ts` |
| 前排／後排 Bonus | `src/lib/formation.ts` |
| Element 剋制倍率 | `src/lib/rangerClass.ts` |
| 可選 Skill Effect 種類 | `src/lib/skills.ts` |
| 可選 Passive 種類 | `src/lib/passives.ts` |
| Damage / Hit / Evade / Energy / Status 公式 | `src/play/battle.ts` |
| AI 如何評估技能 | `src/play/ai.ts` |
| 投射物／攻擊動畫規則 | `src/lib/actionPlan.ts`, `src/lib/shotRules.ts` |
| LINE Rangers 原作數據 | `stats.json`（自動產生，不建議手改） |
| 原作動畫／Projectile metadata | `gamedata.json`（自動產生，不建議手改） |

最重要的原則：

> 要修改「這款回合制遊戲裡角色實際有多強」，先看 `ranger.json`。
