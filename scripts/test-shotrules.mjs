// ====================================================
// test-shotrules.mjs — เทสต์กฎการยิงตามสเปก Line Ranger Kiwi ทีละข้อ
//   node scripts/test-shotrules.mjs
// ====================================================

import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = path.join(process.cwd(), 'node_modules', '.tmp-shotRules.mjs')
await build({
  entryPoints: ['src/lib/shotRules.ts'], bundle: true, format: 'esm', platform: 'node',
  outfile: OUT, logLevel: 'silent', alias: { '@': path.join(process.cwd(), 'src') },
})
const R = await import(pathToFileURL(OUT).href)

let pass = 0, fail = 0
const check = (name, got, want, tol = 0) => {
  const ok = typeof want === 'number' && typeof got === 'number'
    ? Math.abs(got - want) <= tol
    : JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(58)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

// ── ตัวช่วยสร้างข้อมูล ──
const move = (over = {}) => ({
  animationPart: 'bul',
  start: { x: 150, y: 100 },
  moveSpeed: 20,
  angle: { start: 0, end: 0 },
  motion: { type: 'LINEAR', enabled: true, rotation: 'FIXED', loopNormal: false },
  hitPointRate: 100,
  ...over,
  motion: { type: 'LINEAR', enabled: true, rotation: 'FIXED', loopNormal: false, ...(over.motion ?? {}) },
})
const geo = (over = {}) => ({
  fileKey: 'u9999e-test-bul', normalFrames: 4, finishFrames: 30, fps: 30,
  faceAnchor: { x: 10, y: -20 }, shadowAnchor: { x: 5, y: 15 },
  spawnRef: { x: 8, y: -10 }, burstRef: { x: 0, y: -30 },
  artTop: -120, decalY: null, selfArc: false, bulShadow: null,
  ...over,
})
const targets = (x) => ({ main: { x, y: 90 }, face: { x: x - 5, y: -40 }, center: { x, y: 20 } })
const ctx = (over = {}) => ({
  rangerId: 'u9999e-test',
  kind: 'normal',
  meta: move(),
  skill: null,
  stand: { x: 60, y: 90 },
  bodyFps: 30,
  front: targets(560),
  rear: null,
  bulletFor: () => geo(),
  ...over,
})

// ── 1. แยกบัฟกับโจมตี ──
check('สกิล basis self = บัฟ',
  R.isBuffMove('skill1', move(), { basis: { type: 'self' }, area: null }), true)
check('สกิล basis front = โจมตี แม้ motion NONE',
  R.isBuffMove('skill1', move({ motion: { type: 'NONE' } }), { basis: { type: 'front' }, area: null }), false)
check('ตีธรรมดา motion NONE = บัฟ', R.isBuffMove('normal', move({ motion: { type: 'NONE' } }), null), true)
check('สกิลไม่มี basis → ดู motion.type', R.isBuffMove('skill2', move(), { basis: null, area: null }), false)

// ── 2. ไม่บิน ──
check('motion.enabled = false → ไม่บิน', R.isInstantMove(move({ motion: { enabled: false } })), true)
check('moveSpeed = 0 → ไม่บิน', R.isInstantMove(move({ moveSpeed: 0 })), true)
check('start (0,0) แม้ enabled+speed → ไม่บิน', R.isInstantMove(move({ start: { x: 0, y: 0 } })), true)
check('ครบทุกอย่าง → บิน', R.isInstantMove(move()), false)

// ── 3. จุดปล่อย ──
check('start.y = 0 → ระดับ origin (y 0)', R.attackStartWorld({ x: 224, y: 0 }, 90), { x: 224, y: 0 })
check('start.y นับขึ้นจากจุดยืน', R.attackStartWorld({ x: 154, y: 48 }, 90), { x: 154, y: 42 })
check('ค่ายกเว้นจุดปล่อยใช้คีย์ตระกูล', R.attackStartWorld({ x: 1, y: 1 }, 90, 'u1317e-brown:normal'), { x: 180, y: -345 })
check('แก้ start.y รายสกิล', R.attackStartWorld({ x: 350, y: 20 }, 90, 'u1306e-az:skill1'), { x: 350, y: -60 })
check('familyKey ถอดตัวอักษรร่าง', R.familyKey('u1297e-sn-bul'), 'u1297-sn-bul')
check('ค่ายกเว้นไฟล์กระสุนหาด้วยคีย์ตระกูล', R.bulletOverride('u1522e-po-bul'), { targetFace: true })

// ── 4. โค้ง ──
check('ยอดโค้ง = ระยะ² / 3800', R.arcPeak(400), 400 * 400 / 3800, 1e-9)
check('ยอดโค้งหนีบที่ 255', R.arcPeak(2000), 255)

// ── 5. ตีประชิด (ไม่มีไฟล์กระสุน) ──
{
  const p = R.planShot(ctx({ bulletFor: () => undefined }))
  check('ไม่มีไฟล์ → melee', p.type, 'melee')
  check('melee โดนตีเป้าแนวหน้าทันที', p.hit, { aimRear: false, isSkill: false, areaWorld: 0, centerX: 560 })
  const buff = R.planShot(ctx({ bulletFor: () => undefined, kind: 'skill1', skill: { basis: { type: 'self' }, area: 300 } }))
  check('melee ที่เป็นบัฟ → ไม่มีใครโดนตี', buff.hit, null)
}

// ── 6. กระสุนบิน ──
{
  const p = R.planShot(ctx())
  const speed = 20 * R.PROJECTILE_SPEED_SCALE
  const dist = Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y)
  check('บิน: travelTicks = round(ระยะ / (moveSpeed × ตัวคูณความเร็ว))', p.travelTicks, Math.max(1, Math.round(dist / speed)))
  check('ตัวคูณความเร็ว = PT_TO_WORLD × PROJECTILE_SPEED_TUNE', R.PROJECTILE_SPEED_SCALE, 2.1 * 0.95, 1e-9)
  check('rate 100 → เล็ง CENTER', p.end, { x: 560, y: 20 })
  check('หมุดช่วงบิน = กึ่งกลางเฟรมแรกของ normal', p.anchor, { x: 8, y: -10 })
  check('หมุด finish = กึ่งกลางเฟรมแรกของ finish', p.finishAnchor, { x: 0, y: -30 })
  // spawnShift = flightA - spawnRef = 0 → start = attackStartWorld
  check('จุดปล่อย = start จากข้อมูล', p.start, { x: 150, y: -10 })
  check('finishTicks = finishFrames / bulletFps × bodyFps', p.finishTicks, 30)
  check('LINEAR → ไม่โค้ง', p.hasArc, false)
}

