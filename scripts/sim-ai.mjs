// ====================================================
// sim-ai.mjs — วัดความฉลาดของ AI: ทีมเดียวกันเป๊ะ (ตัว ค่าพลัง สกิล ธาตุ) ต่างกันแค่วิธีคิด
//   node scripts/sim-ai.mjs [จำนวนเกม=600]
//
// smart vs basic (แบบเดิม) หรือ random: node scripts/sim-ai.mjs 600 random · สลับฝั่งทุกเกม (ตัดผลของฝั่งออก) · ถ้า AI ไม่ได้ฉลาดกว่าจริง จะชนะราว 50%
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
const B = await bundle('src/play/battle.ts', 'ai-battle')
const C = await bundle('src/lib/rangerClass.ts', 'ai-class')
const K = await bundle('src/lib/skills.ts', 'ai-skills')

const GAMES = Number(process.argv[2] ?? 600)
const OPPONENT = process.argv[3] ?? 'basic'
const ROLES = Object.keys(C.ROLES)
const rand = B.rng(777)
const pick = arr => arr[Math.floor(rand() * arr.length)]
const FRONT = new Set(['tank', 'fighter'])

function makeTeam() {
  const roles = Array.from({ length: 5 }, () => pick(ROLES)).sort((a, b) => Number(FRONT.has(b)) - Number(FRONT.has(a)))
  const slots = [['front', 0], ['front', 1], ['back', 0], ['back', 1], ['back', 2]]
  return roles.map((role, i) => ({
    rangerId: role, row: slots[i][0], lane: slots[i][1], role,
    stats: C.randomStats(role, rand), element: pick(C.ELEMENTS), skills: K.defaultSkills(role),
  }))
}
const clone = t => JSON.parse(JSON.stringify(t))

function play(teamA, teamB, levels, seed) {
  const b = new B.Battle([teamA, teamB], seed)
  b.aiLevel = levels
  const usage = [{ attack: 0, skill: 0 }, { attack: 0, skill: 0 }]
  let turns = 0
  while (b.winner === null && turns < 400) {
    const actor = b.nextActor()
    if (!actor) break
    turns++
    if (b.beginTurn(actor).stunned) { b.endTurn(actor); continue }
    const plan = b.planAuto(actor)
    if (!plan) break
    b.commitAction(actor, plan.action)
    usage[actor.team][plan.action === 'attack' ? 'attack' : 'skill']++
    b.resolveAction(actor, plan.action, plan.target)
    b.endTurn(actor)
  }
  return { winner: b.winner, turns, usage }
}

let smartWins = 0, turns = 0
const use = { smart: { attack: 0, skill: 0 }, random: { attack: 0, skill: 0 } }
for (let g = 0; g < GAMES; g++) {
  const team = makeTeam()
  const smartLeft = g % 2 === 0
  const r = play(clone(team), clone(team), smartLeft ? ['smart', OPPONENT] : [OPPONENT, 'smart'], 9000 + g)
  const smartTeam = smartLeft ? 0 : 1
  if (r.winner === smartTeam) smartWins++
  turns += r.turns
  for (const k of ['attack', 'skill']) {
    use.smart[k] += r.usage[smartTeam][k]
    use.random[k] += r.usage[1 - smartTeam][k]
  }
}
const ratio = u => (u.skill / Math.max(1, u.attack + u.skill) * 100).toFixed(0)
console.log(`เกม ${GAMES} (ทีมเหมือนกันเป๊ะ) · smart vs ${OPPONENT} · AI ฉลาดชนะ ${(smartWins / GAMES * 100).toFixed(1)}% · เทิร์นเฉลี่ย ${(turns / GAMES).toFixed(1)}`)
console.log(`ใช้สกิล: ฉลาด ${ratio(use.smart)}% ของเทิร์น · สุ่ม ${ratio(use.random)}%`)

for (const n of ['ai-battle', 'ai-class', 'ai-skills']) await rm(out(n), { force: true })
