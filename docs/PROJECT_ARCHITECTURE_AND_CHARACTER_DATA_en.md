# LineRanger Turn-Based: Project Architecture and Character Data Guide

> This document explains the main project architecture and where character base stats, skills, abilities, animation settings, and original-game reference data should be added or modified.

## 1. Project Architecture

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

Main directories:

- `public/rangers/`: assets and JSON data for each Ranger
- `src/lib/`: shared core used by the Editor and game
- `src/editor/`: Ranger Editor
- `src/play/`: production game, Battle, AI, HUD
- `scripts/`: asset import, data synchronization, balance simulation, tests
- `data/`: Lerico / WarmyCat caches and deleted-Ranger backups
- `docs/`: project documentation

Important core files:

- `src/lib/rangerConfig.ts`: Ranger data schema
- `src/lib/rangerAssets.ts`: SAM / PLIST / PNG / projectile loading
- `src/lib/skills.ts`: skill and Skill Effect definitions
- `src/lib/passives.ts`: per-character Passive definitions
- `src/lib/rangerClass.ts`: Element, Category, Role
- `src/lib/roleTraits.ts`: shared Role abilities
- `src/lib/formation.ts`: front/back formation bonuses
- `src/lib/actionPlan.ts`, `src/lib/shotRules.ts`: attack animation and projectile rules
- `src/play/battle.ts`: actual battle rules and calculations
- `src/play/ai.ts`: AI
- `src/play/battleScene.ts`: battle presentation
- `src/play/battleHud.ts`: Canvas HUD

## 2. Data for Each Ranger

Each character is stored under:

```text
public/rangers/<ranger-id>/
```

Typical contents:

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

The three JSON files have different responsibilities:

| File | Purpose | Normally edit manually? |
|---|---|---|
| `ranger.json` | Character data actually used by this turn-based game | **Yes** |
| `stats.json` | Original LINE Rangers data fetched from Lerico | No; synchronization can overwrite it |
| `gamedata.json` | Animation/projectile metadata from WarmyCat/RangerBook | No; synchronization can overwrite it |

Simple rule:

```text
ranger.json   = our game design
stats.json    = original-character reference data
gamedata.json = original animation/projectile reference data
```

## 3. Where Do I Change Base Stats?

The values actually used in this game's battles are stored in:

```text
public/rangers/<id>/ranger.json
└── stats
```

Example:

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

Editor:

```text
Ranger Editor → General → Stats
```

Fields:

- `hp`: HP
- `atk`: ATK
- `def`: DEF
- `spd`: Speed / turn order
- `crit`: critical rate
- `critDmg`: critical damage
- `evade` / `hit`: normal-attack evasion / accuracy
- `skillEvade` / `skillHit`: skill evasion / accuracy
- `skillRes`: resistance to skill status effects
- `skillDmgRes`: skill damage resistance

The actual calculations are in `src/play/battle.ts`.

## 4. Element, Category, and Role

Per-character settings are stored in `ranger.json`:

```json
"element": "water",
"category": "str",
"role": "fighter"
```

Supported values:

```text
Element: fire / water / wood / light / dark
Category: str / agi / int
Role: tank / fighter / shooter / assassin / mage / support
```

To change only one Ranger's Role, edit `ranger.json`.

To change a shared ability for every Ranger of the same Role, edit:

```text
src/lib/roleTraits.ts
```

Element advantage multipliers and the basic Role/Category definitions are in:

```text
src/lib/rangerClass.ts
```

Front/back formation bonuses are in:

```text
src/lib/formation.ts
```

## 5. Skill Data

Actual Skill Gameplay is stored in:

```text
ranger.json
└── skills
    ├── skill1
    └── skill2
```

Example:

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

- `kind`: `attack` or `buff`
- `cost`: team Energy consumed
- `area`: targeting area
- `effects`: actual battle effects

Attack areas:

```text
single_front
single_any
row
row_any
all
```

Support areas:

```text
self
own_row
ally_single
ally_all
```

Editor:

```text
Ranger Editor → Skill 1 / Skill 2 → Battle Ability
```

Available Effect types are defined in:

```text
src/lib/skills.ts
```

Their actual behavior is calculated in:

```text
src/play/battle.ts
```

If you only need to change existing Damage%, turns, Cost, Area, and similar parameters, edit `ranger.json`.

For a completely new mechanic such as revival, damage reflection, or copying buffs:

