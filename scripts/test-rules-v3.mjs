// ====================================================
// test-rules-v3.mjs — กฎชุดที่ 3 (ตามแผนเกม): แถวหน้าบังจนตายหมด · ยั่วยุ · เปราะบาง/ทนทาน ·
//   ต้านดาเมจสกิล · เร่งเทิร์นของเป้า · ลดการฟื้นฟูเป็น % · ขัดขวางการล้าง · แถวเลือกอิสระ ·
//   ความสามารถประจำอาชีพใหม่ (สู้ตาย / ล่าแทงค์ / นักฆ่าข้ามแถว)
//   node scripts/test-rules-v3.mjs
// ====================================================

import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const out = n => path.join(ROOT, 'node_modules', `.tmp-${n}.mjs`)
const bundle = async (entry, n) => {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out(n), logLevel: 'silent', alias: { '@': path.join(ROOT, 'src') } })
  return import(pathToFileURL(out(n)).href)
}
const B = await bundle('src/play/battle.ts', 'v3-battle')
const C = await bundle('src/lib/rangerClass.ts', 'v3-class')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(62)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

const stats = (o = {}) => ({ hp: 5000, atk: 400, def: 250, spd: 100, crit: 0, critDmg: 150, evade: 0, hit: 0, skillEvade: 0, skillHit: 0, skillRes: 0, skillDmgRes: 0, ...o })
const S = (kind, cost, area, effects) => ({ kind, cost, area, effects })
const U = (id, row, lane, skills, over, role = 'fighter') => ({ rangerId: id, row, lane, stats: stats(over), role, skills })
const hit = { skill1: S('attack', 2, 'single_front', [{ type: 'damage', pct: 200 }]), skill2: S('attack', 2, 'row', [{ type: 'damage', pct: 150 }]) }

// ── 1. ธาตุ 150% / 50% ──
check('ธาตุชนะทาง 1.5 · แพ้ทาง 0.5', [C.ELEMENT_WIN, C.ELEMENT_LOSE], [1.5, 0.5])

// ── 2. แถวหน้าบัง: ต้องเก็บแถวหน้าให้ "หมด" ก่อน ──
{
  const b = new B.Battle([[U('a', 'front', 0, hit)], [U('b', 'front', 0, hit), U('b2', 'front', 1, hit), U('b3', 'back', 0, hit)]], 1)
  const me = b.unit('0-front-0')
  const names = act => b.selectableTargets(me, act).map(u => u.uid).sort()
  check('แถวหน้าครบ 2 → ตีปกติ/ทั้งแถว เลือกได้แค่แถวหน้า', [names('attack'), names('skill2')], [['1-front-0', '1-front-1'], ['1-front-0', '1-front-1']])
  b.unit('1-front-1').alive = false
  check('แถวหน้าเหลือ 1 ตัว → ยังตีแถวหลังไม่ได้ (กฎใหม่)', [names('attack'), names('skill2')], [['1-front-0'], ['1-front-0']])
  b.unit('1-front-0').alive = false
  check('แถวหน้าตายหมด → ตีแถวหลังได้', names('attack'), ['1-back-0'])
}

// ── 3. นักฆ่าข้ามแถวได้ (ไม่มีโบนัสตีเป้าเลือดต่ำแล้ว) ──
{
  const b = new B.Battle([[U('a', 'front', 0, hit, {}, 'assassin')], [U('b', 'front', 0, hit), U('b2', 'back', 0, hit)]], 1)
  const me = b.unit('0-front-0')
  check('นักฆ่า: ตีข้ามแถวได้ทันที', b.selectableTargets(me, 'attack').map(u => u.uid).sort(), ['1-back-0', '1-front-0'])
  const t = b.unit('1-back-0')
  const full = b.expectedDamage(me, t, 100, true)
  t.hp = t.maxHp * 0.2
  check('นักฆ่า: เป้าเลือดต่ำไม่ได้โบนัสแล้ว', Math.round(b.expectedDamage(me, t, 100, true)) === Math.round(full), true)
}

// ── 4. ไฟเตอร์ "สู้ตาย" · นักยิง "ล่าแทงค์" ──
{
  const b = new B.Battle([[U('a', 'front', 0, hit, {}, 'fighter'), U('c', 'back', 0, hit, {}, 'shooter')], [U('b', 'front', 0, hit)]], 1)
  const fighter = b.unit('0-front-0'), shooter = b.unit('0-back-0'), foe = b.unit('1-front-0')
  const atFull = b.expectedDamage(fighter, foe, 100, true)
  fighter.hp = fighter.maxHp * 0.25
  const hurt = b.expectedDamage(fighter, foe, 100, true)
  check('ไฟเตอร์: เลือดเหลือ 25% → ตีแรงขึ้น ~30%', Math.round((hurt / atFull - 1) * 100), 30)
  const big = b.expectedDamage(shooter, foe, 100, true)
  foe.hp = foe.maxHp * 0.4
  const small = b.expectedDamage(shooter, foe, 100, true)
  check('นักยิง: เป้าเลือดเกินครึ่งแรงกว่าเป้าเลือดน้อย 35%', Math.round((big / small - 1) * 100), 35)
}

