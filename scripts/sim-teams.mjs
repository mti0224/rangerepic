// ====================================================
// sim-teams.mjs — รบ 2 ทีมที่จัดจริง (ใช้ ranger.json ของแต่ละตัว) หลายร้อยเกม ดูว่าสมดุลไหม
//   node scripts/sim-teams.mjs [จำนวนเกม=1000] [ไฟล์ทีม.json] [--search]   (--search = AI มองล่วงหน้าแบบในเกมจริง · ช้ากว่า ~30 เท่า)
//
// ไฟล์ทีม: { "left": { "front-0": id, ... }, "right": { ... } } — ไม่ใส่ = ทีมเริ่มต้นด้านล่าง
// สลับฝั่งซ้าย/ขวาครึ่งหนึ่ง (ฝั่งซ้ายได้เล่นก่อนเล็กน้อยตอน Speed เท่ากัน) → ตัดผลของฝั่งออก
// ====================================================

import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const out = n => path.join(ROOT, 'node_modules', `.tmp-${n}.mjs`)
const bundle = async (entry, n) => {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out(n), logLevel: 'silent', alias: { '@': path.join(ROOT, 'src') } })
  return import(pathToFileURL(out(n)).href)
}
const B = await bundle('src/play/battle.ts', 'simt-battle')
const R = await bundle('src/lib/rangerConfig.ts', 'simt-config')

const GAMES = Number(process.argv[2] ?? 1000)
const SEARCH = process.argv.includes('--search')
// ทีมที่จูนแล้ว (ซ้ายชนะ ~55% · ราว 49 เทิร์น) — ดูที่มาใน scripts/apply-team-balance.mjs
const DEFAULT_TEAMS = {
  left: { 'front-0': 'u1618e-ka', 'front-1': 'u1296e-db', 'back-0': 'u1260e-brown', 'back-1': 'u1524e-ak', 'back-2': 'u1438e-iz' },
  right: { 'front-0': 'u1541e-ri', 'front-1': 'u1483e-brown', 'back-0': 'u1550e-moon', 'back-1': 'u1317e-brown', 'back-2': 'u1631e-sally' },
}
const teamFile = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null
const teams = teamFile ? JSON.parse(await fs.readFile(teamFile, 'utf8')) : DEFAULT_TEAMS

const configs = new Map()
for (const id of [...Object.values(teams.left), ...Object.values(teams.right)]) {
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, 'public', 'rangers', id, 'ranger.json'), 'utf8'))
  configs.set(id, R.migrateRangerConfig(raw))
}
const setups = side => Object.entries(side).map(([slot, id]) => {
  const [row, lane] = slot.split('-')
  const c = configs.get(id)
  return { rangerId: id, row, lane: Number(lane), stats: c.stats, element: c.element, category: c.category, role: c.role, skills: c.skills, passives: c.passives }
})
/** ทดลองเท่านั้น: RIGHT_POWER=1.1 → ทีมขวา HP/ATK ×1.1 (หาจุดสมดุลก่อนค่อยแปลงเป็นค่าจริง) */
const RIGHT_POWER = Number(process.env.RIGHT_POWER ?? 1)
const powered = list => list.map(u => ({ ...u, stats: { ...u.stats, hp: Math.round(u.stats.hp * RIGHT_POWER), atk: Math.round(u.stats.atk * RIGHT_POWER) } }))

function play(A, Bt, seed) {
  const b = new B.Battle([A, Bt], seed)
  // มองล่วงหน้าด้วยการจำลอง (AI จริงในเกม) ช้ากว่ามาก → ปิดไว้เป็นค่าเริ่มต้น · --search = เปิด
  b.aiSearch = SEARCH
  const dealt = new Map(b.units.map(u => [u.uid, 0]))
  const casts = new Map(b.units.map(u => [u.uid, { attack: 0, skill1: 0, skill2: 0 }]))
  const hits = []
  const stuns = new Map(b.units.map(u => [u.uid, 0]))   // ดาเมจต่อครั้งเป็น % ของ HP สูงสุด + ฆ่าจากเลือดเกิน 70% ในทีเดียวไหม
  let turns = 0
  while (b.winner === null && turns < 400) {
    const actor = b.nextActor()
    if (!actor) break
    turns++
    if (b.beginTurn(actor).stunned) { b.endTurn(actor); continue }
    const plan = b.planAuto(actor)
    if (!plan) break
    const { action, target } = plan
    b.commitAction(actor, action)
    casts.get(actor.uid)[action]++
    const hpBefore = new Map(b.units.map(u => [u.uid, u.hp]))
    const res = b.resolveAction(actor, action, target)
    stuns.set(actor.uid, stuns.get(actor.uid) + res.outcomes.filter(o => o.applied.includes('stun')).length)
    for (const o of res.outcomes) {
      if (o.damage <= 0) continue
      const u = b.unit(o.uid)
      hits.push({ pct: o.damage / u.maxHp * 100, oneShot: o.killed && hpBefore.get(o.uid) / u.maxHp >= 0.7, skill: action !== 'attack', who: actor.rangerId + ' ' + action + ' → ' + u.rangerId })
    }
    dealt.set(actor.uid, dealt.get(actor.uid) + res.outcomes.reduce((n, o) => n + o.damage, 0))
    b.endTurn(actor)
  }
  return { b, turns, dealt, hits, stuns, casts }
}

