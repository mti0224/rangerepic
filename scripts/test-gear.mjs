// ====================================================
// test-gear.mjs — อุปกรณ์ · เซ็ต · ตีบวก · เลเวลฮีโร่ · การใส่/ถอด (lib/gear.ts + play/collection.ts)
//   node scripts/test-gear.mjs
// ====================================================

import { build } from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const out = n => path.join(ROOT, 'node_modules', `.tmp-${n}.mjs`)
const bundle = async (entry, n) => {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out(n), logLevel: 'silent', alias: { '@': path.join(ROOT, 'src') } })
  return import(pathToFileURL(out(n)).href)
}
const G = await bundle('src/lib/gear.ts', 'gear-lib')
const C = await bundle('src/play/collection.ts', 'gear-col')
const B = await bundle('src/play/battle.ts', 'gear-battle')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(62)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}
const base = { hp: 5000, atk: 400, def: 250, spd: 100, crit: 10, critDmg: 150, evade: 5, hit: 5, skillEvade: 5, skillHit: 5, skillRes: 10 }

// ── ข้อมูลอุปกรณ์ ──
check('อุปกรณ์ 15 แบบ', G.GEAR.length, 15)
check('อาวุธ/เกราะ/เครื่องประดับ อย่างละ 5', G.GEAR_SLOTS.map(s => G.GEAR.filter(g => g.slot === s).length), [5, 5, 5])
check('มีครบ 5 ระดับ', G.RARITIES.every(r => G.GEAR.some(g => g.rarity === r)), true)
check('ทุกชิ้นมีชื่อครบ 4 ภาษา', G.GEAR.every(g => ['en', 'th', 'zh', 'jp'].every(l => g.name[l])), true)
check('เซ็ตละ 3 ชิ้น ครบทุกช่อง', G.SET_IDS.every(id => {
  const p = G.GEAR.filter(g => g.set === id)
  return p.length === 3 && new Set(p.map(g => g.slot)).size === 3
}), true)
check('ทุกชิ้นธาตุตรงกับเซ็ตของตัวเอง', G.GEAR.every(g => G.SETS[g.set].element === g.element), true)
check('โบนัสเซ็ตไม่ซ้ำกันเลยสักชุด', new Set(G.SET_IDS.map(id => JSON.stringify([G.SETS[id].two, G.SETS[id].three]))).size, 5)

// ── ค่าสุ่ม ──
const tpl = G.GEAR_BY_ID.katana_blaze
const r1 = G.rollLines(tpl, 42), r2 = G.rollLines(tpl, 42), r3 = G.rollLines(tpl, 43)
check('สุ่มเมล็ดเดิม → ได้ผลเดิม', JSON.stringify(r1) === JSON.stringify(r2), true)
check('เมล็ดต่าง → ค่าต่าง', JSON.stringify(r1) !== JSON.stringify(r3), true)
check('ค่าสุ่ม 3 บรรทัด', r1.subs.length, 3)
check('ค่าสุ่ม + ค่าธาตุ ไม่ซ้ำกันและไม่ซ้ำค่าหลัก', (() => {
  const ks = [...r1.subs.map(l => l.stat), r1.elem.stat]
  return new Set(ks).size === 4 && !ks.includes(tpl.main.stat)
})(), true)
check('ของ common ค่าสุ่มต่ำกว่า mythic (เฉลี่ย 100 ครั้ง)', (() => {
  const avg = t => { let n = 0; for (let i = 0; i < 100; i++) n += G.rollLines(G.GEAR_BY_ID[t], i).subs.reduce((a, l) => a + l.value, 0); return n }
  return avg('bouquet_spring') < avg('blade_frost')
})(), true)

// ── ตีบวก ──
check('ค่าหลัก +0 = ค่าตั้งต้น', G.mainAt({ stat: 'atk', value: 24 }, 0).value, 24)
check('ค่าหลัก +20 = ×2', G.mainAt({ stat: 'atk', value: 24 }, 20).value, 48)
check('ค่าสุ่ม +20 = ×1.5', G.subAt({ stat: 'crit', value: 6 }, 20).value, 9)
check('ตีบวกเกิน +20 / ต่ำกว่า 0 ถูกตัด', [G.clampGearLevel(99), G.clampGearLevel(-3)], [20, 0])

// ── เลเวลฮีโร่ ──
check('Lv.1 = ×1', G.heroLevelMul(1), 1)
check('Lv.60 = ×3', +G.heroLevelMul(60).toFixed(6), 3)
check('Lv.30 อยู่กลางทาง (≈ ×1.98)', +G.heroLevelMul(30).toFixed(2), 1.98)
check('เลเวลเกิน 60 / ต่ำกว่า 1 ถูกตัด', [G.clampHeroLevel(500), G.clampHeroLevel(0)], [60, 1])
check('Lv.1 ไม่มีอุปกรณ์ = ค่าตั้งต้น', G.effectiveStats(base, 1, []), { ...base, skillDmgRes: 0 })
check('Lv.60 เพิ่มแค่ HP/ATK/DEF (×3)', (() => {
  const s = G.effectiveStats(base, 60, [])
  return [s.hp, s.atk, s.def, s.spd, s.crit, s.evade]
})(), [15000, 1200, 750, 100, 10, 5])

