# LineRanger Turn-Based: คู่มือโครงสร้างโปรเจกต์และข้อมูลตัวละคร

> เอกสารนี้อธิบายโครงสร้างหลักของโปรเจกต์ รวมถึงตำแหน่งที่ควรเพิ่มหรือแก้ไขค่าสถานะพื้นฐาน สกิล ความสามารถ การตั้งค่าแอนิเมชัน และข้อมูลอ้างอิงจากเกมต้นฉบับ

## 1. โครงสร้างโปรเจกต์

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

โฟลเดอร์หลัก:

- `public/rangers/`: Asset และ JSON ของ Ranger แต่ละตัว
- `src/lib/`: Core ที่ใช้ร่วมกันระหว่าง Editor และเกม
- `src/editor/`: Ranger Editor
- `src/play/`: ตัวเกมจริง, Battle, AI, HUD
- `scripts/`: Import Asset, Sync Data, Balance Simulation และ Tests
- `data/`: Cache ของ Lerico / WarmyCat และ Backup Ranger ที่ถูกลบ
- `docs/`: เอกสารของโปรเจกต์

ไฟล์ Core สำคัญ:

- `src/lib/rangerConfig.ts`: รูปแบบข้อมูล Ranger
- `src/lib/rangerAssets.ts`: โหลด SAM / PLIST / PNG / projectile
- `src/lib/skills.ts`: นิยาม Skill และ Skill Effect
- `src/lib/passives.ts`: นิยาม Passive เฉพาะตัว
- `src/lib/rangerClass.ts`: Element, Category, Role
- `src/lib/roleTraits.ts`: ความสามารถร่วมของแต่ละ Role
- `src/lib/formation.ts`: Bonus แถวหน้า/แถวหลัง
- `src/lib/actionPlan.ts`, `src/lib/shotRules.ts`: กฎ Attack Animation และ Projectile
- `src/play/battle.ts`: กฎและสูตรคำนวณการต่อสู้จริง
- `src/play/ai.ts`: AI
- `src/play/battleScene.ts`: การแสดงผลสนามรบ
- `src/play/battleHud.ts`: Canvas HUD

## 2. ข้อมูลของ Ranger แต่ละตัว

Ranger แต่ละตัวอยู่ที่:

```text
public/rangers/<ranger-id>/
```

โดยทั่วไปมี:

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

JSON ทั้งสามไฟล์มีหน้าที่ต่างกัน:

| ไฟล์ | หน้าที่ | ปกติควรแก้เองหรือไม่ |
|---|---|---|
| `ranger.json` | ข้อมูลที่เกม Turn-Based นี่ใช้จริง | **ใช่** |
| `stats.json` | ข้อมูล LINE Rangers ต้นฉบับจาก Lerico | ไม่ คำสั่ง Sync อาจเขียนทับ |
| `gamedata.json` | Metadata ของ Animation/Projectile จาก WarmyCat/RangerBook | ไม่ คำสั่ง Sync อาจเขียนทับ |

จำแบบง่าย:

```text
ranger.json   = Game Design ของเรา
stats.json    = ข้อมูลอ้างอิงตัวละครจากเกมต้นฉบับ
gamedata.json = ข้อมูลอ้างอิง Animation/Projectile จากเกมต้นฉบับ
```

## 3. ค่าสถานะพื้นฐานต้องแก้ที่ไหน?

ค่าที่ใช้จริงใน Battle ของเกมนี่อยู่ใน:

```text
public/rangers/<id>/ranger.json
└── stats
```

ตัวอย่าง:

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

ใน Editor:

```text
Ranger Editor → General → Stats
```

ความหมาย:

- `hp`: HP
- `atk`: ATK
- `def`: DEF
- `spd`: Speed / ลำดับ Turn
- `crit`: Critical Rate
- `critDmg`: Critical Damage
- `evade` / `hit`: หลบ / แม่นยำของการโจมตีปกติ
- `skillEvade` / `skillHit`: หลบ / แม่นยำของ Skill
- `skillRes`: ต้าน Status จาก Skill
- `skillDmgRes`: ต้านความเสียหายจาก Skill

สูตรจริงอยู่ใน `src/play/battle.ts`

## 4. Element, Category และ Role

