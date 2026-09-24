// ====================================================
// analyze-rules.mjs — วิเคราะห์สมดุลของกติกาด้วยการรบทีมสุ่มหลายพันเกม (ใช้ ranger.json ของทุกตัวที่ตั้งสกิลแล้ว)
//   node scripts/analyze-rules.mjs [จำนวนเกม=4000] [--search] [--all]   (--search = AI มองล่วงหน้าแบบในเกมจริง · ช้ากว่า ~30 เท่า · --all = อัตราชนะทุกตัว)
//
// รายงาน: ความยาวเกม · เกมที่ครบเพดานเทิร์น/เสมอ · อัตราชนะตามตำแหน่ง/ธาตุ/ความเร็ว ·
//         เรนเจอร์ที่ชนะบ่อยผิดปกติ (โกง) / แพ้บ่อยผิดปกติ (อ่อน) · ความถี่สถานะ · ดาเมจต่อเนื่อง · ดูดเลือด
// อัตราชนะของ "สิ่งหนึ่ง" = อัตราชนะของทีมที่มีสิ่งนั้น (สลับฝั่งทุกเกมคู่ ตัดผลของฝั่งออก)
// ====================================================

import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const out = n => path.join(ROOT, 'node_modules', `.tmp-${n}.mjs`)
const bundle = async (e, n) => {
  await build({ entryPoints: [e], bundle: true, format: 'esm', platform: 'node', outfile: out(n), logLevel: 'silent', alias: { '@': path.join(ROOT, 'src') } })
  return import(pathToFileURL(out(n)).href)
}
const B = await bundle('src/play/battle.ts', 'ar-battle')
const R = await bundle('src/lib/rangerConfig.ts', 'ar-config')
const C = await bundle('src/lib/rangerClass.ts', 'ar-class')

const GAMES = Number(process.argv[2] ?? 4000)
const SEARCH = process.argv.includes('--search')
const cfg = new Map()
for (const id of await fs.readdir(path.join(ROOT, 'public', 'rangers'))) {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(ROOT, 'public', 'rangers', id, 'ranger.json'), 'utf8'))
    if (!raw.skills) continue
    cfg.set(id, R.migrateRangerConfig(raw))
  } catch { /* ยังไม่มี ranger.json */ }
}
const ids = [...cfg.keys()]

let seed = 7
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const SLOTS = [['front', 0], ['front', 1], ['back', 0], ['back', 1], ['back', 2]]
const FRONT_ROLES = new Set(['tank', 'fighter'])
/** ทีมสุ่มแบบคนจัด: แทงค์/ไฟเตอร์ไปแถวหน้าก่อน */
function randomTeam() {
  const pick = [...ids].sort(() => rnd() - 0.5).slice(0, 5)
  pick.sort((a, b) => Number(FRONT_ROLES.has(cfg.get(b).role)) - Number(FRONT_ROLES.has(cfg.get(a).role)))
  return pick.map((id, i) => {
    const c = cfg.get(id)
    return { rangerId: id, row: SLOTS[i][0], lane: SLOTS[i][1], stats: c.stats, element: c.element, category: c.category, role: c.role, skills: c.skills, passives: c.passives }
  })
}

const turns = []
let limitGames = 0, draws = 0
const tally = new Map()   // key → { games, wins }
const add = (key, won) => { const t = tally.get(key) ?? { games: 0, wins: 0 }; t.games++; if (won) t.wins++; tally.set(key, t) }
const statusCount = new Map()
let hits = 0, capped = 0, oneShots = 0, dotDamage = 0, totalDamage = 0, lifestealHeal = 0, stunTurns = 0, actorTurns = 0, advances = 0

function play(A, Bt, s) {
  const b = new B.Battle([A, Bt], s)
  // มองล่วงหน้าด้วยการจำลอง (AI จริงในเกม) ช้ากว่ามาก → ปิดไว้เป็นค่าเริ่มต้น · --search = เปิด
  b.aiSearch = SEARCH
  let t = 0
  while (!b.over && t < 400) {
    const a = b.nextActor()
    if (!a) break
    t++
    actorTurns++
    const start = b.beginTurn(a)
    dotDamage += start.dot ?? 0
    if (start.stunned || !a.alive) { if (start.stunned) stunTurns++; b.endTurn(a); continue }
    const p = b.planAuto(a)
    if (!p) break
    b.commitAction(a, p.action)
    const res = b.resolveAction(a, p.action, p.target)
    for (const o of res.outcomes) {
      totalDamage += o.damage
      const tu = b.unit(o.uid)
      if (o.killed && o.hpBefore >= tu.maxHp * 0.7) oneShots++
      if (o.damage > 0) { hits++; if (o.damage >= tu.maxHp * B.MAX_HIT_RATIO * b.overtimeMult - 1) capped++ }
      for (const st of o.applied) statusCount.set(st, (statusCount.get(st) ?? 0) + 1)
      advances += o.advanced ? 1 : 0
    }
    lifestealHeal += (res.lifesteal ?? []).reduce((n, l) => n + l.amount, 0)
    b.endTurn(a)
  }
  return { b, t }
}

