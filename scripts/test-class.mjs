// ====================================================
// test-class.mjs — ธาตุ ชนิด ตำแหน่ง การสุ่มค่าพลัง และดาเมจกาย/เวท
//   node scripts/test-class.mjs
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
const C = await bundle('src/lib/rangerClass.ts', 'class')
const B = await bundle('src/play/battle.ts', 'battle-class')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(56)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

// ── ธาตุ ──
const m = C.elementMultiplier
check('Fire ตี Wood · Wood ตี Water · Water ตี Fire → ×1.5', [m('fire', 'wood'), m('wood', 'water'), m('water', 'fire')], [1.5, 1.5, 1.5])
check('แพ้ทาง → ×0.5', [m('wood', 'fire'), m('water', 'wood'), m('fire', 'water')], [0.5, 0.5, 0.5])
check('Light ตี Dark · Dark ตี Light → ×1.5', [m('light', 'dark'), m('dark', 'light')], [1.5, 1.5])
check('ธาตุเดียวกัน → ×1', C.ELEMENTS.map(e => m(e, e)), [1, 1, 1, 1, 1])
check('Light/Dark ตี Fire/Water/Wood → ×1', ['fire', 'water', 'wood'].flatMap(e => [m('light', e), m('dark', e)]), [1, 1, 1, 1, 1, 1])
check('Fire/Water/Wood ตี Light/Dark → ×1', ['fire', 'water', 'wood'].flatMap(e => [m(e, 'light'), m(e, 'dark')]), [1, 1, 1, 1, 1, 1])
check('ไม่ระบุธาตุ → ×1', [m(undefined, 'fire'), m('fire', undefined)], [1, 1])

// ── ตำแหน่ง ──
check('ตำแหน่งแยกตามชนิด', [C.rolesOf('str'), C.rolesOf('agi'), C.rolesOf('int')], [['tank', 'fighter'], ['shooter', 'assassin'], ['mage', 'support']])

// ── สุ่มค่าพลัง ──
{
  const bad = []
  for (const role of Object.keys(C.ROLES)) {
    for (let i = 0; i < 200; i++) {
      const s = C.randomStats(role)
      for (const [k, [lo, hi]] of Object.entries(C.ROLE_PROFILES[role])) if (s[k] < lo || s[k] > hi) bad.push(`${role}.${k}=${s[k]}`)
    }
  }
  check('สุ่ม 200 ครั้งต่อตำแหน่ง → ทุกค่าอยู่ในช่วง', bad.slice(0, 3), [])
  const avg = (role, k) => { let t = 0; for (let i = 0; i < 300; i++) t += C.randomStats(role)[k]; return t / 300 }
  check('แทงค์เลือดเยอะกว่าไฟเตอร์ · ไฟเตอร์ตีแรงกว่าแทงค์', [avg('tank', 'hp') > avg('fighter', 'hp'), avg('fighter', 'atk') > avg('tank', 'atk')], [true, true])
  check('นักฆ่าตีแรง/คริสูงกว่านักยิง แต่เลือดน้อยกว่า', [avg('assassin', 'atk') > avg('shooter', 'atk'), avg('assassin', 'crit') > avg('shooter', 'crit'), avg('assassin', 'hp') < avg('shooter', 'hp')], [true, true, true])
  check('นักเวทตีแรงกว่าซัพพอร์ต · ซัพพอร์ตเร็วกว่าและต้านสูงกว่า', [avg('mage', 'atk') > avg('support', 'atk'), avg('support', 'spd') > avg('mage', 'spd'), avg('support', 'skillRes') > avg('mage', 'skillRes')], [true, true, true])
  const r = C.randomStats('tank')
  check('HP ปัดหลัก 10 · ATK ปัดหลัก 5', [r.hp % 10, r.atk % 5], [0, 0])
}

// ── ดาเมจ + ธาตุ ──
{
  const base = { hp: 1e6, atk: 1000, def: 800, spd: 100, crit: 0, critDmg: 150, evade: 0, hit: 0, skillEvade: 0, skillHit: 0, skillRes: 0 }
  const unit = (extra = {}) => ({ rangerId: 'x', row: 'front', lane: 0, stats: { ...base }, ...extra })
  const hit = (a, t) => {
    const b = new B.Battle([[a], [t]], 7)
    return b.applyHit(b.units[0], b.units[1], 'attack')
  }
  const plain = hit(unit(), unit())
  const win = hit(unit({ element: 'water' }), unit({ element: 'fire' }))
  const lose = hit(unit({ element: 'fire' }), unit({ element: 'water' }))
  check('ธาตุชนะทาง ×1.5 · แพ้ทาง ×0.5', [win.elementMult, lose.elementMult, win.damage > plain.damage * 1.25, lose.damage < plain.damage * 0.65], [1.5, 0.5, true, true])
}

for (const n of ['class', 'battle-class']) await rm(out(n), { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