ค่าของ Ranger แต่ละตัวเก็บใน `ranger.json`:

```json
"element": "water",
"category": "str",
"role": "fighter"
```

ค่าที่รองรับ:

```text
Element: fire / water / wood / light / dark
Category: str / agi / int
Role: tank / fighter / shooter / assassin / mage / support
```

ถ้าต้องการเปลี่ยน Role ของ Ranger ตัวเดียว ให้แก้ `ranger.json`

ถ้าต้องการเปลี่ยนความสามารถร่วมของ Ranger ทุกตัวใน Role เดียวกัน ให้แก้:

```text
src/lib/roleTraits.ts
```

กฎแพ้ทางของ Element และนิยาม Role/Category อยู่ใน:

```text
src/lib/rangerClass.ts
```

Bonus แถวหน้า/แถวหลังอยู่ใน:

```text
src/lib/formation.ts
```

## 5. ข้อมูล Skill

Gameplay ของ Skill อยู่ใน:

```text
ranger.json
└── skills
    ├── skill1
    └── skill2
```

ตัวอย่าง:

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

- `kind`: `attack` หรือ `buff`
- `cost`: Energy ของทีมที่ใช้
- `area`: ขอบเขตเป้าหมาย
- `effects`: ผลการต่อสู้จริง

Attack Area:

```text
single_front
single_any
row
row_any
all
```

Support Area:

```text
self
own_row
ally_single
ally_all
```

ใน Editor:

```text
Ranger Editor → Skill 1 / Skill 2 → Battle Ability
```

ชนิด Effect ที่รองรับกำหนดใน:

```text
src/lib/skills.ts
```

Logic จริงของ Effect อยู่ใน:

```text
src/play/battle.ts
```

ถ้าเพียงแก้ Damage%, จำนวน Turn, Cost, Area หรือ Parameter ของ Effect ที่มีอยู่แล้ว ให้แก้ `ranger.json`

ถ้าจะเพิ่ม Mechanic ใหม่ทั้งหมด เช่น ชุบชีวิต สะท้อน Damage หรือ Copy Buff:

1. เพิ่ม Effect Type ใหม่ใน `src/lib/skills.ts`
2. กำหนด Parameter และ Editor UI ใน `EFFECTS`
3. Implement Logic ใน `src/play/battle.ts`
4. เพิ่ม AI Evaluation ใน `src/play/ai.ts` หากจำเป็น
5. เพิ่มข้อความใน `src/play/i18n.ts` / UI หากจำเป็น

## 6. ความสามารถเฉพาะตัว / Passive

Passive ที่เกมนี้ใช้จริงอยู่ใน:

```text
ranger.json
└── passives
```

ตัวอย่าง:

```json
"passives": [
  { "type": "lifesteal", "pct": 15 },
  { "type": "atkUp", "pct": 10 }
]
```

Passive Type กำหนดใน:

```text
src/lib/passives.ts
```

ปัจจุบันมี:

```text
execute
lifesteal
tough
atkUp
critUp
speedUp
healUp
```

ใน Editor:

```text
Ranger Editor → General → Special Passives
```

ถ้าเพิ่ม Passive Type ใหม่ ต้อง Implement ผลใน `battle.ts` หรือสูตรที่เกี่ยวข้องด้วย

## 7. Ability ของ LINE Rangers ต้นฉบับอยู่ที่ไหน?

Ability ของเกมต้นฉบับอยู่ใน:

```text
public/rangers/<id>/stats.json
└── abilities
```

ดึงอัตโนมัติจาก Lerico API โดย:

```text
scripts/fetch-lerico.mjs
```

`stats.json` ยังมี:

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

ข้อสำคัญ:

> `stats.json` เป็นข้อมูลอ้างอิงจากเกมต้นฉบับ ไม่ใช่ Battle Config ที่เกม Turn-Based นี้ใช้โดยตรง

ปัจจุบัน Ability จาก LINE Rangers ต้นฉบับ **ไม่ได้ถูกแปลงเป็น Battle Mechanic โดยอัตโนมัติ**

ถ้าต้องการให้ Ability มีผลจริง ควรแปลงเป็น:

- `ranger.json.passives`
- Skill `effects`
- หรือเพิ่ม Battle Mechanic ใหม่

