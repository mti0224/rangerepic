// ====================================================
// fetch-lerico.mjs — ดึงข้อมูลค่าพลัง / ชื่อ / ธาตุ / ชนิด / สกิล / ability ของเรนเจอร์มาเก็บในเครื่อง
//
//   node scripts/fetch-lerico.mjs              ← ทุกตัวที่มีใน public/rangers (ใช้แคชถ้ามี)
//   node scripts/fetch-lerico.mjs u1357e-mg    ← เฉพาะตัวที่ระบุ
//   node scripts/fetch-lerico.mjs --refresh    ← ดึง API ใหม่ (ดึงไม่ได้ → ใช้แคชเดิม)
//
// เรียกจาก dev server ด้วย: ปุ่ม "โหลดข้อมูลอีกครั้ง" (refresh) และตอนเพิ่มเรนเจอร์ใหม่
//
// ต้นทาง (ตามที่ Line Ranger Kiwi ใช้) — ทุกอย่างผูกด้วย id = unitCode ตัวเดียว
//   lerico  /api/getRangersBasics          ค่าพลัง การเติบโต ประเภท ธาตุ เกรด ร่าง โค้ดสกิล/ability
//   lerico  /api/getSkills                 iconResourcePath, probability, skillDelayTime, ระยะ
//   lerico  /api/v2/abilities              { abilities, groupBuffs }
//   lerico  /api/v2/translate?keys=<lang>:UNIT|SKILL|ABILITY|PROPERTIES|CUSTOM   (en + th)
//   warmycat Rangers_data.json (มีอยู่แล้วใน data/warmycat) → 觸發基準 จับคู่ด้วยชื่อไฟล์ไอคอนสกิล
//
// ผลลัพธ์
//   data/lerico/*.json                    ไฟล์ดิบจาก API (แคช · ไม่ขึ้น git)
//   public/rangers/<id>/stats.json        เฉพาะที่เกมเราต้องใช้ของตัวนั้น (+ suggest = ค่าที่แปลงเป็นระบบของเราแล้ว)
//   public/rangers/<id>/icons/*.png       ไอคอนสกิล / ability
// ====================================================

import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const API = 'https://rangers.lerico.net'
const RES = 'https://rangers.lerico.net/res'
const CACHE = path.join(ROOT, 'data', 'lerico')
const WARMY = path.join(ROOT, 'data', 'warmycat', 'Rangers_data.json')
const RANGERS_DIR = path.join(ROOT, 'public', 'rangers')
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

const SOURCES = {
  basics: '/api/getRangersBasics',
  skills: '/api/getSkills',
  abilities: '/api/v2/abilities',
  ...Object.fromEntries(['en', 'th'].flatMap(lang =>
    ['UNIT', 'SKILL', 'ABILITY', 'PROPERTIES', 'CUSTOM'].map(k => [`${lang}_${k}`, `/api/v2/translate?keys=${lang}:${k}`]))),
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchWithRetry(url, tries = 2) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS })
      if (res.ok) return res
      last = new Error(`${res.status} ${url}`)
      if (res.status < 500 && res.status !== 429) break
    } catch (e) { last = e }
    if (i + 1 < tries) await sleep(1200 * (i + 1))
  }
  throw last
}

/** ใช้แคชก่อน (ถ้าไม่สั่ง refresh) · ดึงไม่ได้ → ถอยไปใช้แคชเดิมถ้ามี */
async function cachedJson(name, route, refresh, state) {
  const file = path.join(CACHE, name + '.json')
  const readCache = async () => JSON.parse(await fs.readFile(file, 'utf8'))
  if (!refresh) {
    try { return { data: await readCache(), from: 'cache' } } catch { /* ยังไม่มี → ดึง */ }
  }
  try {
    // API ล่มไปแล้วในรอบนี้ → ไม่ต้องรอ retry ซ้ำทุกไฟล์
    if (state.apiDown) throw new Error(state.apiDown)
    const text = await (await fetchWithRetry(API + route)).text()
    const data = JSON.parse(text)                   // พังตรงนี้ = ไม่ใช่ JSON (เช่นหน้า error) → ไม่เขียนทับแคช
    await fs.mkdir(CACHE, { recursive: true })
    await fs.writeFile(file, text, 'utf8')
    return { data, from: 'api' }
  } catch (e) {
    state.apiDown ??= e.message
    try { return { data: await readCache(), from: 'stale-cache', error: e.message } } catch { throw e }
  }
}

