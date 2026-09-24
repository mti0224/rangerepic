// ====================================================
// test-player.mjs — เทสต์ SamPlayer แบบไม่ต้องเปิดเบราว์เซอร์
//   node scripts/test-player.mjs
//
// เช็ก 3 อย่างที่พังแล้วจะเห็นยาก:
//   1. onRelease ยิงตรงรอยต่อ cast → release
//   2. x2/x3 ย่อเฟสร่ายมากกว่าเฟสปล่อย (ไม่ใช่ย่อเท่ากัน)
//   3. castSpeedCap บังคับเพดานเวลาได้จริง
// ====================================================

import { build } from 'esbuild'
import { writeFile, rm } from 'node:fs/promises'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'node_modules', '.tmp-samPlayer.mjs')
await build({
  entryPoints: ['src/lib/samPlayer.ts'],
  bundle: true, format: 'esm', platform: 'node', outfile: OUT, logLevel: 'silent',
})
const { SamPlayer, SPEED_PROFILES } = await import('file://' + OUT.replace(/\\/g, '/'))

// SAM ปลอม: คลิป cast 45 เฟรม + release 15 เฟรม ที่ 30fps
const fakeSam = (fps = 30) => ({
  animRate: fps,
  animNames: ['_all', 'idle', 'cast', 'rel'],
  animations: {
    idle: Array.from({ length: 60 }, () => []),
    cast: Array.from({ length: 45 }, () => []),
    rel: Array.from({ length: 15 }, () => []),
  },
})

