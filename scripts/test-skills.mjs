// ====================================================
// test-skills.mjs — กติกาสกิล: ความกว้าง หลบ/ต้าน บาเรีย โล่ ชะงัก ห้ามสกิล บัฟ และการนับเทิร์น
//   node scripts/test-skills.mjs
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
const B = await bundle('src/play/battle.ts', 'battle-skills')
const K = await bundle('src/lib/skills.ts', 'skills')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(58)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

// ค่าพลังกลาง: ไม่คริ ไม่หลบ ไม่ต้าน — ผลแน่นอน
const STATS = { hp: 10000, atk: 500, def: 200, spd: 100, crit: 0, critDmg: 150, evade: 0, hit: 0, skillEvade: 0, skillHit: 0, skillRes: 0 }
const fx = (type, over = {}) => ({ ...K.newEffect(type), ...over })
const skill = (kind, area, effects, cost = 2) => ({ kind, cost, area, effects })
const unit = (row, lane, over = {}, extra = {}) => ({ rangerId: 'x', row, lane, stats: { ...STATS, ...over }, ...extra })
const team = (extra = {}, over = {}) => [unit('front', 0, over, extra), unit('front', 1, over, extra), unit('back', 0, over, extra), unit('back', 1, over, extra), unit('back', 2, over, extra)]
const withSkill1 = s => ({ skills: { skill1: s, skill2: s } })
const uids = list => list.map(u => u.uid).sort()

// ── ความกว้างสกิลโจมตี ──
{
  const b = new B.Battle([team(withSkill1(skill('attack', 'row', [fx('damage')]))), team()], 1)
  const a = b.unit('0-front-0')
  check('แถว: แถวหน้าศัตรูมี 2 ตัว → เลือกได้แค่แถวหน้า', uids(b.selectableTargets(a, 'skill1')), ['1-front-0', '1-front-1'])
  check('แถว: โดนทั้งแถวหน้า', uids(b.affectedUnits(a, 'skill1', b.unit('1-front-0'))), ['1-front-0', '1-front-1'])
  b.unit('1-front-1').alive = false
  check('แถว: แถวหน้าเหลือ 1 → ยังตีแถวหลังไม่ได้ (ต้องเก็บแถวหน้าให้หมด)', uids(b.selectableTargets(a, 'skill1')), ['1-front-0'])
  b.unit('1-front-0').alive = false
  check('แถว: แถวหน้าตายหมด → เลือกแถวหลังได้', b.selectableTargets(a, 'skill1').length, 3)
  check('แถว: เลือกแถวหลัง → โดนแค่แถวหลัง', uids(b.affectedUnits(a, 'skill1', b.unit('1-back-2'))), ['1-back-0', '1-back-1', '1-back-2'])

  const all = new B.Battle([team(withSkill1(skill('attack', 'all', [fx('damage')]))), team()], 1)
  const r = all.resolveAction(all.unit('0-front-0'), 'skill1', all.unit('1-front-0'))
  check('ทั้งหมด: ศัตรูโดนครบ 5 ตัว', r.outcomes.filter(o => o.damage > 0).length, 5)

  const any = new B.Battle([team(withSkill1(skill('attack', 'single_any', [fx('damage')]))), team()], 1)
  check('เดี่ยวตัวไหนก็ได้ → เลือกแถวหลังได้แม้แถวหน้าอยู่', any.selectableTargets(any.unit('0-front-0'), 'skill1').length, 5)
  const front = new B.Battle([team(withSkill1(skill('attack', 'single_front', [fx('damage')]))), team()], 1)
  check('เดี่ยวแถวหน้าก่อน → เลือกได้แค่แถวหน้า', front.selectableTargets(front.unit('0-front-0'), 'skill1').length, 2)
}

// ── หลบ ──
{
  // หลบตีปกติสูงมาก แต่ติดเพดาน 60% · ผู้ตี Hit 100 หักจนหลบไม่ได้
  const b = new B.Battle([[unit('front', 0)], [unit('front', 0, { evade: 500 })]], 3)
  check('หลบตีปกติติดเพดาน 60%', b.evadeChance(b.units[0], b.units[1], true), 60)
  const sure = new B.Battle([[unit('front', 0, { hit: 500 })], [unit('front', 0, { evade: 500 })]], 3)
  check('Hit สูงหักล้าง Evade จนหลบไม่ได้', sure.evadeChance(sure.units[0], sure.units[1], true), 0)
  const sk = new B.Battle([[unit('front', 0, { skillHit: 10 })], [unit('front', 0, { skillEvade: 40 })]], 3)
  check('หลบสกิล = Skill Evade − Skill Hit', sk.evadeChance(sk.units[0], sk.units[1], false), 30)
  const res = new B.Battle([[unit('front', 0)], [unit('front', 0, { skillRes: 999 })]], 3)
  check('ต้านสถานะติดเพดาน 70%', res.resistChance(res.units[1]), 70)
  // หลบได้ 60% → 300 ครั้งต้องมีทั้งหลบและโดน
  let evaded = 0
  for (let i = 0; i < 300; i++) {
    const t = new B.Battle([[unit('front', 0)], [unit('front', 0, { evade: 500 })]], 100 + i)
    if (t.resolveAction(t.units[0], 'attack', t.units[1]).outcomes[0].evaded) evaded++
  }
  check('หลบจริงราว 60% (เพดาน)', evaded > 150 && evaded < 210, true)
}

