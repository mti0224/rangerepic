// ====================================================
// test-anchors.mjs — เทสต์ระบบพิกัด 2 ชั้น (sprite space / slot space)
//   node scripts/test-anchors.mjs
//
// กติกาที่ต้องจริงเสมอ:
//   วาดตัวละครที่ drawOriginFor(cfg, slot) แล้ว "จุดยืน" ต้องไปตกบน slot พอดี
//   ไม่ว่าจะกลับด้านหรือไม่ — เพราะแมพจะวางตัวละครด้วยกติกานี้
// ====================================================

import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'node_modules', '.tmp-rangerConfig.mjs')
await build({
  entryPoints: ['src/lib/rangerConfig.ts'],
  bundle: true, format: 'esm', platform: 'node', outfile: OUT, logLevel: 'silent',
  alias: { '@': path.join(process.cwd(), 'src') },
})
const { drawOriginFor, migrateRangerConfig, readyLengthUntilVanish, withDefaultGround } = await import('file://' + OUT.replace(/\\/g, '/'))

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(52)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

const cfg = (ground) => ({
  schemaVersion: 2,
  anchors: { ground, hitPoint: { x: 0, y: -50 }, overhead: { x: 0, y: -120 } },
  actions: {
    attack: { muzzle: { x: 30, y: -60 }, impactOffset: { x: 0, y: -40 } },
    skill1: { muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 } },
    skill2: { muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 } },
  },
})

// จำลองการวาดของ renderSAMFrame: จุดในไฟล์ .sam ไปโผล่ที่ไหนบนจอ
//   ปกติ  screen = drawOrigin + p
//   กลับด้าน screen.x = drawOrigin.x − p.x  (มิเรอร์รอบ drawOrigin)
const screenOf = (drawOrigin, p, flip) => ({
  x: flip ? drawOrigin.x - p.x : drawOrigin.x + p.x,
  y: drawOrigin.y + p.y,
})

// ── 1. จุดยืนต้องตกบน slot พอดี (ไม่กลับด้าน) ──
{
  const g = { x: 12, y: 118 }
  const c = cfg(g)
  for (const slot of [{ x: 0, y: 0 }, { x: 260, y: 0 }, { x: -140, y: 25 }]) {
    const o = drawOriginFor(c, slot)
    check(`จุดยืนตกบน slot (${slot.x},${slot.y})`, screenOf(o, g, false), slot)
  }
}

// ── 2. จุดยืนต้องตกบน slot พอดีแม้กลับด้าน ──
{
  const g = { x: 12, y: 118 }
  const c = cfg(g)
  const slot = { x: 260, y: 0 }
  const o = drawOriginFor(c, slot, true)
  check('จุดยืนตกบน slot ตอนกลับด้าน', screenOf(o, g, true), slot)
}

// ── 3. ground เป็น 0 → drawOrigin = slot ตรงๆ ──
{
  const o = drawOriginFor(cfg({ x: 0, y: 0 }), { x: 77, y: 5 })
  check('ground = (0,0) → drawOrigin = slot', o, { x: 77, y: 5 })
}

// ── 4. ย้ายไฟล์เก่า v1 → v2 (ลบ ground ออกจากพิกัดที่กลายเป็น slot space) ──
{
  const v1 = {
    schemaVersion: 1,
    anchors: { ground: { x: 10, y: 100 }, hitPoint: { x: 12, y: 45 }, overhead: { x: 8, y: -20 } },
    actions: {
      attack: { muzzle: { x: 40, y: 30 }, impactOffset: { x: 0, y: -40 } },
      skill1: { muzzle: { x: 10, y: 100 }, impactOffset: { x: 0, y: 0 } },
      skill2: { muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 } },
    },
  }
  const v2 = migrateRangerConfig(v1)
  check('v1→v2 hitPoint ลบ ground', v2.anchors.hitPoint, { x: 2, y: -55 })
  check('v1→v2 overhead ลบ ground', v2.anchors.overhead, { x: -2, y: -120 })
  check('v1→v2 muzzle ลบ ground', v2.actions.attack.muzzle, { x: 30, y: -70 })
  check('v1→v2 muzzle ที่ตรงกับเท้าพอดี → (0,0)', v2.actions.skill1.muzzle, { x: 0, y: 0 })
  check('v1→v2 ground คงเดิม', v2.anchors.ground, { x: 10, y: 100 })
  check('v1→v2 impactOffset ไม่แตะ (เทียบเป้าอยู่แล้ว)', v2.actions.attack.impactOffset, { x: 0, y: -40 })
  check('v1→v10 เลขเวอร์ชันขยับ', v2.schemaVersion, 10)
}

// ── 5. ไฟล์ v2 อยู่แล้วต้องไม่ถูกแปลงซ้ำ ──
{
  const c = cfg({ x: 10, y: 100 })
  const once = migrateRangerConfig(c)
  const twice = migrateRangerConfig(once)
  check('v2 แปลงซ้ำแล้วไม่เปลี่ยน (idempotent)', twice.anchors.hitPoint, c.anchors.hitPoint)
}