ไม่ควรแก้ `stats.json` ด้วยมือ เพราะ Refresh Data อาจเขียนทับ

## 8. `gamedata.json` ใช้ทำอะไร?

`gamedata.json` สร้างโดย:

```text
scripts/fetch-gamedata.mjs
```

จากข้อมูล WarmyCat / RangerBook

ข้อมูลหลัก:

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

ถูกใช้โดย:

```text
rangerAssets.ts
actionPlan.ts
shotRules.ts
```

เพื่อกำหนดจุดปล่อยกระสุน ความเร็ว เส้นทาง จุดกระทบ และ Animation

ปกติไม่ควรแก้ไฟล์นี้ด้วยมือ ถ้า Ranger บางตัวต้องแก้ Visual เป็นกรณีพิเศษ ควรใช้ Manual Override ใน `ranger.json.actions`

## 9. แยก Skill Gameplay ออกจาก Animation

```text
ranger.json.skills
```

ตอบคำถาม:

> Skill นี้ทำอะไรในกฎการต่อสู้?

เช่น:

```text
300% Damage
Stun 1 Turn
Cost 3
```

ส่วน:

```text
ranger.json.actions
```

ตอบคำถาม:

> Skill นี้แสดงผลอย่างไร?

เช่น:

```text
cast clip
release clip
release frame
projectile
muzzle
impact
approach movement
```

ดังนั้น:

```text
skills  = Gameplay
actions = Animation / Presentation
```

## 10. Workflow ที่แนะนำเมื่อต้องเพิ่ม Ranger

1. ใส่ Ranger ID ใน Editor หรือรัน `npm run fetch-ranger -- <ranger-id>`
2. ดาวน์โหลด SAM / PLIST / PNG / projectile ไปยัง `public/rangers/<id>/`
3. Refresh Data เพื่อสร้าง/อัปเดต `stats.json`, `gamedata.json`, `icons/`
4. ตั้ง Name, Element, Category, Role, Stats ใน Ranger Editor
5. ตั้ง Skill 1, Skill 2 และ Passives
6. ตั้ง Clips, Anchors, Projectile, Portrait และ Cut-in
7. ใช้ Preview ทดสอบ Normal Attack และ Skill ทั้งสอง
8. บันทึก `ranger.json`
9. ตั้ง `"approved": true`; Ranger ที่ Approved เท่านั้นจะขึ้นใน Team Builder

## 11. Quick Reference

| สิ่งที่ต้องการแก้ | ตำแหน่ง |
|---|---|
| HP / ATK / DEF / SPD ของ Ranger ตัวเดียว | `public/rangers/<id>/ranger.json` |
| Skill ของ Ranger ตัวเดียว | `public/rangers/<id>/ranger.json` |
| Passive ของ Ranger ตัวเดียว | `public/rangers/<id>/ranger.json` |
| ความสามารถร่วมของ Tank/Fighter ฯลฯ | `src/lib/roleTraits.ts` |
| Bonus แถวหน้า/แถวหลัง | `src/lib/formation.ts` |
| ตัวคูณแพ้ทาง Element | `src/lib/rangerClass.ts` |
| ชนิด Skill Effect ที่ใช้ได้ | `src/lib/skills.ts` |
| ชนิด Passive ที่ใช้ได้ | `src/lib/passives.ts` |
| สูตร Damage / Hit / Evade / Energy / Status | `src/play/battle.ts` |
| วิธีที่ AI ประเมิน Skill | `src/play/ai.ts` |
| กฎ Projectile / Attack Animation | `src/lib/actionPlan.ts`, `src/lib/shotRules.ts` |
| ข้อมูล LINE Rangers ต้นฉบับ | `stats.json` (สร้างอัตโนมัติ ปกติไม่ควรแก้) |
| Metadata ของ Animation/Projectile ต้นฉบับ | `gamedata.json` (สร้างอัตโนมัติ ปกติไม่ควรแก้) |

หลักสำคัญที่สุด:

> ถ้าต้องการเปลี่ยนว่าตัวละครเก่งแค่ไหนจริง ๆ ในเกม Turn-Based นี้ ให้ดู `ranger.json` ก่อน
