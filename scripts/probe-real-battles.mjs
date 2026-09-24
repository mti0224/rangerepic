// ====================================================
// probe-real-battles.mjs — รบ 5v5 ด้วยไฟล์จริงของทุกเรนเจอร์ในเครื่อง แบบไม่เปิดเบราว์เซอร์
//   node scripts/probe-real-battles.mjs [จำนวนรอบ] [ความเร็ว=2]
//
// ไม่วาดภาพ แต่เดินเวลาครบทุกขั้น (เดิน/ร่าย/ปล่อย/กระสุน/ตาย) — ใช้จับเทิร์นที่ค้าง
// ขนาดสไปรต์อ่านจาก plist ตรงๆ เพราะการคำนวณกรอบใช้แค่กว้าง/สูง
// ====================================================

import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = process.cwd()
const out = n => path.join(ROOT, 'node_modules', `.probe-${n}.mjs`)
const bundle = async (entry, n) => {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out(n), logLevel: 'silent', alias: { '@': path.join(ROOT, 'src') } })
  return import(pathToFileURL(out(n)).href)
}
const { SAMParser } = await bundle('src/lib/animation/samParser.ts', 'sam')
const { rangerGeometry, bulletGeometry } = await bundle('src/lib/rangerAssets.ts', 'assets')
const { defaultRangerConfig, migrateRangerConfig } = await bundle('src/lib/rangerConfig.ts', 'cfg')
const { Battle } = await bundle('src/play/battle.ts', 'battle')
const { BattleScene } = await bundle('src/play/battleScene.ts', 'scene')

const spritesFrom = async file => {
  const xml = await fs.readFile(file, 'utf8')
  const map = {}
  for (const m of xml.matchAll(/<key>([^<]+\.png)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g)) {
    const rect = (m[2].match(/<key>(?:textureRect|frame)<\/key>\s*<string>([^<]+)<\/string>/) ?? [])[1]
    const nums = rect?.match(/-?\d+/g)?.map(Number)
    if (nums && nums.length >= 4) map[m[1]] = { bitmap: null, w: nums[2], h: nums[3] }
  }
  return map
}
const samFrom = async file => { const b = await fs.readFile(file); return new SAMParser(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) }

const dir = path.join(ROOT, 'public', 'rangers')
const ids = (await fs.readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()
const kits = new Map()
for (const id of ids) {
  const d = path.join(dir, id)
  const sam = await samFrom(path.join(d, 'body.sam'))
  const sprites = await spritesFrom(path.join(d, 'body.plist'))
  const gameData = JSON.parse(await fs.readFile(path.join(d, 'gamedata.json'), 'utf8').catch(() => 'null'))
  const bullets = {}
  for (const s of ['bul', 'bul2', 'bul3']) {
    try {
      const bs = await samFrom(path.join(d, s + '.sam'))
      const bsp = await spritesFrom(path.join(d, s + '.plist'))
      const info = bulletGeometry(id, s, bs, bsp, gameData)
      if (info) bullets[s] = { sam: bs, sprites: bsp, normalName: info.normalName, finishName: info.finishName, flight: bs.animations[info.normalName] ?? [], impact: info.finishName ? bs.animations[info.finishName] ?? [] : [], geometry: info.geometry }
    } catch { /* ไม่มีไฟล์ */ }
  }
  const assets = { id, sam, sprites, bullets, gameData, geometry: rangerGeometry(sam, sprites, gameData), disposed: false, dispose() {} }
  let config
  try { config = migrateRangerConfig(JSON.parse(await fs.readFile(path.join(d, 'ranger.json'), 'utf8'))) } catch { config = defaultRangerConfig(id, sam, Object.keys(bullets)) }
  kits.set(id, { assets, config })
}

const ROUNDS = Number(process.argv[2] ?? 6)
const SPEED = Number(process.argv[3] ?? 2)
const times = []
let timeUps = 0
const SLOTS = [['front', 0], ['front', 1], ['back', 0], ['back', 1], ['back', 2]]
let worst = { stuck: 0, who: '' }
let failures = 0

for (let round = 0; round < ROUNDS; round++) {
  // หมุนเวียนให้ทุกตัวได้ลงสนามครบในหลายรอบ
  const team = t => SLOTS.map(([row, lane], i) => {
    const id = ids[(round * 10 + t * 5 + i) % ids.length]
    const c = kits.get(id).config
    return { rangerId: id, row, lane, stats: c.stats, element: c.element, category: c.category, role: c.role, skills: c.skills, passives: c.passives }
  })
  const battle = new Battle([team(0), team(1)], 1000 + round)
  const scene = new BattleScene(battle, kits, undefined, undefined, { intro: false })
  scene.speed = SPEED

  const STEP = 1000 / 60
  let t = 0, lastTurn = 0, stuck = 0, maxStuck = 0, stuckWho = ''
  while (scene.phase !== 'ended' && t < 900) {
    scene.update(STEP); t += STEP / 1000
    if (battle.turn === lastTurn) {
      stuck += STEP / 1000
      if (stuck > maxStuck) { maxStuck = stuck; stuckWho = scene.state.acting ?? '' }
    } else { lastTurn = battle.turn; stuck = 0 }
    if (stuck > 20) break
  }
  const actingId = stuckWho ? battle.unit(stuckWho)?.rangerId : ''
  const ok = scene.phase === 'ended'
  if (!ok) failures++
  if (maxStuck > worst.stuck) worst = { stuck: maxStuck, who: actingId }
  if (ok) times.push(t)
  if (battle.timeUpResult) timeUps++
  console.log(`${ok ? '✓' : '✗'} รอบ ${round + 1}: ${battle.turn} เทิร์น · ${t.toFixed(0)} วิ (x${SPEED}) · ชนะ: ${battle.winner === 0 ? 'ซ้าย' : battle.winner === 1 ? 'ขวา' : '—'} · เทิร์นยาวสุด ${maxStuck.toFixed(2)} วิ (${actingId})`)
}

times.sort((a, b) => a - b)
console.log(`
หมดเวลา ${timeUps}/${ROUNDS} เกม`)
const pick = q => times[Math.min(times.length - 1, Math.floor(q * times.length))] ?? 0
console.log(`\nเวลาจริงต่อเกม (x${SPEED}): เฉลี่ย ${(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length)).toFixed(0)} วิ · มัธยฐาน ${pick(0.5).toFixed(0)} · p90 ${pick(0.9).toFixed(0)} · สูงสุด ${pick(1).toFixed(0)}`)
console.log(`\n${failures ? `✗ ค้าง ${failures} รอบ` : '✓ ทุกรอบจบได้ ไม่ค้าง'} · เทิร์นยาวสุดทั้งหมด ${worst.stuck.toFixed(2)} วิ (${worst.who})`)
for (const n of ['sam', 'assets', 'cfg', 'battle', 'scene']) await fs.rm(out(n), { force: true })
process.exit(failures ? 1 : 0)