// ── 7. ไม่บิน ──
{
  const p = R.planShot(ctx({ meta: move({ motion: { enabled: false } }), bulletFor: () => geo({ normalFrames: 12, fps: 24 }) }))
  check('ไม่บิน: travelTicks = round(normalFrames × bodyFps / bulletFps)', p.travelTicks, Math.round(12 * 30 / 24))
  check('ไม่บิน: จุดเริ่ม = จุดปลายทาง', p.start, p.end)
  const one = R.planShot(ctx({ meta: move({ motion: { enabled: false } }), bulletFor: () => geo({ normalFrames: 1 }) }))
  check('normal 1 เฟรม → 1 ติ๊กแล้วเข้า finish', one.travelTicks, 1)
}

// ── 8. จุดเล็ง ──
{
  const ground = R.planShot(ctx({ meta: move({ hitPointRate: 0 }) }))
  check('rate 0 → ลงพื้น (MAIN) + หยุดก่อน 40 + เลื่อนตามหมุด', ground.end,
    { x: 560 + (8 - 5) - 40, y: 90 + (-10 - 15) })
  check('rate 0 → aimGround', ground.aimGround, true)

  const half = R.planShot(ctx({ meta: move({ hitPointRate: 0.5 }) }))
  check('rate 0.5 → บังคับชน FACE (ไม่ลงพื้น)', half.aimGround, false)
  check('rate 0.5 กระสุนบินยึด MAIN ของกระสุน', half.anchor, { x: 5, y: 15 })

  const face = R.planShot(ctx({ bulletFor: () => geo({ fileKey: 'u1522e-po-bul' }), meta: move({ hitPointRate: 0 }) }))
  check('targetFace override → เล็ง FACE แม้ rate 0', face.end, { x: 555, y: -40 })

  const sky = R.planShot(ctx({ meta: move({ motion: { enabled: false } }), bulletFor: () => geo({ artTop: -410 }) }))
  check('ไม่บิน + ของตกจากฟ้า (artTop ≤ -300) → ลงพื้น', sky.end, { x: 560, y: 90 })
  const onBody = R.planShot(ctx({ meta: move({ motion: { enabled: false } }), bulletFor: () => geo({ artTop: -184 }) }))
  check('ไม่บิน + เอฟเฟกต์คาตัว → CENTER', onBody.end, { x: 560, y: 20 })
  check('ท่าไม่บินที่ลงพื้นใช้หมุด instA (จุดยืน)', sky.anchor, { x: 60, y: 90 })

  const decal = R.planShot(ctx({ meta: move({ motion: { enabled: false } }), bulletFor: () => geo({ artTop: -410, decalY: 50 }) }))
  check('instA.y = min(จุดยืน, รอยพื้น)', decal.anchor.y, 50)

  const pinned = R.planShot(ctx({ meta: move({ motion: { enabled: false } }), bulletFor: () => geo({ fileKey: 'u1524e-ak-bul3' }) }))
  check('ไฟล์ที่ปักหมุดไว้ (u1524-ak-bul3 x0 y0) → ลงพื้น + หมุด 0,0', [pinned.aimGround, pinned.anchor], [true, { x: 0, y: 0 }])
}