// ── แปลงรูปแบบคำตอบ ──
const asArray = x => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : [])
/** translate คืน { "en:UNIT": {...} } หรือ {...} ตรงๆ */
const dict = (raw, key) => (raw && typeof raw === 'object' && raw[key] && typeof raw[key] === 'object' ? raw[key] : raw ?? {})
const byKey = (list, key) => new Map(list.filter(x => x && x[key]).map(x => [String(x[key]), x]))
const nameOf = (map, code) => map?.[`${code}_nm`] ?? map?.[code] ?? null
const firstPositive = (obj, keys) => { for (const k of keys) { const v = Number(obj?.[k]); if (v > 0) return v } return null }

// "自身" / "前方敵人" / "後方敵人（倍率:1.8倍）"
function parseBasis(raw) {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (s === '自身') return { type: 'self' }
  if (s === '前方敵人') return { type: 'front' }
  const m = s.match(/後方敵人.*?([\d.]+)/)
  if (s.startsWith('後方敵人')) return { type: 'rear', multiplier: m ? Number(m[1]) : null }
  return { type: 'unknown', raw: s }
}

const tierOf = u => (u.isHyperUnit ? 'hyper' : u.isTranscendentUnit ? 'ultra' : Number(u.grade) === 9 ? 'base9' : 'base8')

/** lerico → ธาตุของเรา (tree/nature/earth/plant → wood · holy → light · shadow → dark) */
function normalizeElement(raw) {
  const e = String(raw ?? '').toLowerCase()
  if (['tree', 'nature', 'earth', 'plant', 'wood'].includes(e)) return 'wood'
  if (['holy', 'light'].includes(e)) return 'light'
  if (['shadow', 'dark'].includes(e)) return 'dark'
  if (e === 'fire' || e === 'water') return e
  return null
}
function normalizeCategory(raw) {
  const c = String(raw ?? '').toUpperCase()
  return c.includes('STR') ? 'str' : c.includes('AGI') ? 'agi' : c.includes('INT') ? 'int' : null
}
/** เดาตำแหน่งจาก unitType (ATTACK/HP/DEFENSE/SUPPORT) + ชนิด — เป็นแค่ค่าแนะนำ */
function suggestRole(category, unitType) {
  const t = String(unitType ?? '').toUpperCase()
  if (category === 'str') return t === 'ATTACK' ? 'fighter' : 'tank'
  if (category === 'agi') return 'shooter'
  if (category === 'int') return t === 'SUPPORT' ? 'support' : 'mage'
  return null
}

async function downloadIcon(url, file) {
  try {
    await fs.access(file)
    return true
  } catch { /* ยังไม่มี */ }
  try {
    const res = await fetchWithRetry(url, 2)
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, buf)
    return true
  } catch {
    return false
  }
}

/**
 * ดึงข้อมูล + สร้าง stats.json / ไอคอน
 * @param {{ ids?: string[], refresh?: boolean, log?: (s: string) => void }} opts
 */