// ── 6b. ความเร็วกระสุน: ค่าเริ่มต้นเก่าที่ตั้งผิด (900) ต้องถูกแทนด้วยค่าที่ถูก ──
// 900 หน่วย/วิ ช้ากว่าของจริงราว 4 เท่า (ของจริง ~3685) แต่ค่าที่ผู้ใช้จูนเองต้องไม่ถูกแตะ
{
  const withSpeed = (speed) => ({
    schemaVersion: 3,
    anchors: { ground: { x: 0, y: 0 }, hitPoint: { x: 0, y: 0 }, overhead: { x: 0, y: 0 } },
    actions: Object.fromEntries(['attack', 'skill1', 'skill2'].map(n => [n, {
      muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 },
      projectile: { asset: 'bul', mode: 'flight', path: 'straight', arcHeight: null, speed, rotate: 'none', fitFlight: false },
    }])),
  })

  check('ความเร็ว 900 (ค่าเริ่มต้นเก่า) → แทนด้วย 3685',
    migrateRangerConfig(withSpeed(900)).actions.attack.projectile.speed, 3685)

  check('ความเร็วที่จูนเองไว้ → ไม่ถูกแตะ',
    migrateRangerConfig(withSpeed(1500)).actions.attack.projectile.speed, 1500)

  check('ไม่มีกระสุน → ยังเป็น null',
    migrateRangerConfig({
      schemaVersion: 3,
      anchors: { ground: { x: 0, y: 0 }, hitPoint: { x: 0, y: 0 }, overhead: { x: 0, y: 0 } },
      actions: Object.fromEntries(['attack', 'skill1', 'skill2'].map(n => [n, {
        muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 }, projectile: null,
      }])),
    }).actions.attack.projectile, null)
}

// ── 6c. v4 → v5: ตำแหน่งที่ผู้ใช้ตั้งเองต้องไม่ถูกทับ ──
{
  const v4 = (actions) => ({
    schemaVersion: 4,
    anchors: { ground: { x: 91.1, y: 93.8 }, hitPoint: { x: 0, y: 0 }, overhead: { x: 0, y: 0 } },
    actions: {
      attack: { muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 }, projectile: null },
      skill1: { muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 }, projectile: null },
      skill2: { muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 }, projectile: null },
      ...actions,
    },
  })
  const m = migrateRangerConfig(v4({
    skill1: { muzzle: { x: 32.6, y: -21 }, impactOffset: { x: 0, y: -30.2 }, projectile: null },
    skill2: { muzzle: { x: -91.1, y: -93.8 }, impactOffset: { x: 0, y: 0 }, projectile: null },
  }))
  check('ยังไม่เคยตั้ง → auto (ใช้กฎ Kiwi)', m.actions.attack.positioning, 'auto')
  check('เคยลากตั้งเอง → manual (ไม่ทับงาน)', m.actions.skill1.positioning, 'manual')
  check('ค่าที่ตั้งเองยังอยู่ครบ', m.actions.skill1.muzzle, { x: 32.6, y: -21 })
  check('muzzle = -ground (ค่าว่างที่เกิดจากการแปลง v1) → auto', m.actions.skill2.positioning, 'auto')
  check('เพิ่ม castPre = null', m.actions.attack.castPre, null)
  check('เพิ่ม moveSpeedOverride = null (ใช้ค่าจากเกม)', m.actions.attack.moveSpeedOverride, null)
  const v5 = migrateRangerConfig({ ...m, schemaVersion: 5, actions: { ...m.actions, attack: { ...m.actions.attack, moveSpeedOverride: undefined } } })
  check('v5 → v10 เติม moveSpeedOverride', [v5.schemaVersion, v5.actions.attack.moveSpeedOverride], [10, null])
  check('เติม approach ปิดไว้เป็นค่าตั้งต้น', v5.actions.attack.approach, { enabled: false, stopOffset: { x: -140, y: 0 }, speed: 600, returnHome: true })
  const v6 = migrateRangerConfig({ ...v5, schemaVersion: 6, actions: { ...v5.actions, skill1: { ...v5.actions.skill1, approach: undefined } } })
  check('v6 → v10 เติม approach', [v6.schemaVersion, v6.actions.skill1.approach.enabled], [10, false])
  const v7 = migrateRangerConfig({ ...v6, schemaVersion: 7, actions: { ...v6.actions, attack: { ...v6.actions.attack, impactOffset: { x: 12, y: -30 }, finishSplit: undefined, finishOffset: undefined } } })
  check('v7 → v10 เติม finishSplit ปิด + finishOffset = จุดตกเดิม', [v7.schemaVersion, v7.actions.attack.finishSplit, v7.actions.attack.finishOffset], [10, false, { x: 12, y: -30 }])
}