// ── 9. บัฟ ──
{
  const p = R.planShot(ctx({ kind: 'skill1', skill: { basis: { type: 'self' }, area: 330 } }))
  check('บัฟ → เกิดที่จุดยืนผู้ร่าย', p.end, { x: 60, y: 90 })
  check('บัฟ → ไม่มีใครโดนตี', p.hit, null)
}

// ── 10. แนวหลัง + Area ──
{
  const rear = targets(1000)
  const skill = { basis: { type: 'rear', multiplier: 1.8 }, area: 350 }
  const p = R.planShot(ctx({ kind: 'skill2', skill, rear }))
  check('basis rear + มีหุ่นหลัง → เล็งแนวหลัง', [p.useRear, p.end.x], [true, 1000])
  check('Area × 2.1 และจุดกลางวง = MAIN ของเป้าที่เล็ง', [p.hit.areaWorld, p.hit.centerX], [735, 1000])
  const noRear = R.planShot(ctx({ kind: 'skill2', skill }))
  check('basis rear แต่ไม่มีหุ่นหลัง → ยิงแนวหน้า', [noRear.useRear, noRear.end.x], [false, 560])
}

// ── 11. โค้ง + selfArc ──
{
  const curve = R.planShot(ctx({ meta: move({ motion: { type: 'CURVE' } }) }))
  const dist = Math.hypot(curve.end.x - curve.start.x, curve.end.y - curve.start.y)
  check('CURVE → โค้ง ยอด min(ระยะ²/3800, 255)', [curve.hasArc, curve.arcPeak], [true, Math.min(255, dist * dist / 3800)])
  const self = R.planShot(ctx({ meta: move({ motion: { type: 'CURVE' } }), bulletFor: () => geo({ selfArc: true }) }))
  check('CURVE แต่คลิปลอยเองแล้ว → ไม่ใส่โค้งซ้ำ', self.hasArc, false)
}

// ── 12. เฟรมกระสุน ──
{
  const p = R.planShot(ctx({ bulletFor: () => geo({ normalFrames: 4, finishFrames: 30, fps: 15 }) }))
  // bulletFps 15 / bodyFps 30 → 1 เฟรมกระสุนต่อ 2 ติ๊ก
  check('วน normal = floor(T × bulletFps/bodyFps) % normalFrames', R.shotFrameIndex(p, Math.min(7, p.travelTicks)).index,
    Math.floor(Math.min(7, p.travelTicks) * 0.5) % 4)
  const T = p.travelTicks + 6
  check('finish นับจากถึงเป้า', R.shotFrameIndex(p, T), { clip: 'finish', index: 3 })
  check('หมดอายุหลัง travel + finish', [R.shotExpired(p, p.travelTicks + p.finishTicks), R.shotExpired(p, p.travelTicks + p.finishTicks + 0.01)], [false, true])

  const fit = R.planShot(ctx({ bulletFor: () => geo({ fileKey: 'u1556e-af-bul3', normalFrames: 10 }) }))
  check('fitNormal (u1556-af-bul3) → ยืดตาม p ไม่วน', R.shotFrameIndex(fit, fit.travelTicks * 0.5).index, 5)

  const noFinish = R.planShot(ctx({ bulletFor: () => geo({ finishFrames: 0 }) }))
  // finishAt: ช่วงบินยังไปปลายทางเดิม · ถึงแล้วภาพ finish ไปเล่นที่ finishAt
  const split = { ...p, finishAt: { x: p.end.x + 50, y: p.end.y - 30 } }
  check('finishAt: ช่วงบินไม่เปลี่ยน', R.shotPose(split, p.travelTicks / 2).pos, R.shotPose(p, p.travelTicks / 2).pos)
  check('finishAt: ช่วง finish เล่นที่จุดที่ตั้งแยก', R.shotPose(split, p.travelTicks + 1).pos, split.finishAt)
  check('ไม่ตั้ง finishAt → finish เล่นที่ปลายทาง', R.shotPose(p, p.travelTicks + 1).pos, p.end)
  check('ไม่มี finish → หายตอนถึงเป้า', R.shotExpired(noFinish, noFinish.travelTicks + 0.01), true)

  // เฟรมกลาง: finish เฟรม 3 ครึ่ง (age 7 ติ๊ก × 0.5) → ผสมกับเฟรม 4 ที่ 0.5 · เฟรมสุดท้ายไม่ผสม
  const mix = R.shotFrameMix(p, p.travelTicks + 7)
  check('shotFrameMix: finish 3.5 → เฟรม 3 ผสม 4 ครึ่งหนึ่ง', [mix.clip, mix.index, mix.next, mix.frac], ['finish', 3, 4, 0.5])
  const lastF = R.shotFrameMix(p, p.travelTicks + p.finishTicks)
  check('shotFrameMix: เฟรมสุดท้ายของ finish → ไม่มีเฟรมถัดไป', [lastF.index, lastF.next, lastF.frac], [29, null, 0])
  const loopN = R.shotFrameMix(p, 7)
  check('shotFrameMix: normal วน เฟรม 3 → ถัดไปคือ 0', [loopN.index, loopN.next, loopN.frac], [3, 0, 0.5])
}

