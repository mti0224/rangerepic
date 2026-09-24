// ====================================================
// test-labels.mjs — ป้ายชื่อหมุดต้องไม่ทับกัน แม้หมุดจะอยู่จุดเดียวกัน
//   node scripts/test-labels.mjs
// ====================================================

import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = path.join(process.cwd(), 'node_modules', '.tmp-stage.mjs')
await build({
  entryPoints: ['src/editor/EditorStage.tsx'], bundle: true, format: 'esm', platform: 'node',
  outfile: OUT, logLevel: 'silent', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
  alias: { '@': path.join(process.cwd(), 'src') },
})
const { layoutLabels } = await import(pathToFileURL(OUT).href)

let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  ' + detail}`)
  ok ? pass++ : fail++
}
// ctx ปลอม: ตัวอักษรกว้าง 7 พิกเซล
const ctx = { font: '', measureText: t => ({ width: t.length * 7 }) }
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const noOverlap = L => L.every((a, i) => L.every((b, j) => i === j || !hit(a.label, b.label)))
const R = 7
const clearOfDots = L => L.every(a => L.every(b => !hit(a.label, { x: b.hx - R, y: b.hy - R, w: 2 * R, h: 2 * R })))

{
  const L = layoutLabels(ctx, [
    { key: 'g', label: 'จุดยืน (เท้า)', hx: 300, hy: 300 },
    { key: 'h', label: 'จุดโดนตี', hx: 300, hy: 300 },
    { key: 'o', label: 'เหนือหัว', hx: 300, hy: 300 },
  ])
  check('หมุด 3 อันจุดเดียวกัน → ป้ายไม่ทับกัน', noOverlap(L), JSON.stringify(L.map(l => l.label)))
  check('หมุด 3 อันจุดเดียวกัน → ป้ายไม่ทับตัวหมุด', clearOfDots(L))
}
{
  const L = layoutLabels(ctx, [
    { key: 'm', label: 'จุดปล่อย', hx: 200, hy: 200 },
    { key: 'i', label: 'จุดกระทบ', hx: 206, hy: 204 },
  ])
  check('หมุดใกล้กันมาก → ป้ายไม่ทับกัน', noOverlap(L))
}
{
  const many = Array.from({ length: 8 }, (_, i) => ({ key: 'k' + i, label: 'หมุด ' + i, hx: 400, hy: 250 }))
  const L = layoutLabels(ctx, many)
  check('หมุด 8 อันจุดเดียวกัน → ป้ายไม่ทับกันสักคู่', noOverlap(L))
}
{
  const L = layoutLabels(ctx, [
    { key: 'a', label: 'จุดยืน', hx: 100, hy: 100 },
    { key: 'b', label: 'เหนือหัว', hx: 500, hy: 100 },
  ])
  check('หมุดห่างกัน → ป้ายอยู่ตำแหน่งปกติ (ขวาบน)', L.every(l => l.label.x === l.hx + 12 && l.label.y < l.hy))
}

await rm(OUT, { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
