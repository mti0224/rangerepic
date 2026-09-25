// ====================================================
// sim-real.mjs — จำลองเกมด้วยเรนเจอร์จริง (ranger.json ที่อนุมัติแล้ว + แถวพิเศษ) แล้วตรวจการตัดสินใจของ AI
//   node scripts/sim-real.mjs [จำนวนเกม=200] [ฝั่งซ้าย=smart] [ฝั่งขวา=smart]
//   node scripts/sim-real.mjs 200 --vs=path/to/ai.ts   ← AI ปัจจุบัน vs AI อีกไฟล์ (เช่นเวอร์ชันเก่าจาก git show) สลับฝั่งทุกเกม
//
// ตรวจทุกท่าที่ AI เลือก:
//   ผิดทีม       สกิลโจมตีเล็งเพื่อน / สกิลบัฟเล็งศัตรู (บัค — ต้องเป็น 0)
//   สกิลเปล่า    สกิลโจมตีที่ไม่โดนใครเลย (ทุกเป้าติดบาเรียอมตะ · ไม่มีทะลุอมตะ)
//   ฮีลเปล่า     สกิลฮีล (ฮีล/ฟื้นฟู/เพิ่ม Cost เท่านั้น) ใช้ตอนเลือดที่ขาดรวม < 30% ของยอดฮีล
// ====================================================

import { build } from 'esbuild'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const out = n => path.join(ROOT, 'node_modules', `.tmp-${n}.mjs`)
const bundle = async (entry, n) => {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out(n), logLevel: 'silent', alias: { '@': path.join(ROOT, 'src') } })
  return import(pathToFileURL(out(n)).href)
}
const B = await bundle('src/play/battle.ts', `real-battle-${process.pid}`)

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const VS = process.argv.find(a => a.startsWith('--vs='))?.slice(5)
const ME = process.argv.find(a => a.startsWith('--me='))?.slice(5)
const SEED = Number(process.argv.find(a => a.startsWith('--seed='))?.slice(7) ?? 4242)
const GAMES = Number(args[0] ?? 200)
const LEVELS = [args[1] ?? 'smart', args[2] ?? 'smart']
// AI คู่แข่ง: import './battle' ในไฟล์นั้น → ชี้ไปที่ src/play/battle.ts เสมอ (วางไฟล์ไว้ที่ไหนก็ได้)
const loadAI = async (file, n) => {
  await build({
    entryPoints: [path.resolve(file)], bundle: true, format: 'esm', platform: 'node', outfile: out(n), logLevel: 'silent',
    alias: { '@': path.join(ROOT, 'src') },
    plugins: [{ name: 'battle', setup(p) { p.onResolve({ filter: /^\.\/battle$/ }, () => ({ path: path.join(ROOT, 'src/play/battle.ts') })) } }],
  })
  return (await import(pathToFileURL(out(n)).href)).BattleAI
}
// --me: ฝั่ง "AI ปัจจุบัน" ใช้ไฟล์นี้แทน src/play/ai.ts (ไว้เทียบหลายเวอร์ชันพร้อมกัน)
const tag = `${process.pid}`
const Rival = VS ? await loadAI(VS, `real-rival-${tag}`) : null
const Me = ME ? await loadAI(ME, `real-me-${tag}`) : null

const who = Rival ? ['AI ปัจจุบัน', 'AI คู่แข่ง'] : ['ซ้าย', 'ขวา']

const dir = path.join(ROOT, 'public', 'rangers')
const pool = []
for (const id of await readdir(dir)) {
  const cfg = await readFile(path.join(dir, id, 'ranger.json'), 'utf8').then(JSON.parse).catch(() => null)
  if (cfg?.approved && cfg.stats && cfg.skills) pool.push(cfg)
}

const rand = B.rng(SEED)
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
const FRONT = new Set(['tank', 'fighter'])
const setupOf = (c, row, lane) => ({ rangerId: c.id, row, lane, stats: c.stats, element: c.element, category: c.category, role: c.role, skills: c.skills, passives: c.passives ?? [] })
function makeTeam() {
  const picks = shuffle([...pool]).slice(0, 7)
  const field = picks.slice(0, 5).sort((a, b) => Number(FRONT.has(b.role)) - Number(FRONT.has(a.role)))
  const slots = [['front', 0], ['front', 1], ['back', 0], ['back', 1], ['back', 2]]
  return { field: field.map((c, i) => setupOf(c, ...slots[i])), sup: picks.slice(5).map((c, i) => setupOf(c, 'back', i)) }
}