const elementEdge = (A, Bt) => {
  // ธาตุได้เปรียบรวม: ทุกคู่ (เรา → เขา) ×ตัวคูณ − (เขา → เรา)
  let s = 0
  for (const x of A) for (const y of Bt) s += Math.log2(C.elementMultiplier(x.element, y.element)) - Math.log2(C.elementMultiplier(y.element, x.element))
  return s
}

for (let g = 0; g < GAMES; g++) {
  const A = randomTeam(), Bt = randomTeam()
  for (const swap of [false, true]) {
    const L = swap ? Bt : A, Rt = swap ? A : Bt
    const { b, t } = play(L, Rt, 1000 + g * 2 + (swap ? 1 : 0))
    turns.push(t)
    if (b.timeUpResult) limitGames++
    if (b.isDraw) { draws++; continue }
    for (const [team, list, foes] of [[0, L, Rt], [1, Rt, L]]) {
      const won = b.winner === team
      add('side ' + (team === 0 ? 'left' : 'right'), won)
      for (const u of list) add('ranger ' + u.rangerId, won)
      for (const role of new Set(list.map(u => u.role))) add('has ' + role, won)
      const nSup = list.filter(u => u.role === 'support').length
      add('supports ' + nSup, won)
      const edge = elementEdge(list, foes)
      add('element edge ' + (edge > 2 ? '++' : edge > 0 ? '+' : edge === 0 ? '0' : edge >= -2 ? '-' : '--'), won)
      const spd = list.reduce((n, u) => n + u.stats.spd, 0) - foes.reduce((n, u) => n + u.stats.spd, 0)
      add('speed ' + (spd > 40 ? 'faster++' : spd > 0 ? 'faster' : 'slower'), won)
    }
  }
}

const n = turns.length
turns.sort((a, b) => a - b)
const q = p => turns[Math.min(n - 1, Math.floor(n * p))]
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) : '-') + '%'
console.log(`เรนเจอร์ ${ids.length} ตัว · ${n} เกม`)
console.log(`เทิร์น: เฉลี่ย ${(turns.reduce((a, b) => a + b, 0) / n).toFixed(1)} · p50 ${q(0.5)} · p90 ${q(0.9)} · p99 ${q(0.99)} · ครบเพดาน ${pct(limitGames, n)} · เสมอ ${pct(draws, n)}`)
console.log(`ชะงักกินเทิร์น ${pct(stunTurns, actorTurns)} ของเทิร์นทั้งหมด · ดาเมจต่อเนื่อง ${pct(dotDamage, totalDamage + dotDamage)} ของดาเมจ · ดูดเลือด ${(lifestealHeal / n).toFixed(0)}/เกม · ดึงเทิร์น ${(advances / n).toFixed(2)}/เกม`)
const show = prefix => {
  const rows = [...tally].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v])
  rows.sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games)
  return rows.map(([k, v]) => `${k} ${pct(v.wins, v.games)} (${v.games})`).join(' · ')
}
console.log(`ตีโดนเพดานดาเมจ (${B.MAX_HIT_RATIO * 100}% ของ HP สูงสุด) ${pct(capped, hits)} ของการตีที่เข้า · ล้มในทีเดียวจากเลือด ≥70% ${(oneShots / n).toFixed(2)}/เกม`)
console.log('ฝั่ง:', show('side '))
console.log('มีตำแหน่ง:', show('has '))
console.log('จำนวนซัพพอร์ต:', show('supports '))
console.log('ธาตุได้เปรียบ:', show('element edge '))
console.log('ความเร็วรวม:', show('speed '))
const rangers = [...tally].filter(([k]) => k.startsWith('ranger ')).map(([k, v]) => ({ id: k.slice(7), rate: v.wins / v.games, games: v.games }))
rangers.sort((a, b) => b.rate - a.rate)
const line = r => `${r.id} ${cfg.get(r.id).role} ${(r.rate * 100).toFixed(0)}%`
console.log('เรนเจอร์ชนะบ่อยสุด:', rangers.slice(0, 6).map(line).join(' · '))
console.log('เรนเจอร์แพ้บ่อยสุด:', rangers.slice(-6).map(line).join(' · '))
if (process.argv.includes('--all')) for (const r of rangers) console.log(`  ${line(r)} · ${cfg.get(r.id).name}`)
const spread = rangers.map(r => r.rate)
const mean = spread.reduce((a, b) => a + b, 0) / spread.length
console.log(`ความต่างอัตราชนะรายตัว (SD): ${(Math.sqrt(spread.reduce((a, b) => a + (b - mean) ** 2, 0) / spread.length) * 100).toFixed(1)}%`)
console.log('สถานะที่ติดบ่อย/เกม:', [...statusCount].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(' · '))
for (const x of ['ar-battle', 'ar-config', 'ar-class']) await fs.rm(out(x), { force: true })
