// ====================================================
// effects.ts — เอฟเฟกต์ส่วนกลางของสนามรบ (ไม่ผูกกับเรนเจอร์ตัวใด) จาก public/effects/
//
// eff_die        วิญญาณฝั่งเรา (ผีขาว วงแหวน ปีกนางฟ้า)
// eff_die_enemy  วิญญาณศัตรู (ผีเทา ปีกค้างคาว)
// ที่มา: rangers.lerico.net/res/hd/unit/effect/eff_die/ — ทั้งสองไฟล์มีคลิป "die" 17 เฟรม @30fps วนได้
// ====================================================

import { SAMParser, type SamFrame } from './animation/samParser'
import { loadSprites, type SpriteMap } from './animation/samRenderer'
import type { Vec2 } from './rangerConfig'

export interface SamEffect {
  sam: SAMParser
  sprites: SpriteMap
  frames: SamFrame[]
  fps: number
  /** จุดในไฟล์ที่ถือเป็น "กึ่งกลางตัววิญญาณ" — วางจุดนี้ลงบนตำแหน่งที่ต้องการ */
  anchor: Vec2
}

export interface DeathEffects {
  ally: SamEffect
  enemy: SamEffect
}

async function loadEffect(dir: string, stem: string, clip: string, anchor: Vec2): Promise<SamEffect> {
  const url = (ext: string) => `/effects/${dir}/${stem}.${ext}`
  const get = (ext: string) => fetch(url(ext)).then(r => { if (!r.ok) throw new Error(`ไม่พบ ${url(ext)}`); return r })
  const [samBuf, plistBuf, png] = await Promise.all([
    get('sam').then(r => r.arrayBuffer()),
    get('plist').then(r => r.arrayBuffer()),
    get('png').then(r => r.blob()),
  ])
  const sam = new SAMParser(samBuf)
  const frames = sam.animations[clip] ?? sam.animations._all ?? []
  return { sam, sprites: await loadSprites(plistBuf, png), frames, fps: sam.animRate || 30, anchor }
}

/** กึ่งกลางตัวผี (วัดจากภาพเรนเดอร์: ตัวกว้าง ~95 สูงจากวงแหวนถึงชายผ้า ~80) */
const SOUL_ANCHOR: Vec2 = { x: 47, y: 120 }

let cache: Promise<DeathEffects> | null = null

/** โหลดครั้งเดียวแล้วใช้ร่วมกันทุกฉาก */
export function loadDeathEffects(): Promise<DeathEffects> {
  cache ??= Promise.all([
    loadEffect('eff_die', 'eff_die', 'die', SOUL_ANCHOR),
    loadEffect('eff_die', 'eff_die_enemy', 'die', SOUL_ANCHOR),
  ]).then(([ally, enemy]) => ({ ally, enemy }))
  cache.catch(() => { cache = null })
  return cache
}

// ── ไอคอนสถานะเหนือหัว (in → loop วน → out) ──
// unit01-shield = อมตะ (บาเรีย) · unit22-stun = ดาวหมุน (ชะงัก)
// ที่มา: rangers.lerico.net/res/unit01-shield/ และ /res/unit22-stun/ — คลิป in 10 / loop 30 / out 8 เฟรม @30fps

export interface StatusIconFx {
  sam: SAMParser
  sprites: SpriteMap
  clips: { in: SamFrame[]; loop: SamFrame[]; out: SamFrame[] }
  fps: number
  /** จุดกึ่งกลางไอคอนในไฟล์ (วัดจากภาพเรนเดอร์) */
  anchor: Vec2
}

export interface StatusIcons { barrier: StatusIconFx; stun: StatusIconFx }

async function loadIcon(stem: string, anchor: Vec2): Promise<StatusIconFx> {
  const url = (ext: string) => `/effects/${stem}/${stem}.${ext}`
  const get = (ext: string) => fetch(url(ext)).then(r => { if (!r.ok) throw new Error(`ไม่พบ ${url(ext)}`); return r })
  const [samBuf, plistBuf, png] = await Promise.all([
    get('sam').then(r => r.arrayBuffer()),
    get('plist').then(r => r.arrayBuffer()),
    get('png').then(r => r.blob()),
  ])
  const sam = new SAMParser(samBuf)
  const a = sam.animations
  return {
    sam, sprites: await loadSprites(plistBuf, png), fps: sam.animRate || 30, anchor,
    clips: { in: a.in ?? [], loop: a.loop ?? a._all ?? [], out: a.out ?? [] },
  }
}

let iconCache: Promise<StatusIcons> | null = null

export function loadStatusIcons(): Promise<StatusIcons> {
  iconCache ??= Promise.all([
    loadIcon('unit01-shield', { x: 33, y: 15 }),
    loadIcon('unit22-stun', { x: 41, y: 20 }),
  ]).then(([barrier, stun]) => ({ barrier, stun }))
  iconCache.catch(() => { iconCache = null })
  return iconCache
}

// ── วงแหวนปุ่มกลม (AUTO / ความเร็ว) ──
// endless_battle_icon_eff: loop = เส้นโค้งหมุนรอบ 24 เฟรม · success = วงแหวนแฟลชแล้วจาง 24 เฟรม @30fps
// จุดกึ่งกลางวงในไฟล์ ~ (35, 35) · รัศมีเส้นโค้ง loop ~30 หน่วย (วัดจากภาพเรนเดอร์)

export interface RingFx {
  sam: SAMParser
  sprites: SpriteMap
  clips: { loop: SamFrame[]; success: SamFrame[] }
  fps: number
  anchor: Vec2
  /** รัศมีเส้นโค้งของ loop (หน่วยในไฟล์) ใช้ย่อ/ขยายให้พอดีปุ่ม */
  radius: number
}

let ringCache: Promise<RingFx> | null = null

export function loadButtonRing(): Promise<RingFx> {
  ringCache ??= (async () => {
    const stem = 'endless_battle_icon_eff'
    const url = (ext: string) => `/effects/${stem}/${stem}.${ext}`
    const get = (ext: string) => fetch(url(ext)).then(r => { if (!r.ok) throw new Error(`ไม่พบ ${url(ext)}`); return r })
    const [samBuf, plistBuf, png] = await Promise.all([
      get('sam').then(r => r.arrayBuffer()),
      get('plist').then(r => r.arrayBuffer()),
      get('png').then(r => r.blob()),
    ])
    const sam = new SAMParser(samBuf)
    const a = sam.animations
    return {
      sam, sprites: await loadSprites(plistBuf, png), fps: sam.animRate || 30,
      clips: { loop: a.loop ?? [], success: a.success ?? [] },
      anchor: { x: 35, y: 35 }, radius: 30,
    }
  })()
  ringCache.catch(() => { ringCache = null })
  return ringCache
}
