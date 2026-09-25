// ====================================================
// test-pass.mjs — ซีซั่นพาส: ตารางรางวัล 60 เลเวล · เงื่อนไขการรับ · ความคืบหน้า (lib/seasonPass.ts + play/collection.ts)
//   node scripts/test-pass.mjs
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
const P = await bundle('src/lib/seasonPass.ts', 'pass-lib')
const G = await bundle('src/lib/gear.ts', 'pass-gear')
const C = await bundle('src/play/collection.ts', 'pass-col')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(62)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

const L = P.PASS_LEVELS
check('60 เลเวล เรียง 1–60', [L.length, L[0].level, L[59].level], [60, 1, 60])
check('ช่องใหญ่ทุก 10 เลเวล', L.filter(x => x.big).map(x => x.level), [10, 20, 30, 40, 50, 60])
check('พรีเมียมทุก 10 เลเวล = เรนเจอร์', L.filter(x => x.big).every(x => x.premium.kind === 'ranger'), true)
check('เรนเจอร์รางวัลไม่ซ้ำกัน', new Set(L.filter(x => x.big).map(x => x.premium.id)).size, 6)
const missing = []
for (const x of L) for (const r of [x.free, x.premium]) {
  if (r.kind === 'gear' && !G.GEAR_BY_ID[r.tpl]) missing.push(`gear:${r.tpl}`)
  if (r.kind === 'ranger') {
    const cfg = await readFile(path.join(ROOT, 'public', 'rangers', r.id, 'ranger.json'), 'utf8').then(JSON.parse).catch(() => null)
    if (!cfg || cfg.approved !== true) missing.push(`ranger:${r.id}`)
  }
  if ((r.kind === 'gold' || r.kind === 'gem') && !(r.amount > 0)) missing.push(`amount:${x.level}`)
}
check('รางวัลทุกช่องมีของจริง (อุปกรณ์/เรนเจอร์อนุมัติแล้ว/จำนวน > 0)', missing, [])
check('ช่องใหญ่ฟรีมีแต่อุปกรณ์ระดับสูง/เพชรก้อนใหญ่', L.filter(x => x.big).every(x =>
  x.free.kind === 'gem' ? x.free.amount >= 300 : ['legend', 'mythic'].includes(G.GEAR_BY_ID[x.free.tpl].rarity)), true)
check('ชื่อซีซั่นครบ 4 ภาษา', ['en', 'th', 'zh', 'jp'].every(l => P.SEASON.name[l]), true)

// ── เงื่อนไขการรับ ──
const st = { level: 12, premium: false, claimed: ['f3'] }
check('ถึงเลเวลแล้ว (ฟรี) → รับได้', P.canClaim('free', 12, st), true)
check('ยังไม่ถึงเลเวล → รับไม่ได้', P.canClaim('free', 13, st), false)
check('รับไปแล้ว → รับซ้ำไม่ได้', P.canClaim('free', 3, st), false)
check('พรีเมียมยังไม่ปลดล็อค → รับไม่ได้', P.canClaim('premium', 5, st), false)
check('ปลดล็อคพรีเมียมแล้ว → รับได้', P.canClaim('premium', 5, { ...st, premium: true }), true)
check('รหัสช่อง', [P.passKey('free', 12), P.passKey('premium', 60)], ['f12', 'p60'])

// ── ความคืบหน้า ──
C.resetCollection()
check('เริ่มต้น: Lv.1 · ไม่มีพรีเมียม · ยังไม่รับอะไร', C.getCollection().pass, { level: 1, premium: false, claimed: [] })
C.setPassLevel(99)
check('เลเวลเกิน 60 → 60', C.getCollection().pass.level, 60)
C.setPassLevel(-4)
check('เลเวลต่ำกว่า 1 → 1', C.getCollection().pass.level, 1)
C.setPassPremium(true)
C.markPassClaimed(['f1', 'p1']); C.markPassClaimed(['f1'])
check('ปลดพรีเมียม · จำช่องที่รับ (ไม่ซ้ำ)', [C.getCollection().pass.premium, C.getCollection().pass.claimed], [true, ['f1', 'p1']])
C.resetPass()
check('รีเซ็ตพาส', C.getCollection().pass, { level: 1, premium: false, claimed: [] })

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
if (fail) process.exit(1)