1. Add a new Effect Type in `src/lib/skills.ts`
2. Define parameters and Editor UI in `EFFECTS`
3. Implement the battle behavior in `src/play/battle.ts`
4. Add AI evaluation in `src/play/ai.ts` when necessary
5. Add text in `src/play/i18n.ts` / relevant UI when necessary

## 6. Per-Character Abilities / Passives

Game-specific individual abilities are stored in:

```text
ranger.json
└── passives
```

Example:

```json
"passives": [
  { "type": "lifesteal", "pct": 15 },
  { "type": "atkUp", "pct": 10 }
]
```

Passive Types are defined in:

```text
src/lib/passives.ts
```

Current types:

```text
execute
lifesteal
tough
atkUp
critUp
speedUp
healUp
```

Editor:

```text
Ranger Editor → General → Special Passives
```

When adding a completely new Passive Type, also implement its effect in `battle.ts` or the relevant formula.

## 7. Where Are the Original LINE Rangers Abilities?

Original-game Abilities are stored in:

```text
public/rangers/<id>/stats.json
└── abilities
```

They are automatically fetched by:

```text
scripts/fetch-lerico.mjs
```

from the Lerico API.

`stats.json` also contains:

```text
name
grade
tier
element
category
original stats
combat
cost
skills
abilities
raw
```

Important:

> `stats.json` is reference data from the original game, not the current turn-based game's direct battle configuration.

At the moment, original LINE Rangers Abilities are **not automatically converted into battle mechanics** in this project. To make one work in battle, convert it into:

- `ranger.json.passives`
- Skill `effects`
- or a newly implemented Battle mechanic

Do not rely on manually editing `stats.json`; Refresh Data can overwrite it.

## 8. Purpose of `gamedata.json`

`gamedata.json` is generated by:

```text
scripts/fetch-gamedata.mjs
```

using WarmyCat / RangerBook data.

It mainly contains:

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

It is mainly consumed by:

```text
rangerAssets.ts
actionPlan.ts
shotRules.ts
```

to determine projectile start points, speed, paths, impact positions, and animation behavior.

Normally, do not edit it manually. For a visual exception on one Ranger, prefer a manual override in `ranger.json.actions`.

## 9. Keep Skill Gameplay Separate from Animation

```text
ranger.json.skills
```

answers:

> What does this skill do according to battle rules?

For example:

```text
300% Damage
Stun 1 Turn
Cost 3
```

while:

```text
ranger.json.actions
```

answers:

> How is this skill presented visually?

For example:

```text
cast clip
release clip
release frame
projectile
muzzle
impact
approach movement
```

Therefore:

```text
skills  = Gameplay
actions = Animation / Presentation
```

## 10. Recommended Workflow for Adding a Ranger

1. Enter the Ranger ID in the Editor, or run `npm run fetch-ranger -- <ranger-id>`
2. Download SAM / PLIST / PNG / projectile assets into `public/rangers/<id>/`
3. Refresh Data to create/update `stats.json`, `gamedata.json`, and `icons/`
4. Configure Name, Element, Category, Role, and Stats in Ranger Editor
5. Configure Skill 1, Skill 2, and Passives
6. Configure Clips, Anchors, Projectile, Portrait, and Cut-in
7. Use Preview to test the normal attack and both skills
8. Save `ranger.json`
9. Set `"approved": true`; only approved Rangers appear in Team Builder

## 11. Quick Reference

| What you want to change | Where to change it |
|---|---|
| One Ranger's HP / ATK / DEF / SPD | `public/rangers/<id>/ranger.json` |
| One Ranger's Skill | `public/rangers/<id>/ranger.json` |
| One Ranger's Passive | `public/rangers/<id>/ranger.json` |
| Shared Tank/Fighter/etc. behavior | `src/lib/roleTraits.ts` |
| Front/back formation bonus | `src/lib/formation.ts` |
| Element advantage multipliers | `src/lib/rangerClass.ts` |
| Available Skill Effect types | `src/lib/skills.ts` |
| Available Passive types | `src/lib/passives.ts` |
| Damage / Hit / Evade / Energy / Status formulas | `src/play/battle.ts` |
| AI skill evaluation | `src/play/ai.ts` |
| Projectile / attack animation rules | `src/lib/actionPlan.ts`, `src/lib/shotRules.ts` |
| Original LINE Rangers data | `stats.json` (generated; do not normally edit) |
| Original animation/projectile metadata | `gamedata.json` (generated; do not normally edit) |

Most important rule:

> If you want to change how strong a character actually is in this turn-based game, check `ranger.json` first.
