// ====================================================
// test-ai.mjs — พฤติกรรมของออโต้/บอท (ai.ts)
//   node scripts/test-ai.mjs
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
const B = await bundle('src/play/battle.ts', 'ai-test-battle')
const K = await bundle('src/lib/skills.ts', 'ai-test-skills')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(62)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

const STATS = { hp: 5000, atk: 450, def: 250, spd: 100, crit: 0, critDmg: 150, evade: 0, hit: 0, skillEvade: 0, skillHit: 0, skillRes: 0 }
const fx = (type, over = {}) => ({ ...K.newEffect(type), ...over })
const sk = (kind, area, effects, cost = 2) => ({ kind, cost, area, effects })
const plainSkills = { skill1: sk('attack', 'single_front', [fx('damage', { pct: 150 })]), skill2: sk('attack', 'single_front', [fx('damage', { pct: 150 })]) }
const unit = (row, lane, stats = {}, extra = {}) => ({ rangerId: 'x', row, lane, stats: { ...STATS, ...stats }, skills: plainSkills, ...extra })
const battle = (left, right) => new B.Battle([left, right], 42)
/** เสียงสุ่มของ AI ±4% — เช็คหลายรอบให้แน่ใจว่าเลือกแบบเดิมเสมอ */
const always = (fn, n = 25) => { const r = new Set(Array.from({ length: n }, fn)); return r.size === 1 ? [...r][0] : [...r].sort().join('|') }

// ── เลือกเป้า ──
{
  // ฆ่าได้ทันที vs เลือดเต็ม → เก็บตัวที่ฆ่าได้
  const b = battle([unit('front', 0)], [unit('front', 0), unit('front', 1)])
  b.unit('1-front-1').hp = 300
  check('ฆ่าได้ → เก็บตัวนั้นก่อน', always(() => b.planAuto(b.unit('0-front-0')).target.uid), '1-front-1')

  // เลือดเท่ากัน ตัวหนึ่งอันตรายกว่ามาก (ATK สูง) → ตีตัวอันตราย ถ้าฆ่าได้
  const b2 = battle([unit('front', 0, { atk: 900 })], [unit('front', 0, { atk: 200 }), unit('front', 1, { atk: 1200 })])
  b2.unit('1-front-0').hp = 700; b2.unit('1-front-1').hp = 700
  check('ฆ่าได้ทั้งคู่ → เก็บตัวที่อันตรายกว่า', always(() => b2.planAuto(b2.unit('0-front-0')).target.uid), '1-front-1')

  // ตัวที่มีบาเรีย → ตีปกติไม่เข้า เลือกตัวอื่น
  const b3 = battle([unit('front', 0)], [unit('front', 0), unit('front', 1)])
  b3.unit('1-front-0').hp = 200
  b3.unit('1-front-0').statuses.push({ type: 'barrier', pct: 0, turns: 2, appliedTurn: 0 })
  check('ศัตรูมีบาเรีย → ไม่เสียเทิร์นตีตัวนั้น', always(() => b3.autoTarget(b3.unit('0-front-0'), 'attack').uid), '1-front-1')

  // ธาตุ: ตัวที่ได้เปรียบธาตุ (ดาเมจ ×2) คุ้มกว่า
  const b4 = battle([unit('front', 0, {}, { element: 'water' })], [unit('front', 0, {}, { element: 'water' }), unit('front', 1, {}, { element: 'fire' })])
  check('เลือดเท่ากัน → ตีตัวที่ธาตุแพ้ทางเรา', always(() => b4.autoTarget(b4.unit('0-front-0'), 'attack').uid), '1-front-1')

  // ตีทั้งแถวแบบเลือกแถวอิสระ: เลือกแถวที่โดนได้หลายตัว/คุ้มกว่า (แบบ 'row' ต้องเก็บแถวหน้าให้หมดก่อน)
  const rowSkill = { skill1: sk('attack', 'row_any', [fx('damage', { pct: 200 })]), skill2: plainSkills.skill2 }
  const b5 = battle([unit('front', 0, {}, { skills: rowSkill })], [unit('front', 0), unit('back', 0), unit('back', 1), unit('back', 2)])
  check('ตีทั้งแถว (เลือกแถวอิสระ) → เลือกแถวหลัง 3 ตัว', always(() => b5.autoTarget(b5.unit('0-front-0'), 'skill1').row), 'back')
}