// ── บาเรีย / ยกเลิกอมตะ / โล่ ──
{
  const b = new B.Battle([[unit('front', 0, {}, withSkill1(skill('attack', 'single_front', [fx('damage'), fx('breakInvincible')])))], [unit('front', 0)]], 5)
  const [a, t] = b.units
  t.statuses.push({ type: 'barrier', pct: 0, turns: 1, appliedTurn: 0 })
  const normal = b.resolveAction(a, 'attack', t).outcomes[0]
  check('บาเรีย: ตีปกติไม่เข้า', [normal.immune, normal.damage, t.hp], [true, 0, t.maxHp])
  const br = b.resolveAction(a, 'skill1', t).outcomes[0]
  check('ยกเลิกอมตะ: บาเรียแตก + ดาเมจเข้า', [br.barrierBroken, br.damage > 0, b.has(t, 'barrier')], [true, true, false])

  const s = new B.Battle([[unit('front', 0, {}, withSkill1(skill('buff', 'self', [fx('shield', { pct: 50 })])))], [unit('front', 0, { atk: 400 })]], 5)
  const [me, foe] = s.units
  s.resolveAction(me, 'skill1', me)
  const shieldHp = me.statuses.find(x => x.type === 'shield').shieldHp
  check('โล่ = % ของ HP สูงสุด', shieldHp, Math.round(me.maxHp * 0.5))
  const hit = s.resolveAction(foe, 'attack', me).outcomes[0]
  check('โล่รับดาเมจก่อน HP', [hit.shieldAbsorbed === hit.damage, me.hp], [true, me.maxHp])
}

// ── ชะงัก / ห้ามสกิล / ต้านทาน / การนับเทิร์น ──
{
  const b = new B.Battle([[unit('front', 0, {}, withSkill1(skill('attack', 'single_front', [fx('stun', { turns: 1 }), fx('silence', { turns: 1 })])))], [unit('front', 0)]], 9)
  const [a, t] = b.units
  b.turn = 1
  const o = b.resolveAction(a, 'skill1', t).outcomes[0]
  check('ติดชะงัก + ห้ามสกิล', o.applied.sort(), ['silence', 'stun'])
  check('ห้ามสกิล → ใช้ได้แค่ตีปกติ', [b.canUse(t, 'attack'), b.canUse(t, 'skill1')], [true, false])
  b.turn = 2
  check('ถึงเทิร์นของตัวที่ชะงัก → ข้าม', b.beginTurn(t).stunned, true)
  b.endTurn(t)
  check('จบเทิร์นนั้น → หมดสถานะ (1 เทิร์น)', t.statuses.length, 0)
  b.turn = 3
  const again = b.resolveAction(a, 'skill1', t).outcomes[0]
  check('กันชะงักรัว: เพิ่งหายชะงัก → ชะงักซ้ำไม่ติด (ต้าน)', [again.applied.includes('stun'), again.resisted.includes('stun')], [false, true])
  b.turn = 4; b.endTurn(t)                           // จบเทิร์นถัดไปของตัวเอง (ไม่ได้ชะงัก)
  t.statuses = []
  b.turn = 5; b.endTurn(t)
  const later = b.resolveAction(a, 'skill1', t).outcomes[0]
  check('ผ่านไปแล้ว → ติดชะงักได้อีก', later.applied.includes('stun'), true)

  const self = new B.Battle([[unit('front', 0, {}, withSkill1(skill('buff', 'self', [fx('atkUp', { pct: 50, turns: 1 })])))], [unit('front', 0)]], 9)
  const me = self.units[0]
  self.turn = 5
  self.resolveAction(me, 'skill1', me)
  self.endTurn(me)
  check('บัฟที่ได้ในเทิร์นตัวเอง → จบเทิร์นนั้นยังไม่นับ', self.has(me, 'atkUp'), true)
  check('ATK +50%', self.effAtk(me), 750)
  self.turn = 7
  self.endTurn(me)
  check('จบเทิร์นถัดไปของตัวเอง → หมด', self.has(me, 'atkUp'), false)

  const r = new B.Battle([[unit('front', 0, {}, withSkill1(skill('attack', 'single_front', [fx('stun')])))], [unit('front', 0, { skillRes: 999 })]], 11)
  let resisted = 0
  for (let i = 0; i < 200; i++) {
    r.units[1].statuses = []
    if (r.resolveAction(r.units[0], 'skill1', r.units[1]).outcomes[0].resisted.length) resisted++
  }
  check('ต้านได้ราว 70% (เพดาน) ไม่ใช่ 100%', resisted > 115 && resisted < 165, true)
}

