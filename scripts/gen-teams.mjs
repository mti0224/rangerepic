// ====================================================
// gen-teams.mjs — สร้างไฟล์ทีมทุกแบบที่ "สลับสมาชิก 1 คู่" จากทีมตั้งต้น แล้ววัดอัตราชนะคร่าวๆ
//   node scripts/gen-teams.mjs <ไฟล์ทีมตั้งต้น.json> [จำนวนเกมต่อแบบ=500]
//
// ช่องที่วางคงเดิม (แถวหน้า/แถวหลังเดิม) แค่สลับตัวข้ามฝั่ง — ดูว่าคู่ไหนทำให้ใกล้ 50/50 ที่สุด
// ไฟล์ผลลัพธ์อยู่ใน node_modules/.teams/ (ใช้กับ scripts/sim-teams.mjs ได้ตรงๆ)
// ====================================================

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DIR = path.join(ROOT, 'node_modules', '.teams')
fs.mkdirSync(DIR, { recursive: true })

const baseFile = process.argv[2]
const GAMES = Number(process.argv[3] ?? 500)
if (!baseFile) { console.error('ต้องบอกไฟล์ทีมตั้งต้น'); process.exit(1) }
const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'))

const SLOTS = ['front-0', 'front-1', 'back-0', 'back-1', 'back-2']
const run = file => {
  const out = execFileSync(process.execPath, ['scripts/sim-teams.mjs', String(GAMES), file], { encoding: 'utf8' })
  const line = out.split('\n')[0]
  return { line, win: Number((line.match(/ชนะ ([\d.]+)%/) ?? [])[1] ?? NaN) }
}

const results = []
console.log('ตั้งต้น: ' + run(baseFile).line)
for (const a of SLOTS) {
  for (const b of SLOTS) {
    // สลับได้เฉพาะแถวเดียวกัน (ไม่ย้ายแถวหน้า↔แถวหลัง เพราะโบนัสแถวต่างกัน)
    if (a.split('-')[0] !== b.split('-')[0]) continue
    const next = { left: { ...base.left }, right: { ...base.right } }
    next.left[a] = base.right[b]
    next.right[b] = base.left[a]
    const name = `X_${base.left[a]}__${base.right[b]}__${a}_${b}`
    const file = path.join(DIR, name + '.json')
    fs.writeFileSync(file, JSON.stringify(next))
    const { line, win } = run(file)
    results.push({ name, win, file })
    console.log(`${name.padEnd(46)} ${line}`)
  }
}
results.sort((x, y) => Math.abs(x.win - 55) - Math.abs(y.win - 55))
console.log('\nใกล้ 55% ที่สุด:')
for (const r of results.slice(0, 5)) console.log(`  ${r.win.toFixed(1)}%  ${r.name}`)