const stat = { games: 0, wins: [0, 0], draws: 0, turns: 0, plans: 0, wrongTeam: 0, wastedAttack: [0, 0], wastedHeal: [0, 0], summons: 0, skills: 0 }
const samples = []
for (let g = 0; g < GAMES; g++) {
  const A = makeTeam(), Bt = makeTeam()
  const b = new B.Battle([A.field, Bt.field], 5000 + g, [A.sup, Bt.sup])
  b.aiLevel = LEVELS
  // --vs: ทีม rivalTeam ใช้ AI คู่แข่ง (สลับฝั่งทุกเกม) · การจำลองล่วงหน้าข้างในใช้ AI ปัจจุบันทั้งคู่
  const rivalTeam = g % 2
  if (Rival) {
    const rival = new Rival(b, () => b.nextRandom())
    const me = Me ? new Me(b, () => b.nextRandom()) : null
    const own = b.planAuto.bind(b)
    const mine = u => { if (!me) return own(u); const c = me.choose(u); return c ? { action: c.action, target: c.target, caster: c.caster } : null }
    b.planAuto = u => {
      if (u.team !== rivalTeam) return mine(u)
      const c = rival.choose(u)
      return c ? { action: c.action, target: c.target, caster: c.caster } : null
    }
    // สำเนาที่ใช้จำลองล่วงหน้าไม่เอาตัวสลับ AI ไปด้วย (Object.assign คัดลอกฟังก์ชันที่แปะไว้บนตัว b)
    const cloneOf = b.clone.bind(b)
    b.clone = seed => { const c = cloneOf(seed); delete c.planAuto; delete c.clone; return c }
  }
  let turns = 0
  while (b.winner === null && turns < 300) {
    const actor = b.nextActor()
    if (!actor) break
    turns++
    const st = b.beginTurn(actor)
    if (st.stunned || !actor.alive) { b.endTurn(actor); continue }
    const plan = b.planAuto(actor)
    if (!plan) break
    stat.plans++
    const side = Rival ? Number(actor.team === rivalTeam) : actor.team
    const caster = plan.caster ?? actor
    const skill = b.skillOf(caster, plan.action)
    if (plan.action !== 'attack') stat.skills++
    if (plan.caster) stat.summons++
    const wrong = skill.kind === 'attack' ? plan.target.team === actor.team : plan.target.team !== actor.team
    if (wrong) {
      stat.wrongTeam++
      if (samples.length < 8) samples.push(`ผิดทีม: ${caster.rangerId} ${plan.action} (${skill.kind}/${skill.area}) → ${plan.target.uid}${plan.caster ? ' [อัญเชิญโดย ' + actor.uid + ']' : ''}`)
    }
    if (plan.action !== 'attack' && skill.kind === 'attack') {
      const breaks = skill.effects.some(e => e.type === 'breakInvincible')
      if (plan.caster) b.prepareSummon(actor, plan.caster)
      const hit = b.affectedUnits(caster, plan.action, plan.target)
      if (!breaks && hit.every(t => b.has(t, 'barrier'))) {
        stat.wastedAttack[side]++
        if (samples.length < 16) samples.push(`สกิลเปล่า(บาเรีย): ${caster.rangerId} ${plan.action} → ${plan.target.uid}`)
      }
    }
    if (skill.kind === 'buff' && skill.effects.some(e => e.type === 'heal') && skill.effects.every(e => ['heal', 'regen', 'energyGain'].includes(e.type))) {
      if (plan.caster) b.prepareSummon(actor, plan.caster)
      const hit = b.affectedUnits(caster, plan.action, plan.target)
      const missing = hit.reduce((n, u) => n + (u.maxHp - u.hp), 0)
      const amount = hit.reduce((n, u) => n + skill.effects.reduce((m, e) => m + b.healBase(caster, u, e), 0), 0)
      if (missing < amount * 0.3) {
        stat.wastedHeal[side]++
        if (samples.length < 24) samples.push(`ฮีลเปล่า [${Rival ? who[side] : 'ทีม ' + side}]: ${caster.rangerId} ${plan.action} ขาด ${Math.round(missing)} / ฮีล ${Math.round(amount)}`)
      }
    }
    b.perform(actor, plan)
    b.endTurn(actor)
  }
  stat.games++
  stat.turns += turns
  if (b.winner === 0 || b.winner === 1) stat.wins[Rival ? Number(b.winner === rivalTeam) : b.winner]++
  else stat.draws++
}

console.log(`เรนเจอร์จริง ${pool.length} ตัว · ${stat.games} เกม${Rival ? ' (สลับฝั่งทุกเกม)' : ` · ${LEVELS[0]} vs ${LEVELS[1]}`} · ชนะ ${who[0]} ${stat.wins[0]} / ${who[1]} ${stat.wins[1]} / เสมอ ${stat.draws}${Rival ? ` → AI ปัจจุบันชนะ ${(stat.wins[0] / stat.games * 100).toFixed(1)}%` : ''} · เทิร์นเฉลี่ย ${(stat.turns / stat.games).toFixed(1)}`)
console.log(`ท่าทั้งหมด ${stat.plans} · สกิล ${stat.skills} · อัญเชิญ ${stat.summons}`)
console.log(`ผิดทีม ${stat.wrongTeam} · สกิลโจมตีใส่อมตะเปล่า ${who[0]} ${stat.wastedAttack[0]} / ${who[1]} ${stat.wastedAttack[1]} · ฮีลเปล่า ${who[0]} ${stat.wastedHeal[0]} / ${who[1]} ${stat.wastedHeal[1]}`)
for (const s of samples) console.log('  ' + s)
for (const n of [`real-battle-${tag}`, `real-rival-${tag}`, `real-me-${tag}`]) await rm(out(n), { force: true })