export async function fetchLericoData({ ids: onlyIds = [], refresh = false, log = () => {} } = {}) {
  const report = { ok: [], missing: [], sources: {}, error: null }
  log('โหลด API (' + (refresh ? 'ดึงใหม่' : 'ใช้แคชใน data/lerico ถ้ามี') + ')…')
  const raw = {}
  const state = { apiDown: null }
  for (const [name, route] of Object.entries(SOURCES)) {
    try {
      const r = await cachedJson(name, route, refresh, state)
      raw[name] = r.data
      report.sources[name] = r.from
      log(`  ${r.from === 'stale-cache' ? '~' : '✓'} ${name} (${r.from}${r.error ? ' · ' + r.error : ''})`)
    } catch (e) {
      report.sources[name] = 'failed: ' + e.message
      log(`  ✗ ${name}: ${e.message}`)
    }
  }
  if (!raw.basics) {
    report.error = 'โหลด getRangersBasics ไม่ได้ (API ต้นทางล่ม และยังไม่มีแคชในเครื่อง)'
    return report
  }

  const basics = byKey(asArray(raw.basics), 'unitCode')
  const skills = byKey(asArray(raw.skills), 'skillCode')
  const abilityRoot = raw.abilities ?? {}
  const abilities = byKey([...asArray(abilityRoot.abilities), ...asArray(abilityRoot.groupBuffs)], 'abilityCode')
  const tr = lang => ({
    unit: dict(raw[`${lang}_UNIT`], `${lang}:UNIT`),
    skill: dict(raw[`${lang}_SKILL`], `${lang}:SKILL`),
    ability: dict(raw[`${lang}_ABILITY`], `${lang}:ABILITY`),
  })
  const en = tr('en'), th = tr('th')

  // warmycat: icon ของสกิล → 觸發基準
  const basisByIcon = new Map()
  try {
    for (const r of asArray(JSON.parse(await fs.readFile(WARMY, 'utf8')))) {
      for (const k of ['技能1', '技能2', '技能3']) {
        const s = r?.[k]
        if (s?.icon) basisByIcon.set(s.icon, parseBasis(s['觸發基準']))
      }
    }
  } catch { log('  (ไม่มี data/warmycat/Rangers_data.json — ข้าม 觸發基準)') }

  const local = (await fs.readdir(RANGERS_DIR, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name)
  const ids = onlyIds.length ? onlyIds : local
  for (const id of ids) {
    const u = basics.get(id)
    if (!u) { report.missing.push(id); log(`✗ ${id}: ไม่พบใน getRangersBasics`); continue }
    const dir = path.join(RANGERS_DIR, id)
    const iconDir = path.join(dir, 'icons')

    const skillSlot = async (slot, code) => {
      if (!code) return null
      const s = skills.get(String(code)) ?? {}
      const iconFile = s.iconResourcePath ?? `skill_icon_${code}.png`
      const saved = await downloadIcon(`${RES}/skill_icon/${iconFile}`, path.join(iconDir, iconFile))
      return {
        slot,
        code,
        name: { en: nameOf(en.skill, code), th: nameOf(th.skill, code) },
        desc: { en: en.skill?.[`${code}_desc`] ?? null, th: th.skill?.[`${code}_desc`] ?? null },
        icon: saved ? `icons/${iconFile}` : null,
        iconUrl: `${RES}/skill_icon/${iconFile}`,
        probability: s.probability ?? null,
        cooldownSec: s.skillDelayTime ?? null,
        range: firstPositive(s, ['attackScope', 'skillScope', 'area', 'scope', 'range']),
        basis: basisByIcon.get(iconFile) ?? null,
      }
    }
    const abilitySlot = async code => {
      if (!code) return null
      const a = abilities.get(String(code)) ?? {}
      const iconFile = a.iconResourcePath ?? `${code}_icon.png`
      const saved = await downloadIcon(`${RES}/ability_icon/${iconFile}`, path.join(iconDir, iconFile))
      return {
        code,
        // ชื่อต้องใช้ <code>_nm ของโค้ดตัวเองก่อนเสมอ (nameCode บางตัวชี้ผิด)
        name: { en: nameOf(en.ability, code), th: nameOf(th.ability, code) },
        desc: { en: en.ability?.[`${code}_desc`] ?? null, th: th.ability?.[`${code}_desc`] ?? null },
        icon: saved ? `icons/${iconFile}` : null,
        groupBuff: u.abilityCategoryCode === 'ab701_team' || String(code).startsWith('ab701_team'),
      }
    }

    const stat = (initial, delta, deltaMax) => ({ initial: u[initial] ?? 0, perLevel: u[delta] ?? 0, perLevelAfterMax: u[deltaMax] ?? 0 })
    const category = normalizeCategory(u.unitCategoryType)
    const out = {
      id,
      source: { lerico: API, fetchedAt: new Date().toISOString() },
      name: { en: nameOf(en.unit, id) ?? id, th: nameOf(th.unit, id) },
      grade: u.grade ?? null,
      tier: tierOf(u),
      maxLevel: u.maxLevel ?? null,
      unitType: u.unitType ?? null,            // ATTACK / HP / DEFENSE / SUPPORT
      category: u.unitCategoryType ?? null,    // STR / AGI / INT
      element: u.unitElement ?? null,          // water / fire / wood / light / dark
      elementOpen: u.elementOpen ?? null,
      // ค่าที่แปลงเป็นระบบของเกมเราแล้ว (editor ใช้เติมให้)
      suggest: { element: normalizeElement(u.unitElement), category, role: suggestRole(category, u.unitType) },
      stats: {
        atk: stat('initialAttack', 'attackIncreaseAmount', 'attackIncreaseAmountMax'),
        matk: stat('specialAttack', 'specialAttackDelta', 'specialAttackDeltaMax'),
        def: stat('defence', 'generalDefenceDelta', 'generalDefenceDeltaMax'),
        mdef: stat('specialDefence', 'specialDefenceDelta', 'specialDefenceDeltaMax'),
        hp: stat('initialHp', 'hpIncreaseAmount', 'hpIncreaseAmountMax'),
      },
      combat: {
        attackDelayFrames: u.attackDelay ?? null,   // เฟรมที่ 30fps
        attackRange: u.attackRange ?? null,
        attackScope: u.attackScope ?? null,
        projectileAttackScope: u.projectileAttackScope ?? null,
        attackSpeedType: u.attackSpeedType ?? null,
        moveSpeedType: u.moveSpeedType ?? null,
        movingSpeed: u.movingSpeed ?? null,
        critChance: u.criticalProbability ?? null,
        critRatio: u.criticalRatio ?? null,
        avoid: u.avoidProbability ?? null,
        skillAvoid: u.skillAvoidProbability ?? null,
        skillResistance: u.skillResistance ?? null,
        antiAvoid: u.antiAvoidProb ?? null,
        antiSkillAvoid: u.antiSkillAvoidProb ?? null,
      },
      cost: {
        productionSpeed: u.productionSpeed ?? null,
        summonEnergy: u.summonEnergy ?? null,
        maxLeonardPoint: u.maxLeonardPoint ?? null,
      },
      skills: {
        skill1: await skillSlot('skill1', u.skillCode),
        skill2: await skillSlot('skill2', u.skillCode2),
        skill3: await skillSlot('skill3', u.skillCode3),
        passive: await skillSlot('passive', u.passiveSkillCode),
      },
      abilities: (await Promise.all([u.abilityCode, u.abilityCode2, u.abilityCode3].map(abilitySlot))).filter(Boolean),
      raw: u,   // เก็บฟิลด์ดิบไว้ด้วย เผื่อใช้ค่าที่ยังไม่ได้แยกออกมา
    }
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'stats.json'), JSON.stringify(out, null, 2), 'utf8')
    report.ok.push(id)
    log(`✓ ${id}  ${out.name.en}${out.name.th ? ' / ' + out.name.th : ''} · ${out.tier} · ${out.element ?? '-'}`)
  }
  log(`\nเสร็จ ${report.ok.length}/${ids.length} ตัว`)
  return report
}

const isCli = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))
if (isCli) {
  const r = await fetchLericoData({
    ids: process.argv.slice(2).filter(a => !a.startsWith('--')),
    refresh: process.argv.includes('--refresh'),
    log: s => console.log(s),
  })
  if (r.error) { console.error('\n' + r.error); process.exit(1) }
}