// ── ค่าพลังจากอุปกรณ์ ──
const item = (tplId, level = 0, subs = [], elem = { stat: 'hit', value: 10 }) => ({ uid: tplId + '#t', tpl: tplId, level, subs, elem })
check('อาวุธ ATK 24% → ATK ×1.24', G.effectiveStats(base, 1, [item('katana_blaze')]).atk, 496)
check('ATK% คิดจากค่าหลังเลเวล (Lv.60 + 24%)', G.effectiveStats(base, 60, [item('katana_blaze')]).atk, Math.round(1200 * 1.24))
check('ค่าอัตรา (คริ) บวกตรงเป็นแต้ม', G.effectiveStats(base, 1, [item('brush_flame')]).crit, 18)
check('ค่าสุ่มนับรวม', G.effectiveStats(base, 1, [item('katana_blaze', 0, [{ stat: 'spd', value: 5 }])]).spd, 105)
check('ค่าธาตุ: ธาตุตรง → นับ', G.effectiveStats(base, 1, [item('katana_blaze')], 'fire').hit, 15)
check('ค่าธาตุ: ธาตุไม่ตรง → ไม่นับ', G.effectiveStats(base, 1, [item('katana_blaze')], 'water').hit, 5)
check('ตีบวก +20 ค่าหลักคูณ 2 (ATK 48%)', G.effectiveStats(base, 1, [item('katana_blaze', 20)]).atk, 592)

// ── เซ็ต ──
const blaze2 = [item('katana_blaze'), item('coat_crimson')]
const blaze3 = [...blaze2, item('brush_flame')]
check('ใส่เซ็ตเดียว 1 ชิ้น → ไม่มีโบนัส', G.activeSetBonuses([item('katana_blaze')]).length, 0)
check('ครบ 2 ชิ้น → ATK +10% (รวมกับ 24% = 34%)', G.effectiveStats(base, 1, blaze2).atk, 536)
check('ครบ 2 ชิ้นยังไม่มีพาสซีฟ', G.gearPassives(blaze2), [])
check('ครบ 3 ชิ้น → พาสซีฟลอบสังหาร 25%', G.gearPassives(blaze3), [{ type: 'execute', pct: 25 }])
check('ต่างเซ็ตกัน → ไม่นับเป็นเซ็ต', G.setCounts([item('katana_blaze'), item('haori_tide')]), { blaze: 1, tide: 1 })
check('เซ็ตหน้ากาก 3 ชิ้น → คริ +8 · คริดาเมจ +30 · แม่นสกิล +10', (() => {
  const s = G.effectiveStats(base, 1, [item('katana_shade'), item('tux_masque'), item('bandana_star')])
  return [s.crit, s.critDmg - 15, s.skillHit]  // −15 = ค่าหลักของผ้าโพกหัว (คริดาเมจ)
})(), [18, 180, 15])

// ── กระเป๋าเริ่มต้น + ใส่/ถอด ──
const start = C.starterCollection()
check('กระเป๋าเริ่มต้น 75 ชิ้น (15 แบบ × 5)', start.gear.length, 75)
check('uid ไม่ซ้ำกัน', new Set(start.gear.map(g => g.uid)).size, 75)
check('แบบละ 5 ชิ้นพอดี', G.GEAR.every(t => start.gear.filter(g => g.tpl === t.id).length === 5), true)
check('ของแบบเดียวกัน 5 ชิ้นค่าสุ่มไม่เหมือนกันหมด', G.GEAR.every(t => new Set(start.gear.filter(g => g.tpl === t.id).map(g => JSON.stringify(g.subs))).size > 1), true)
check('เริ่มต้น +0 ทุกชิ้น · ยังไม่มีใครใส่', [start.gear.every(g => g.level === 0), Object.keys(start.equip).length], [true, 0])

