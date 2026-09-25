// ====================================================
// test-ai-plan.mjs — สถานการณ์ที่ AI ต้องตัดสินใจให้ฉลาด (ไม่เปลืองสกิล · ดอง Cost ให้เพื่อน · ล้างดีบัฟ · ล็อคเป้า)
//   node scripts/test-ai-plan.mjs
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
const B = await bundle('src/play/battle.ts', 'aip-battle')
const K = await bundle('src/lib/skills.ts', 'aip-skills')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = Array.isArray(want) && !Array.isArray(got) ? want.includes(got) : JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(66)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

const STATS = { hp: 6000, atk: 500, def: 250, spd: 100, crit: 5, critDmg: 150, evade: 0, hit: 0, skillEvade: 0, skillHit: 0, skillRes: 0 }
const fx = (type, over = {}) => ({ ...K.newEffect(type), ...over })
const sk = (kind, area, effects, cost = 2) => ({ kind, cost, area, effects })
const hit = pct => sk('attack', 'single_front', [fx('damage', { pct })])
const plain = { skill1: hit(150), skill2: hit(150) }
const unit = (row, lane, stats = {}, extra = {}) => ({ rangerId: 'x', row, lane, stats: { ...STATS, ...stats }, skills: plain, ...extra })
const battle = (left, right, reserves) => new B.Battle([left, right], 42, reserves)
/** ทุกการตัดสินใจ (มีสุ่มเล็กน้อย + จำลองล่วงหน้า) — เก็บผลหลายรอบ คืนค่าที่ได้ทั้งหมด */
const plans = (b, uid, n = 12) => {
  const r = new Set()
  for (let i = 0; i < n; i++) {
    const p = b.planAuto(b.unit(uid))
    r.add(p ? `${p.caster ? p.caster.uid + ':' : ''}${p.action}` : 'none')
  }
  return [...r].sort().join('|')
}
const barrier = (u, turns = 2) => u.statuses.push({ type: 'barrier', pct: 0, turns, appliedTurn: 0 })

// ── 1. ศัตรูเหลือแต่ตัวที่มีบาเรียอมตะ · สกิลโจมตีเราไม่ทะลุ ──
{
  const skills = { skill1: sk('attack', 'single_front', [fx('damage', { pct: 300 }), fx('stun')], 2), skill2: sk('buff', 'self', [fx('atkUp', { pct: 40, turns: 3 })], 2) }
  const b = battle([unit('front', 0, {}, { skills }), unit('front', 1)], [unit('front', 0)])
  b.energy[0] = 6
  barrier(b.unit('1-front-0'))
  check('ศัตรูอมตะหมด → ไม่ใช้สกิลโจมตี (บัฟตัวเอง/ตีปกติเก็บ Cost)', plans(b, '0-front-0').split('|').includes('skill1'), false)

  // มีตัวแถวพิเศษที่ทะลุอมตะได้ → อัญเชิญมาทำลายบาเรีย
  const breaker = { skill1: sk('attack', 'single_any', [fx('damage', { pct: 280 }), fx('breakInvincible')], 3), skill2: sk('attack', 'single_any', [fx('damage', { pct: 280 }), fx('breakInvincible')], 3) }
  const b2 = battle([unit('front', 0, {}, { skills }), unit('front', 1)], [unit('front', 0, { hp: 3000 })], [[unit('back', 0, { atk: 700 }, { skills: breaker })], []])
  b2.energy[0] = 6
  b2.unit('1-front-0').hp = 1200
  barrier(b2.unit('1-front-0'))
  check('ศัตรูอมตะ + เพื่อนแถวพิเศษทะลุได้ → อัญเชิญมาทุบ', plans(b2, '0-front-0'), ['0-sup-0:skill1', '0-sup-0:skill2', '0-sup-0:skill1|0-sup-0:skill2'])
}

// ── 2. ฮีลให้คุ้ม ──
{
  const healer = { skill1: sk('buff', 'ally_all', [fx('heal', { pct: 20 })], 2), skill2: hit(150) }
  const b = battle([unit('back', 0, { atk: 250 }, { skills: healer, role: 'support' }), unit('front', 0), unit('front', 1)], [unit('front', 0), unit('front', 1)])
  for (const e of [4, 10]) {
    b.energy[0] = e
    for (const u of b.units.filter(u => u.team === 0)) u.hp = Math.round(u.maxHp * 0.99)
    check(`เลือดหาย 1% · พลังงาน ${e} → ไม่กดฮีล 20%`, plans(b, '0-back-0').split('|').includes('skill1'), false)
  }
  b.energy[0] = 4
  b.unit('0-front-0').hp = 2200; b.unit('0-front-1').hp = 2600
  check('เพื่อนเลือดหายเยอะ → กดฮีล', plans(b, '0-back-0'), 'skill1')
}

