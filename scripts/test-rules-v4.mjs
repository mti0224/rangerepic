// ====================================================
// test-rules-v4.mjs — กฎชุดที่ 4 (ตามแผนเกม รอบ 2): ดาเมจอิงเลือดผู้ร่าย · เพิกเฉยโล่ขาว ·
//   เปลี่ยนธาตุ · แลกเลือด/เปราะบางของผู้ร่าย · สเกลฮีล/โล่/ฟื้นฟู · พาสซีฟพิเศษประจำตัว
//   node scripts/test-rules-v4.mjs
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
const B = await bundle('src/play/battle.ts', 'v4-battle')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(62)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}
/** ใกล้เคียงพอ (ดาเมจมีการปัดเศษ) */
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= Math.abs(b) * tol + 1

const stats = (o = {}) => ({ hp: 5000, atk: 400, def: 250, spd: 100, crit: 0, critDmg: 150, evade: 0, hit: 0, skillEvade: 0, skillHit: 0, skillRes: 0, skillDmgRes: 0, ...o })
const S = (kind, cost, area, effects) => ({ kind, cost, area, effects })
const U = (id, row, lane, skills, over, extra = {}) => ({ rangerId: id, row, lane, stats: stats(over), role: 'fighter', skills, ...extra })
const hit = { skill1: S('attack', 2, 'single_front', [{ type: 'damage', pct: 200 }]), skill2: S('attack', 2, 'row', [{ type: 'damage', pct: 150 }]) }

/** ศึกตัวต่อตัว: ฝั่งเราใช้สกิลที่ส่งมา · Cost เต็ม */
const arena = (skills, mine = {}, foe = {}, extra = {}, foeExtra = {}) => {
  const b = new B.Battle([[U('a', 'front', 0, skills, mine, extra)], [U('b', 'front', 0, hit, foe, foeExtra)]], 1)
  b.energy[0] = 10
  return { b, me: b.unit('0-front-0'), foe: b.unit('1-front-0') }
}

// ── 1. ดาเมจอิงเลือดสูงสุดของผู้ร่าย (damageHp) ──
{
  const sk = { skill1: S('attack', 2, 'single_front', [{ type: 'damageHp', pct: 20 }]), skill2: hit.skill2 }
  // เป้าเลือดหนามากเพื่อไม่ให้ชนเพดานดาเมจต่อครั้ง (50% ของเลือดเป้า)
  const a = arena(sk, { hp: 10000, atk: 1 }, { hp: 200000 })
  const c = arena(sk, { hp: 20000, atk: 1 }, { hp: 200000 })
  const d1 = a.b.expectedDamage(a.me, a.foe, 20, false, a.me.maxHp)
  const d2 = c.b.expectedDamage(c.me, c.foe, 20, false, c.me.maxHp)
  check('damageHp: เลือดผู้ร่ายมากขึ้น 2 เท่า → ดาเมจ 2 เท่า', near(d2, d1 * 2), true)
  const before = a.foe.hp
  a.b.perform(a.me, { action: 'skill1', target: a.foe })
  check('damageHp: ทำดาเมจได้ทั้งที่ ATK ต่ำมาก', a.foe.hp < before - 500, true)
}

// ── 2. เพิกเฉยโล่ขาว (pierce) ──
{
  const none = { skill1: S('attack', 2, 'single_front', [{ type: 'damage', pct: 100, pierce: 0 }]), skill2: hit.skill2 }
  const full = { skill1: S('attack', 2, 'single_front', [{ type: 'damage', pct: 100, pierce: 100 }]), skill2: hit.skill2 }
  const shieldUp = t => t.statuses.push({ type: 'shield', pct: 100, turns: 5, shieldHp: 99999, appliedTurn: 0 })
  const a = arena(none); shieldUp(a.foe)
  a.b.perform(a.me, { action: 'skill1', target: a.foe })
  check('โล่ขาว: ดาเมจปกติโดนโล่กินหมด (เลือดไม่ลด)', a.foe.hp, a.foe.maxHp)
  const c = arena(full); shieldUp(c.foe)
  c.b.perform(c.me, { action: 'skill1', target: c.foe })
  check('เพิกเฉยโล่ขาว 100%: ข้ามโล่ลงเลือดตรงๆ', c.foe.hp < c.foe.maxHp, true)
  check('เพิกเฉยโล่ขาว 100%: โล่ยังเต็มอยู่', c.foe.statuses.find(s => s.type === 'shield').shieldHp, 99999)
}

