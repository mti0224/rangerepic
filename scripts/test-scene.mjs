// ====================================================
// test-scene.mjs — เทสต์ลำดับเหตุการณ์ของ PreviewScene แบบไม่ต้องเปิดเบราว์เซอร์
//   node scripts/test-scene.mjs
//
// update() ไม่แตะ canvas จึงเดินเวลาทดสอบได้ตรงๆ
// ====================================================

import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = path.join(process.cwd(), 'node_modules', '.tmp-previewScene.mjs')
await build({
  entryPoints: ['src/editor/previewScene.ts'], bundle: true, format: 'esm', platform: 'node',
  outfile: OUT, logLevel: 'silent', alias: { '@': path.join(process.cwd(), 'src') },
})
const { PreviewScene } = await import(pathToFileURL(OUT).href)


const FPS = 30
const STEP = 1000 / 240
const frames = n => Array.from({ length: n }, () => [])
const fakeSam = clips => ({
  animRate: FPS,
  animNames: ['_all', ...Object.keys(clips)],
  animations: Object.fromEntries(Object.entries(clips).map(([k, n]) => [k, frames(n)])),
  images: [],
})

const bulletGeo = (over = {}) => ({
  fileKey: 'u9999e-t-bul', normalFrames: 4, finishFrames: 18, fps: FPS,
  faceAnchor: null, shadowAnchor: null, spawnRef: { x: 0, y: 0 }, burstRef: { x: 0, y: 0 },
  artTop: -100, decalY: null, selfArc: false, bulShadow: null, ...over,
})
const bullet = (over = {}) => {
  const geometry = bulletGeo(over)
  return {
    sam: fakeSam({ normal: geometry.normalFrames, finish: geometry.finishFrames }),
    sprites: {}, normalName: 'normal', finishName: 'finish',
    flight: frames(geometry.normalFrames), impact: frames(geometry.finishFrames), geometry,
  }
}

const moveData = (over = {}) => ({
  animationPart: 'bul', start: { x: 100, y: 60 }, moveSpeed: 20,
  angle: { start: 0, end: 0 }, hitPointRate: 100, ...over,
  motion: { type: 'LINEAR', enabled: true, rotation: 'FIXED', loopNormal: false, ...(over.motion ?? {}) },
})

const makeAssets = ({ moves = {}, skills = {}, bullets = { bul: bullet() } } = {}) => ({
  id: 'u9999e-t',
  sam: fakeSam({ idle: 60, walk: 18, cast: 30, rel: 20, target: 25, knockback: 50 }),
  sprites: {},
  bullets,
  gameData: {
    id: 'u9999e-t', render: null, attackRangePt: 400,
    moves: { normal: moveData(), skill1: null, skill2: null, ...moves },
    skills: { skill1: { basis: null, area: null }, skill2: { basis: null, area: null }, ...skills },
  },
  geometry: { idleName: 'idle', hitName: 'target', pivotX: 60, autoStand: { x: 60, y: 90 }, faceAnchor: { x: 60, y: -20 }, centerY: 20 },
  disposed: false,
  dispose: () => {},
})

const action = (over = {}) => ({
  castPre: null, cast: 'cast', release: 'rel', releaseFrame: 30, castSpeedCap: null,
  positioning: 'auto', moveSpeedOverride: null,
  approach: { enabled: false, stopOffset: { x: -140, y: 0 }, speed: 600, returnHome: true }, muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 }, finishSplit: false, finishOffset: { x: 0, y: 0 }, projectile: null, ...over,
})
const makeConfig = (actions = {}) => ({
  schemaVersion: 8, id: 'u9999e-t', name: 't', form: 'body', fps: FPS,
  row: 'front', element: 'red', attackRange: 'ranged',
  anchors: { ground: { x: 60, y: 90 }, hitPoint: { x: 0, y: 0 }, overhead: { x: 0, y: 0 } },
  clips: { idle: 'idle', walk: 'walk', hitLight: 'target', hitHeavy: 'knockback', stun: 'target', die: 'knockback' },
  actions: { attack: action(), skill1: action(), skill2: action(), ...actions },
  stats: { hp: 4000, atk: 400, def: 250, spd: 100, crit: 5, critDmg: 150, eff: 0, res: 0 },
})

