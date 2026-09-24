// ====================================================
// sim-balance.mjs — จำลองการรบ (เฉพาะกติกา ไม่มีภาพ) หลายร้อยเกม เพื่อดูความยาวเกมและความสมดุลของตำแหน่ง
//   node scripts/sim-balance.mjs [จำนวนเกม=600]
//
// ทีมละ 5 ตัว สุ่มตำแหน่ง/ธาตุ/ค่าพลัง (ตามช่วงของตำแหน่ง) + สกิลเริ่มต้นของตำแหน่ง · ออโต้ทั้งสองฝั่ง
// จัดแถว: แทงค์/ไฟเตอร์ลงแถวหน้าก่อน ที่เหลือแถวหลัง
// เวลาจริงโดยประมาณ ≈ เทิร์น × 1.6 วิ (ที่ x2 วัดจาก probe-real-battles)
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
const B = await bundle('src/play/battle.ts', 'sim-battle')
const C = await bundle('src/lib/rangerClass.ts', 'sim-class')
const K = await bundle('src/lib/skills.ts', 'sim-skills')

const GAMES = Number(process.argv[2] ?? 600)
const SEC_PER_TURN_X2 = 1.6
const ROLES = Object.keys(C.ROLES)
const rand = B.rng(20260917)
const pick = arr => arr[Math.floor(rand() * arr.length)]
const FRONT_ROLES = new Set(['tank', 'fighter'])

function makeTeam() {
  const roles = Array.from({ length: 5 }, () => pick(ROLES))
  // แถวหน้า 2 ช่อง: ให้สายหน้า (แทงค์/ไฟเตอร์) ก่อน
  roles.sort((a, b) => Number(FRONT_ROLES.has(b)) - Number(FRONT_ROLES.has(a)))
  const slots = [['front', 0], ['front', 1], ['back', 0], ['back', 1], ['back', 2]]
  return roles.map((role, i) => ({
    rangerId: role, row: slots[i][0], lane: slots[i][1], role,
    stats: C.randomStats(role, rand), element: pick(C.ELEMENTS), skills: K.defaultSkills(role),
  }))
}

function play(seed) {
  const teams = [makeTeam(), makeTeam()]
  const b = new B.Battle(teams, seed)
  const dealt = new Map(b.units.map(u => [u.uid, 0]))
  let turns = 0
  const usage = { attack: 0, skill1: 0, skill2: 0, stunnedSkips: 0 }
  while (b.winner === null && turns < 400) {
    const actor = b.nextActor()
    if (!actor) break
    turns++
    const st = b.beginTurn(actor)
    if (st.stunned) { usage.stunnedSkips++; b.endTurn(actor); continue }
    const plan = b.planAuto(actor)
    if (!plan) break
    const { action, target } = plan
    b.commitAction(actor, action)
    usage[action]++
    const res = b.resolveAction(actor, action, target)
    dealt.set(actor.uid, dealt.get(actor.uid) + res.outcomes.reduce((n, o) => n + o.damage, 0))
    b.endTurn(actor)
  }
  return { teams, b, turns, dealt, usage }
}

const turnsList = []
const roleStats = Object.fromEntries(ROLES.map(r => [r, { games: 0, wins: 0, survived: 0, units: 0, dealt: 0 }]))
const usage = { attack: 0, skill1: 0, skill2: 0, stunnedSkips: 0 }
let timeouts = 0
for (let g = 0; g < GAMES; g++) {
  const { teams, b, turns, dealt, usage: u } = play(1000 + g)
  turnsList.push(turns)
  if (b.winner === null) timeouts++
  for (const k of Object.keys(usage)) usage[k] += u[k]
  teams.forEach((list, t) => {
    list.forEach((s, i) => {
      const unit = b.units.filter(x => x.team === t)[i]
      const r = roleStats[s.role]
      r.units++
      r.dealt += dealt.get(unit.uid)
      if (unit.alive) r.survived++
      if (b.winner === t) r.wins++
      r.games++
    })
  })
}

turnsList.sort((a, b) => a - b)
const q = p => turnsList[Math.floor((turnsList.length - 1) * p)]
const avg = turnsList.reduce((a, b) => a + b, 0) / turnsList.length
console.log(`เกม ${GAMES} · DAMAGE_SCALE ${B.DAMAGE_SCALE}`)
console.log(`เทิร์นต่อเกม: เฉลี่ย ${avg.toFixed(1)} · มัธยฐาน ${q(0.5)} · p10 ${q(0.1)} · p90 ${q(0.9)} · สูงสุด ${turnsList[turnsList.length - 1]} · ไม่จบ ${timeouts}`)
console.log(`เวลาโดยประมาณที่ x2: เฉลี่ย ${(avg * SEC_PER_TURN_X2).toFixed(0)} วิ · p90 ${(q(0.9) * SEC_PER_TURN_X2).toFixed(0)} วิ`)
const totalAct = usage.attack + usage.skill1 + usage.skill2
console.log(`ท่าที่ใช้: ตีปกติ ${(usage.attack / totalAct * 100).toFixed(0)}% · สกิล1 ${(usage.skill1 / totalAct * 100).toFixed(0)}% · สกิล2 ${(usage.skill2 / totalAct * 100).toFixed(0)}% · เทิร์นที่ชะงัก ${usage.stunnedSkips}`)
console.log('\nตำแหน่ง     อยู่ในทีมที่ชนะ  รอดจนจบ  ดาเมจเฉลี่ย/เกม')
const dealtAvg = ROLES.reduce((n, r) => n + roleStats[r].dealt / Math.max(1, roleStats[r].units), 0) / ROLES.length
for (const r of ROLES) {
  const s = roleStats[r]
  console.log(`${C.ROLES[r].label.padEnd(10)} ${(s.wins / s.games * 100).toFixed(1).padStart(8)}%  ${(s.survived / s.units * 100).toFixed(0).padStart(6)}%  ${(s.dealt / s.units).toFixed(0).padStart(8)} (${(s.dealt / s.units / dealtAvg * 100).toFixed(0)}%)`)
}

for (const n of ['sim-battle', 'sim-class', 'sim-skills']) await rm(out(n), { force: true })