C.resetCollection()
C.equipGear('heroA', 'katana_blaze#1')
check('ใส่อาวุธให้ A', C.getCollection().equip.heroA, { weapon: 'katana_blaze#1' })
C.equipGear('heroA', 'katana_shade#2')
check('ใส่อาวุธชิ้นใหม่ → แทนที่ชิ้นเดิมในช่อง', C.getCollection().equip.heroA, { weapon: 'katana_shade#2' })
C.equipGear('heroB', 'katana_shade#2')
check('ชิ้นเดียวกันใส่ให้ B → ย้ายออกจาก A', [C.getCollection().equip.heroA, C.ownerOf(C.getCollection(), 'katana_shade#2')], [undefined, 'heroB'])
C.equipGear('heroB', 'haori_tide#1')
check('คนละช่องใส่พร้อมกันได้', C.getCollection().equip.heroB, { weapon: 'katana_shade#2', armor: 'haori_tide#1' })
C.unequipGear('heroB', 'weapon')
check('ถอดอาวุธ เหลือเกราะ', C.getCollection().equip.heroB, { armor: 'haori_tide#1' })
C.setGearLevel('haori_tide#1', 99)
check('ตีบวกเกินเพดาน → +20', C.itemByUid(C.getCollection(), 'haori_tide#1').level, 20)
C.setHeroLevel('heroB', 60)
check('เลเวลฮีโร่ 60', C.heroLevel(C.getCollection(), 'heroB'), 60)
check('ฮีโร่ที่ไม่เคยตั้ง = Lv.1', C.heroLevel(C.getCollection(), 'nobody'), 1)
check('ค่าพลังจริง: Lv.60 + เกราะ HP 24% +20 (48%)', C.heroStats(C.getCollection(), 'heroB', { stats: base, element: 'fire' }).hp,
  Math.round(5000 * 3 * (1 + 48 / 100 + C.itemByUid(C.getCollection(), 'haori_tide#1').subs.filter(l => l.stat === 'hp').reduce((n, l) => n + G.subAt(l, 20).value, 0) / 100)))
C.toggleFavorite('heroB'); C.toggleFavorite('heroA')
check('กดดาว 2 ตัว → เป็นที่ชอบทั้งคู่', [C.isFavorite(C.getCollection(), 'heroA'), C.isFavorite(C.getCollection(), 'heroB')], [true, true])
C.toggleFavorite('heroB')
check('กดดาวซ้ำ → เอาออก', C.getCollection().favorites, ['heroA'])
C.resetCollection()
check('รีเซ็ต → ของกลับเป็นค่าเริ่มต้น', [Object.keys(C.getCollection().equip).length, Object.keys(C.getCollection().levels).length, C.getCollection().favorites.length], [0, 0, 0])

// ── เซ็ตทีม ──
C.resetCollection()
const t1 = C.addTeam()
check('เพิ่มทีม → ทีมว่าง 7 ช่อง', [C.getCollection().teams.length, Object.values(C.getCollection().teams[0].slots).every(v => v === null), C.TEAM_KEYS.length], [1, true, 7])
C.setTeamSlot(t1, 'front-0', 'heroA'); C.setTeamSlot(t1, 'back-1', 'heroB')
check('ใส่ฮีโร่ลงช่อง', [C.getCollection().teams[0].slots['front-0'], C.getCollection().teams[0].slots['back-1']], ['heroA', 'heroB'])
C.setTeamSlot(t1, 'back-1', 'heroA')
check('ใส่ตัวที่อยู่ช่องอื่นแล้ว → สลับกัน (ไม่ซ้ำในทีม)', [C.getCollection().teams[0].slots['front-0'], C.getCollection().teams[0].slots['back-1']], ['heroB', 'heroA'])
C.setTeamSlot(t1, 'back-1', null)
check('ถอดออกจากช่อง', C.getCollection().teams[0].slots['back-1'], null)
C.renameTeam(t1, 'x'.repeat(40))
check('ชื่อทีมยาวเกิน → ตัดที่ 20 ตัว', C.getCollection().teams[0].name.length, 20)
C.renameTeam(t1, '')
check('ไม่ตั้งชื่อ → ใช้ชื่ออัตโนมัติ', C.teamName(C.getCollection().teams[0], 0).includes('1'), true)
for (let i = 0; i < 20; i++) C.addTeam()
check('จัดได้สูงสุด 10 ทีม', [C.getCollection().teams.length, C.addTeam()], [10, null])
C.deleteTeam(t1)
check('ลบทีม', [C.getCollection().teams.length, C.getCollection().teams.some(t => t.id === t1)], [9, false])
C.resetCollection()
check('รีเซ็ต → ไม่มีเซ็ตทีม', C.getCollection().teams.length, 0)

// ── ใช้ได้จริงในจอดวล ──
const U = (id, stats, passives) => ({ rangerId: id, row: 'front', lane: 0, stats, role: 'fighter', passives })
const geared = G.effectiveStats(base, 11, blaze3, 'fire')
const b = new B.Battle([[U('a', geared, G.gearPassives(blaze3))], [U('b', base)]], 1)
const me = b.unit('0-front-0')
check('จอดวลรับค่าพลังจากเลเวล+อุปกรณ์ (ATK ไม่โดนโบนัสแถวหน้า)', me.atk, geared.atk)
check('จอดวลรับพาสซีฟจากเซ็ต 3 ชิ้น', b.passive(me, 'execute'), 25)

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
if (fail) process.exit(1)