// ── 3. ติดดีบัฟหนัก → ล้าง ──
{
  const cleaner = { skill1: sk('buff', 'ally_all', [fx('cleanse')], 2), skill2: hit(150) }
  const b = battle([unit('back', 0, { atk: 250 }, { skills: cleaner, role: 'support' }), unit('front', 0, { atk: 900 }), unit('front', 1, { atk: 900 })], [unit('front', 0), unit('front', 1)])
  b.energy[0] = 4
  const add = (uid, type, turns, pct = 30) => b.unit(uid).statuses.push({ type, pct, turns, appliedTurn: 0 })
  add('0-front-0', 'stun', 2); add('0-front-0', 'vulnerable', 2, 40); add('0-front-1', 'atkDown', 3, 40)
  add('0-front-1', 'silence', 2); add('0-front-1', 'poison', 3, 60)
  check('เพื่อนตัวแรงติดชะงัก/ห้ามสกิล/ลด ATK/พิษ → ล้างดีบัฟ', plans(b, '0-back-0'), 'skill1')
  for (const u of b.units) u.statuses = []
  add('0-front-0', 'hitDown', 1, 5)
  check('ดีบัฟเล็กน้อยตัวเดียว → ไม่เปลืองสกิลล้าง', plans(b, '0-back-0').split('|').includes('skill1'), false)
}

// ── 4. ดอง Cost ให้เพื่อนที่เก่งกว่า (เพื่อนได้เล่นต่อจากเรา) ──
{
  const mine = { skill1: sk('attack', 'single_front', [fx('damage', { pct: 230 })], 3), skill2: sk('attack', 'single_front', [fx('damage', { pct: 230 })], 3) }
  const star = { skill1: sk('attack', 'all', [fx('damage', { pct: 330 })], 3), skill2: sk('attack', 'all', [fx('damage', { pct: 330 })], 3) }
  // เราธาตุแพ้ทาง (ไฟตีน้ำ) · เพื่อนธาตุชนะทาง (ไม้ตีน้ำ) และได้เล่นถัดจากเรา · พลังงานพอแค่ท่าเดียว
  const b = battle(
    [unit('front', 0, { spd: 120 }, { skills: mine, element: 'fire' }), unit('back', 0, { spd: 110, atk: 700 }, { skills: star, element: 'wood' })],
    [unit('front', 0, { spd: 90 }, { element: 'water' }), unit('front', 1, { spd: 90 }, { element: 'water' }), unit('back', 0, { spd: 90 }, { element: 'water' })])
  b.energy[0] = 3
  check('แพ้ทาง + พลังงานพอท่าเดียว + เพื่อนเก่งได้เล่นถัดไป → ตีปกติดองให้เพื่อน', plans(b, '0-front-0'), 'attack')
  b.energy[0] = 10
  check('พลังงานเต็ม (ตีปกติได้ Cost เพิ่มไม่ได้) + เหลือพอให้เพื่อน → ใช้สกิล', /skill/.test(plans(b, '0-front-0')), true)
}

// ── 5. ล็อคเป้า: เก็บตัวที่ฆ่าได้/อันตราย แทนการตีตัวถึก ──
{
  const b = battle([unit('front', 0, { atk: 800 }, { role: 'assassin' })],
    [unit('front', 0, { hp: 12000, def: 600 }, { role: 'tank' }), unit('back', 0, { atk: 400 }, { role: 'support', skills: { skill1: sk('buff', 'ally_all', [fx('heal', { pct: 30 })]), skill2: hit(100) } }), unit('back', 1, { atk: 1100 }, { role: 'mage' })])
  b.unit('1-back-1').hp = 1500
  const t = new Set(Array.from({ length: 10 }, () => b.planAuto(b.unit('0-front-0')).target.uid))
  check('นักฆ่า: เก็บตัวตีแรงที่เลือดเหลือน้อย (ไม่ตีแทงค์)', [...t].join('|'), '1-back-1')
}

// ── 6. ไม่มีทางเล็งทีมตัวเอง (ทุกท่า ทุกตัว ในเกมจำลอง) ──
{
  const buffAll = { skill1: sk('buff', 'ally_single', [fx('heal', { pct: 30 })], 2), skill2: sk('attack', 'row', [fx('damage', { pct: 200 })], 3) }
  const b = battle([unit('front', 0), unit('back', 0, {}, { skills: buffAll })], [unit('front', 0), unit('back', 0, {}, { skills: buffAll })],
    [[unit('back', 0, {}, { skills: buffAll })], [unit('back', 0, {}, { skills: buffAll })]])
  let wrong = 0
  for (let k = 0; k < 200 && b.winner === null; k++) {
    const a = b.nextActor(); if (!a) break
    if (b.beginTurn(a).stunned || !a.alive) { b.endTurn(a); continue }
    const p = b.planAuto(a); if (!p) break
    const s = b.skillOf(p.caster ?? a, p.action)
    if ((s.kind === 'attack') === (p.target.team === a.team)) wrong++
    b.perform(a, p); b.endTurn(a)
  }
  check('ทั้งเกม: สกิลโจมตีไม่เล็งเพื่อน · บัฟไม่เล็งศัตรู', wrong, 0)
  // กันพลาดในกติกา: สั่งตีเพื่อนตรงๆ → ต้องไปลงศัตรูแทน
  const g = battle([unit('front', 0), unit('front', 1)], [unit('front', 0)])
  const mate = g.unit('0-front-1'), hp = mate.hp
  g.resolveAction(g.unit('0-front-0'), 'attack', mate)
  check('สั่งตีปกติใส่เพื่อน → กติกาเปลี่ยนเป็นศัตรู เพื่อนไม่เสียเลือด', [mate.hp === hp, g.unit('1-front-0').hp < g.unit('1-front-0').maxHp], [true, true])
}

for (const n of ['aip-battle', 'aip-skills']) await rm(out(n), { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
