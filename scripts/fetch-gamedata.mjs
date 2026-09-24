// ====================================================
// fetch-gamedata.mjs — ดึงข้อมูลเกมจาก warmycat มาเก็บต่อเรนเจอร์
//
//   node scripts/fetch-gamedata.mjs              ← ทุกตัวที่มีใน public/rangers
//   node scripts/fetch-gamedata.mjs u1607e-sh    ← เฉพาะตัวที่ระบุ
//
// ได้ไฟล์ public/rangers/<id>/gamedata.json ที่มีเฉพาะที่กฎการยิงต้องใช้:
//   • projectile_data.json → render (shadow/faceCenter), ท่า normal/skill1/skill2
//       (animationPart, start, moveSpeed, angle, motion, hitPointRate)
//   • Rangers_data.json    → 攻擊範圍 (ATK range), 觸發基準 และ 範圍 (Area) ของสกิล
//
// ไฟล์ต้นทาง (~17MB) เก็บไว้ในโปรเจคที่ data/warmycat/ เพื่อทำงานแบบ offline ได้
// มีไฟล์แล้วใช้ของในเครื่องเสมอ · ดึงใหม่เฉพาะตอนไม่มีไฟล์ หรือสั่ง --refresh
//   node scripts/fetch-gamedata.mjs --refresh
// ====================================================

import fs from 'node:fs/promises'
import path from 'node:path'

const SOURCES = {
  projectile: 'https://rangerbook.warmycat.com/res/projectile_data.json',
  rangers: 'https://rangerbook.warmycat.com/res/Rangers_data.json',
}
const CACHE_DIR = path.join(process.cwd(), 'data', 'warmycat')
const REFRESH = process.argv.includes('--refresh')
const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

async function cachedJson(name, url) {
  const file = path.join(CACHE_DIR, name + '.json')
  if (!REFRESH) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { /* ยังไม่มีไฟล์ → ดึงจากเน็ต */ }
  }
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const text = await res.text()
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(file, text, 'utf8')
  return JSON.parse(text)
}

let loaded = null
async function loadSources() {
  if (!loaded) {
    loaded = Promise.all([
      cachedJson('projectile_data', SOURCES.projectile),
      cachedJson('Rangers_data', SOURCES.rangers),
    ]).then(([projectile, rangers]) => ({
      units: projectile?.units ?? {},
      rangers: Array.isArray(rangers) ? rangers : Object.values(rangers ?? {}),
    }))
  }
  return loaded
}

// "自身" / "前方敵人" / "後方敵人（倍率:1.8倍）"
function parseBasis(raw) {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (s === '自身') return { type: 'self' }
  if (s === '前方敵人') return { type: 'front' }
  const m = s.match(/^後方敵人（倍率:([\d.]+)倍）$/)
  if (m) return { type: 'rear', multiplier: parseFloat(m[1]) }
  return null
}

// "350點" → 350 · เอาค่ามากสุดของทุกผลในสกิลนั้น
function parseArea(skill) {
  const groups = Array.isArray(skill?.['技能組']) ? skill['技能組'] : []
  let best = null
  for (const g of groups) {
    const m = String(g?.['範圍'] ?? '').match(/([\d.]+)/)
    if (m) best = Math.max(best ?? 0, parseFloat(m[1]))
  }
  return best
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

function pickMove(raw, rate) {
  if (!raw || typeof raw !== 'object') return null
  return {
    animationPart: typeof raw.animationPart === 'string' && raw.animationPart ? raw.animationPart : null,
    start: { x: num(raw.start?.x), y: num(raw.start?.y) },
    moveSpeed: num(raw.moveSpeed),
    angle: { start: num(raw.angle?.start), end: num(raw.angle?.end) },
    motion: {
      type: typeof raw.motion?.type === 'string' ? raw.motion.type : 'NONE',
      enabled: raw.motion?.enabled === true,
      rotation: typeof raw.motion?.rotation === 'string' ? raw.motion.rotation : 'FIXED',
      loopNormal: raw.motion?.loopNormal === true,
    },
    hitPointRate: typeof rate === 'number' ? rate : null,
  }
}

/** สร้างก้อนข้อมูลของเรนเจอร์ 1 ตัว — คืน null ถ้า warmycat ไม่มีตัวนี้เลย */
export async function buildGameData(id) {
  const { units, rangers } = await loadSources()
  const u = units[id] ?? Object.values(units).find(x => x?.resourceCode === id) ?? null
  const r = rangers.find(x => String(x?.ranger_id ?? '').toLowerCase() === id) ?? null
  if (!u && !r) return null

  const ht = u?.hitTiming ?? {}
  const range = parseFloat(String(r?.['攻擊範圍'] ?? '').replace(/[^\d.]/g, ''))

  return {
    id,
    source: 'warmycat',
    render: u?.render
      ? { shadowCenter: u.render.shadowCenter ?? null, faceCenter: u.render.faceCenter ?? null }
      : null,
    attackRangePt: Number.isFinite(range) && range > 0 ? range : (u?.normal?.attackRange ?? null),
    moves: {
      normal: pickMove(u?.normal, ht.normalHitPointRate),
      skill1: pickMove(u?.skill1, ht.skill1HitPointRate),
      skill2: pickMove(u?.skill2, ht.skill2HitPointRate),
    },
    skills: {
      skill1: { basis: parseBasis(r?.['技能1']?.['觸發基準']), area: parseArea(r?.['技能1']) },
      skill2: { basis: parseBasis(r?.['技能2']?.['觸發基準']), area: parseArea(r?.['技能2']) },
    },
  }
}

export async function writeGameData(id, rangersDir) {
  const data = await buildGameData(id)
  if (!data) return { ok: false, id, error: 'warmycat ไม่มีข้อมูลตัวนี้' }
  await fs.writeFile(path.join(rangersDir, id, 'gamedata.json'), JSON.stringify(data, null, 2), 'utf8')
  return { ok: true, id }
}

// ── รันจาก command line ──
const isCli = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))
if (isCli) {
  const rangersDir = path.join(process.cwd(), 'public', 'rangers')
  let ids = process.argv.slice(2).filter(a => !a.startsWith('--'))
  if (!ids.length) {
    ids = (await fs.readdir(rangersDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()
  }
  for (const id of ids) {
    try {
      const r = await writeGameData(id, rangersDir)
      console.log(r.ok ? `✓ ${id}` : `✗ ${id.padEnd(18)} ${r.error}`)
    } catch (e) {
      console.log(`✗ ${id.padEnd(18)} ${e instanceof Error ? e.message : e}`)
    }
  }
}
