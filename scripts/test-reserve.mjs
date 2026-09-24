// ====================================================
// test-reserve.mjs — แถวพิเศษ (อัญเชิญมาร่ายสกิล)
//   node scripts/test-reserve.mjs
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
const B = await bundle('src/play/battle.ts', 'reserve-battle')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(62)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

const stats = (over = {}) => ({ hp: 4000, atk: 400, def: 250, spd: 100, crit: 0, critDmg: 150, evade: 0, hit: 0, skillEvade: 0, skillHit: 0, skillRes: 0, ...over })
const S = (kind, cost, area, effects) => ({ kind, cost, area, effects })
const unit = (id, row, lane, skills, over) => ({ rangerId: id, row, lane, stats: stats(over), role: 'fighter', skills })
const plain = { skill1: S('attack', 2, 'single_front', [{ type: 'damage', pct: 200 }]), skill2: S('attack', 3, 'row', [{ type: 'damage', pct: 150 }]) }
const hitter = { skill1: S('attack', 2, 'single_any', [{ type: 'damage', pct: 300 }]), skill2: S('buff', 2, 'self', [{ type: 'atkUp', pct: 30, turns: 2 }]) }
const rowBuff = { skill1: S('buff', 2, 'own_row', [{ type: 'shield', pct: 20, turns: 2 }]), skill2: S('buff', 2, 'ally_all', [{ type: 'actionAdvance', pct: 100 }]) }

const make = () => new B.Battle(
  [[unit('a', 'front', 0, plain), unit('a2', 'back', 0, plain)], [unit('b', 'front', 0, plain), unit('b2', 'back', 0, plain)]],
  1,
  [[unit('r1', 'back', 0, hitter, { atk: 800 }), unit('r2', 'back', 1, rowBuff), unit('r3', 'back', 2, plain)], []],
)

{
  const b = make()
  check('แถวพิเศษไม่เกินทีมละ 2 ตัว · ไม่อยู่ในสนาม', [b.reserves[0].length, b.units.length], [2, 4])
  check('ตัวแถวพิเศษไม่อยู่ในลำดับเทิร์น', b.previewOrder(8).some(u => u.reserve), false)
  const [r1] = b.reserves[0]
  const front = b.unit('0-front-0'), back = b.unit('0-back-0')
  check('ค่าพลังดิบ (ไม่มีโบนัสแถว) · สนามได้โบนัส', [r1.atk, front.def > 250], [800, true])
  b.energy[0] = 5
  check('อัญเชิญได้เมื่อ Cost พอ + ไม่มีคูลดาวน์', b.canSummon(front, r1, 'skill1'), true)
  const target = b.unit('1-back-0')
  const hpBefore = target.hp
  b.perform(front, { action: 'skill1', target, caster: r1 })
  check('ใช้สกิลตัวอัญเชิญ: Cost ลดตามสกิล (5 − 2) ไม่ได้ +1', b.energy[0], 3)
  check('ดาเมจเข้าเป้า (ใช้ ATK ของตัวอัญเชิญ)', target.hp < hpBefore, true)
  check('ติดคูลดาวน์ → เรียกตัวเดิมไม่ได้', [b.reserveCooldown(r1), b.canSummon(front, r1, 'skill2')], [B.RESERVE_COOLDOWN, false])
  check('อีกตัวยังเรียกได้', b.canSummon(front, b.reserves[0][1], 'skill1'), true)
  for (let i = 0; i < B.RESERVE_COOLDOWN; i++) b.endTurn(i % 2 ? front : back)
  check(`ครบ ${B.RESERVE_COOLDOWN} เทิร์นของทีม → เรียกได้อีก`, b.reserveCooldown(r1), 0)
  b.endTurn(b.unit('1-front-0'))
  check('เทิร์นของทีมศัตรูไม่นับคูลดาวน์เรา', b.reserveCooldown(r1), 0)
}