// ── บัฟ ──
{
  const sup = skill('buff', 'ally_all', [fx('heal', { pct: 20 }), fx('cleanse'), fx('energyGain', { amount: 2 })])
  const b = new B.Battle([team(withSkill1(sup)), team()], 13)
  const allies = b.units.filter(u => u.team === 0)
  allies.forEach(u => { u.hp = 5000; u.statuses.push({ type: 'atkDown', pct: 20, turns: 2, appliedTurn: 0 }) })
  const e0 = b.energy[0]
  const r = b.resolveAction(allies[0], 'skill1', allies[0])
  check('ฟื้นฟูทั้งทีม 20% ของ HP สูงสุด', allies.map(u => u.hp), allies.map(u => 5000 + Math.round(u.maxHp * 0.2)))
  check('ล้างผลด้านลบ', allies.every(u => u.statuses.length === 0), true)
  check('เพิ่ม Cost ให้ทีม (ครั้งเดียวต่อการใช้)', [r.energyGained, b.energy[0] - e0], [2, 2])

  const regen = new B.Battle([[unit('front', 0)], [unit('front', 0)]], 13)
  const u = regen.units[0]
  u.hp = 5000
  u.statuses.push({ type: 'regen', pct: 10, turns: 2, appliedTurn: 0 })
  check('ฟื้นฟูต่อเนื่องตอนต้นเทิร์น', regen.beginTurn(u).regen, Math.round(u.maxHp * 0.1))
  u.statuses.push({ type: 'healBlock', pct: 0, turns: 2, appliedTurn: 0 })
  check('ขัดขวางฟื้นฟูต่อเนื่อง → ไม่ฟื้น', regen.beginTurn(u).regen, 0)

  const disp = new B.Battle([[unit('front', 0, {}, withSkill1(skill('attack', 'single_front', [fx('dispelBuffs')])))], [unit('front', 0)]], 13)
  const foe = disp.units[1]
  foe.statuses.push({ type: 'atkUp', pct: 30, turns: 2, appliedTurn: 0 }, { type: 'stun', pct: 0, turns: 1, appliedTurn: 0 })
  disp.resolveAction(disp.units[0], 'skill1', foe)
  check('ยกเลิกบัฟศัตรู (ดีบัฟคงอยู่)', foe.statuses.map(x => x.type), ['stun'])

  const one = new B.Battle([team(withSkill1(skill('buff', 'ally_single', [fx('heal')]))), team()], 13)
  const hurt = one.unit('0-back-2'); hurt.hp = 1000
  check('บัฟเพื่อนตัวเดียว (ออโต้) → เลือกตัวที่เลือดน้อยสุด', one.autoTarget(one.unit('0-front-0'), 'skill1').uid, '0-back-2')
  const row = new B.Battle([team(withSkill1(skill('buff', 'own_row', [fx('atkUp')]))), team()], 13)
  check('บัฟแถวตัวเอง → เฉพาะแถวเดียวกัน', uids(row.affectedUnits(row.unit('0-back-1'), 'skill1', row.unit('0-back-1'))), ['0-back-0', '0-back-1', '0-back-2'])

  const spd = new B.Battle([[unit('front', 0)], [unit('front', 0)]], 13)
  spd.units[0].statuses.push({ type: 'speedUp', pct: 50, turns: 2, appliedTurn: 0 })
  check('เร่งความเร็ว +50% → Speed ×1.5', Math.round(spd.effSpd(spd.units[0])), 150)
}

// ── สกิลเริ่มต้นตามตำแหน่ง ──
{
  const roles = ['tank', 'fighter', 'shooter', 'assassin', 'mage', 'support']
  const bad = []
  for (const r of roles) {
    for (const slot of ['skill1', 'skill2']) {
      const s = K.defaultSkills(r)[slot]
      if (!K.AREAS_OF[s.kind].includes(s.area)) bad.push(`${r}.${slot} area`)
      for (const e of s.effects) { const k = K.EFFECTS[e.type].kind; if (k !== s.kind && k !== 'both') bad.push(`${r}.${slot} ${e.type}`) }
    }
  }
  check('สกิลเริ่มต้นทุกตำแหน่ง: ความกว้าง/ความสามารถตรงประเภท', bad, [])
  check('ค่าเริ่มต้นตอนเพิ่มความสามารถ', [K.newEffect('damage'), K.newEffect('stun'), K.newEffect('breakInvincible')], [{ type: 'damage', pct: 250, pierce: 0 }, { type: 'stun', turns: 1 }, { type: 'breakInvincible' }])
}

for (const n of ['battle-skills', 'skills']) await rm(out(n), { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
