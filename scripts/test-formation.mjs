// ====================================================
// test-formation.mjs — โบนัสตามแถวที่วาง (lib/formation.ts) + ความสามารถพิเศษของตำแหน่ง (lib/roleTraits.ts)
//   node scripts/test-formation.mjs
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
const F = await bundle('src/lib/formation.ts', 'formation')
const T = await bundle('src/lib/roleTraits.ts', 'roletraits')
const B = await bundle('src/play/battle.ts', 'fbattle')
const G = await bundle('src/lib/rangerGrade.ts', 'grade')

let pass = 0, fail = 0
const check = (name, got, want, tol = 0) => {
  const ok = typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(56)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

const stats = (over = {}) => ({ hp: 4000, atk: 400, def: 250, spd: 100, crit: 5, critDmg: 150, evade: 0, hit: 0, skillEvade: 0, skillHit: 0, skillRes: 0, ...over })
const setup = (row, lane, role, over) => ({ rangerId: 'x', row, lane, role, stats: stats(over) })

// ── โบนัสตามแถว ──
{
  const front = F.statsWithPosition(stats(), 'front', 0)
  check('แถวหน้า: DEF +30% · HP +15% (ATK เท่าเดิม)', [front.def, front.hp, front.atk], [325, 4600, 400])
  const back = F.statsWithPosition(stats(), 'back', 0)
  check('แถวหลัง: ATK +15% · คริ +8 (DEF เท่าเดิม)', [back.atk, back.crit, back.def], [460, 13, 250])
  check('ทุกช่องในแถวหลังได้เท่ากัน (กลางไม่พิเศษ)', F.statsWithPosition(stats(), 'back', 1), back)
  check('ข้อความโบนัสแถวหน้า', F.bonusText(F.FRONT_BONUS), 'DEF +30% · HP +15%')
  check('ข้อความโบนัสแถวหลัง', F.bonusText(F.BACK_BONUS), 'ATK +15% · คริ +8')
  check('ตำแหน่งที่เข้ากับแถวหน้า', F.FRONT_BONUS.fits, ['tank', 'fighter'])
  check('นักยิงเข้ากับแถวหลัง ไม่เข้ากับแถวหน้า', [F.fitsSlot('shooter', 'back', 2), F.fitsSlot('shooter', 'front', 0)], [true, false])
  const b = new B.Battle([[setup('front', 0, 'tank'), setup('back', 0, 'shooter')], [setup('front', 0, 'tank')]])
  check('โบนัสมีผลจริงตอนเริ่มรบ', [b.units[0].def, b.units[1].atk], [325, 460])
}

// ── ความสามารถพิเศษของตำแหน่ง ──
{
  // นักฆ่าตีข้ามแถวได้ · ตำแหน่งอื่นไม่ได้ ไม่ว่าวางช่องไหน
  const b = new B.Battle([
    [setup('back', 1, 'shooter'), setup('back', 2, 'assassin')],
    [setup('front', 0, 'tank'), setup('back', 0, 'mage')],
  ])
  const [shooter, killer] = b.units
  check('นักฆ่า → เล็งได้ทุกตัว', b.validTargets(killer).length, 2)
  check('นักยิงช่องกลางแถวหลัง → เล็งได้แค่แถวหน้า', b.validTargets(shooter).map(u => u.row), ['front'])
  check('canStrikeAnyone ตามตำแหน่ง ไม่ใช่ตามช่อง', [b.canStrikeAnyone(killer), b.canStrikeAnyone(shooter)], [true, false])
}
{
  // แทงค์รับดาเมจลดลง 15% (เทียบกับตำแหน่งอื่นค่าพลังเท่ากัน)
  const same = { hp: 100000, def: 0 }
  const b = new B.Battle([[setup('front', 0, 'mage', { atk: 1000, crit: 0 })], [setup('back', 0, 'tank', same), setup('back', 1, 'fighter', same)]], 7)
  const [mage, tank, fighter] = b.units
  const avg = (t, n = 300) => { let s = 0; for (let i = 0; i < n; i++) { t.hp = t.maxHp; s += b.applyHit(mage, t, 'attack').damage } return s / n }
  check('แทงค์รับดาเมจ ≈ 85% ของตำแหน่งอื่น', Math.round(avg(tank) / avg(fighter) * 100) / 100, 0.85, 0.03)
  check('นักเวท: ดาเมจสกิลแรงขึ้น 20%', Math.round(b.roleDamageMult(mage, fighter, false) * 100) / 100, 1.2)
  check('นักเวทตีปกติไม่ได้โบนัส', b.roleDamageMult(mage, fighter, true), 1)
}
{
  // นักยิง "ล่าแทงค์" (เป้าเลือดเกินครึ่ง +35%) · นักฆ่าไม่มีโบนัสเป้าเลือดต่ำแล้ว
  const b = new B.Battle([[setup('back', 0, 'shooter'), setup('back', 1, 'assassin')], [setup('front', 0, 'fighter')]], 3)
  const [shooter, killer, foe] = b.units
  check('นักยิง: เป้าเลือดเกินครึ่ง ×1.35', b.roleDamageMult(shooter, foe, true), 1.35)
  check('นักฆ่า: เป้าเลือดเต็ม → ×1', b.roleDamageMult(killer, foe, true), 1)
  foe.hp = foe.maxHp * 0.4
  check('นักยิง: เป้าเลือดต่ำกว่าครึ่ง → ไม่ได้โบนัส', b.roleDamageMult(shooter, foe, true), 1)
  check('นักฆ่า: เป้าเลือดต่ำกว่าครึ่ง → ไม่ได้โบนัสแล้ว', b.roleDamageMult(killer, foe, true), 1)
}
{
  // ไฟเตอร์ "สู้ตาย": ยิ่งเลือดน้อยยิ่งตีแรง (สูงสุด +40% — ตัวเลขรวมแทงค์รับลด 15% ไว้แล้ว)
  const b = new B.Battle([[setup('front', 0, 'fighter', { atk: 1000 })], [setup('front', 0, 'tank', { hp: 100000 })]], 11)
  const [hero, foe] = b.units
  const base = b.roleDamageMult(hero, foe, true)
  hero.hp = Math.round(hero.maxHp / 2)
  check('ไฟเตอร์: เลือดครึ่งหลอด → ตีแรงขึ้น 20%', Math.round(b.roleDamageMult(hero, foe, true) / base * 100) / 100, 1.2)
  hero.hp = 1
  check('ไฟเตอร์: เลือดใกล้หมด → ตีแรงขึ้น 40%', Math.round(b.roleDamageMult(hero, foe, true) / base * 100) / 100, 1.4)
}
{
  // ซัพพอร์ต: ฮีล/โล่แรงขึ้น 25% · ทีมเริ่มเกมพลังงาน +1
  const heal = { kind: 'buff', cost: 2, area: 'ally_single', effects: [{ type: 'heal', pct: 20 }, { type: 'shield', pct: 20, turns: 2 }] }
  const withHeal = (row, lane, role) => ({ ...setup(row, lane, role), skills: { skill1: heal, skill2: heal } })
  const b = new B.Battle([[withHeal('back', 0, 'support'), withHeal('back', 1, 'mage'), setup('front', 0, 'tank')], [setup('front', 0, 'tank')]], 17)
  const [sup, mage, tank] = b.units
  check('ทีมที่มีซัพพอร์ต → พลังงานเริ่มเกม 4', [b.energy[0], b.energy[1]], [4, 3])
  const cast = caster => {
    tank.hp = 1000
    tank.statuses = []
    const o = b.resolveAction(caster, 'skill1', tank).outcomes[0]
    return { healed: o.healed, shield: tank.statuses.find(s => s.type === 'shield').shieldHp }
  }
  const bySup = cast(sup)
  const byMage = cast(mage)
  check('ซัพพอร์ตฮีลแรงกว่า 25%', Math.round(bySup.healed / byMage.healed * 100) / 100, 1.25, 0.01)
  check('ซัพพอร์ตให้โล่หนากว่า 25%', Math.round(bySup.shield / byMage.shield * 100) / 100, 1.25, 0.01)
}
{
  // แทงค์ดึงความสนใจ: บอทเลือกตีแทงค์แม้ค่าพลังเท่ากัน
  const both = { hp: 20000, def: 200 }
  const b = new B.Battle([[setup('front', 0, 'shooter', { atk: 600 })], [setup('front', 0, 'tank', both), setup('front', 1, 'mage', both)]], 5)
  const shooter = b.units[0]
  const picks = Array.from({ length: 40 }, () => b.autoTarget(shooter, 'attack').uid)
  check('บอทเล็งแทงค์บ่อยกว่า (ดึงความสนใจ)', picks.filter(u => u === '1-front-0').length > 20, true)
}
{
  // ข้อมูลความสามารถครบทุกตำแหน่ง (ใช้แสดงในหน้าจัดทีม)
  const roles = ['tank', 'fighter', 'shooter', 'assassin', 'mage', 'support']
  check('มีคำอธิบายความสามารถครบ 6 ตำแหน่ง', roles.every(r => T.ROLE_TRAITS[r]?.label && T.ROLE_TRAITS[r]?.text), true)
  check('ไม่ระบุตำแหน่ง → ใช้ของไฟเตอร์', T.traitOf(undefined).label, T.ROLE_TRAITS.fighter.label)
}

// ── ระดับดาว + Evolution (ดูจาก ID) ──
check('Evolution จาก ID: e = Normal · u = Ultra · h = Hyper',
  [G.evolutionOf('u1631e-sally'), G.evolutionOf('u1626u-cony'), G.evolutionOf('u1628h-boss')], ['normal', 'ultra', 'hyper'])
check('รูปดาว: Normal ทอง / Ultra ฟ้า / Hyper ชมพู',
  [G.starImageUrl(9, 'normal'), G.starImageUrl(8, 'ultra'), G.starImageUrl(8, 'hyper')],
  ['/ui/9star.png', '/ui/8star-ultra.png', '/ui/8star-hyper.png'])
check('ไม่มีรูปของ Evolution ในระดับนั้น (9 ดาว Hyper) → ใช้รูป Normal ระดับเดียวกัน', G.starImageUrl(9, 'hyper'), '/ui/9star.png')
check('ไม่รู้ระดับ → ไม่มีรูปดาว', G.starImageUrl(null, 'normal'), null)

for (const n of ['formation', 'roletraits', 'fbattle', 'grade']) await rm(out(n), { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