// ── 6. จังหวะปล่อย: ตัดเฟรมท้ายช่วงร่ายที่ไม่มีภาพออก ──
// บางตัวหายตัวไปก่อนช่วงร่ายจะจบ (ท่าวาป/ดำดิน) ถ้ารอจนครบ กระสุนจะออกช้า
// โดยไม่มีอะไรให้ดูระหว่างนั้น
{
  const solid = [[0, 0, [1, 0, 0, 1, 0, 0], [255, 255, 255, 255]]]   // มีภาพ
  const blank = [[0, 0, [1, 0, 0, 1, 0, 0], [255, 255, 255, 0]]]     // alpha = 0
  const mk = (clips) => ({ images: [{ name: 'p' }], animations: clips })

  check('ช่วงร่ายมีภาพครบ → ได้ความยาวเต็ม',
    readyLengthUntilVanish(mk({ cast: [solid, solid, solid] }), 'cast'), 3)

  check('หายตัวช่วงท้าย → ตัดเฟรมว่างออก',
    readyLengthUntilVanish(mk({ cast: [solid, solid, blank, blank] }), 'cast'), 2)

  check('ว่างทั้งคลิป → 0',
    readyLengthUntilVanish(mk({ cast: [blank, blank] }), 'cast'), 0)

  check('ว่างตรงกลางแต่ท้ายมีภาพ → ไม่ตัด',
    readyLengthUntilVanish(mk({ cast: [solid, blank, solid] }), 'cast'), 3)

  check('ไม่มีช่วงร่าย → 0', readyLengthUntilVanish(mk({}), null), 0)
  check('ท่า 3 ส่วน: part1 + part2 นับต่อกัน',
    readyLengthUntilVanish(mk({ p1: [solid, solid], p2: [solid, blank] }), 'p1', 'p2'), 3)
  check('ท่า 3 ส่วน: part2 ว่างทั้งคลิป → ตัดถอยเข้าไปใน part1',
    readyLengthUntilVanish(mk({ p1: [solid, blank], p2: [blank, blank] }), 'p1', 'p2'), 1)
  check('อ้างคลิปที่ไม่มีอยู่ → 0', readyLengthUntilVanish(mk({}), 'cast'), 0)
}

// ── v8 → v9: ธาตุ / ชนิด / ตำแหน่ง / ค่าพลังเวท ──
{
  const v8 = {
    schemaVersion: 8, element: 'green', row: 'back', attackRange: 'ranged',
    anchors: { ground: { x: 1, y: 2 }, hitPoint: { x: 0, y: 0 }, overhead: { x: 0, y: 0 } },
    actions: {}, stats: { hp: 4000, atk: 400, def: 250, spd: 100, crit: 5, critDmg: 150, eff: 0, res: 0 },
  }
  const v9 = migrateRangerConfig(v8)
  check('v8→v9 ธาตุ green → wood', v9.element, 'wood')
  check('v8→v9 ระยะไกล → ว่องไว / นักยิง', [v9.category, v9.role], ['agi', 'shooter'])
  check('v8→v9 ลบ row / attackRange', ['row' in v9, 'attackRange' in v9], [false, false])
  check('v8→v10 ค่าพลังชุดใหม่ (ค่าเดิมไม่หาย · res → skillRes)', [v9.stats.atk, v9.stats.def, v9.stats.hp, 'matk' in v9.stats, 'res' in v9.stats, v9.stats.evade, v9.stats.skillRes], [400, 250, 4000, false, false, 5, 0])
  check('v8→v10 เติมสกิลเริ่มต้นของตำแหน่ง (นักยิง)', [v9.skills.skill1.kind, v9.skills.skill1.area, v9.skills.skill2.area], ['attack', 'single_front', 'row'])
  const mage = migrateRangerConfig({ ...v8, schemaVersion: 9, element: 'fire', category: 'int', role: 'mage', stats: { ...v8.stats, atk: 80, matk: 560 } })
  check('v9→v10 นักเวทที่ตั้ง ATK เวทไว้ → ใช้เป็น ATK', [mage.stats.atk, mage.skills.skill2.area], [560, 'all'])
  const melee = migrateRangerConfig({ ...v8, element: 'red', attackRange: 'melee' })
  check('v8→v9 ประชิด → พลัง / ไฟเตอร์ · red → fire', [melee.category, melee.role, melee.element], ['str', 'fighter', 'fire'])
}

// ── จุดยืนเริ่มต้น = เงา ──
{
  const base = { anchors: { ground: { x: 0, y: 0 }, hitPoint: { x: 3, y: -60 }, overhead: { x: 0, y: -150 } } }
  const set = withDefaultGround(base, { x: 61.237, y: 88.04 })
  check('ยังไม่เคยตั้ง → จุดยืน = เงา (ปัด 1 ตำแหน่ง)', set.anchors.ground, { x: 61.2, y: 88 })
  check('จุดโดนตี/เหนือหัว (เทียบจุดยืน) ไม่เปลี่ยน', [set.anchors.hitPoint, set.anchors.overhead], [base.anchors.hitPoint, base.anchors.overhead])
  const mine = { anchors: { ...base.anchors, ground: { x: 50, y: 90 } } }
  check('ตั้งเองไว้แล้ว → ไม่ทับ', withDefaultGround(mine, { x: 61, y: 88 }), mine)
  check('ไม่มีเงา → คงเดิม', withDefaultGround(base, null), base)
}

await rm(OUT, { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