// ── 3. เปลี่ยนธาตุของเป้า ──
{
  const sk = { skill1: S('attack', 2, 'single_front', [{ type: 'elementShift', turns: 2, element: 'wood' }]), skill2: hit.skill2 }
  const { b, me, foe } = arena(sk, {}, {}, { element: 'fire' }, { element: 'water' })
  const before = b.expectedDamage(me, foe, 100, true)
  b.perform(me, { action: 'skill1', target: foe })
  check('เปลี่ยนธาตุ: เป้าใช้ธาตุใหม่ในการคิดตัวคูณ', b.effElement(foe), 'wood')
  const after = b.expectedDamage(me, foe, 100, true)
  check('เปลี่ยนธาตุ: ไฟ×น้ำ (0.5) → ไฟ×ไม้ (1.5) แรงขึ้น 3 เท่า', near(after, before * 3), true)
}

// ── 4. แลกเลือด / ทำตัวเองเปราะบาง ──
{
  const sk = {
    skill1: S('attack', 2, 'single_front', [{ type: 'damage', pct: 300 }, { type: 'selfHpCost', pct: 20 }, { type: 'selfVulnerable', pct: 30, turns: 2 }]),
    skill2: hit.skill2,
  }
  const { b, me, foe } = arena(sk)
  b.perform(me, { action: 'skill1', target: foe })
  check('แลกเลือด: ผู้ร่ายเสียเลือด 20% ของ HP สูงสุด', me.hp, me.maxHp - Math.round(me.maxHp * 0.2))
  check('แลกเลือด: ผู้ร่ายติดเปราะบางเอง', b.has(me, 'vulnerable'), true)
  const c = arena(sk)
  c.me.hp = 50
  c.b.perform(c.me, { action: 'skill1', target: c.foe })
  check('แลกเลือด: ไม่ทำให้ตัวเองตาย (เหลืออย่างน้อย 1)', c.me.hp >= 1 && c.me.alive, true)
}

// ── 5. สเกลของฮีล / โล่ / ฟื้นฟูต่อเนื่อง ──
{
  const big = { hp: 10000, atk: 1000 }
  const healSkill = scale => ({ skill1: S('buff', 2, 'self', [{ type: 'heal', pct: 50, scale }]), skill2: hit.skill2 })
  const t1 = arena(healSkill('targetHp'), big); t1.me.hp = 1
  t1.b.perform(t1.me, { action: 'skill1', target: t1.me })
  check('ฮีลสเกลเลือดเป้า: 50% ของ HP สูงสุด', near(t1.me.hp, 1 + t1.me.maxHp * 0.5), true)
  const t2 = arena(healSkill('casterAtk'), big); t2.me.hp = 1
  t2.b.perform(t2.me, { action: 'skill1', target: t2.me })
  check('ฮีลสเกล ATK ผู้ร่าย: 50% ของ ATK', near(t2.me.hp, 1 + t2.me.atk * 0.5), true)
  const sh = { skill1: S('buff', 2, 'self', [{ type: 'shield', pct: 50, turns: 3, scale: 'casterAtk' }]), skill2: hit.skill2 }
  const t3 = arena(sh, big)
  t3.b.perform(t3.me, { action: 'skill1', target: t3.me })
  check('โล่สเกล ATK ผู้ร่าย', near(t3.me.statuses.find(s => s.type === 'shield').shieldHp, t3.me.atk * 0.5), true)
  const rg = { skill1: S('buff', 2, 'self', [{ type: 'regen', pct: 50, turns: 3, scale: 'casterAtk' }]), skill2: hit.skill2 }
  const t4 = arena(rg, big)
  t4.b.perform(t4.me, { action: 'skill1', target: t4.me })
  check('ฟื้นฟูต่อเนื่อง: ล็อกจำนวนต่อเทิร์นตามสเกลตอนใส่', near(t4.me.statuses.find(s => s.type === 'regen').shieldHp, t4.me.atk * 0.5), true)
}