// ── 13. การหมุน ──
{
  const p = R.planShot(ctx({ meta: move({ motion: { rotation: 'ANGLE_LERP' }, angle: { start: -40, end: 40 } }) }))
  check('ANGLE_LERP กลางทาง = ค่าเฉลี่ยของมุม', R.shotPose(p, p.travelTicks / 2).angle, 0, 1e-9)
  check('ANGLE_LERP ต้นทาง = angle.start', R.shotPose(p, 0).angle, -40 * Math.PI / 180, 1e-9)
  const fixed = R.planShot(ctx())
  check('FIXED → ไม่หมุน', R.shotPose(fixed, fixed.travelTicks / 2).angle, 0)
}

// ── 14. วิ่งเข้าไปตี (ไฟล์มีเงา) ──
{
  const p = R.planShot(ctx({ bulletFor: () => geo({ bulShadow: { x: 22, y: 50 } }) }))
  // runIn: เงาในไฟล์ทับเงาเรนเจอร์ → start = stand + (flightA − bulShadow)
  check('วิ่งเข้าไปตี: เงาในไฟล์ทับจุดยืนผู้ยิง', p.start, { x: 60 + (8 - 22), y: 90 + (-10 - 50) })
}

// ── 15. ตั้งตำแหน่งเอง ──
{
  const p = R.planShot(ctx({ manual: { muzzle: { x: 40, y: -55 }, impactOffset: { x: 0, y: -60 } } }))
  check('manual: จุดปล่อย = จุดยืน + muzzle', p.start, { x: 100, y: 35 })
  check('manual: จุดตก = MAIN ของเป้า + impactOffset', p.end, { x: 560, y: 30 })
}

// ── 16. สลับอัตโนมัติ → ตั้งเอง ด้วยค่าที่คำนวณไว้ ต้องได้ภาพเดิมเป๊ะ (หมุดไม่กระโดด) ──
{
  const cases = {
    'กระสุนบินปกติ': ctx(),
    'บินลงพื้น (rate 0)': ctx({ meta: move({ hitPointRate: 0 }) }),
    'ปาโค้ง': ctx({ meta: move({ motion: { type: 'CURVE' } }) }),
    'ไม่บินตกจากฟ้า': ctx({ meta: move({ motion: { enabled: false } }), bulletFor: () => geo({ artTop: -410 }) }),
    'วิ่งเข้าไปตี': ctx({ bulletFor: () => geo({ bulShadow: { x: 22, y: 50 } }) }),
    'บัฟ': ctx({ kind: 'skill1', skill: { basis: { type: 'self' }, area: 300 } }),
  }
  for (const [name, c] of Object.entries(cases)) {
    const auto = R.planShot(c)
    const base = auto.isBuff ? c.stand : c.front.main
    const manual = {
      muzzle: { x: auto.start.x - c.stand.x, y: auto.start.y - c.stand.y },
      impactOffset: { x: auto.end.x - base.x, y: auto.end.y - base.y },
    }
    const m = R.planShot({ ...c, manual })
    const same = (a, b) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9
    // ท่าไม่บิน: จุดเริ่ม = จุดตกอยู่แล้ว จึงเทียบแค่จุดตก
    const ok = same(auto.end, m.end) && (auto.isInstant || same(auto.start, m.start)) && auto.travelTicks === m.travelTicks
    check(`สลับเป็นตั้งเองไม่กระโดด — ${name}`, ok, true)
  }
}

// ── 17. บัฟตั้งตำแหน่งเองได้ (เทียบจุดยืนผู้ร่าย) ──
{
  const p = R.planShot(ctx({ kind: 'skill1', skill: { basis: { type: 'self' }, area: 300 }, manual: { muzzle: { x: 0, y: 0 }, impactOffset: { x: 10, y: -80 } } }))
  check('บัฟ manual: จุดเกิด = จุดยืนผู้ร่าย + impactOffset', p.end, { x: 70, y: 10 })
  check('บัฟ manual: ยังไม่มีใครโดนตี', p.hit, null)
}

await rm(OUT, { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
