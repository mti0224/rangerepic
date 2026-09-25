// ====================================================
// test-stages.mjs — ด่านเนื้อเรื่อง: ข้อมูลด่าน · ดาว · รางวัล · ความคืบหน้า (lib/stages.ts + play/collection.ts)
//   node scripts/test-stages.mjs
// ====================================================

import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const out = n => path.join(ROOT, 'node_modules', `.tmp-${n}.mjs`)
const bundle = async (entry, n) => {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out(n), logLevel: 'silent', alias: { '@': path.join(ROOT, 'src') } })
  return import(pathToFileURL(out(n)).href)
}
const S = await bundle('src/lib/stages.ts', 'st-lib')
const G = await bundle('src/lib/gear.ts', 'st-gear')
const C = await bundle('src/play/collection.ts', 'st-col')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(62)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

// ── ข้อมูลด่าน ──
const st = S.STAGES
check('ทั้งหมด 30 ด่าน · 3 บท', [st.length, S.CHAPTERS.length], [30, 3])
check('ทุกบทมีด่าน 1–10 เรียงกัน', S.CHAPTERS.map(c => S.stagesOf(c.no).map(s => s.no).join(',')), Array(3).fill('1,2,3,4,5,6,7,8,9,10'))
check('รหัสด่านไม่ซ้ำ · ป้าย = บท-ด่าน', [new Set(st.map(s => s.id)).size, st[14].label, st[29].id], [30, '2-5', 'c3-10'])
check('ด่านบอส = ด่าน 5 และ 10 ของทุกบท', st.filter(s => s.boss).map(s => s.label), ['1-5', '1-10', '2-5', '2-10', '3-5', '3-10'])
check('ชื่อบทครบ 4 ภาษา', S.CHAPTERS.every(c => ['en', 'th', 'zh', 'jp'].every(l => c.name[l])), true)
check('ด่านบอสมีตัวบอสตัวเดียว · ด่านปกติไม่มี', st.every(s => s.enemies.filter(e => e.boss).length === (s.boss ? 1 : 0)), true)
check('ช่องศัตรูในด่านเดียวกันไม่ซ้ำ', st.every(s => new Set(s.enemies.map(e => e.slot)).size === s.enemies.length), true)
check('ศัตรูตัวเดียวกันไม่ซ้ำในด่าน', st.every(s => new Set(s.enemies.map(e => e.id)).size === s.enemies.length), true)
check('มีศัตรูแถวหน้าทุกด่าน', st.every(s => s.enemies.some(e => e.slot.startsWith('front'))), true)
check('เลเวลศัตรูไม่ลดลงเมื่อด่านสูงขึ้น', st.every((s, i) => i === 0 || Math.min(...s.enemies.map(e => e.level)) >= Math.min(...st[i - 1].enemies.map(e => e.level))), true)
check('ของดรอปเป็นอุปกรณ์ที่มีจริง', st.every(s => s.drops.length && s.drops.every(d => G.GEAR_BY_ID[d])), true)
const missing = []
for (const s of st) for (const e of s.enemies) {
  const cfg = await readFile(path.join(ROOT, 'public', 'rangers', e.id, 'ranger.json'), 'utf8').then(JSON.parse).catch(() => null)
  if (!cfg || cfg.approved !== true) missing.push(`${s.id}:${e.id}`)
}
check('ศัตรูทุกตัวมีไฟล์และอนุมัติแล้ว (ขึ้นในเกมได้จริง)', missing, [])

// ── ความคืบหน้า ──
check('ยังไม่ผ่านอะไร → ด่านปัจจุบัน = ด่าน 1', S.currentIndex({}), 0)
check('สถานะปุ่ม: ด่าน 1 ปัจจุบัน · ด่าน 2 ล็อค', [S.stageState(0, {}), S.stageState(1, {})], ['current', 'locked'])
const two = { 'c1-1': 3, 'c1-2': 1 }
check('ผ่าน 2 ด่าน → ปัจจุบัน = ด่าน 3', S.currentIndex(two), 2)
check('สถานะ: ผ่านแล้ว / ปัจจุบัน / ล็อค', [S.stageState(1, two), S.stageState(2, two), S.stageState(3, two)], ['cleared', 'current', 'locked'])
const ch1 = Object.fromEntries(S.stagesOf(1).map(s => [s.id, 1]))
check('ผ่านบทที่ 1 ครบ → ด่านปัจจุบัน = 2-1 (ต่อข้ามบท)', st[S.currentIndex(ch1)].label, '2-1')
const all = Object.fromEntries(st.map(s => [s.id, 1]))
check('ผ่านครบ → ไม่มีด่านปัจจุบัน · ทุกปุ่ม = ผ่านแล้ว', [S.currentIndex(all), S.stageState(29, all)], [-1, 'cleared'])
check('ศัตรูเลเวลเกิน 60 ได้ (บทที่ 3)', Math.max(...st[29].enemies.map(e => e.level)) > 60, true)
check('สูตรเลเวลศัตรูไม่ตัดที่ 60 · ฮีโร่ตัด', [G.enemyLevelMul(82) > G.heroLevelMul(82), G.heroLevelMul(82) === G.heroLevelMul(60)], [true, true])