{
  const b = make()
  const [r1, r2] = b.reserves[0]
  const back = b.unit('0-back-0'), front = b.unit('0-front-0')
  b.energy[0] = 10
  b.perform(back, { action: 'skill2', target: back, caster: r1 })
  check('บัฟตัวเอง → ไปที่ผู้อัญเชิญ', [back.statuses.map(s => s.type), r1.statuses.length], [['atkUp'], 0])
  b.perform(back, { action: 'skill1', target: back, caster: r2 })
  check('บัฟแถวตัวเอง → แถวของผู้อัญเชิญ (แถวหลัง)', [back.statuses.some(s => s.type === 'shield'), front.statuses.some(s => s.type === 'shield')], [true, false])
}

{
  const b = make()
  const [, r2] = b.reserves[0]
  const front = b.unit('0-front-0'), back = b.unit('0-back-0')
  b.energy[0] = 10
  b.reserveCd[r2.uid] = 0
  const avBack = back.av, avFront = front.av
  b.perform(front, { action: 'skill2', target: front, caster: r2 })
  check('ดึงเทิร์นทั้งทีม: ผู้อัญเชิญไม่โดน · เพื่อนโดน', [front.av === avFront, back.av < avBack], [true, true])
}

{
  const b = make()
  const [r1] = b.reserves[0]
  const front = b.unit('0-front-0')
  b.energy[0] = 10
  front.statuses.push({ type: 'silence', pct: 0, turns: 1, appliedTurn: 0 })
  check('ผู้อัญเชิญติดห้ามใช้ทักษะ → อัญเชิญไม่ได้', b.canSummon(front, r1, 'skill1'), false)
  b.energy[0] = 1
  front.statuses = []
  check('Cost ไม่พอ → อัญเชิญไม่ได้', b.canSummon(front, r1, 'skill1'), false)
}

{
  // ทีมที่ไม่มีดาเมจ (ตีไม่เข้า) + มีตัวอัญเชิญตีแรง → บอทเรียกใช้
  const weak = { skill1: S('buff', 2, 'self', [{ type: 'evadeUp', pct: 10, turns: 1 }]), skill2: S('buff', 3, 'self', [{ type: 'evadeUp', pct: 10, turns: 1 }]) }
  const b = new B.Battle(
    [[unit('a', 'front', 0, weak, { atk: 50 })], [unit('b', 'front', 0, plain)]],
    3,
    [[unit('r1', 'back', 0, hitter, { atk: 900 })], []],
  )
  b.aiSearch = false
  b.energy[0] = 6
  const p = b.planAuto(b.unit('0-front-0'))
  check('บอท: ดาเมจตัวเองน้อย → อัญเชิญตัวแถวพิเศษมาตี', [p.caster?.uid ?? null, p.action], ['0-sup-0', 'skill1'])
}

{
  // รบอัตโนมัติจนจบ (ทั้งสองทีมมีแถวพิเศษ) — ไม่ค้าง · คูลดาวน์ไม่ติดลบ
  const team = id => [unit(id, 'front', 0, plain), unit(id, 'front', 1, plain), unit(id, 'back', 0, hitter), unit(id, 'back', 1, rowBuff), unit(id, 'back', 2, plain)]
  let summons = 0, ok = true
  for (let g = 0; g < 20; g++) {
    const b = new B.Battle([team('x'), team('y')], 100 + g, [[unit('r', 'back', 0, hitter), unit('r', 'back', 1, rowBuff)], [unit('q', 'back', 0, hitter), unit('q', 'back', 1, rowBuff)]])
    b.aiSearch = g < 3
    let t = 0
    while (!b.over && t < 300) {
      const a = b.nextActor()
      if (!a) break
      t++
      const st = b.beginTurn(a)
      if (st.stunned || !a.alive) { b.endTurn(a); continue }
      const p = b.planAuto(a)
      if (!p) break
      if (p.caster) summons++
      b.perform(a, p)
      b.endTurn(a)
      if (Object.values(b.reserveCd).some(v => v < 0)) ok = false
    }
    if (!b.over) ok = false
  }
  check('รบอัตโนมัติ 20 เกม จบทุกเกม · คูลดาวน์ไม่ติดลบ', ok, true)
  check('บอทใช้แถวพิเศษจริง', summons > 0, true)
}

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
await rm(out('reserve-battle'), { force: true })
process.exit(fail ? 1 : 0)