// ── 5. ยั่วยุ: ตีปกติต้องใส่ตัวที่ยั่วยุ (สกิลยังเลือกได้) ──
{
  const taunter = { skill1: S('buff', 2, 'self', [{ type: 'taunt', turns: 2 }]), skill2: S('attack', 2, 'single_front', [{ type: 'damage', pct: 100 }]) }
  const b = new B.Battle([[U('a', 'front', 0, hit)], [U('b', 'front', 0, taunter, {}, 'tank'), U('b2', 'front', 1, hit)]], 1)
  const me = b.unit('0-front-0'), tank = b.unit('1-front-0')
  b.energy[1] = 10
  b.perform(tank, { action: 'skill1', target: tank })
  check('ตีธรรมดา: เลือกได้เฉพาะตัวที่ยั่วยุ', b.selectableTargets(me, 'attack').map(u => u.uid), ['1-front-0'])
  check('สกิลยังเลือกเป้าได้ตามปกติ', b.selectableTargets(me, 'skill1').map(u => u.uid).sort(), ['1-front-0', '1-front-1'])
}

// ── 6. เปราะบาง / ทนทาน / ต้านดาเมจสกิล ──
{
  const b = new B.Battle([[U('a', 'front', 0, hit)], [U('b', 'front', 0, hit), U('c', 'front', 1, hit, { skillDmgRes: 30 })]], 1)
  const me = b.unit('0-front-0'), t = b.unit('1-front-0'), res = b.unit('1-front-1')
  const base = b.expectedDamage(me, t, 100)
  t.statuses.push({ type: 'vulnerable', pct: 30, turns: 2, appliedTurn: 0 })
  check('เปราะบาง 30% → รับดาเมจ +30%', Math.round((b.expectedDamage(me, t, 100) / base - 1) * 100), 30)
  t.statuses = [{ type: 'toughUp', pct: 25, turns: 2, appliedTurn: 0 }]
  check('ทนทาน 25% → รับดาเมจ −25%', Math.round((1 - b.expectedDamage(me, t, 100) / base) * 100), 25)
  const plainSkill = b.expectedDamage(me, t, 100)
  t.statuses = []
  check('ต้านดาเมจสกิล 30% → ดาเมจสกิลลด 30% แต่ตีปกติไม่ลด', [
    Math.round((1 - b.expectedDamage(me, res, 100) / b.expectedDamage(me, t, 100)) * 100),
    Math.round((1 - b.expectedDamage(me, res, 100, true) / b.expectedDamage(me, t, 100, true)) * 100),
  ], [30, 0])
  void plainSkill
}

// ── 7. เร่งเทิร์นของเป้า ──
{
  const burner = { skill1: S('attack', 2, 'single_front', [{ type: 'turnBurn', turns: 2 }]), skill2: S('attack', 2, 'row', [{ type: 'damage', pct: 100 }]) }
  const b = new B.Battle([[U('a', 'front', 0, burner)], [U('b', 'front', 0, hit)]], 1)
  const me = b.unit('0-front-0'), t = b.unit('1-front-0')
  t.statuses.push({ type: 'barrier', pct: 0, turns: 3, appliedTurn: 0 })
  t.statuses.push({ type: 'poison', pct: 50, turns: 3, appliedTurn: 0, srcAtk: 400, srcElement: undefined })
  const hpBefore = t.hp
  b.energy[0] = 10
  b.perform(me, { action: 'skill1', target: t })
  const barrier = t.statuses.find(s => s.type === 'barrier')
  const poison = t.statuses.find(s => s.type === 'poison')
  check('เร่งเทิร์น 2: บัฟ/ดีบัฟเหลือเทิร์นน้อยลง 2', [barrier?.turns, poison?.turns], [1, 1])
  check('เร่งเทิร์น: ดาเมจต่อเนื่องทำงานทันที', t.hp < hpBefore, true)
}

