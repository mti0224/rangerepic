// ====================================================
// test-rules.mjs — กติกาชุดใหม่: ความเร็วแบบ Honkai: Star Rail · ดึงเทิร์น · ลดความเร็ว ·
//   ดาเมจต่อเนื่อง (พิษ/ไฟไหม้/เลือดไหล) · ดูดเลือด 3 ขอบเขต · ลดคริ/คริดาเมจ · ห้ามฟื้นฟู ·
//   ชะงักจากสกิลวงกว้าง · เพดานเพิ่ม Cost
//   node scripts/test-rules.mjs
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
const B = await bundle('src/play/battle.ts', 'rules-battle')

let pass = 0, fail = 0
const check = (name, got, want, tol = 0) => {
  const ok = typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(60)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

// ค่าพลังกลาง: ไม่หลบ ไม่ต้าน ไม่คริ (ผลแน่นอน)
const stats = (over = {}) => ({ hp: 100000, atk: 1000, def: 0, spd: 100, crit: 0, critDmg: 150, evade: 0, hit: 0, skillEvade: 0, skillHit: 0, skillRes: 0, ...over })
const atk = (area, effects, cost = 0) => ({ kind: 'attack', cost, area, effects })
const buff = (area, effects, cost = 0) => ({ kind: 'buff', cost, area, effects })
const idle = { skill1: atk('single_any', [{ type: 'damage', pct: 100 }]), skill2: atk('single_any', [{ type: 'damage', pct: 100 }]) }
const unit = (row, lane, over = {}, skills = idle, role = 'mage') => ({ rangerId: `${row}${lane}`, row, lane, role, stats: stats(over), skills })
/** ยิงสกิลของ actor ใส่ target ตรงๆ (ไม่ผ่านลำดับเทิร์น) */
const use = (b, actor, target, action = 'skill1') => b.resolveAction(actor, action, target)

// ── ความเร็ว: มีผลทันที (AV × Speed เดิม / Speed ใหม่) ──
{
  const haste = buff('ally_single', [{ type: 'speedUp', pct: 25, turns: 2 }])
  const b = new B.Battle([[unit('back', 0, {}, { skill1: haste, skill2: haste }), unit('back', 1)], [unit('front', 0, { spd: 50 })]])
  const [caster, ally] = b.units
  ally.av = 5000
  use(b, caster, ally)
  check('เร่งความเร็ว 25% → AV ที่เหลือ 5000 × 100/125', Math.round(ally.av), 4000)
  // หมดบัฟ (จบเทิร์นของตัวที่ได้ 2 ครั้ง) → AV กลับเป็นสัดส่วนเดิม
  b.turn++; b.endTurn(ally); b.turn++; b.endTurn(ally)
  check('บัฟหมด → AV ปรับกลับ (4000 × 125/100)', Math.round(ally.av), 5000)
}
{
  const slow = atk('single_any', [{ type: 'damage', pct: 1 }, { type: 'speedDown', pct: 20, turns: 2 }])
  const b = new B.Battle([[unit('back', 0, {}, { skill1: slow, skill2: slow })], [unit('front', 0)]])
  const [caster, foe] = b.units
  foe.av = 4000
  use(b, caster, foe)
  check('ลดความเร็ว 20% → AV ที่เหลือ 4000 × 100/80', Math.round(foe.av), 5000)
  check('Speed จริงหลังโดนลด', Math.round(b.effSpd(foe)), 80)
  foe.statuses.find(s => s.type === 'speedDown').pct = 90
  check('ลดความเร็วได้ต่ำสุดครึ่งหนึ่ง', Math.round(b.effSpd(foe)), 50)
}
{
  // ดึงเทิร์น 100% → เพื่อนได้เล่นเป็นตัวถัดไปทันที · ลำดับล่วงหน้าเปลี่ยนตาม · ใช้กับตัวเองไม่ได้
  const pull = buff('ally_all', [{ type: 'actionAdvance', pct: 100 }])
  const b = new B.Battle([[unit('back', 0, { spd: 120 }, { skill1: pull, skill2: pull }), unit('back', 1, { spd: 60 })], [unit('front', 0, { spd: 110 })]])
  const [caster, slowAlly, foe] = b.units
  const first = b.nextActor()
  check('ตัวเร็วสุดได้เล่นก่อน', first.uid, caster.uid)
  check('ก่อนดึง: เพื่อนช้าอยู่ท้ายคิว', b.previewOrder(3).map(u => u.uid).indexOf(slowAlly.uid) > 0, true)
  const res = use(b, caster, caster)
  b.endTurn(caster)
  check('ดึงเทิร์น 100% → เพื่อนได้เล่นต่อทันที', b.previewOrder(1)[0].uid, slowAlly.uid)
  check('ผู้ใช้ไม่ได้ดึงตัวเอง', res.outcomes.find(o => o.uid === caster.uid).advanced, false)
  check('เพื่อนถูกดึง (advanced)', res.outcomes.find(o => o.uid === slowAlly.uid).advanced, true)
  check('ตัวที่ได้เล่นจริงถัดไป = เพื่อนที่ถูกดึง', b.nextActor().uid, slowAlly.uid)
  void foe
}
{
  // ดึงเทิร์น 30% ของ 10000/Speed
  const pull = buff('ally_single', [{ type: 'actionAdvance', pct: 30 }])
  const b = new B.Battle([[unit('back', 0, {}, { skill1: pull, skill2: pull }), unit('back', 1)], [unit('front', 0)]])
  const [caster, ally] = b.units
  ally.av = 80
  use(b, caster, ally)
  check('ดึงเทิร์น 30% → AV ลด 30 (10000/Speed 100 × 30%)', Math.round(ally.av), 50)
}

// ── ดาเมจต่อเนื่อง ──
{
  const dot = atk('single_any', [{ type: 'damage', pct: 1 }, { type: 'poison', pct: 50, turns: 2 }, { type: 'burn', pct: 30, turns: 1 }])
  const b = new B.Battle([[unit('back', 0, {}, { skill1: dot, skill2: dot })], [unit('front', 0)]])
  const [caster, foe] = b.units
  use(b, caster, foe)
  check('ติดพิษ + ไฟไหม้พร้อมกันได้ (คนละชนิด)', foe.statuses.map(s => s.type).sort(), ['burn', 'poison'])
  const hp0 = foe.hp
  const start = b.beginTurn(foe)
  // ATK ผู้ใส่รวมโบนัสแถวหลังแล้ว (caster.atk)
  const want = Math.round(caster.atk * 0.5 * B.DAMAGE_SCALE) + Math.round(caster.atk * 0.3 * B.DAMAGE_SCALE)
  check('ต้นเทิร์นเป้าโดนดาเมจต่อเนื่อง = ATK × % × ความแรงเกม', start.dot, want)
  check('เลือดลดจริงเท่าดาเมจต่อเนื่อง', hp0 - foe.hp, want)
  b.turn++; b.endTurn(foe)
  check('ไฟไหม้ 1 เทิร์นหมด · พิษ 2 เทิร์นเหลือ', foe.statuses.map(s => s.type), ['poison'])
  // ATK ผู้ใส่เปลี่ยนทีหลังไม่กระทบ (ใช้ค่า ณ ตอนใส่)
  const atkThen = caster.atk
  caster.atk = 5000
  check('ดาเมจใช้ ATK ตอนใส่ (ไม่เปลี่ยนตามทีหลัง)', b.beginTurn(foe).dot, Math.round(atkThen * 0.5 * B.DAMAGE_SCALE))
}
{
  // บาเรียไม่กันดาเมจต่อเนื่อง · โล่รับก่อน · ใส่ซ้ำชนิดเดิม = แทนที่ · ล้างผลด้านลบล้างได้
  const dot = atk('single_any', [{ type: 'damage', pct: 1 }, { type: 'bleed', pct: 40, turns: 3 }])
  const b = new B.Battle([[unit('back', 0, {}, { skill1: dot, skill2: dot })], [unit('front', 0)]])
  const [caster, foe] = b.units
  use(b, caster, foe); use(b, caster, foe)
  check('เลือดไหลใส่ซ้ำ = แทนที่ (มีอันเดียว)', foe.statuses.filter(s => s.type === 'bleed').length, 1)
  foe.statuses.push({ type: 'barrier', pct: 0, turns: 1, appliedTurn: -1 })
  const hp0 = foe.hp
  b.beginTurn(foe)
  check('บาเรียไม่กันดาเมจต่อเนื่อง', foe.hp < hp0, true)
  foe.statuses.push({ type: 'shield', pct: 0, turns: 2, shieldHp: 100000, appliedTurn: -1 })
  const hp1 = foe.hp
  b.beginTurn(foe)
  check('โล่รับดาเมจต่อเนื่องก่อน', foe.hp, hp1)
  foe.hp = 10
  const s = b.beginTurn({ ...foe, statuses: foe.statuses.filter(x => x.type === 'bleed') })
  check('ดาเมจต่อเนื่องฆ่าได้ (killed)', s.killed, true)
}
{
  const cure = buff('ally_single', [{ type: 'cleanse' }])
  const b = new B.Battle([[unit('back', 0, {}, { skill1: cure, skill2: cure }), unit('back', 1)], [unit('front', 0)]])
  const [caster, ally] = b.units
  ally.statuses.push({ type: 'poison', pct: 50, turns: 2, appliedTurn: -1, srcAtk: 1000 })
  use(b, caster, ally)
  check('ล้างผลด้านลบ → ล้างพิษได้', ally.statuses.length, 0)
}

// ── ดูดเลือด 3 ขอบเขต ──
for (const [scope, want] of [['self', [true, false, false]], ['own_row', [true, true, false]], ['ally_all', [true, true, true]]]) {
  const steal = atk('single_any', [{ type: 'damage', pct: 100 }, { type: 'lifesteal', pct: 50, scope }])
  const b = new B.Battle([[unit('back', 0, {}, { skill1: steal, skill2: steal }), unit('back', 1), unit('front', 0)], [unit('front', 0)]])
  const [caster, rowMate, front, foe] = b.units
  for (const u of [caster, rowMate, front]) u.hp = 1000
  const res = use(b, caster, foe)
  const dealt = res.outcomes[0].damage
  check(`ดูดเลือด (${scope}): ใครได้บ้าง`, [caster, rowMate, front].map(u => u.hp > 1000), want)
  const n = want.filter(Boolean).length
  check(`ดูดเลือด (${scope}): 50% ของดาเมจ แบ่งเท่าๆ กัน ${n} ตัว`, caster.hp - 1000, Math.round(dealt * 0.5 / n))
}
{
  // ห้ามฟื้นฟู: กันดูดเลือด · ฮีล · ฟื้นฟูต่อเนื่อง
  const steal = atk('single_any', [{ type: 'damage', pct: 100 }, { type: 'lifesteal', pct: 50, scope: 'self' }])
  const heal = buff('ally_single', [{ type: 'heal', pct: 30 }])
  const b = new B.Battle([[unit('back', 0, {}, { skill1: steal, skill2: heal }), unit('back', 1)], [unit('front', 0)]])
  const [caster, ally, foe] = b.units
  for (const u of [caster, ally]) { u.hp = 1000; u.statuses.push({ type: 'healBlock', pct: 0, turns: 2, appliedTurn: -1 }) }
  use(b, caster, foe)
  check('ห้ามฟื้นฟู → ดูดเลือดไม่ได้', caster.hp, 1000)
  use(b, caster, ally, 'skill2')
  check('ห้ามฟื้นฟู → ฮีลไม่เข้า', ally.hp, 1000)
  check('ไกด์ฮีลแสดง 0 ตอนโดนห้ามฟื้นฟู', b.previewAction(caster, 'skill2', ally)[0].heal, 0)
  ally.statuses.push({ type: 'regen', pct: 10, turns: 2, appliedTurn: -1 })
  check('ห้ามฟื้นฟู → ฟื้นฟูต่อเนื่องไม่เข้า', b.beginTurn(ally).regen, 0)
}

// ── ลดคริ / ลดคริดาเมจ ──
{
  const b = new B.Battle([[unit('back', 0, { crit: 40, critDmg: 180 })], [unit('front', 0)]])
  const [u] = b.units
  u.statuses.push({ type: 'critDown', pct: 25, turns: 2, appliedTurn: -1 }, { type: 'critDmgDown', pct: 50, turns: 2, appliedTurn: -1 })
  check('ลดอัตราคริ 25 → (40 + 8 แถวหลัง) − 25', b.effCrit(u), u.crit - 25)
  check('ลดดาเมจคริ 50 → 180 − 50', b.effCritDmg(u), 130)
  u.statuses.find(s => s.type === 'critDmgDown').pct = 200
  check('ดาเมจคริไม่ต่ำกว่า 100% (คริไม่เบากว่าตีปกติ)', b.effCritDmg(u), 100)
}

// ── ชะงักจากสกิลวงกว้างติดยากกว่า ──
{
  const rate = area => {
    const stun = atk(area, [{ type: 'damage', pct: 1 }, { type: 'stun', turns: 1 }])
    let landed = 0, tries = 0
    for (let seed = 1; seed <= 400; seed++) {
      const b = new B.Battle([[unit('back', 0, {}, { skill1: stun, skill2: stun })], [unit('front', 0), unit('front', 1), unit('back', 0)]], seed)
      const [caster, foe] = b.units
      const res = use(b, caster, foe)
      for (const o of res.outcomes) { tries++; if (o.applied.includes('stun')) landed++ }
    }
    return Math.round(landed / tries * 100) / 100
  }
  check('ชะงักเป้าเดี่ยว: ติด 100% (ไม่มีต้านทาน)', rate('single_any'), 1)
  check('ชะงักทั้งแถว: ติด ~70%', rate('row'), 0.7, 0.06)
  check('ชะงักทั้งหมด: ติด ~50%', rate('all'), 0.5, 0.06)
}

// ── เพิ่ม Cost ให้ทีม: ได้สุทธิไม่เกิน +1 ──
{
  const pump = buff('self', [{ type: 'energyGain', amount: 5 }], 2)
  const b = new B.Battle([[unit('back', 0, {}, { skill1: pump, skill2: pump })], [unit('front', 0)]])
  const [u] = b.units
  b.energy[0] = 5
  b.commitAction(u, 'skill1')
  const res = use(b, u, u)
  check('Cost 2 + เพิ่ม Cost 5 → ได้คืนแค่ 3 (สุทธิ +1)', [res.energyGained, b.energy[0]], [3, 6])
}

// ── ความเสียหายจริง: ลงเลือดตรงๆ ไม่สนโล่ · ไม่หัก DEF · บาเรียยังกัน ──
{
  const pierce = atk('single_any', [{ type: 'trueDamage', pct: 100 }])
  const b = new B.Battle([[unit('back', 0, {}, { skill1: pierce, skill2: pierce })], [unit('front', 0, { def: 800 })]])
  const [caster, foe] = b.units
  foe.statuses.push({ type: 'shield', pct: 0, turns: 2, shieldHp: 5000, appliedTurn: -1 })
  const hp0 = foe.hp
  const o = use(b, caster, foe).outcomes[0]
  const want = Math.round(caster.atk * B.DAMAGE_SCALE)
  check('ความเสียหายจริง = ATK × % × ความแรงเกม (ไม่หัก DEF แม้ DEF สูง)', o.damage, want)
  check('ไม่ผ่านโล่: เลือดลดเต็ม · โล่ยังอยู่ครบ', [hp0 - foe.hp, foe.statuses.find(s => s.type === 'shield').shieldHp, o.shieldAbsorbed], [want, 5000, 0])
  check('นับเป็นความเสียหายจริงในผล', o.trueDamage, want)
  const pv = b.previewAction(caster, 'skill1', foe)[0]
  check('ไกด์: ความเสียหายจริงลงเลือด ไม่ลงโล่', B.previewLoss(pv, foe.hp, 5000), { shieldLoss: 0, hpLoss: want, ko: false })
  foe.statuses.push({ type: 'barrier', pct: 0, turns: 1, appliedTurn: -1 })
  const hp1 = foe.hp
  check('บาเรียอมตะยังกันได้', [use(b, caster, foe).outcomes[0].immune, foe.hp], [true, hp1])
  // ดาเมจปกติผสม: ส่วนปกติเข้าโล่ก่อน ส่วนจริงลงเลือด
  check('ไกด์ผสม: ปกติ 300 เข้าโล่ 200 · เลือดหาย 100 + จริง 50', B.previewLoss({ damage: 350, trueDamage: 50 }, 1000, 200), { shieldLoss: 200, hpLoss: 150, ko: false })
}

// ── ลดความแม่นยำ (ตีปกติ) / ลดความแม่นยำทักษะ ──
{
  const blind = atk('single_any', [{ type: 'damage', pct: 1 }, { type: 'hitDown', pct: 25, turns: 2 }, { type: 'skillHitDown', pct: 15, turns: 2 }])
  const b = new B.Battle([[unit('back', 0, { evade: 10, skillEvade: 10 }, { skill1: blind, skill2: blind })], [unit('front', 0, { hit: 5, skillHit: 5 })]])
  const [caster, foe] = b.units
  check('ก่อนโดน: ตีปกติของเป้าโดนเราหลบ 10 − 5 = 5%', b.evadeChance(foe, caster, true), 5)
  use(b, caster, foe)
  check('ติดทั้งสองสถานะ', foe.statuses.map(s => s.type).sort(), ['hitDown', 'skillHitDown'])
  check('ลดแม่นยำ 25 → แม่นยำเป้า 5 − 25 = −20', b.effHit(foe), -20)
  check('ตีปกติของเป้า: เราหลบได้ 10 − (−20) = 30%', b.evadeChance(foe, caster, true), 30)
  check('ลดแม่นยำทักษะ 15 → สกิลของเป้าเราหลบได้ 10 − (5 − 15) = 20%', b.evadeChance(foe, caster, false), 20)
  check('นับเป็นผลด้านลบ (ล้างได้ · ต้านได้)', [B.isDebuff('hitDown'), B.isDebuff('skillHitDown')], [true, true])
}

await rm(out('rules-battle'), { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