// ── ดาว ──
const s1 = st[0]
check('แพ้ = 0 ดาว', S.starsFor({ win: false, alliesLost: 0, turns: 5 }, s1), 0)
check('ชนะ มีคนล้ม เกินเทิร์น = 1 ดาว', S.starsFor({ win: true, alliesLost: 2, turns: 99 }, s1), 1)
check('ชนะ ไม่มีใครล้ม เกินเทิร์น = 2 ดาว', S.starsFor({ win: true, alliesLost: 0, turns: 99 }, s1), 2)
check('ชนะ มีคนล้ม ทันเทิร์น = 2 ดาว', S.starsFor({ win: true, alliesLost: 1, turns: s1.turnGoal }, s1), 2)
check('ชนะ ไม่มีใครล้ม ทันเทิร์น = 3 ดาว', S.starsFor({ win: true, alliesLost: 0, turns: s1.turnGoal }, s1), 3)

// ── รางวัล ──
const seq = arr => { let i = 0; return () => arr[i++ % arr.length] }
const first = S.rewardFor(s1, true, seq([0.99]))
check('ผ่านครั้งแรก: เงิน + เพชร + อุปกรณ์แน่นอน', [first.gold, first.gem, first.gear], [s1.gold, s1.firstGem, s1.drops[s1.drops.length - 1]])
check('เล่นซ้ำ: ไม่มีเพชร · สุ่มไม่ติด = ไม่มีของ', (({ gem, gear }) => [gem, gear])(S.rewardFor(s1, false, seq([0.9]))), [0, null])
check('เล่นซ้ำ: สุ่มติด (< 25%) = ได้ของ', S.rewardFor(s1, false, seq([0.1, 0])).gear, s1.drops[0])
check('ด่านบอสได้เงิน ×2', st[4].gold, (300 + 5 * 150) * 2)

// ── บันทึกผล + ของดรอป ──
C.resetCollection()
check('ผ่านครั้งแรก → firstClear', C.recordStage('c1-1', 2), { firstClear: true })
check('เล่นซ้ำได้ดาวน้อยกว่า → เก็บดาวที่ดีที่สุด', (C.recordStage('c1-1', 1), C.getCollection().story.stars['c1-1']), 2)
check('เล่นซ้ำได้ดาวมากกว่า → อัปเดต · ไม่ใช่ครั้งแรก', [C.recordStage('c1-1', 3).firstClear, C.getCollection().story.stars['c1-1']], [false, 3])
check('แพ้ (0 ดาว) → ไม่บันทึก', (C.recordStage('c1-2', 0), C.getCollection().story.stars['c1-2']), undefined)
const before = C.getCollection().gear.length
const uid = C.addGear('katana_blaze')
check('ของดรอปเข้ากระเป๋า · uid ต่อจากชิ้นสุดท้าย', [C.getCollection().gear.length - before, uid], [1, 'katana_blaze#6'])
check('ของดรอปมีค่าสุ่ม 3 บรรทัด + ค่าธาตุ', [C.itemByUid(C.getCollection(), uid).subs.length, !!C.itemByUid(C.getCollection(), uid).elem], [3, true])
check('ของแบบที่ไม่มีจริง → ไม่เพิ่ม', C.addGear('nope'), null)
C.setStory({ opened: ['c1-1'], at: 'c1-1', team: 't1' })
check('จำด่านที่เปิดแล้ว/ที่ยืน/ทีม', [C.getCollection().story.opened, C.getCollection().story.at, C.getCollection().story.team], [['c1-1'], 'c1-1', 't1'])
C.resetCollection()
check('รีเซ็ต → ความคืบหน้าหาย', [Object.keys(C.getCollection().story.stars).length, C.getCollection().story.opened.length], [0, 0])

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
if (fail) process.exit(1)