// ── ใช้สกิลให้คุ้ม ──
{
  const heal = { skill1: sk('buff', 'ally_all', [fx('heal', { pct: 30 })]), skill2: plainSkills.skill2 }
  // ทีมเลือดเต็ม → ไม่ฮีล
  const full = battle([unit('front', 0, {}, { skills: heal }), unit('front', 1)], [unit('front', 0), unit('front', 1)])
  full.energy[0] = 6
  check('ทีมเลือดเต็ม → ไม่กดฮีล', always(() => full.planAuto(full.unit('0-front-0')).action !== 'skill1'), true)
  // เพื่อนเลือดเหลือน้อย → ฮีล
  const hurt = battle([unit('front', 0, {}, { skills: heal }), unit('front', 1)], [unit('front', 0, { atk: 150 }), unit('front', 1, { atk: 150 })])
  hurt.energy[0] = 6
  hurt.unit('0-front-0').hp = 1500; hurt.unit('0-front-1').hp = 1200
  check('เพื่อนเลือดน้อย → กดฮีล', always(() => hurt.planAuto(hurt.unit('0-front-0')).action), 'skill1')

  // ชะงักใส่ตัวที่ติดชะงักอยู่แล้ว → ไม่คุ้ม
  const stunSkill = { skill1: sk('attack', 'single_front', [fx('stun', { turns: 1 })]), skill2: plainSkills.skill2 }
  const st = battle([unit('front', 0, {}, { skills: stunSkill })], [unit('front', 0, { atk: 1600, crit: 30, critDmg: 200 })])
  st.energy[0] = 6
  const foe = st.unit('1-front-0')
  const before = st.planAuto(st.unit('0-front-0')).action
  foe.statuses.push({ type: 'stun', pct: 0, turns: 1, appliedTurn: 0 })
  check('ชะงักตัวอันตราย → ใช้ · ติดชะงักอยู่แล้ว → ไม่ใช้ซ้ำ', [before, always(() => st.planAuto(st.unit('0-front-0')).action)], ['skill1', 'attack'])

  // ยกเลิกอมตะ: ศัตรูทุกตัวมีบาเรีย → ใช้สกิลที่ทะลุได้
  const breakSkill = { skill1: sk('attack', 'single_front', [fx('damage', { pct: 120 }), fx('breakInvincible')]), skill2: plainSkills.skill2 }
  const br = battle([unit('front', 0, {}, { skills: breakSkill })], [unit('front', 0)])
  br.unit('1-front-0').statuses.push({ type: 'barrier', pct: 0, turns: 2, appliedTurn: 0 })
  check('ศัตรูมีบาเรีย → ใช้สกิลยกเลิกอมตะ', always(() => br.planAuto(br.unit('0-front-0')).action), 'skill1')
}

// ── ดอง Cost ──
{
  // สกิลแย่ (ดาเมจน้อยกว่าตีปกติแถมเสีย Cost) ของตัวนี้ ขณะที่เพื่อนมีสกิลคุ้ม → เก็บพลังงานไว้
  const weak = { skill1: sk('attack', 'single_front', [fx('damage', { pct: 105 })]), skill2: sk('attack', 'single_front', [fx('damage', { pct: 105 })]) }
  const strong = { skill1: sk('attack', 'row', [fx('damage', { pct: 400 })]), skill2: sk('attack', 'row', [fx('damage', { pct: 400 })]) }
  const b = battle([unit('front', 0, {}, { skills: weak }), unit('back', 0, {}, { skills: strong })], [unit('front', 0), unit('front', 1)])
  b.energy[0] = 3
  check('สกิลไม่คุ้ม + เพื่อนมีสกิลคุ้ม → ตีปกติดอง Cost', always(() => b.planAuto(b.unit('0-front-0')).action), 'attack')
  check('ตัวที่สกิลคุ้ม → ใช้สกิล', always(() => b.planAuto(b.unit('0-back-0')).action), 'skill1|skill2')

  // พลังงานเต็ม → ตีปกติได้พลังงานเพิ่มไม่ได้แล้ว รีบใช้สกิลที่พอคุ้ม
  const mid = { skill1: sk('attack', 'single_front', [fx('damage', { pct: 150 })]), skill2: sk('attack', 'single_front', [fx('damage', { pct: 150 })]) }
  const fullE = battle([unit('front', 0, {}, { skills: mid }), unit('back', 0, {}, { skills: strong })], [unit('front', 0), unit('front', 1)])
  fullE.energy[0] = 3
  const low = always(() => fullE.planAuto(fullE.unit('0-front-0')).action)
  fullE.energy[0] = 10
  const high = always(() => fullE.planAuto(fullE.unit('0-front-0')).action)
  check('สกิลกลางๆ: พลังงานน้อย → ดอง · พลังงานเต็ม → ใช้', [low, high], ['attack', 'skill1|skill2'])
}

// ── โหมด ──
{
  const b = battle([unit('front', 0)], [unit('front', 0)])
  b.aiLevel = ['random', 'random']
  check('โหมดสุ่มยังเลือกท่า/เป้าที่ใช้ได้', !!b.planAuto(b.unit('0-front-0')), true)
}

for (const n of ['ai-test-battle', 'ai-test-skills']) await rm(out(n), { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