let pass = 0, fail = 0
const check = (name, got, want, tol = 0) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : got === want
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(52)} ได้ ${typeof got === 'number' ? got.toFixed(3) : got}${ok ? '' : `  (ควรได้ ${want})`}`)
  ok ? pass++ : fail++
}

/** เดินเวลาให้ player ทีละ 1000/240 ms จนจบ แล้วคืนเวลาที่ใช้ (วินาที) */
function runToEnd(p, maxSec = 60) {
  const step = 1000 / 240
  let t = 0
  while (!p.isEnded && t < maxSec) { p.update(step); t += step / 1000 }
  return t
}

// ── 1. onRelease ยิงตอนข้ามเฟส ──
{
  const p = new SamPlayer(fakeSam())
  let firedAt = -1
  let t = 0
  p.playAction('cast', 'rel', { speed: 1, onRelease: () => { firedAt = t } })
  const step = 1000 / 240
  while (!p.isEnded && t < 10) { p.update(step); t += step / 1000 }
  check('onRelease ยิงที่เวลา = ความยาว cast (45f/30fps)', firedAt, 45 / 30, 0.02)
}

// ── 2. ไม่มีเฟส cast → ปล่อยทันทีตั้งแต่เฟรมแรก ──
{
  const p = new SamPlayer(fakeSam())
  let fired = false
  p.playAction(null, 'rel', { onRelease: () => { fired = true } })
  check('ไม่มีเฟส cast → onRelease ยิงทันที', fired, true)
}

// ── 3. เวลารวมที่แต่ละความเร็ว ──
{
  const expect = (sp) => {
    const { cast, release } = SPEED_PROFILES[sp]
    return 45 / (30 * cast) + 15 / (30 * release)
  }
  for (const sp of [1, 2, 3]) {
    const p = new SamPlayer(fakeSam())
    p.playAction('cast', 'rel', { speed: sp })
    check(`x${sp} เวลารวม`, runToEnd(p), expect(sp), 0.03)
  }
}

// ── 4. เฟสร่ายต้องถูกย่อ "มากกว่า" เฟสปล่อย ──
{
  const ratio = (sp) => SPEED_PROFILES[sp].cast / SPEED_PROFILES[sp].release
  check('x2 ย่อเฟสร่ายมากกว่าเฟสปล่อย', ratio(2) > 1, true)
  check('x3 ย่อเฟสร่ายมากกว่าเฟสปล่อย', ratio(3) > 1, true)
  check('x3 ย่อแรงกว่า x2', ratio(3) > ratio(2), true)
}

// ── 5. castSpeedCap บังคับเพดานได้จริง ──
{
  // cast 45f@30fps = 1.5 วิ ตั้งเพดาน 0.5 วิ → รวมต้องเหลือ 0.5 + 0.5 = 1.0 วิ
  const p = new SamPlayer(fakeSam())
  p.playAction('cast', 'rel', { speed: 1, castSpeedCap: 0.5 })
  check('castSpeedCap 0.5s → เวลารวม', runToEnd(p), 0.5 + 15 / 30, 0.03)

  // เพดานหลวมกว่าความยาวจริง → ต้องไม่ทำให้ช้าลง
  const q = new SamPlayer(fakeSam())
  q.playAction('cast', 'rel', { speed: 1, castSpeedCap: 5 })
  check('castSpeedCap หลวม → ไม่ยืดเวลา', runToEnd(q), 1.5 + 0.5, 0.03)
}

// ── 6. seek + totalFrames ──
{
  const p = new SamPlayer(fakeSam())
  p.playAction('cast', 'rel', { speed: 1 })
  check('totalFrames = cast + release', p.totalFrames, 60)
  p.seek(50)
  check('seek(50) → globalFrame', p.globalFrame, 50)
  check('seek(50) → อยู่เฟสปล่อย', p.phase, 'release')
  p.seek(10)
  check('seek(10) → อยู่เฟสร่าย', p.phase, 'cast')
  p.seek(999)
  check('seek เกินขอบ → หนีบไว้ที่เฟรมสุดท้าย', p.globalFrame, 59)
}

// ── 7. holdClip ค้างไว้ไม่จบ (ใช้ตอนสตัน) ──
{
  const p = new SamPlayer(fakeSam())
  p.holdClip('cast')
  for (let i = 0; i < 1000; i++) p.update(1000 / 240)
  check('holdClip → ไม่จบเอง (ใช้ค้างตอนสตัน)', p.isEnded, false)
  check('holdClip → ค้างที่เฟรมสุดท้าย', p.globalFrame, 44)
}

// ── เฟรมกลาง (ภาพลื่น) ──
{
  // ชิ้น id 1 เลื่อน x 0 → 10 ทีละเฟรม · ชิ้น id 2 กระโดด 100 (ตัดภาพ) · ชิ้น id 3 เปลี่ยนรูป
  const piece = (id, img, x, a = 255) => [id, img, [1, 0, 0, 1, x, 0], [255, 255, 255, a]]
  const f0 = [piece(1, 0, 0, 255), piece(2, 0, 0), piece(3, 0, 0)]
  const f1 = [piece(1, 0, 10, 55), piece(2, 0, 100), piece(3, 1, 5)]
  const sam = { animRate: 30, animNames: ['_all', 'walk'], animations: { walk: [f0, f1] } }
  const p = new SamPlayer(sam)
  p.playClip('walk', { loop: true })
  p.update(1000 / 60)                                  // ครึ่งเฟรม (30fps ที่จอ 60Hz)
  const s = p.smoothFrame
  check('เฟรมดิบยังเป็นเฟรม 0', p.frame === f0, true)
  check('ชิ้นที่เลื่อนต่อเนื่อง → อยู่กึ่งกลาง (x 5)', s[0][2][4], 5, 1e-6)
  check('ความทึบผสมด้วย (255 → 55 = 155)', s[0][3][3], 155, 1e-6)
  check('กระโดดไกล (ตัดภาพ) → ไม่ผสม', s[1][2][4], 0)
  check('เปลี่ยนรูป → ไม่ผสม', s[2][2][4], 0)
  p.update(1000 / 30)                                  // เฟรมสุดท้าย + ครึ่ง → ผสมกับเฟรมแรก (วน)
  check('เฟรมสุดท้ายของคลิปวน → ผสมกลับไปเฟรมแรก', p.smoothFrame[0][2][4], 5, 1e-6)
  const once = new SamPlayer(sam).playClip('walk')
  once.update(1000 / 20)
  check('คลิปเล่นครั้งเดียว เฟรมสุดท้าย → ไม่ผสมกับอะไร', once.smoothFrame[0][2][4], 10, 1e-6)
}

await rm(OUT, { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