// ── 8. ลดการฟื้นฟูเป็น % ──
{
  const healer = { skill1: S('buff', 2, 'ally_single', [{ type: 'heal', pct: 20 }]), skill2: S('attack', 2, 'single_front', [{ type: 'healBlock', pct: 60, turns: 2 }]) }
  const b = new B.Battle([[U('a', 'front', 0, healer, {}, 'fighter'), U('a2', 'front', 1, hit)], [U('b', 'front', 0, hit)]], 1)
  const me = b.unit('0-front-0'), mate = b.unit('0-front-1')
  b.energy[0] = 10
  mate.hp = mate.maxHp * 0.3
  const before = mate.hp
  b.perform(me, { action: 'skill1', target: mate })
  const fullHeal = mate.hp - before
  mate.hp = before
  mate.statuses.push({ type: 'healBlock', pct: 60, turns: 2, appliedTurn: 0 })
  b.energy[0] = 10
  b.perform(me, { action: 'skill1', target: mate })
  check('ลดการฟื้นฟู 60% → ฮีลได้ 40%', Math.round(((mate.hp - before) / fullHeal) * 100), 40)
  mate.hp = before
  mate.statuses = [{ type: 'healBlock', pct: 100, turns: 2, appliedTurn: 0 }]
  b.energy[0] = 10
  b.perform(me, { action: 'skill1', target: mate })
  check('ลดการฟื้นฟู 100% → ฟื้นไม่ได้เลย', mate.hp - before, 0)
}

// ── 9. ขัดขวางการล้างผลด้านลบ ──
{
  const cleanser = { skill1: S('buff', 2, 'ally_all', [{ type: 'cleanse' }]), skill2: S('attack', 2, 'single_front', [{ type: 'damage', pct: 100 }]) }
  const b = new B.Battle([[U('a', 'front', 0, cleanser, {}, 'support'), U('a2', 'front', 1, hit)], [U('b', 'front', 0, hit)]], 1)
  const me = b.unit('0-front-0'), mate = b.unit('0-front-1')
  mate.statuses.push({ type: 'atkDown', pct: 20, turns: 2, appliedTurn: 0 }, { type: 'sealCleanse', pct: 0, turns: 2, appliedTurn: 0 })
  b.energy[0] = 10
  b.perform(me, { action: 'skill1', target: mate })
  check('โดนขัดขวาง → ล้างดีบัฟไม่ออก', mate.statuses.some(s => s.type === 'atkDown'), true)
  mate.statuses = [{ type: 'atkDown', pct: 20, turns: 2, appliedTurn: 0 }]
  b.energy[0] = 10
  b.perform(me, { action: 'skill1', target: mate })
  check('ไม่โดนขัดขวาง → ล้างออกตามปกติ', mate.statuses.some(s => s.type === 'atkDown'), false)
}

// ── 10. สกิลทั้งแถวแบบเลือกแถวอิสระ ──
{
  const anyRow = { skill1: S('attack', 2, 'row_any', [{ type: 'damage', pct: 120 }]), skill2: S('attack', 2, 'row', [{ type: 'damage', pct: 120 }]) }
  const b = new B.Battle([[U('a', 'front', 0, anyRow, {}, 'mage')], [U('b', 'front', 0, hit), U('b2', 'front', 1, hit), U('b3', 'back', 0, hit), U('b4', 'back', 1, hit)]], 1)
  const me = b.unit('0-front-0')
  check('แถวอิสระ: เลือกแถวหลังได้ทั้งที่แถวหน้ายังอยู่', b.selectableTargets(me, 'skill1').map(u => u.uid).sort(), ['1-back-0', '1-back-1', '1-front-0', '1-front-1'])
  check('แถวอิสระ: เลือกตัวแถวหลัง → โดนทั้งแถวหลัง', b.affectedUnits(me, 'skill1', b.unit('1-back-1')).map(u => u.uid).sort(), ['1-back-0', '1-back-1'])
}

// ── 11. คืน Cost จากสกิลโจมตีได้ ──
{
  const gainer = { skill1: S('attack', 2, 'single_front', [{ type: 'damage', pct: 100 }, { type: 'energyGain', amount: 2 }]), skill2: S('attack', 2, 'row', [{ type: 'damage', pct: 100 }]) }
  const b = new B.Battle([[U('a', 'front', 0, gainer)], [U('b', 'front', 0, hit)]], 1)
  const me = b.unit('0-front-0')
  b.energy[0] = 5
  b.perform(me, { action: 'skill1', target: b.unit('1-front-0') })
  check('สกิลโจมตีคืน Cost ได้ (5 − 2 + 2)', b.energy[0], 5)
}

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
await rm(out('v3-battle'), { force: true })
await rm(out('v3-class'), { force: true })
process.exit(fail ? 1 : 0)