// ── 6. พาสซีฟพิเศษประจำตัว ──
{
  const exe = arena(hit, {}, {}, { passives: [{ type: 'execute', pct: 50 }] })
  const plain = arena(hit)
  exe.foe.hp = exe.foe.maxHp * 0.2
  plain.foe.hp = plain.foe.maxHp * 0.2
  check('พาสซีฟลอบสังหาร +50% กับเป้าเลือดต่ำ',
    near(exe.b.expectedDamage(exe.me, exe.foe, 100, true), plain.b.expectedDamage(plain.me, plain.foe, 100, true) * 1.5), true)
  exe.foe.hp = exe.foe.maxHp
  plain.foe.hp = plain.foe.maxHp
  check('พาสซีฟลอบสังหาร: เป้าเลือดเต็มไม่ได้โบนัส',
    near(exe.b.expectedDamage(exe.me, exe.foe, 100, true), plain.b.expectedDamage(plain.me, plain.foe, 100, true)), true)

  const atk = arena(hit, {}, {}, { passives: [{ type: 'atkUp', pct: 25 }] })
  check('พาสซีฟ ATK ติดตัว +25%', atk.b.effAtk(atk.me), atk.me.atk * 1.25)
  const spd = arena(hit, {}, {}, { passives: [{ type: 'speedUp', pct: 20 }] })
  check('พาสซีฟความเร็วติดตัว +20%', spd.b.effSpd(spd.me), spd.me.spd * 1.2)
  const cr = arena(hit, { crit: 10 }, {}, { passives: [{ type: 'critUp', pct: 15 }] })
  check('พาสซีฟคริติคอลติดตัว +15 จุด', cr.b.effCrit(cr.me), 25)

  const tough = arena(hit, {}, {}, {}, { passives: [{ type: 'tough', pct: 20 }] })
  const soft = arena(hit)
  check('พาสซีฟอึด −20% ดาเมจที่รับ',
    near(tough.b.expectedDamage(tough.me, tough.foe, 100, true), soft.b.expectedDamage(soft.me, soft.foe, 100, true) * 0.8), true)

  const healSkill = { skill1: S('buff', 2, 'self', [{ type: 'heal', pct: 20 }]), skill2: hit.skill2 }
  const h1 = arena(healSkill); h1.me.hp = 1
  h1.b.perform(h1.me, { action: 'skill1', target: h1.me })
  const h2 = arena(healSkill, {}, {}, { passives: [{ type: 'healUp', pct: 50 }] }); h2.me.hp = 1
  h2.b.perform(h2.me, { action: 'skill1', target: h2.me })
  check('พาสซีฟมือฟื้นฟู +50%', near(h2.me.hp - 1, (h1.me.hp - 1) * 1.5), true)

  const ls = arena(hit, {}, {}, { passives: [{ type: 'lifesteal', pct: 50 }] })
  ls.me.hp = ls.me.maxHp - 3000
  const hpBefore = ls.me.hp
  ls.b.perform(ls.me, { action: 'skill1', target: ls.foe })
  check('พาสซีฟดูดเลือด: ฟื้นเลือดจากดาเมจที่ทำได้', ls.me.hp > hpBefore, true)
}

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
await rm(out('v4-battle'), { force: true })
process.exit(fail ? 1 : 0)