const L = setups(teams.left), Rt = powered(setups(teams.right))
let leftWins = 0, turnsSum = 0, marginSum = 0
const turnList = []
const allHits = []
const perUnit = new Map([...L.map(u => ['L ' + u.rangerId, { dealt: 0, alive: 0 }]), ...Rt.map(u => ['R ' + u.rangerId, { dealt: 0, alive: 0 }])])
for (let g = 0; g < GAMES; g++) {
  const swap = g % 2 === 1
  const { b, turns, dealt, hits, stuns, casts } = play(swap ? Rt : L, swap ? L : Rt, 5000 + g)
  for (const h of hits) allHits.push(h)
  turnsSum += turns
  turnList.push(turns)
  const leftTeamIndex = swap ? 1 : 0
  if (b.winner === leftTeamIndex) leftWins++
  if (b.winner !== null) {
    const w = b.units.filter(u => u.team === b.winner)
    marginSum += w.reduce((n, u) => n + u.hp, 0) / w.reduce((n, u) => n + u.maxHp, 0)
  }
  for (const u of b.units) {
    const side = u.team === leftTeamIndex ? 'L ' : 'R '
    const s = perUnit.get(side + u.rangerId)
    s.dealt += dealt.get(u.uid)
    s.stunsApplied = (s.stunsApplied ?? 0) + stuns.get(u.uid)
    s.skills = (s.skills ?? 0) + casts.get(u.uid).skill1 + casts.get(u.uid).skill2
    if (u.alive) s.alive++
  }
}
console.log(`เกม ${GAMES} · ทีมซ้ายชนะ ${(leftWins / GAMES * 100).toFixed(1)}% · เทิร์นเฉลี่ย ${(turnsSum / GAMES).toFixed(1)} · ทีมที่ชนะเหลือเลือด ${(marginSum / GAMES * 100).toFixed(0)}%`)
turnList.sort((a, b) => a - b)
const pctl = p => turnList[Math.min(turnList.length - 1, Math.floor(turnList.length * p))]
console.log(`เทิร์น: p50 ${pctl(0.5)} · p90 ${pctl(0.9)} · p99 ${pctl(0.99)} · p99.9 ${pctl(0.999)} · สูงสุด ${turnList.at(-1)}`)
{
  const pcts = allHits.map(h => h.pct).sort((a, c) => a - c)
  const q = p => pcts[Math.floor((pcts.length - 1) * p)].toFixed(0)
  const oneShots = allHits.filter(h => h.oneShot)
  const worst = new Map()
  for (const h of allHits.filter(x => x.pct >= 45)) worst.set(h.who, (worst.get(h.who) ?? 0) + 1)
  console.log(`ดาเมจต่อครั้ง (% HP สูงสุด): มัธยฐาน ${q(0.5)} · p90 ${q(0.9)} · p99 ${q(0.99)} · สูงสุด ${q(1)} · ฆ่าจากเลือด ≥70% ในทีเดียว ${oneShots.length} ครั้ง (${(oneShots.length / GAMES).toFixed(2)}/เกม)`)
  const top = [...worst].sort((a, c) => c[1] - a[1]).slice(0, 6)
  if (top.length) console.log('  ตีแรง ≥45% บ่อยสุด: ' + top.map(([w, n]) => `${w} ×${n}`).join(' · '))
}
for (const [k, s] of perUnit) {
  const c = configs.get(k.slice(2))
  console.log(`  ${k.padEnd(16)} ${c.element.padEnd(5)} ${c.role.padEnd(8)} ดาเมจ/เกม ${(s.dealt / GAMES).toFixed(0).padStart(6)} · รอด ${(s.alive / GAMES * 100).toFixed(0).padStart(3)}% · ใช้สกิล ${(s.skills / GAMES).toFixed(1)} · ติดชะงักใส่ศัตรู ${(s.stunsApplied / GAMES).toFixed(1)}`)
}
for (const n of ['simt-battle', 'simt-config']) await fs.rm(out(n), { force: true })
