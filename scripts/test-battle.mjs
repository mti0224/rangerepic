// ====================================================
// test-battle.mjs — กติกาการรบ 5v5 + รบอัตโนมัติจนจบโดยไม่ค้าง
//   node scripts/test-battle.mjs
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
const B = await bundle('src/play/battle.ts', 'battle')
const S = await bundle('src/play/battleScene.ts', 'battleScene')

let pass = 0, fail = 0
const check = (name, got, want, tol = 0) => {
  const ok = typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(56)} ได้ ${JSON.stringify(got)}${ok ? '' : `  (ควรได้ ${JSON.stringify(want)})`}`)
  ok ? pass++ : fail++
}

const stats = (over = {}) => ({ hp: 4000, atk: 400, def: 250, spd: 100, crit: 5, critDmg: 150, eff: 0, res: 0, ...over })
const setup = (id, row, lane, over, role) => ({ rangerId: id, row, lane, stats: stats(over), role })
const fullTeam = (id, over = {}) => [
  setup(id, 'front', 0, over), setup(id, 'front', 1, over),
  setup(id, 'back', 0, over), setup(id, 'back', 1, over), setup(id, 'back', 2, over),
]

// ── 1. ลำดับเทิร์นตาม SPD (Action Value) ──
{
  const b = new B.Battle([[setup('a', 'front', 0, { spd: 150 })], [setup('b', 'front', 0, { spd: 100 })]])
  const seq = []
  for (let i = 0; i < 10; i++) seq.push(b.nextActor().team)
  const fast = seq.filter(t => t === 0).length
  check('SPD 150 vs 100 → ใน 10 เทิร์นตัวเร็วได้เล่น 6 ครั้ง', fast, 6)
  check('ตัวเร็วได้เล่นก่อน', seq[0], 0)
}

// ── 2. ลำดับเทิร์นล่วงหน้าตรงกับของจริง ──
{
  const b = new B.Battle([fullTeam('a', { spd: 110 }), fullTeam('b', { spd: 95 })])
  const preview = b.previewOrder(12).map(u => u.uid)
  const real = []
  for (let i = 0; i < 12; i++) real.push(b.nextActor().uid)
  check('แถบลำดับเทิร์นตรงกับลำดับจริง 12 เทิร์น', preview, real)
}

// ── 2b. SPD เท่ากัน → สลับกันเล่นทีละทีม ──
{
  const b = new B.Battle([fullTeam('a'), fullTeam('b')])
  const teams = Array.from({ length: 6 }, () => b.nextActor().team)
  check('SPD เท่ากัน → ซ้าย ขวา ซ้าย ขวา...', teams, [0, 1, 0, 1, 0, 1])
}

// ── 3. แถวหน้าก่อน ──
{
  const b = new B.Battle([fullTeam('a'), fullTeam('b')])
  const attacker = b.units.find(u => u.team === 0)
  check('แถวหน้ายังอยู่ → เล็งได้แค่แถวหน้า', b.validTargets(attacker).map(u => u.row), ['front', 'front'])
  for (const u of b.units) if (u.team === 1 && u.row === 'front') u.alive = false
  check('แถวหน้าตายหมด → เล็งแถวหลังได้', b.validTargets(attacker).length, 3)
}
{
  // สิทธิ์ตีข้ามแถวเป็นของ "ตำแหน่งนักฆ่า" ไม่ใช่ของช่องที่วาง (ช่องกลางแถวหลังก็เหมือนช่องอื่น)
  const team = [
    setup('a', 'front', 0), setup('a', 'front', 1),
    setup('a', 'back', 0, {}, 'assassin'), setup('a', 'back', 1), setup('a', 'back', 2, {}, 'shooter'),
  ]
  const b = new B.Battle([team, fullTeam('b')])
  const killer = b.unit('0-back-0')
  const mid = b.unit('0-back-1')
  check('นักฆ่า → เล็งได้ทั้ง 5 ตัว', b.validTargets(killer).length, 5)
  check('ช่องกลางแถวหลัง (ไม่ใช่นักฆ่า) → ยังเล็งได้แค่แถวหน้า', b.validTargets(mid).map(u => u.row), ['front', 'front'])
  b.unit('1-front-0').hp = 1                               // แถวหน้าเลือดน้อยกว่า แต่นักฆ่ายังเลือกแถวหลัง
  b.unit('1-back-2').hp = 50
  check('ออโต้นักฆ่า → ตีแถวหลังเลือดน้อยสุด', b.autoTarget(killer).uid, '1-back-2')
  check('ออโต้ตำแหน่งอื่น → ยังตีแถวหน้า', b.autoTarget(mid).uid, '1-front-0')
  for (const u of b.units) if (u.team === 1 && u.row === 'back') u.alive = false
  check('แถวหลังศัตรูตายหมด → นักฆ่ากลับมาตีแถวหน้า', b.autoTarget(killer).row, 'front')
}

// ── 4. พลังงานทีม ──
{
  // ไฟเตอร์: สกิล 1 Cost 2 · สกิล 2 Cost 3
  const b = new B.Battle([fullTeam('a'), fullTeam('b')])
  const u = b.units[0]
  check('เริ่มต้นพลังงาน 3', b.energy[0], 3)
  check('Cost มาจากสกิลที่ตั้ง (ไฟเตอร์ 2 / 3)', [b.costOf(u, 'attack'), b.costOf(u, 'skill1'), b.costOf(u, 'skill2')], [0, 2, 3])
  // โหมดสุ่ม (aiLevel random) — 200 ครั้งต้องเจอครบทั้ง 3 ท่า
  b.aiLevel = ['random', 'random']
  const seen = new Set(Array.from({ length: 200 }, () => b.autoAction(u)))
  check('ออโต้โหมดสุ่ม: สุ่มได้ครบทั้ง 3 ท่า', [...seen].sort(), ['attack', 'skill1', 'skill2'])
  b.commitAction(u, 'skill2')
  check('ใช้สกิล 2 (Cost 3) → เหลือ 0', b.energy[0], 0)
  check('พลังงาน 0 → ใช้สกิลไม่ได้', [b.canUse(u, 'skill1'), b.canUse(u, 'skill2')], [false, false])
  const onlyAttack = new Set(Array.from({ length: 50 }, () => b.autoAction(u)))
  check('พลังงานไม่พอ → ออโต้ตีธรรมดาอย่างเดียว', [...onlyAttack], ['attack'])
  for (let i = 0; i < 20; i++) b.commitAction(u, 'attack')
  check('พลังงานไม่เกินเพดาน 10', b.energy[0], 10)
  check('พลังงานของอีกทีมไม่เปลี่ยน', b.energy[1], 3)
}

// ── 5. ดาเมจ ──
{
  const b = new B.Battle([[setup('a', 'front', 0, { atk: 1000, crit: 0 })], [setup('b', 'front', 0, { def: 800, hp: 100000 })]])
  const [a, t] = b.units
  const r = b.applyHit(a, t, 'attack')
  // แถวหน้าได้โบนัส DEF +30% → DEF จริง 1040 · 1000 × 100% × (1 − 1040/1840) × DAMAGE_SCALE ± 15%
  const base = 1000 * (1 - t.def / (t.def + 800)) * B.DAMAGE_SCALE
  check('ดาเมจ = ATK × % × (1 − DEF/(DEF+800)) × DAMAGE_SCALE ± 15%', r.damage >= base * 0.85 - 1 && r.damage <= base * 1.15 + 1, true)
  check('แถวหน้าได้โบนัส DEF +30% · HP +15%', [t.def, t.maxHp], [1040, 115000])
  const s2 = b.applyHit(a, t, 'skill2')
  check('สกิล 2 (200%) แรงกว่าตีธรรมดา', s2.damage > r.damage * 1.5, true)
}

// ── 5b. ไกด์ผลลัพธ์ก่อนกด (previewAction) — ค่ากลาง ไม่คริ ไม่สุ่ม ไม่หลบ ──
{
  const b = new B.Battle([[setup('a', 'front', 0, { atk: 1000, crit: 100 })], [setup('b', 'front', 0, { def: 800, hp: 100000 }), setup('b', 'front', 1, { def: 800, hp: 100000 }), setup('b', 'back', 0, { def: 800, hp: 100000 })]], 3)
  const [a, t1, t2, t3] = b.units
  const p = b.previewAction(a, 'attack', t1)
  const mid = Math.round(1000 * (1 - t1.def / (t1.def + 800)) * B.DAMAGE_SCALE)
  check('ไกด์ตีปกติ = ค่ากลาง ไม่คริ (แม้คริ 100%)', [p.length, p[0].uid, p[0].damage], [1, t1.uid, mid])
  // ผลจริงอยู่ในช่วง ±15% ของค่าไกด์ (ไม่คริ) → คริทำให้แรงกว่าเสมอ
  check('ยังไม่ชี้เป้า → แสดงทุกตัวที่เลือกได้ (แถวหน้า)', b.previewAction(a, 'attack', null).map(x => x.uid), [t1.uid, t2.uid])
  t1.statuses.push({ type: 'barrier', pct: 0, turns: 2, appliedTurn: 0 })
  check('เป้ามีบาเรีย → IMMUNE ไม่มีดาเมจ', [b.previewAction(a, 'attack', t1)[0].immune, b.previewAction(a, 'attack', t1)[0].damage], [true, 0])
  t1.statuses = []
  const hp0 = t1.hp
  check('ไกด์ไม่เปลี่ยนเลือดจริง', t1.hp, hp0)
}
{
  const rowSkill = { kind: 'attack', cost: 2, area: 'row', effects: [{ type: 'damage', pct: 100 }, { type: 'stun', turns: 1 }] }
  const heal = { kind: 'buff', cost: 2, area: 'ally_all', effects: [{ type: 'heal', pct: 30 }, { type: 'shield', pct: 20, turns: 2 }, { type: 'atkUp', pct: 20, turns: 2 }] }
  const withSk = (row, lane, s1) => ({ ...setup('x', row, lane), skills: { skill1: s1, skill2: s1 } })
  const b = new B.Battle([[withSk('back', 0, rowSkill), withSk('front', 0, heal)], [setup('b', 'front', 0), setup('b', 'front', 1), setup('b', 'back', 0)]], 3)
  const [mage, healer, f1, f2] = b.units
  const row = b.previewAction(mage, 'skill1', f1)
  check('ไกด์ท่าทั้งแถว: ชี้ตัวเดียว → เห็นทั้งแถว + ติดชะงัก', [row.map(x => x.uid), row[0].statuses.map(s => s.type)], [[f1.uid, f2.uid], ['stun']])
  mage.hp = mage.maxHp - 500
  const buff = b.previewAction(healer, 'skill1', null)
  const onMage = buff.find(x => x.uid === mage.uid)
  check('ไกด์ฮีล: ไม่เกินเลือดที่หาย · โล่ตาม % เลือดเต็ม · มีบัฟ ATK', [onMage.heal, onMage.shield, onMage.statuses.map(s => s.type)], [500, Math.round(mage.maxHp * 0.2), ['atkUp']])
}

// ── 6. ตาย + มีผู้ชนะ ──
{
  const b = new B.Battle([[setup('a', 'front', 0, { atk: 99999 })], [setup('b', 'front', 0)]])
  b.units[1].hp = 10                                   // เลือดเหลือน้อย (เพดานดาเมจคิดจาก HP สูงสุด ไม่กันตัวที่ใกล้ตาย)
  const r = b.applyHit(b.units[0], b.units[1], 'attack')
  check('ดาเมจเกินเลือด → ตาย', [r.killed, b.units[1].alive, b.units[1].hp], [true, false, 0])
  check('ทีมขวาตายหมด → ทีมซ้ายชนะ', b.winner, 0)
  check('จบแล้วไม่มีเทิร์นต่อ', b.nextActor(), null)
}

// ── 7. seed เดียวกัน → ผลเหมือนเดิม ──
{
  const run = () => {
    const b = new B.Battle([fullTeam('a', { crit: 50 }), fullTeam('b', { crit: 50 })], 42)
    return Array.from({ length: 6 }, () => b.applyHit(b.units[0], b.units[5], 'attack').damage)
  }
  check('seed เดียวกัน → ดาเมจชุดเดียวกัน', run(), run())
}

// ── 7b. AI มองล่วงหน้า (จำลองในสำเนา): ไม่แตะของจริง · seed เดียวกัน → เล่นเหมือนเดิมทั้งเกม ──
{
  const playAll = () => {
    const b = new B.Battle([fullTeam('a', { spd: 110 }), fullTeam('b', { atk: 450 })], 99)
    const log = []
    for (let t = 0; t < 60 && !b.over; t++) {
      const a = b.nextActor(); if (!a) break
      const st = b.beginTurn(a); if (st.stunned || !a.alive) { b.endTurn(a); continue }
      const hpBefore = b.units.map(u => u.hp).join(',')
      const p = b.planAuto(a)
      if (b.units.map(u => u.hp).join(',') !== hpBefore) log.push('AI แตะของจริง!')
      b.commitAction(a, p.action); b.resolveAction(a, p.action, p.target); b.endTurn(a)
      log.push(a.uid + ':' + p.action + '>' + p.target.uid)
    }
    return log
  }
  const first = playAll()
  check('AI คิด (จำลองในสำเนา) แล้วเลือดของจริงไม่เปลี่ยน', first.includes('AI แตะของจริง!'), false)
  check('seed เดียวกัน → AI เล่นเหมือนเดิมทุกตา', JSON.stringify(playAll()) === JSON.stringify(first), true)
}

// ── 8. ฉากรบอัตโนมัติจนจบ ไม่ค้าง (ตัวละครปลอม) ──
{
  const FPS = 30
  const frames = n => Array.from({ length: n }, () => [])
  const fakeSam = clips => ({ animRate: FPS, animNames: ['_all', ...Object.keys(clips)], animations: Object.fromEntries(Object.entries(clips).map(([k, n]) => [k, frames(n)])), images: [] })
  const bullet = () => ({
    sam: fakeSam({ normal: 4, finish: 12 }), sprites: {}, normalName: 'normal', finishName: 'finish',
    flight: frames(4), impact: frames(12),
    geometry: { fileKey: 'x-bul', normalFrames: 4, finishFrames: 12, fps: FPS, faceAnchor: null, shadowAnchor: null, spawnRef: { x: 0, y: 0 }, burstRef: { x: 0, y: 0 }, artTop: -100, decalY: null, selfArc: false, bulShadow: null },
  })
  const move = over => ({ animationPart: 'bul', start: { x: 100, y: 60 }, moveSpeed: 20, angle: { start: 0, end: 0 }, hitPointRate: 100, ...over, motion: { type: 'LINEAR', enabled: true, rotation: 'FIXED', loopNormal: false, ...(over?.motion ?? {}) } })
  const act = over => ({ castPre: null, cast: 'cast', release: 'rel', releaseFrame: 12, castSpeedCap: null, positioning: 'auto', moveSpeedOverride: null, approach: { enabled: false, stopOffset: { x: -140, y: 0 }, speed: 600, returnHome: true }, muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 }, projectile: null, ...over })
  const kit = (id, { ranged, walk }) => ({
    assets: {
      id, sam: fakeSam({ idle: 30, walk: 12, cast: 12, rel: 10, target: 10, knockback: 15 }), sprites: {},
      bullets: ranged ? { bul: bullet() } : {},
      gameData: { id, render: null, attackRangePt: 400, moves: { normal: move(), skill1: move({ motion: { enabled: false } }), skill2: move() }, skills: { skill1: { basis: { type: 'front' }, area: 300 }, skill2: { basis: { type: 'rear', multiplier: 1.5 }, area: 200 } } },
      geometry: { idleName: 'idle', hitName: 'target', pivotX: 60, autoStand: { x: 60, y: 90 }, faceAnchor: { x: 60, y: -20 }, centerY: 20 },
      disposed: false, dispose() {},
    },
    config: {
      schemaVersion: 8, id, name: id, form: 'body', fps: FPS, row: 'front', element: 'red', attackRange: ranged ? 'ranged' : 'melee',
      anchors: { ground: { x: 60, y: 90 }, hitPoint: { x: 0, y: 0 }, overhead: { x: 0, y: 0 } },
      clips: { idle: 'idle', walk: 'walk', hitLight: 'target', hitHeavy: 'knockback', stun: 'target', die: 'knockback' },
      actions: { attack: act({ approach: { enabled: walk, stopOffset: { x: -140, y: 0 }, speed: 900, returnHome: true } }), skill1: act(), skill2: act() },
      stats: stats(),
    },
  })
  const kits = new Map([['gun', kit('gun', { ranged: true, walk: false })], ['sword', kit('sword', { ranged: false, walk: true })]])

  for (const speed of [1, 3]) {
    const battle = new B.Battle([fullTeam('gun', { atk: 900 }), fullTeam('sword', { atk: 900 })], 7)
    const scene = new S.BattleScene(battle, kits, undefined, undefined, { intro: false })
    scene.speed = speed
    let t = 0
    const STEP = 1000 / 60
    let lastTurn = 0, stuckFor = 0, maxStuck = 0
    while (scene.phase !== 'ended' && t < 600) {
      scene.update(STEP); t += STEP / 1000
      if (battle.turn === lastTurn) { stuckFor += STEP / 1000; maxStuck = Math.max(maxStuck, stuckFor) } else { lastTurn = battle.turn; stuckFor = 0 }
    }
    check(`x${speed} รบอัตโนมัติจนมีผู้ชนะ`, [scene.phase, battle.winner !== null], ['ended', true])
    check(`x${speed} ไม่มีเทิร์นไหนค้างเกิน 8 วินาที`, maxStuck < 8, true)
    console.log(`   (x${speed}: ${battle.turn} เทิร์น · ${t.toFixed(1)} วินาที · เทิร์นยาวสุด ${maxStuck.toFixed(2)} วิ)`)
  }

  // หลบทางให้เพื่อน: นักฆ่าแถวหลังเดินไปหยุดตรงช่องแถวหน้าบนของเรา → เพื่อนแถวหน้าถอยเฉียง (หันหน้าเดิม) แล้วกลับเข้าช่อง
  {
    const killer = kit('killer', { ranged: false, walk: true })
    killer.config.actions.attack.approach.stopOffset = { x: -S.frontLineGap(), y: 0 }   // หยุดห่างเป้าเท่าแถวหน้าสองฝั่ง = ตรงช่องแถวหน้าบนของเรา
    const dk = new Map([...kits, ['killer', killer]])
    const u = (id, row, lane, role = 'fighter') => ({ rangerId: id, row, lane, role, stats: stats() })
    const b = new B.Battle([[u('gun', 'front', 0), u('killer', 'back', 1, 'assassin')], [u('gun', 'front', 0), u('gun', 'front', 1)]], 3)
    const sc = new S.BattleScene(b, dk, undefined, undefined, { intro: false, layout: 'fixed' })
    sc.auto = false
    const buddy = sc.views.find(v => v.unit.uid === '0-front-0')
    const far = sc.views.find(v => v.unit.uid === '1-front-1')
    const attacker = b.unit('0-back-1')
    sc.startAction(attacker, 'attack', b.unit('1-front-0'))
    let maxBack = 0, maxUp = 0, faced = true, stillFar = true
    for (let i = 0; i < 90; i++) {
      sc.update(1000 / 60)
      maxBack = Math.max(maxBack, -buddy.pos.x); maxUp = Math.max(maxUp, -buddy.pos.y)
      if (buddy.facingBack) faced = false
    }
    check('นักฆ่าเดินมาหยุดที่ช่องเพื่อน → เพื่อนถอยหลัง (ทีมซ้ายถอย = x ลด)', maxBack > 30, true)
    check('ถอยเฉียงขึ้นนิดหน่อย', maxUp > 5 && maxUp < maxBack, true)
    check('ถอยแบบหันหน้าเข้าศัตรู (moonwalk)', faced, true)
    check('ศัตรูไม่ขยับ (หลบให้แค่เพื่อนร่วมทีม)', [far.pos.x, far.pos.y], [0, 0])
    let guard = 0
    while ((sc.run || buddy.pos.x !== 0 || buddy.pos.y !== 0) && guard++ < 60 * 20) sc.update(1000 / 60)
    check('นักฆ่ากลับแล้ว → เพื่อนเดินกลับเข้าช่องพอดี', [buddy.pos.x, buddy.pos.y, buddy.dodging], [0, 0, false])

    // หยุดไกลจากเพื่อน (ระยะปกติ −140) → เพื่อนไม่ต้องหลบ
    const near = kit('near', { ranged: false, walk: true })
    const dk2 = new Map([...kits, ['near', near]])
    const b2 = new B.Battle([[u('gun', 'front', 0), u('near', 'back', 1, 'assassin')], [u('gun', 'front', 0), u('gun', 'front', 1)]], 3)
    const sc2 = new S.BattleScene(b2, dk2, undefined, undefined, { intro: false, layout: 'fixed' })
    sc2.auto = false
    const buddy2 = sc2.views.find(v => v.unit.uid === '0-front-0')
    sc2.startAction(b2.unit('0-back-1'), 'attack', b2.unit('1-front-0'))
    let moved = 0
    for (let i = 0; i < 90; i++) { sc2.update(1000 / 60); moved = Math.max(moved, Math.hypot(buddy2.pos.x, buddy2.pos.y)) }
    check('ไม่ได้มาหยุดใกล้ → เพื่อนไม่ขยับ', moved, 0)
  }

  // กดท่าเดิมซ้ำ: เลือกได้ทางเดียว → เล็งให้เอง · หลายทาง → รอให้เลือก
  {
    const u = (id, row, lane, role = 'fighter') => ({ rangerId: id, row, lane, role, stats: stats({ spd: row === 'back' ? 200 : 100 }) })
    const mk = foes => {
      const b = new B.Battle([[u('gun', 'back', 0)], foes], 5)
      const sc = new S.BattleScene(b, kits, undefined, undefined, { intro: false })
      sc.auto = false
      let g = 0; while (sc.phase !== 'input' && g++ < 200) sc.update(16)
      return sc
    }
    const one = mk([u('gun', 'front', 0), u('gun', 'back', 1)])        // ตีปกติ: แถวหน้ามีตัวเดียว → เป้าเดียว
    one.chooseAction('attack')
    check('กดตีครั้งแรก → รอเลือกเป้า', [one.phase, one.pendingAction], ['input', 'attack'])
    one.chooseAction('attack')
    check('กดซ้ำ + เป้าเดียว → เล็งให้เอง', [one.phase, one.run?.target.unit.uid], ['acting', '1-front-0'])
    const two = mk([u('gun', 'front', 0), u('gun', 'front', 1)])        // แถวหน้า 2 ตัว → ต้องเลือกเอง
    two.chooseAction('attack'); two.chooseAction('attack')
    check('กดซ้ำ + เป้าหลายตัว → ยังรอให้เลือก', [two.phase, two.pendingAction], ['input', 'attack'])
  }

  // ผู้เล่นสั่งเอง: ระบบต้องรอ แล้วทำตามท่า+เป้าที่เลือก
  const battle = new B.Battle([fullTeam('gun', { spd: 200 }), fullTeam('sword')], 3)
  const scene = new S.BattleScene(battle, kits, undefined, undefined, { intro: false })
  scene.auto = false
  scene.update(16)
  check('เล่นเอง → รอคำสั่งของทีมซ้าย', [scene.phase, scene.pendingActor?.team], ['input', 0])
  for (let i = 0; i < 120; i++) scene.update(16)
  check('ยังไม่สั่ง → ไม่มีเทิร์นเดินต่อ', battle.turn, 1)
  battle.energy[0] = 1
  scene.chooseAction('skill2')
  check('พลังงานไม่พอ → เลือกสกิล 2 ไม่ได้', scene.pendingAction, null)
  scene.chooseAction('attack')
  const targets = [...scene.validTargetIds]
  check('เป้าที่เลือกได้ = แถวหน้าศัตรู', targets.every(id => id.startsWith('1-front')), true)
  scene.chooseTarget('1-back-0')
  check('คลิกแถวหลังตอนแถวหน้ายังอยู่ → ไม่รับ', scene.phase, 'input')
  scene.chooseTarget(targets[0])
  check('เลือกท่า+เป้าที่ถูก → เริ่มโจมตี', scene.phase, 'acting')
}

// ── 9. เลเยอร์ตอนโจมตี ──
// ชั้น = จุดยืนประจำช่อง · X ตี Y → ทีม X เลื่อนชั้นทั้งกลุ่มจน X อยู่เหนือ Y พอดี · กระสุนอยู่ชั้นของผู้โจมตี
// ความสูงเลเยอร์ = จุดยืนประจำช่อง · มีคนโจมตี → ทีมของตัวนั้นขึ้นไปอยู่บนอีกทีมทั้งทีม · กระสุน/เอฟเฟกต์บนสุด
{
  const FPS = 30
  const piece = [[0, 0, [1, 0, 0, 1, 50, 80], [255, 255, 255, 255]]]
  const clip = n => Array.from({ length: n }, () => piece)
  const samWith = (clips) => ({ animRate: FPS, animNames: ['_all', ...Object.keys(clips)], animations: Object.fromEntries(Object.entries(clips).map(([k, n]) => [k, clip(n)])), images: [{ name: 'p', w: 10, h: 10, m: [1, 0, 0, 1, 0, 0] }] })
  const kitFor = (tag) => {
    const bulletSam = samWith({ normal: 4, finish: 30 })
    return {
      assets: {
        id: tag, sam: samWith({ idle: 30, cast: 6, rel: 40, target: 10, knockback: 15 }),
        sprites: { p: { bitmap: { tag }, w: 10, h: 10 } },
        bullets: { bul: { sam: bulletSam, sprites: { p: { bitmap: { tag: 'shot' }, w: 10, h: 10 } }, normalName: 'normal', finishName: 'finish', flight: clip(4), impact: clip(30),
          geometry: { fileKey: tag + '-bul', normalFrames: 4, finishFrames: 30, fps: FPS, faceAnchor: null, shadowAnchor: null, spawnRef: { x: 0, y: 0 }, burstRef: { x: 0, y: 0 }, artTop: -100, decalY: null, selfArc: false, bulShadow: null } } },
        gameData: { id: tag, render: null, attackRangePt: 400, moves: { normal: { animationPart: 'bul', start: { x: 100, y: 60 }, moveSpeed: 3, angle: { start: 0, end: 0 }, hitPointRate: 100, motion: { type: 'LINEAR', enabled: true, rotation: 'FIXED', loopNormal: false } }, skill1: null, skill2: null }, skills: { skill1: { basis: null, area: null }, skill2: { basis: null, area: null } } },
        geometry: { idleName: 'idle', hitName: 'target', pivotX: 60, autoStand: { x: 60, y: 90 }, faceAnchor: { x: 60, y: -20 }, centerY: 20 },
        disposed: false, dispose() {},
      },
      config: {
        schemaVersion: 8, id: tag, name: tag, form: 'body', fps: FPS, row: 'front', element: 'red', attackRange: 'ranged',
        anchors: { ground: { x: 60, y: 90 }, hitPoint: { x: 0, y: 0 }, overhead: { x: 0, y: 0 } },
        clips: { idle: 'idle', walk: null, hitLight: 'target', hitHeavy: 'knockback', stun: 'target', die: 'knockback' },
        actions: Object.fromEntries(['attack', 'skill1', 'skill2'].map(n => [n, { castPre: null, cast: 'cast', release: 'rel', releaseFrame: 6, castSpeedCap: null, positioning: 'auto', moveSpeedOverride: null, approach: { enabled: false, stopOffset: { x: -140, y: 0 }, speed: 600, returnHome: true }, muzzle: { x: 0, y: 0 }, impactOffset: { x: 0, y: 0 }, projectile: null }])),
        stats: stats(),
      },
    }
  }
  const kits = new Map(['A', 'B', 'C', 'F'].map(k => [k, kitFor(k)]))
  const battle = new B.Battle([
    [setup('A', 'back', 0, { spd: 500 }), setup('F', 'front', 0)],
    [setup('C', 'front', 0), setup('B', 'front', 1)],
  ], 1)
  const scene = new S.BattleScene(battle, kits, undefined, undefined, { intro: false, layout: 'fixed' })   // กฎจัดชั้นอิงความสูงช่องเดิม (A 430 · F 470 · C 470 · B 585)
  scene.auto = false
  scene.update(16)
  const layersNow = () => {
    const order = []
    const ctx = new Proxy({}, {
      get: (_, k) => k === 'canvas' ? { width: 1280, height: 720 }
        : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} })
        : k === 'measureText' ? () => ({ width: 10 })
        : k === 'drawImage' ? (img) => { if (img?.tag && order[order.length - 1] !== img.tag) order.push(img.tag) }
        : () => {},
      set: () => true,
    })
    scene.render(ctx)
    return [...order].reverse()              // วาดทีหลัง = อยู่บน
  }
  // ── 8b. ทรานซิชั่นเปิดฉาก: ม่านดำ → เดินเข้าประจำที่ → START → เริ่มเทิร์นแรก ──
  {
    const b3 = new B.Battle([[setup('A', 'back', 0), setup('F', 'front', 0)], [setup('C', 'front', 0), setup('B', 'front', 1)]], 1)
    const sc = new S.BattleScene(b3, kits)
    // จุดที่ควรเจอตัวละครเมื่อยืนประจำช่องแล้ว (พิกัดจอตรรกะ)
    const atSlot = uid => {
      const p = sc.slotOf(uid)
      return sc.unitAt(p.x * S.CAMERA_ZOOM, (p.y - 80) * S.CAMERA_ZOOM)
    }
    sc.update(16)
    check('เริ่มฉาก → อยู่ในทรานซิชั่น ยังไม่เดินเทิร์น', [sc.phase, b3.turn], ['intro', 0])
    check('ตอนเปิดฉาก ตัวละครยังไม่อยู่ในช่องของตัวเอง', [atSlot('0-back-0'), atSlot('1-front-0')], [null, null])
    let guard = 0
    while (sc.phase === 'intro' && guard++ < 1200) sc.update(16)
    check('เดินเข้าที่ครบ → เริ่มรบเอง (ไม่ค้าง)', [sc.phase !== 'intro', guard < 1200], [true, true])
    check('จบทรานซิชั่น → ทุกตัวยืนในช่องของตัวเอง', [atSlot('0-back-0'), atSlot('1-front-0')], ['0-back-0', '1-front-0'])
    console.log(`   (เปิดฉากใช้เวลา ${(guard * 16 / 1000).toFixed(1)} วินาที)`)

    // คลิกจอตอนเปิดฉาก = ข้ามไปเริ่มเลย
    const b4 = new B.Battle([[setup('A', 'back', 0)], [setup('C', 'front', 0)]], 1)
    const sk = new S.BattleScene(b4, kits)
    sk.update(16)
    sk.skipIntro()
    check('คลิกข้ามเปิดฉาก → เข้าที่ทันที', [sk.phase, sk.unitAt(sk.slotOf('0-back-0').x * S.CAMERA_ZOOM, (sk.slotOf('0-back-0').y - 80) * S.CAMERA_ZOOM)], ['thinking', '0-back-0'])
  }

  // ── 8d. ความเร็ว: เปิดฉาก/จบเกมเล่น x1 เสมอ · ออโต้เปิดตอนรอสั่ง → เล่นต่อทันที ──
  {
    const mk = () => new B.Battle([[setup('A', 'back', 0), setup('F', 'front', 0)], [setup('C', 'front', 0), setup('B', 'front', 1)]], 1)
    const sc = new S.BattleScene(mk(), kits)
    sc.speed = 4
    sc.update(16)
    check('เปิดฉาก → เล่น x1 (ปุ่มยังจำ x4)', [sc.phase, sc.speed, sc.selectedSpeed], ['intro', 1, 4])
    let guard = 0
    while (sc.phase === 'intro' && guard++ < 1200) sc.update(16)
    check('จบเปิดฉาก → ใช้ความเร็วที่เลือก', sc.speed, 4)
    sc.update(16)
    check('จบเปิดฉาก → ท่ายืนที่เล่นค้างอยู่เร่งตามด้วย (x4)', sc.views.every(v => v.player.opts.speed === 4), true)
    guard = 0
    while (sc.phase !== 'ended' && guard++ < 60 * 200) sc.update(1000 / 60)
    check('จบเกม (หน้าผล) → กลับมาเล่น x1', [sc.phase, sc.speed, sc.selectedSpeed], ['ended', 1, 4])
    sc.update(16)
    check('จบเกม → ท่าที่เล่นค้างอยู่ (idle ฯลฯ) กลับเป็น x1 ด้วย', sc.views.filter(v => v.unit.alive).every(v => v.player.opts.speed === 1), true)

    const sc2 = new S.BattleScene(mk(), kits, undefined, undefined, { intro: false })
    sc2.auto = false
    sc2.update(16)
    check('ปิดออโต้ → รอผู้เล่นสั่ง', [sc2.phase, sc2.pendingActor?.team], ['input', 0])
    const turn = sc2.battle.turn
    sc2.auto = true
    check('เปิดออโต้ตอนรอสั่ง → เล่นเทิร์นนี้ทันที', [sc2.phase, sc2.pendingActor, sc2.battle.turn], ['acting', null, turn])
  }

  // ── 8e. จบเกม: ล้างสถานะทุกตัวที่ยังยืน → กลับมายืน idle (ตัวที่ชะงักอยู่ตื่นขึ้นมา) ──
  {
    const b = new B.Battle([[setup('A', 'back', 0), setup('F', 'front', 0)], [setup('C', 'front', 0), setup('B', 'front', 1)]], 1)
    const sc = new S.BattleScene(b, kits, undefined, undefined, { intro: false, timer: true })
    const stunned = b.unit('1-front-0')
    stunned.statuses.push({ type: 'stun', pct: 0, turns: 3, appliedTurn: 0 })
    stunned.statuses.push({ type: 'shield', pct: 20, turns: 3, shieldHp: 500, appliedTurn: 0 })
    b.unit('0-back-0').statuses.push({ type: 'barrier', pct: 0, turns: 2, appliedTurn: 0 })
    sc.update(16)
    const view = sc.views.find(v => v.unit === stunned)
    check('ก่อนจบ: ตัวที่ชะงักค้างท่าชะงัก', view.pose, 'stun')
    sc.timeLeft = 0
    let guard = 0
    while (sc.phase !== 'ended' && guard++ < 1200) sc.update(16)
    for (let i = 0; i < 120; i++) sc.update(16)                  // เล่นท่าตื่นจนจบ
    check('จบเกม → ทุกตัวที่ยังยืนไม่มีสถานะค้าง', b.units.filter(u => u.alive).every(u => u.statuses.length === 0), true)
    check('จบเกม → ตัวที่เคยชะงักกลับมายืน idle', [view.pose, view.reacting], ['idle', false])
  }

  // ── 8f. สกิลล้างผลด้านลบ (บัฟทั้งทีม โดนตัวผู้ใช้ด้วย) ต้องไม่ทำให้เทิร์นค้าง ──
  //     บัคเดิม: ล้างดีบัฟ → สั่งท่ายืนทับท่าร่ายของผู้ใช้ → ท่าไม่มีวันจบ → เกมไม่เดินต่อ
  {
    const cleanseAll = { kind: 'buff', cost: 2, area: 'ally_all', effects: [{ type: 'atkUp', pct: 20, turns: 2 }, { type: 'cleanse' }] }
    const caster = { ...setup('A', 'back', 0, { spd: 500 }), skills: { skill1: cleanseAll, skill2: cleanseAll } }
    const b = new B.Battle([[caster, setup('F', 'front', 0)], [setup('C', 'front', 0)]], 1)
    const sc = new S.BattleScene(b, kits, undefined, undefined, { intro: false })
    sc.auto = false
    sc.update(16)
    const me = sc.pendingActor
    for (const u of b.units.filter(u => u.team === 0)) u.statuses.push({ type: 'atkDown', pct: 20, turns: 3, appliedTurn: 0 })
    b.energy[0] = 10
    const turn0 = b.turn
    sc.chooseAction('skill1')
    let guard = 0
    while (b.turn === turn0 && guard++ < 60 * 20) sc.update(1000 / 60)
    check('สกิลล้างดีบัฟทั้งทีม → เทิร์นจบและเกมเดินต่อ (ไม่ค้าง)', [me?.uid, b.turn > turn0], ['0-back-0', true])
    check('ล้างดีบัฟได้จริง (ทั้งผู้ใช้และเพื่อน)', b.units.filter(u => u.team === 0).every(u => !u.statuses.some(st => st.type === 'atkDown')), true)
  }

  // ── 8c. นับถอยหลัง (ปิดไว้เป็นค่าเริ่มต้น เปิดด้วย timer: true): x2/x4 เดินเร็วขึ้น · หมดเวลาตัดสินที่เลือดคงเหลือ % ──
  {
    const off = new S.BattleScene(new B.Battle([[setup('A', 'back', 0)], [setup('C', 'front', 0)]], 1), kits, undefined, undefined, { intro: false })
    for (let i = 0; i < 60; i++) off.update(1000 / 60)
    check('ค่าเริ่มต้น: ไม่มีนับถอยหลัง (นาฬิกาไม่เดิน)', [off.timerOn, off.timeLeftSec], [false, S.BATTLE_TIME_SEC])

    const mk = () => new B.Battle([[setup('A', 'back', 0), setup('F', 'front', 0)], [setup('C', 'front', 0), setup('B', 'front', 1)]], 1)
    for (const [speed, rate] of [[1, 1], [2, 1.7], [4, 3.2]]) {
      const sc = new S.BattleScene(mk(), kits, undefined, undefined, { intro: false, timer: true })
      sc.speed = speed
      for (let i = 0; i < 60; i++) sc.update(1000 / 60)          // 1 วินาทีจริง
      check(`นาฬิกา x${speed}: 1 วิจริง = ${rate} วินาทีเกม`, Math.round((S.BATTLE_TIME_SEC - sc.timeLeftSec) * 100) / 100, rate, 0.02)
    }

    // หมดเวลา: ซ้ายเหลือ 60% ขวาเหลือ 40% → ซ้ายชนะ
    const b1 = mk()
    b1.units.forEach(u => { u.hp = Math.round(u.maxHp * (u.team === 0 ? 0.6 : 0.4)) })
    const r1 = b1.timeUp()
    check('หมดเวลา: เลือดเหลือมากกว่าชนะ (60% vs 40%)', [r1.winner, b1.winner, b1.over, b1.isDraw], [0, 0, true, false])
    check('หมดเวลาแล้วไม่มีเทิร์นต่อ', b1.nextActor(), null)
    // เลือดเหลือเท่ากัน → เสมอ
    const b2 = mk()
    b2.units.forEach(u => { u.hp = Math.round(u.maxHp * 0.5) })
    b2.timeUp()
    check('หมดเวลา: เลือดเหลือเท่ากัน → เสมอ', [b2.winner, b2.isDraw, b2.over], [null, true, true])
    // ตัวที่ตายแล้วไม่นับเลือด
    const b3 = mk()
    b3.units.find(u => u.team === 1).alive = false
    check('ตัวที่ล้มแล้วไม่นับเลือดคงเหลือ', b3.hpPct(1) < b3.hpPct(0), true)

    // ครบเพดานเทิร์น → จบเทิร์นนั้นแล้วบังคับจบ ตัดสินที่เลือด
    const b4 = mk()
    b4.units.forEach(u => { u.hp = Math.round(u.maxHp * (u.team === 0 ? 0.3 : 0.7)) })
    b4.turn = B.TURN_LIMIT - 2
    const a1 = b4.nextActor()
    b4.endTurn(a1)
    check('เทิร์นก่อนเพดาน: เกมยังไม่จบ', [b4.turn, b4.over], [B.TURN_LIMIT - 1, false])
    const a2 = b4.nextActor()
    b4.endTurn(a2)
    check('จบเทิร์นที่ครบเพดาน → จบเกม · เลือดมากกว่าชนะ', [b4.turn, b4.over, b4.winner], [B.TURN_LIMIT, true, 1])
    check('ครบเพดานแล้วไม่มีเทิร์นต่อ', b4.nextActor(), null)

    // ในฉาก: เวลาหมด → จบเกมเอง (ไม่เริ่มเทิร์นใหม่) พร้อมผล
    const sc = new S.BattleScene(mk(), kits, undefined, undefined, { intro: false, timer: true })
    sc.speed = 4
    let guard = 0
    while (sc.phase !== 'ended' && guard++ < 60 * 120) sc.update(1000 / 60)
    check('นาฬิกาหมด → เกมจบ (หมดเวลา หรือล้มกันหมดก่อน)', sc.phase, 'ended')
    const sc2 = new S.BattleScene(mk(), kits, undefined, undefined, { intro: false, timer: true })
    sc2.auto = false
    sc2.update(16)                                               // รอผู้เล่นสั่งอยู่
    sc2.timeLeft = 0.01
    sc2.update(16)
    check('รอสั่งอยู่แล้วหมดเวลา → ตัดสินทันที', [sc2.phase, sc2.endedByTime, sc2.pendingActor], ['ended', true, null])
  }

  // ชั้นพื้นฐาน: A 430 · F 470 (ซ้าย) · C 470 · B 585 (ขวา) · ชั้นเท่ากันฝั่งที่ถึงตาอยู่สูงกว่า
  const waiting = layersNow()
  check('รอคำสั่ง (ยังไม่เลื่อนชั้น): B → F → C → A', [scene.phase, waiting], ['input', ['B', 'F', 'C', 'A']])
  scene.chooseAction('attack')
  scene.chooseTarget('1-front-0')                      // A (430) เล็ง C (470)
  let guard = 0
  while (scene.state.shots === 0 && guard++ < 600) scene.update(16)
  scene.update(16)

  check('มีกระสุนกำลังบิน', scene.state.shots > 0, true)
  // ทีมซ้ายเลื่อนขึ้น 40 ทั้งกลุ่ม → A อยู่เหนือ C พอดี, F ตามขึ้นไป แต่ B (585) ยังสูงกว่า
  // กระสุนอยู่ชั้นของ A (บน A ใต้ F)
  const top = layersNow()
  check('A ตี C: B → F → กระสุน → A → C', top, ['B', 'F', 'shot', 'A', 'C'])

  // เทิร์นเปลี่ยนระหว่างที่กระสุนยังเล่นไม่จบ (จำลอง: จบเทิร์น A แล้วทีมขวาขึ้นเป็นทีมบน)
  // ตัวละครจัดชั้นใหม่ แต่กระสุนต้องอยู่ชั้นเดิม (470.6) — ไม่ตกลงไปอยู่เหนือ A (430)
  {
    const savedRun = scene.run, savedTeam = scene.layerTeam
    scene.run = null; scene.layerTeam = 1
    const moved = layersNow()
    check('เทิร์นเปลี่ยน → กระสุนอยู่ชั้นเดิม: B → กระสุน → C → F → A', moved, ['B', 'shot', 'C', 'F', 'A'])
    scene.run = savedRun; scene.layerTeam = savedTeam
  }

  guard = 0
  // เทิร์นจะจบได้ต้องรอกระสุน/ควัน finish ของเทิร์นนี้เล่นจนหมดก่อน
  let leftActingWithShots = false
  while ((scene.state.shots > 0 || scene.phase === 'acting') && guard++ < 2000) {
    scene.update(16)
    if (scene.phase !== 'acting' && scene.state.shots > 0) leftActingWithShots = true
  }
  check('เทิร์นยังไม่จบจนกว่า finish (ควัน) เล่นหมด', leftActingWithShots, false)
  check('จบเทิร์น → กลับชั้นพื้นฐาน: B → F → C → A', layersNow(), ['B', 'F', 'C', 'A'])

  // A (430) ตี B (585) → ทีมซ้ายเลื่อนขึ้น 155 ทั้งกลุ่ม: A บน B, F ขึ้นไปบนสุด
  scene.update(16)                                     // เทิร์นจบพอดี (thinking) → อัปเดตอีกครั้งให้เริ่มเทิร์นถัดไป (input)
  scene.chooseAction('attack'); scene.chooseTarget('1-front-1')
  guard = 0
  while (scene.state.shots === 0 && guard++ < 600) scene.update(16)
  scene.update(16)
  check('A ตี B: F → กระสุน → A → B → C', layersNow(), ['F', 'shot', 'A', 'B', 'C'])

  // ── 10. แอนิเมชันตอนโดนตี ──
  {
    const b2 = new B.Battle([[setup('A', 'front', 0, { spd: 500 })], [setup('C', 'front', 0), setup('B', 'front', 1)]], 1)
    const sc = new S.BattleScene(b2, kits, undefined, undefined, { intro: false })
    const views = uid => sc.views.find(v => v.unit.uid === uid)
    const actor = views('0-front-0')
    const run = { actor, target: views('1-front-0'), action: 'attack' }
    const hitWith = (uid, fromPct, toPct, extra = {}) => {
      const v = views(uid)
      v.player.playClip('idle', { loop: true }); v.reacting = false; v.pose = 'idle'
      v.unit.hp = Math.round(v.unit.maxHp * toPct)
      sc.presentResult(run, { energyGained: 0, lifesteal: [], outcomes: [{
        uid, hpBefore: Math.round(v.unit.maxHp * fromPct), damage: 100, crit: false, killed: false, elementMult: 1, evaded: false, immune: false,
        barrierBroken: false, shieldAbsorbed: 0, healed: 0, resisted: [], applied: [], dispelled: 0, cleansed: 0, ...extra,
      }] })
      return v.player.clipName
    }
    check('เลือด 90% → 48% (ผ่านครึ่ง) → knockback', hitWith('1-front-0', 0.9, 0.48), 'knockback')
    check('เลือด 60% → 30% (ผ่านครึ่ง) → knockback', hitWith('1-front-0', 0.6, 0.3), 'knockback')
    check('เลือด 30% → 12% (ไม่ผ่านครึ่ง) · ตีธรรมดา → ท่าเดิม (กะพริบแดง)', hitWith('1-front-0', 0.3, 0.12), 'idle')
    check('เลือด 90% → 70% · ตีธรรมดา → ไม่กระเด็น', hitWith('1-front-0', 0.9, 0.7), 'idle')

    // ชะงัก: ค้างเฟรมแรกของ target
    const C = views('1-front-0')
    C.unit.statuses.push({ type: 'stun', pct: 0, turns: 1, appliedTurn: b2.turn })
    hitWith('1-front-0', 0.4, 0.35, { applied: ['stun'] })
    check('ติดชะงัก → เล่นท่า target', C.player.clipName, 'target')
    check('ติดชะงัก → ค้างทันที ไม่เล่นท่าโดนตีก่อน', [C.player.isFrozen, C.reacting], [true, false])
    {
      // โดนสกิลที่ชะงัก + เลือดผ่านครึ่งพร้อมกัน → เข้าท่าชะงักเลย ไม่กระเด็น
      const D = views('1-front-1')
      D.player.playClip('idle', { loop: true }); D.reacting = false; D.pose = 'idle'
      D.unit.statuses = [{ type: 'stun', pct: 0, turns: 1, appliedTurn: b2.turn }]
      D.unit.hp = Math.round(D.unit.maxHp * 0.3)
      sc.presentResult({ ...run, action: 'skill1' }, { energyGained: 0, lifesteal: [], outcomes: [{
        uid: D.unit.uid, hpBefore: D.unit.maxHp, damage: 500, crit: false, killed: false, elementMult: 1, evaded: false, immune: false,
        barrierBroken: false, shieldAbsorbed: 0, healed: 0, resisted: [], applied: ['stun'], dispelled: 0, cleansed: 0,
      }] })
      check('สกิลชะงัก + เลือดผ่านครึ่ง → ท่าชะงักทันที (ไม่ knockback)', [D.player.clipName, D.player.isFrozen, D.reacting], ['target', true, false])
      D.unit.statuses = []
    }
    for (let i = 0; i < 120; i++) C.player.update(16)
    check('ชะงัก → ค้างเฟรมแรก ไม่เดิน ไม่จบ', [C.player.isEnded, C.player.isFrozen, C.player.globalFrame], [false, true, 0])
    // โดนตีจนผ่านครึ่งระหว่างชะงัก → กระเด็นแล้วกลับไปค้างท่าชะงัก
    C.unit.hp = C.unit.maxHp
    hitWith('1-front-0', 0.8, 0.45)
    check('ชะงักอยู่ + เลือดผ่านครึ่ง → knockback', C.player.clipName, 'knockback')
    for (let i = 0; i < 200; i++) C.player.update(16)
    check('กระเด็นจบ → กลับไปค้างท่าชะงัก', [C.player.clipName, C.pose], ['target', 'stun'])
    // หายชะงัก → กลับท่ายืนปกติ
    C.unit.statuses = []
    sc.update(16)
    check('หายชะงัก → เล่นท่า target ต่อจากเฟรมแรก (ไม่ค้างแล้ว)', [C.player.clipName, C.player.isFrozen, C.reacting], ['target', false, true])
    for (let i = 0; i < 60; i++) C.player.update(16)   // เดินเฉพาะท่าของ C (ไม่ให้ฉากรบเดินเทิร์นจนโดนชะงักซ้ำ)
    check('เล่นจนจบ → กลับ idle', [C.player.clipName, C.pose, C.reacting], ['idle', 'idle', false])

    // ── ไอคอนเหนือหัว: in → loop → out → หาย ──
    const phaseOf = () => C.icons.barrier?.phase ?? 'none'
    C.unit.statuses = [{ type: 'barrier', pct: 0, turns: 3, appliedTurn: b2.turn }]
    sc.stepIcons(C, 0.05)
    const p1 = phaseOf()
    sc.stepIcons(C, 0.5)
    const p2 = phaseOf()
    sc.stepIcons(C, 2)
    const p3 = phaseOf()
    C.unit.statuses = []                                  // บาเรียแตก/หมด
    sc.stepIcons(C, 0.05)
    const p4 = phaseOf()
    sc.stepIcons(C, 0.5)
    check('ไอคอนอมตะ: ได้ → in → loop (วนค้าง) → หมด → out → หาย', [p1, p2, p3, p4, phaseOf()], ['in', 'loop', 'loop', 'out', 'none'])
    C.unit.statuses = [{ type: 'stun', pct: 0, turns: 1, appliedTurn: b2.turn }]
    sc.stepIcons(C, 0.05)
    C.unit.statuses = []
    sc.stepIcons(C, 0.05)
    C.unit.statuses = [{ type: 'stun', pct: 0, turns: 1, appliedTurn: b2.turn }]
    sc.stepIcons(C, 0.05)
    check('ไอคอนชะงัก: ได้ซ้ำระหว่าง out → กลับไปเริ่ม in', C.icons.stun?.phase, 'in')
    C.unit.alive = false
    sc.stepIcons(C, 0.05)
    check('ตาย → ไอคอน out', C.icons.stun?.phase, 'out')
    C.unit.alive = true; C.unit.statuses = []
  }
}
// ผังตามจำนวนตัว: วางตัวเดียวอยู่กลางแถว · แถวหน้า/หลังไม่อยู่ระนาบเดียวกัน · ทีมขวาเป็นภาพสะท้อน
{
  const u = (team, row, lane) => ({ uid: `${team}-${row}-${lane}`, team, row, lane })
  const px = p => ({ x: Math.round(p.x * S.CAMERA_ZOOM), y: Math.round(p.y * S.CAMERA_ZOOM) })
  const full = S.formationSlots([u(0, 'front', 0), u(0, 'front', 1), u(0, 'back', 0), u(0, 'back', 1), u(0, 'back', 2)])
  check('ครบ 5 ตัว → ช่องเดิมทุกช่อง', ['0-front-0', '0-back-1'].map(k => px(full.get(k))), ['0-front-0', '0-back-1'].map(k => { const [, r, l] = k.split('-'); return px(S.slotPosition(0, r, +l)) }))
  const top = S.formationSlots([u(0, 'front', 0)]).get('0-front-0'), bottom = S.formationSlots([u(0, 'front', 1)]).get('0-front-1')
  check('แถวหน้าตัวเดียว (วางบนหรือล่าง) → ตำแหน่งกลางเดียวกัน', px(top), px(bottom))
  const f0 = S.slotPosition(0, 'front', 0), f1 = S.slotPosition(0, 'front', 1)
  check('แถวหน้าตัวเดียวอยู่ระหว่างสองช่อง', top.y > f0.y && top.y < f1.y, true)
  const one = S.formationSlots([u(0, 'front', 1), u(0, 'back', 2)])
  check('หน้า 1 + หลัง 1 → ห่างแนวตั้งอย่างน้อย 24 px (ไม่ระนาบเดียวกัน)', Math.abs(one.get('0-front-1').y - one.get('0-back-2').y) * S.CAMERA_ZOOM >= 24 - 1e-6, true)
  let worst = Infinity
  for (let nf = 0; nf <= 2; nf++) for (let nb = 0; nb <= 3; nb++) {
    const list = [...Array.from({ length: nf }, (_, i) => u(0, 'front', i)), ...Array.from({ length: nb }, (_, i) => u(0, 'back', i))]
    const m = S.formationSlots(list)
    for (let i = 0; i < nf; i++) for (let j = 0; j < nb; j++) worst = Math.min(worst, Math.abs(m.get(`0-front-${i}`).y - m.get(`0-back-${j}`).y) * S.CAMERA_ZOOM)
  }
  check('ทุกจำนวนตัว → แถวหน้า/หลังห่างแนวตั้ง ≥ 24 px', worst >= 24 - 1e-6, true)
  const two = S.formationSlots([u(0, 'back', 0), u(0, 'back', 2)])
  check('แถวหลัง 2 ตัว → ตัวเลนบนกว่าอยู่บนกว่า', two.get('0-back-0').y < two.get('0-back-2').y, true)
  const mirror = S.formationSlots([u(0, 'front', 0), u(1, 'front', 1)])
  // สะท้อนรอบกลางสนาม แล้วเลื่อนทั้งสนามไปขวา FIELD_SHIFT_X (เว้นที่ให้รางลำดับเทิร์น) → ผลรวม x เพิ่มขึ้น 2 เท่าของระยะเลื่อน
  check('ทีมขวาเป็นภาพสะท้อนของทีมซ้าย (เลื่อนขวาทั้งสนาม)', [Math.round(mirror.get('0-front-0').x + mirror.get('1-front-1').x), Math.round(mirror.get('0-front-0').y - mirror.get('1-front-1').y)], [Math.round((1280 + 2 * S.FIELD_SHIFT_X) / S.CAMERA_ZOOM), 0])
}

// ลิมิตชนหน้า (editor): ระยะแถวหน้าบนเรา ↔ แถวหน้าบนศัตรูในสนามจริง
{
  const gap = S.frontLineGap()
  check('ลิมิตชนหน้า = ระยะช่องแถวหน้าบนสองฝั่ง', gap, S.slotPosition(1, 'front', 0).x - S.slotPosition(0, 'front', 0).x, 1e-9)
  check('ลิมิตชนหน้า ≈ (1280 − 2×470) / 0.82', Math.round(gap * 10) / 10, 414.6, 0.05)
}
for (const n of ['battle', 'battleScene']) await rm(out(n), { force: true })
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