let pass = 0, fail = 0
const check = (name, got, want, tol = 0) => {
  const ok = typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(56)} ได้ ${typeof got === 'number' ? got.toFixed(3) : JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

/** เดินเวลาจนเป้าโดนตีครั้งแรก — คืนวินาที */
function timeToHit(scene, maxSec = 20) {
  let t = 0
  while (t < maxSec) {
    scene.update(STEP); t += STEP / 1000
    if (scene.hitCount > 0) return t
  }
  return -1
}
const run = (scene, sec) => { for (let t = 0; t < sec; t += STEP / 1000) scene.update(STEP) }

// ── 1. ประชิด: โดนตีตอนเฟรมผ่าน readyLen ──
{
  const s = new PreviewScene(makeAssets({ bullets: {} }), makeConfig())
  s.fire('attack', 1)
  check('ประชิด — โดนตีที่ releaseFrame 30 (1.0 วิ)', timeToHit(s), 1.0, 0.03)
}

// ── 2. กระสุนบิน: โดนตีหลังบินถึง ──
{
  const assets = makeAssets()
  const s = new PreviewScene(assets, makeConfig())
  const plan = s.planFor('attack')
  s.fire('attack', 1)
  check('บิน — โดนตีที่ปล่อย + travelTicks/fps', timeToHit(s), 1.0 + plan.travelTicks / FPS, 0.04)
}

// ── 3. ไม่บิน: โดนตีหลัง normal เล่นครบ ──
{
  const assets = makeAssets({ moves: { normal: moveData({ motion: { enabled: false } }) }, bullets: { bul: bullet({ normalFrames: 12 }) } })
  const s = new PreviewScene(assets, makeConfig())
  s.targetDistance = 5000
  s.fire('attack', 1)
  check('ไม่บิน — ระยะไม่มีผล โดนตีหลัง normal 12 เฟรม', timeToHit(s), 1.0 + 12 / FPS, 0.04)
}

// ── 4. วนท่า → ยิงนัดใหม่ทุกรอบ ──
{
  const s = new PreviewScene(makeAssets({ bullets: {} }), makeConfig())
  s.loopAction('attack', 1)
  run(s, 50 / FPS * 3 + 0.05)   // ท่ายาว 50 เฟรม เล่น 3 รอบ
  check('loop 3 รอบ → โดนตี 3 ครั้ง', s.hitCount, 3)
}

// ── 5. readyLen = 0 → ยิงทุกครั้งที่วนกลับต้นท่า ──
{
  const s = new PreviewScene(makeAssets({ bullets: {} }), makeConfig({ attack: action({ releaseFrame: 0 }) }))
  s.loopAction('attack', 1)
  run(s, 50 / FPS * 2 + 0.05)
  check('readyLen 0 → ยิงตอนเริ่ม + ตอนวนรอบ (2 รอบ = 3 นัด)', s.hitCount, 3)
}

// ── 6. ลากแถบเวลาถอยหลังไม่นับเป็นวนรอบ ──
{
  const s = new PreviewScene(makeAssets({ bullets: {} }), makeConfig({ attack: action({ releaseFrame: 0 }) }))
  s.loopAction('attack', 1)
  run(s, 0.5)
  const before = s.hitCount
  s.seek(3)
  s.update(STEP)
  check('seek ถอยหลัง → ไม่ยิงเพิ่ม', s.hitCount, before)
}

// ── 7. fire แบบกระโดดข้ามจุดปล่อยในอัปเดตเดียว ยังต้องยิง ──
{
  const s = new PreviewScene(makeAssets({ bullets: {} }), makeConfig({ attack: action({ releaseFrame: 49 }) }))
  s.fire('attack', 1)
  s.update(5000)   // ข้ามทั้งท่าในทีเดียว
  check('อัปเดตเดียวข้ามทั้งท่า → ยังยิงนัดนี้', s.hitCount, 1)
}

// ── 8. บัฟไม่ทำให้ใครโดนตี ──
{
  const assets = makeAssets({
    moves: { skill1: moveData() },
    skills: { skill1: { basis: { type: 'self' }, area: 330 } },
  })
  const s = new PreviewScene(assets, makeConfig())
  s.fire('skill1', 1)
  run(s, 4)
  check('บัฟ → เป้าไม่โดนตี', s.hitCount, 0)
}

// ── 9. มีเป้าเดียว: สกิล 後方敵人 ก็ยิงไปหาตัวที่เล็ง ไม่สร้างหุ่นตัวที่สอง ──
{
  const skills = { skill2: { basis: { type: 'rear', multiplier: 1.8 }, area: 350 } }
  const s = new PreviewScene(makeAssets({ moves: { skill2: moveData({ motion: { enabled: false } }) }, skills }), makeConfig())
  s.targetDistance = 480
  const plan = s.planFor('skill2')
  check('สกิลแนวหลัง → ไม่เล็งหุ่นหลัง', plan.useRear, false)
  check('สกิลแนวหลัง → จุดตกอยู่ที่เป้าตัวเดียว', plan.end.x, s.targetPoints(480).main.x)
  s.fire('skill2', 1)
  run(s, 3)
  check('สกิลแนวหลัง → เป้าที่เล็งโดนตี 1 ครั้ง', s.hitCount, 1)
}

// ── 10. สกิลตีหมู่ยังโดนแค่เป้าที่เล็ง (ดาเมจหมู่ทำทีหลัง) ──
{
  const skills = { skill1: { basis: { type: 'front' }, area: 999 } }
  const s = new PreviewScene(makeAssets({ bullets: {}, skills }), makeConfig())
  s.fire('skill1', 1)
  run(s, 3)
  check('Area ใหญ่มาก → ยังโดนแค่เป้าเดียว 1 ครั้ง', s.hitCount, 1)
}

// ── 10b. ความเร็วกระสุนที่ตั้งเอง ──
{
  const slow = new PreviewScene(makeAssets(), makeConfig({ attack: action({ moveSpeedOverride: 5 }) }))
  const fast = new PreviewScene(makeAssets(), makeConfig({ attack: action({ moveSpeedOverride: 80 }) }))
  slow.targetDistance = fast.targetDistance = 900
  const ps = slow.planFor('attack'), pf = fast.planFor('attack')
  check('ความเร็วตั้งเองสูงขึ้น → travelTicks น้อยลง', pf.travelTicks < ps.travelTicks, true)
  slow.fire('attack', 1); fast.fire('attack', 1)
  check('ความเร็วตั้งเองสูง → โดนตีเร็วกว่า', timeToHit(fast) < timeToHit(slow), true)

  const inst = new PreviewScene(makeAssets({ moves: { normal: moveData({ motion: { enabled: false } }) } }), makeConfig({ attack: action({ moveSpeedOverride: 80 }) }))
  check('ท่าไม่บิน → ความเร็วที่ตั้งเองไม่ทำให้กลายเป็นบิน', inst.planFor('attack').isInstant, true)
}

// ── 10c. เดินเข้าไปก่อนโจมตี ──
{
  const walk = (over = {}) => action({ approach: { enabled: true, stopOffset: { x: -140, y: 0 }, speed: 600, returnHome: true, ...over } })

  // ระยะเดิน = (MAIN ของเป้า + stopOffset) − จุดยืน = 480 − 140 = 340 → ที่ 600/วิ = 0.567 วิ
  const s = new PreviewScene(makeAssets({ bullets: {} }), makeConfig({ attack: walk() }))
  s.targetDistance = 480
  check('จุดหยุดเดิน = 480 − 140', s.approachOffset('attack').x, 340, 1e-9)
  s.fire('attack', 1)
  check('เริ่มยิง → สถานะเดินเข้าไป', s.state, 'approach')
  check('ประชิด + เดิน → โดนตีหลังเดิน 0.567 + ร่าย 1.0 วิ', timeToHit(s), 340 / 600 + 1.0, 0.03)
  check('ตอนโจมตียืนอยู่ที่จุดหยุด', s.attackerOffset.x, 340, 1e-9)
  run(s, 20 / FPS + 0.05)   // ช่วงปล่อยที่เหลือ 20 เฟรมจบ → เดินกลับ
  check('ท่าจบ → เดินกลับ', s.state, 'return')
  run(s, 340 / 600 + 0.05)
  check('ถึงที่เดิม → ยืน', [s.state, s.attackerOffset.x], ['none', 0])

  // ไม่เดินกลับ → ยืนค้างที่จุดหยุด
  const stay = new PreviewScene(makeAssets({ bullets: {} }), makeConfig({ attack: walk({ returnHome: false }) }))
  stay.targetDistance = 480
  stay.fire('attack', 1)
  run(stay, 340 / 600 + 50 / FPS + 0.5)
  check('ไม่ติ๊กเดินกลับ → ยืนค้างที่จุดหยุด', [stay.state, stay.attackerOffset.x], ['none', 340])

  // กระสุนคิดจากจุดที่ยืนตอนร่าย
  const shot = new PreviewScene(makeAssets(), makeConfig({ attack: walk() }))
  shot.targetDistance = 480
  const plain = new PreviewScene(makeAssets(), makeConfig())
  plain.targetDistance = 480
  const a = shot.planFor('attack'), b = plain.planFor('attack')
  check('เดินเข้าไป → จุดปล่อยกระสุนขยับตาม 340', a.start.x - b.start.x, 340, 1e-6)
  check('เดินเข้าไป → จุดตกยังอยู่ที่เป้าเดิม', a.end.x, b.end.x, 1e-6)
  check('เดินเข้าไป → ระยะบินสั้นลง', a.travelTicks <= b.travelTicks, true)

  // วน: เดินไป-ตี-เดินกลับ-เดินไปใหม่
  const loop = new PreviewScene(makeAssets({ bullets: {} }), makeConfig({ attack: walk() }))
  loop.targetDistance = 480
  loop.loopAction('attack', 1)
  run(loop, (340 / 600) * 2 * 2 + (50 / FPS) * 2 + 0.1)
  check('วนท่าที่เดินเข้าไป 2 รอบ → โดนตี 2 ครั้ง', loop.hitCount, 2)

  // x2 เดินเร็วขึ้น
  const fast = new PreviewScene(makeAssets({ bullets: {} }), makeConfig({ attack: walk() }))
  fast.targetDistance = 480
  fast.fire('attack', 2)
  const slow = new PreviewScene(makeAssets({ bullets: {} }), makeConfig({ attack: walk() }))
  slow.targetDistance = 480
  slow.fire('attack', 1)
  check('x2 → เดินถึงและโดนตีเร็วกว่า', timeToHit(fast) < timeToHit(slow), true)
}

// ── 10d. หันหลังเดินกลับ: พลิกกระจกรอบจุดยืน เท้าต้องอยู่ที่เดิม ──
// จงใจตั้งกึ่งกลางกรอบภาพ (pivotX 95) ไม่ตรงกับเท้า (stand.x 60) แบบตัวละครจริงหลายตัว
{
  const stand = { x: 60, y: 90 }
  // ชิ้นส่วนขนาด 2×2 ที่กึ่งกลางอยู่ตรงเท้าพอดี
  const footPiece = [[0, 0, [1, 0, 0, 1, stand.x - 1, stand.y - 1], [255, 255, 255, 255]]]
  const assets = makeAssets({ bullets: {} })
  assets.geometry = { ...assets.geometry, pivotX: 95 }
  assets.sam.images = [{ name: 'foot', w: 2, h: 2, m: [1, 0, 0, 1, 0, 0] }]
  assets.sprites = { foot: { bitmap: {}, w: 2, h: 2 } }
  assets.sam.animations.walk = [footPiece]
  assets.sam.animations.idle = []          // ไม่วาดหุ่นเป้า จะได้จับเฉพาะผู้โจมตี

  const cfg = makeConfig({ attack: action({ approach: { enabled: true, stopOffset: { x: -140, y: 0 }, speed: 600, returnHome: true } }) })
  const s = new PreviewScene(assets, cfg)
  s.targetDistance = 480

  /** ตำแหน่ง x บนจอที่ชิ้นส่วนเท้าถูกวาด (อ่านจาก setTransform) */
  const footScreenX = () => {
    const xs = []
    const ctx = new Proxy({}, {
      get: (_, k) => k === 'canvas' ? { width: 900, height: 520 }
        : k === 'setTransform' ? (a, b, c, d, e) => xs.push(e)
        : () => {},
      set: () => true,
    })
    s.render(ctx, 0, 0, 1)
    return xs[0]
  }

  s.fire('attack', 1)
  run(s, 0.1)
  check('กำลังเดินเข้าไป (หันหน้า)', s.state, 'approach')
  // โลกถูกเลื่อน −stand ให้เท้าอยู่ที่ 0 → เท้าผู้โจมตีต้องอยู่ที่ attackerOffset.x พอดี
  check('หันหน้า → เท้าอยู่ตรงตำแหน่งตัวละคร', footScreenX(), s.attackerOffset.x, 1e-6)

  run(s, 340 / 600 + 50 / FPS + 0.05)
  check('กำลังเดินกลับ (หันหลัง)', s.state, 'return')
  check('หันหลัง → เท้ายังอยู่ตรงตำแหน่งตัวละคร ไม่กระโดด', footScreenX(), s.attackerOffset.x, 1e-6)
}

// ── 10d-2. ขากลับหันตามทิศที่เดินจริง: จุดตีอยู่ไกลกว่าที่ยืน (ถอยไปตี) → ขากลับเดินหน้า ไม่ moonwalk ──
{
  const walk = action({ approach: { enabled: true, stopOffset: { x: -140, y: 0 }, speed: 600, returnHome: true } })
  // เข้าไปหาเป้า (บ้านอยู่ข้างหลัง) → ขากลับหันหลังเดิน
  const fwd = new PreviewScene(makeAssets({ bullets: {} }), makeConfig({ attack: walk }))
  fwd.targetDistance = 480
  fwd.fire('attack', 1)
  run(fwd, 340 / 600 + 50 / FPS + 0.05)
  check('เดินเข้าไปตี → ขากลับหันหลัง', [fwd.state, fwd.facingBack], ['return', true])
  // เป้าอยู่ใกล้กว่าระยะตี 140 → ถอยไป 40 (ขาไปหันหน้า = moonwalk ตามเดิม) → ขากลับเดินหน้า
  const back = new PreviewScene(makeAssets({ bullets: {} }), makeConfig({ attack: walk }))
  back.targetDistance = 100
  check('จุดตีอยู่ข้างหลัง 40', back.approachOffset('attack').x, -40, 1e-9)
  back.fire('attack', 1)
  run(back, 0.02)
  check('ขาไปถอยหลังแต่หันหน้าเข้าหาเป้า (moonwalk)', [back.state, back.facingBack], ['approach', false])
  // เดินทีละนิดจนเริ่มขากลับ (ขากลับแค่ 40 หน่วย จบเร็ว)
  for (let i = 0; i < 400 && back.state !== 'return'; i++) run(back, 1 / 120)
  check('ถอยไปตี → ขากลับเดินหน้า ไม่หันหลัง (ไม่ moonwalk)', [back.state, back.facingBack], ['return', false])
}

// ── 10e. แยกจุด finish (ระเบิด) ออกจากปลายทาง normal ──
{
  const assets = makeAssets()
  const base = new PreviewScene(assets, makeConfig()).planFor('attack')
  const s = new PreviewScene(assets, makeConfig({ attack: action({ finishSplit: true, finishOffset: { x: 80, y: -40 } }) }))
  const p = s.planFor('attack')
  const main = s.targetPoints(s.targetDistance).main
  check('ปลายทางกระสุน (normal) ไม่เปลี่ยน', [p.start, p.end, p.travelTicks], [base.start, base.end, base.travelTicks])
  check('finishAt = เท้าเป้า + finishOffset', p.finishAt, { x: main.x + 80, y: main.y - 40 })
  check('ไม่ติ๊กแยก → finishAt = null (เล่นที่ปลายทางกระสุน)', base.finishAt, null)
}

// ── 11. finish เล่นจนจบก่อนลบกระสุน ──
{
  const s = new PreviewScene(makeAssets({ bullets: { bul: bullet({ finishFrames: 18 }) } }), makeConfig())
  const plan = s.planFor('attack')
  s.fire('attack', 1)
  run(s, 1.0 + plan.travelTicks / FPS + 0.3)
  check('ถึงเป้าแล้ว finish ยังเล่นอยู่', s.shotCount, 1)
  run(s, 0.5)
  check('finish จบ → ลบกระสุน', s.shotCount, 0)
}

// ── 12. asset ที่ปลดแล้วต้องไม่ถูกวาด ──
{
  const assets = makeAssets()
  assets.sam.animations.idle = [[[0, 0, [1, 0, 0, 1, 0, 0], [255, 255, 255, 255]]]]
  assets.sam.images = [{ name: 'p', w: 10, h: 10, m: [1, 0, 0, 1, 0, 0] }]
  assets.sprites = { p: { bitmap: {}, w: 10, h: 10 } }
  assets.disposed = true
  const calls = []
  const fakeCtx = new Proxy({}, {
    get: (_, k) => (k === 'canvas' ? { width: 100, height: 100 } : (...a) => { calls.push(String(k)); return a }),
    set: () => true,
  })
  const s = new PreviewScene(assets, makeConfig())
  s.loopClip('idle', 1)
  s.update(100)
  s.render(fakeCtx, 0, 0, 1)
  check('asset ที่ปลดแล้ว → render ไม่วาดอะไรเลย', calls.length, 0)
}

await rm(OUT, { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
