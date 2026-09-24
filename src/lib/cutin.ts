// ====================================================
// cutin.ts — คัตซีนเปิดตัวตอนร่ายสกิล (ใช้ทั้งในจอดวลและตัวอย่างใน editor)
//
// ลำดับภาพ (วินาทีที่ x1 · ความเร็ว x2/x4 เร่งตาม √ความเร็ว):
//   มืดลงทันที → แถบเฉียงสีตามธาตุเปิดออกจากกลางจอ (แบบม่านตอน START) → เรนเจอร์เลื่อนเข้ามาเป็นเงาดำ
//   → แฟลชเป็นภาพสี (มีเงาซ้อนขอบคมด้านหลัง 2 ชั้น) → ชื่อสกิลเลื่อนเข้า เอียงตามแถบ (มุมล่างฝั่งผู้ใช้)
//   → ค้างสักพัก → แถบหุบ จอสว่าง → ออกท่าจริง
// ทีมขวา (ศัตรู) กลับด้านทั้งหมด: แถบเอียงกลับ ตัวละครเข้าจากซ้าย ชื่ออยู่มุมขวา
//
// ภาพ = เลเยอร์ที่เลือกได้ 2 ชั้น (เปิดชั้นเดียวหรือทั้งคู่):
//   ตัวเรนเจอร์ (body) — เฟรมหนึ่งของท่าร่ายสกิล (castPre + cast + release ต่อกัน)
//   กระสุน (bul / bul2 / bul3) — เฟรมหนึ่งของคลิป normal + finish · วางเยื้องจากตัวได้ (offset) · วาดทับตัว
// จุดโฟกัส = กรอบสี่เหลี่ยมจัตุรัส (พิกัดโลกของ .sam) — กรอบนี้แสดงขนาด CUTIN_FOCUS_PX บนจอ
// ส่วนที่เกินกรอบ (ตัว แขน อาวุธ) วาดต่อไปจนสุดแถบ
// ตั้งค่าเก็บใน ranger.json → config.cutins[skill1|skill2]
// ====================================================

import type { SAMParser, SamFrame } from './animation/samParser'
import { renderSAMFrame } from './animation/samRenderer'
import type { SpriteMap } from './animation/samRenderer'
import type { Element } from './rangerClass'
import type { ActionConfig, Vec2 } from './rangerConfig'
import type { BulletAssets } from './rangerAssets'

export interface CutinConfig {
  enabled: boolean
  /** แสดงตัวเรนเจอร์ (ไม่ระบุ = แสดง) */
  body?: boolean
  /** เฟรมของตัวที่จับภาพ นับจากต้นท่า (castPre → cast → release ต่อกัน) */
  frame: number
  /** เลเยอร์กระสุน (ไม่มี = ไม่แสดง) */
  bullet?: CutinBullet | null
  /** [พิกัดโลกของ .sam] จุดกึ่งกลางกรอบโฟกัส */
  focus: Vec2
  /** ด้านของกรอบโฟกัส (หน่วยโลก) — เล็ก = ซูมเข้า */
  size: number
  /** ข้อความบนคัตซีน · null = ชื่อสกิลจากข้อมูลเกม */
  title: string | null
}

export interface CutinBullet {
  /** ไฟล์กระสุน เช่น 'bul2' */
  file: string
  /** เฟรมนับจากต้นคลิป normal ต่อด้วย finish */
  frame: number
  /** [หน่วยโลก] เยื้องจุดกำเนิดของกระสุนจากจุดกำเนิดของตัว */
  offset: Vec2
}

/** ไฟล์ที่ต้องใช้วาด: ตัว + กระสุนที่โหลดไว้ (RangerAssets ใส่ได้เลย) */
export interface CutinSource {
  sam: SAMParser
  sprites: SpriteMap
  bullets: Record<string, Pick<BulletAssets, 'sam' | 'sprites' | 'normalName' | 'finishName'>>
}

/** กรอบโฟกัสแสดงขนาดเท่านี้บนจอ (px ของจอดวล 1280×720) */
export const CUTIN_FOCUS_PX = 380
export const CUTIN_SIZE_MIN = 40
export const CUTIN_SIZE_MAX = 800
/** ความยาวคัตซีนที่ x1 (วินาที) */
export const CUTIN_SEC = 1.9
/** ความสูงแถบเฉียงตอนเปิดสุด (px) */
const BAND_H = 380
/** ความเอียงของแถบ (เรเดียน) */
const TILT = -0.075

// ── เปิด/ปิดคัตซีนทั้งเกม (เมนูตั้งค่าในจอดวล) · จำไว้ในเครื่อง ──
const STORAGE_KEY = 'lr:cutin'
let enabledAll = (() => {
  try { return typeof localStorage === 'undefined' || localStorage.getItem(STORAGE_KEY) !== 'off' } catch { return true }
})()
export const cutinsOn = (): boolean => enabledAll
export function toggleCutins(): void {
  enabledAll = !enabledAll
  try { localStorage.setItem(STORAGE_KEY, enabledAll ? 'on' : 'off') } catch { /* จำไม่ได้ก็ใช้แค่รอบนี้ */ }
}

// ── เฟรมของท่า ──

/** เฟรมทั้งหมดของท่า (castPre → cast → release) พร้อมชื่อคลิปและลำดับในคลิป */
export function cutinFrames(sam: SAMParser, action: ActionConfig): { clip: string; index: number; frame: SamFrame }[] {
  const out: { clip: string; index: number; frame: SamFrame }[] = []
  for (const clip of [action.castPre, action.cast, action.release]) {
    if (!clip) continue
    ;(sam.animations[clip] ?? []).forEach((frame, index) => out.push({ clip, index, frame }))
  }
  return out
}

/** เฟรมทั้งหมดของไฟล์กระสุน (normal → finish) */
export function bulletFrames(src: CutinSource, file: string): { clip: string; index: number; frame: SamFrame }[] {
  const b = src.bullets[file]
  if (!b) return []
  const out: { clip: string; index: number; frame: SamFrame }[] = []
  for (const clip of [b.normalName, b.finishName]) {
    if (!clip) continue
    ;(b.sam.animations[clip] ?? []).forEach((frame, index) => out.push({ clip, index, frame }))
  }
  return out
}

type Bounds = { x0: number; y0: number; x1: number; y1: number }

interface Layer { sam: SAMParser; sprites: SpriteMap; frame: SamFrame; off: Vec2 }

/** เลเยอร์ที่เปิดอยู่ (ล่าง → บน): ตัว แล้วกระสุน */
function cutinLayers(src: CutinSource, action: ActionConfig, cfg: CutinConfig): Layer[] {
  const out: Layer[] = []
  if (cfg.body !== false) {
    const frames = cutinFrames(src.sam, action)
    const f = frames[clamp(cfg.frame, 0, frames.length - 1)]
    if (f) out.push({ sam: src.sam, sprites: src.sprites, frame: f.frame, off: { x: 0, y: 0 } })
  }
  const bl = cfg.bullet
  const b = bl ? src.bullets[bl.file] : undefined
  if (bl && b) {
    const frames = bulletFrames(src, bl.file)
    const f = frames[clamp(bl.frame, 0, frames.length - 1)]
    if (f) out.push({ sam: b.sam, sprites: b.sprites, frame: f.frame, off: bl.offset })
  }
  return out
}

/** ขอบรวมของทุกเลเยอร์ (พิกัดโลกของคัตซีน) */
function layersBounds(layers: Layer[]): Bounds | null {
  let r: Bounds | null = null
  for (const l of layers) {
    const b = frameBounds(l.sam, l.sprites, l.frame)
    if (!b) continue
    const m = { x0: b.x0 + l.off.x, y0: b.y0 + l.off.y, x1: b.x1 + l.off.x, y1: b.y1 + l.off.y }
    r = r ? { x0: Math.min(r.x0, m.x0), y0: Math.min(r.y0, m.y0), x1: Math.max(r.x1, m.x1), y1: Math.max(r.y1, m.y1) } : m
  }
  return r
}

/**
 * เปิดเลเยอร์กระสุน: เฟรมที่เห็นภาพใหญ่สุดของไฟล์ (คลิป normal บางไฟล์มีแค่เฟรมว่างเฟรมเดียว)
 * · วางให้กลางกระสุนอยู่ที่จุดโฟกัส
 */
export function defaultBullet(src: CutinSource, file: string, focus: Vec2): CutinBullet | null {
  const b = src.bullets[file]
  if (!b) return null
  const frames = bulletFrames(src, file)
  let frame = 0, fb: Bounds | null = null, best = -1
  for (let i = 0; i < frames.length; i++) {
    const r = frameBounds(b.sam, b.sprites, frames[i].frame)
    const area = r ? (r.x1 - r.x0) * (r.y1 - r.y0) : -1
    if (area > best) { best = area; frame = i; fb = r }
  }
  const c = fb ? { x: (fb.x0 + fb.x1) / 2, y: (fb.y0 + fb.y1) / 2 } : { x: 0, y: 0 }
  return { file, frame, offset: { x: Math.round(focus.x - c.x), y: Math.round(focus.y - c.y) } }
}

/** กรอบของทุกชิ้นที่มองเห็นในเฟรม (พิกัดโลก) */
export function frameBounds(sam: SAMParser, sprites: SpriteMap, frame: SamFrame): Bounds | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [, resNum, m, color] of frame) {
    if (color[3] === 0 || resNum >= sam.images.length) continue
    const img = sam.images[resNum]
    const spr = sprites[img.name]
    if (!spr) continue
    const [m00, m01, m10, m11, m02, m12] = m
    const [i00, i01, i10, i11, i02, i12] = img.m
    const cx = spr.w * 0.5, cy = spr.h * 0.5
    const pCx = i00 * cx + i01 * cy + i02, pCy = i10 * cx + i11 * cy + i12
    const wCx = m00 * pCx + m01 * pCy + m02, wCy = m10 * pCx + m11 * pCy + m12
    const f00 = m00 * i00 + m01 * i10, f01 = m00 * i01 + m01 * i11
    const f10 = m10 * i00 + m11 * i10, f11 = m10 * i01 + m11 * i11
    for (const [sx, sy] of [[-cx, -cy], [cx, -cy], [-cx, cy], [cx, cy]]) {
      const x = wCx + f00 * sx + f01 * sy, y = wCy + f10 * sx + f11 * sy
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < x0 ? null : { x0, y0, x1, y1 }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * ค่าเริ่มต้น: ท่าล่าสุดที่ยัง "สะอาด" ก่อนถึงจุดปล่อยท่า — ตัวยังอยู่ใกล้ที่เดิมและไม่มีเอฟเฟกต์ใหญ่กว่าตัวมาก
 * (ท่าพุ่งตัว/วาป หรือเฟรมปล่อยที่มีแสงคลื่นกว้างๆ จะถอยไปใช้เฟรมก่อนหน้า) · กรอบครอบทั้งตัว (ซูมน้อย ภาพไม่แตก)
 */
export function defaultCutin(sam: SAMParser, sprites: SpriteMap, action: ActionConfig): CutinConfig {
  const frames = cutinFrames(sam, action)
  const release = clamp(Math.round(action.releaseFrame), 0, Math.max(0, frames.length - 1))
  const base = frames[0] ? frameBounds(sam, sprites, frames[0].frame) : null
  if (!base) return { enabled: true, frame: release, focus: { x: 0, y: -120 }, size: 220, title: null }
  const bw = base.x1 - base.x0, bh = base.y1 - base.y0
  const bcx = (base.x0 + base.x1) / 2, bcy = (base.y0 + base.y1) / 2
  let frame = 0, b = base
  for (let i = release; i >= 0; i--) {
    const fb = frameBounds(sam, sprites, frames[i].frame)
    if (!fb) continue
    const w = fb.x1 - fb.x0, h = fb.y1 - fb.y0
    const near = Math.abs((fb.x0 + fb.x1) / 2 - bcx) < bw * 0.5 && Math.abs((fb.y0 + fb.y1) / 2 - bcy) < bh * 0.5
    if (near && w < bw * 1.6 && h < bh * 1.6) { frame = i; b = fb; break }
  }
  const size = Math.round(clamp(Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.85, CUTIN_SIZE_MIN, CUTIN_SIZE_MAX))
  return { enabled: true, frame, focus: { x: Math.round((b.x0 + b.x1) / 2), y: Math.round((b.y0 + b.y1) / 2) }, size, title: null }
}

/** ให้กรอบโฟกัสแตะตัวละครเสมอ (ลาก/ซูมจนตัวหลุดจอไม่ได้) · เฟรมอยู่ในช่วง · ขนาดอยู่ในช่วง */
export function clampCutin(src: CutinSource, action: ActionConfig, saved: CutinConfig): CutinConfig {
  const frames = cutinFrames(src.sam, action)
  const frame = clamp(saved.frame, 0, Math.max(0, frames.length - 1))
  const size = clamp(Math.round(saved.size), CUTIN_SIZE_MIN, CUTIN_SIZE_MAX)
  const bl = saved.bullet
  const bullet = bl ? { ...bl, frame: clamp(bl.frame, 0, Math.max(0, bulletFrames(src, bl.file).length - 1)) } : bl
  const cfg = { ...saved, frame, size, bullet }
  const b = layersBounds(cutinLayers(src, action, cfg))
  if (!b) return cfg
  const h = size / 2
  return { ...cfg, frame, size, focus: { x: Math.round(clamp(cfg.focus.x, b.x0 - h * 0.8, b.x1 + h * 0.8)), y: Math.round(clamp(cfg.focus.y, b.y0 - h * 0.8, b.y1 + h * 0.8)) } }
}

// ── ภาพเรนเจอร์ของคัตซีน (วาดครั้งเดียวต่อสกิล แล้วใช้ซ้ำ) ──

export interface CutinArt {
  image: HTMLCanvasElement
  /** เงาดำ (ช่วงเลื่อนเข้า) */
  silhouette: HTMLCanvasElement
  /** จุดกึ่งกลางกรอบโฟกัสบนรูป (px) */
  focusX: number
  focusY: number
}

/** ตัดส่วนที่ไกลจากโฟกัสเกินนี้ทิ้ง (px) — เอฟเฟกต์ใหญ่ๆ ไม่ทำให้แคนวาสใหญ่เกิน */
const ART_REACH = 1100

/**
 * วาดเฟรมที่เลือกเป็นรูป: กรอบโฟกัสกว้าง CUTIN_FOCUS_PX · flip = กลับซ้าย-ขวา (ทีมขวา) รอบจุดโฟกัส
 * ไม่มี DOM / ไม่มีภาพ = null
 */
export function renderCutinArt(src: CutinSource, action: ActionConfig, saved: CutinConfig, flip: boolean): CutinArt | null {
  if (typeof document === 'undefined') return null
  // ค่าที่เพี้ยน (เช่นลากหลุดตัว) → ดึงกลับให้ยังเห็นตัวละคร
  const cfg = clampCutin(src, action, saved)
  const layers = cutinLayers(src, action, cfg)
  const b0 = layersBounds(layers)
  if (!b0) return null
  const k = CUTIN_FOCUS_PX / Math.max(1, cfg.size)
  const fx = cfg.focus.x, fy = cfg.focus.y
  // กลับด้านรอบแกนตั้งที่จุดโฟกัส → จุดโฟกัสอยู่ที่เดิม
  const b = flip ? { x0: 2 * fx - b0.x1, x1: 2 * fx - b0.x0, y0: b0.y0, y1: b0.y1 } : b0
  const reach = ART_REACH / k
  const x0 = Math.max(b.x0, fx - reach), x1 = Math.min(b.x1, fx + reach)
  const y0 = Math.max(b.y0, fy - reach), y1 = Math.min(b.y1, fy + reach)
  if (x1 <= x0 || y1 <= y0) return null
  const pad = 4
  const w = Math.ceil((x1 - x0) * k + pad * 2), h = Math.ceil((y1 - y0) * k + pad * 2)
  const image = document.createElement('canvas')
  image.width = w; image.height = h
  const g = image.getContext('2d')
  if (!g) return null
  const ox = pad - x0 * k, oy = pad - y0 * k
  g.imageSmoothingQuality = 'high'
  // แต่ละเลเยอร์เลื่อนตาม offset · กลับด้านรอบจุดโฟกัสเดียวกัน (แกนในพิกัดของเลเยอร์ = fx − offset)
  for (const l of layers) {
    renderSAMFrame(g, l.frame, l.sam.images, l.sprites, ox + l.off.x * k, oy + l.off.y * k, k, undefined, flip, fx - l.off.x)
  }
  g.setTransform(1, 0, 0, 1, 0, 0)
  const silhouette = document.createElement('canvas')
  silhouette.width = w; silhouette.height = h
  const s = silhouette.getContext('2d')
  if (s) {
    s.drawImage(image, 0, 0)
    s.globalCompositeOperation = 'source-in'
    s.fillStyle = '#1a0f0c'
    s.fillRect(0, 0, w, h)
  }
  return { image, silhouette, focusX: ox + fx * k, focusY: oy + fy * k }
}

// ── วาดคัตซีน ──

export interface CutinPlay {
  art: CutinArt
  /** ชื่อสกิล */
  title: string
  /** สีแถบตามธาตุ */
  element?: Element
  /** ทีมซ้าย = left (ตัวละครหันขวา) · ทีมขวา = right */
  side: 'left' | 'right'
}

/** สีแถบตามธาตุ [เข้ม, สว่าง] */
const PALETTE: Record<Element, [string, string]> = {
  fire: ['#f97316', '#fdba74'],
  water: ['#2563eb', '#7dd3fc'],
  wood: ['#16a34a', '#bef264'],
  light: ['#f59e0b', '#fef08a'],
  dark: ['#6d28d9', '#d8b4fe'],
}

const prog = (a: number, b: number, t: number) => clamp((t - a) / (b - a), 0, 1)
const easeOut = (x: number) => 1 - (1 - x) ** 3
const easeIn = (x: number) => x * x * x

/**
 * เงาซ้อนหลังตัวละคร: ก๊อปเงาตัวเองขอบคม (ไม่เบลอ) เยื้องไปด้านหลังทิศที่ตัวละครหัน
 * [เยื้องแนวนอน, เยื้องแนวตั้ง, ความทึบ] — ชั้นไกลจางกว่า
 */
const ECHOES: [number, number, number][] = [[-30, 14, 0.3], [-60, 28, 0.16]]

/** เวลาแต่ละช่วง (วินาทีที่ x1) */
const T = {
  dark: 0.14, open0: 0.1, open1: 0.4, slide0: 0.2, slide1: 0.56, color0: 0.56, color1: 0.78,
  text0: 0.6, text1: 0.88, close0: 1.55, close1: 1.78,
}

/** เศษแสงสามเหลี่ยมในแถบ (ตำแหน่งคงที่ — ดูเป็นลายเดิมทุกครั้ง) */
const SHARDS = Array.from({ length: 11 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x) }
  return { x: r(1) * 1.4 - 0.7, y: r(2) - 0.5, s: 90 + r(3) * 190, rot: r(4) * Math.PI * 2, a: 0.07 + r(5) * 0.14, drift: 12 + r(6) * 30 }
})

/**
 * วาดคัตซีน ณ เวลา t (วินาที · 0 ถึง CUTIN_SEC) ลงบนจอขนาด W×H
 * ใช้ transform ของ ctx ได้ (editor ย่อลงมาแสดงตัวอย่าง) — ภายในไม่เรียก setTransform
 */
export function paintCutin(ctx: CanvasRenderingContext2D, p: CutinPlay, t: number, W = 1280, H = 720): void {
  const dir = p.side === 'left' ? 1 : -1
  const [deep, light] = PALETTE[p.element ?? 'fire']
  const closing = easeIn(prog(T.close0, T.close1, t))
  const open = easeOut(prog(T.open0, T.open1, t)) * (1 - closing)

  ctx.save()
  // 1) มืดลงทันที · สว่างกลับตอนจบ
  ctx.globalAlpha = 0.86 * Math.min(prog(0, T.dark, t), 1 - prog(T.close1 - 0.08, CUTIN_SEC, t))
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 1
  if (open <= 0.001) { ctx.restore(); return }

  const bandH = BAND_H * open
  const cx = W / 2, cy = H / 2
  const angle = TILT * dir

  // 2) แถบเฉียง (ตัดทุกอย่างให้อยู่ในแถบ)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.rect(-W, -bandH / 2, W * 2, bandH)
  ctx.clip()
  const bg = ctx.createLinearGradient(-W / 2, 0, W / 2, 0)
  bg.addColorStop(0, dir > 0 ? deep : light)
  bg.addColorStop(1, dir > 0 ? light : deep)
  ctx.fillStyle = bg
  ctx.fillRect(-W, -BAND_H / 2, W * 2, BAND_H)
  // เศษแสงสามเหลี่ยม ลอยช้าๆ
  for (const s of SHARDS) {
    ctx.save()
    ctx.translate(s.x * W - dir * s.drift * t, s.y * BAND_H)
    ctx.rotate(s.rot + t * 0.15)
    ctx.beginPath()
    ctx.moveTo(0, -s.s / 2)
    ctx.lineTo(s.s / 2, s.s / 2)
    ctx.lineTo(-s.s / 2, s.s / 2)
    ctx.closePath()
    ctx.fillStyle = `rgba(255,255,255,${s.a})`
    ctx.fill()
    ctx.restore()
  }
  // เส้นความเร็วสีดำ วิ่งผ่านแถบ
  for (const [yy, len, speed] of [[-0.3, 520, 2600], [0.27, 640, 3200]] as const) {
    const run = ((t * speed) % (W * 2.2)) - W * 1.1
    const x = -dir * run
    ctx.beginPath()
    ctx.moveTo(x, yy * BAND_H - 3)
    ctx.lineTo(x + dir * len, yy * BAND_H)
    ctx.lineTo(x, yy * BAND_H + 3)
    ctx.closePath()
    ctx.fillStyle = 'rgba(15,10,10,0.8)'
    ctx.fill()
  }

  // 3) ตัวละคร: ตั้งตรง (หมุนกลับ) แต่ยังโดนตัดในแถบ
  ctx.rotate(-angle)
  const fx = dir * 90, fy = -8
  // แสงวาบหลังตัว
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 320)
  glow.addColorStop(0, 'rgba(255,255,255,0.55)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(fx - 320, fy - 320, 640, 640)
  const slide = easeOut(prog(T.slide0, T.slide1, t))
  const drift = -dir * 22 * prog(T.slide1, T.close1, t)
  const ax = fx + dir * (1 - slide) * 460 + drift - p.art.focusX
  const ay = fy - p.art.focusY
  // เงาซ้อนขอบคม (โผล่ตามหลังตอนตัวเลื่อนเข้า)
  for (const [ex, ey, ea] of ECHOES) {
    ctx.globalAlpha = slide * ea
    ctx.drawImage(p.art.silhouette, ax + dir * ex * slide, ay + ey * slide)
  }
  ctx.globalAlpha = slide
  ctx.drawImage(p.art.image, ax, ay)
  // เงาดำตอนเลื่อนเข้า → จางเป็นภาพสี
  const shadow = 1 - prog(T.color0, T.color1, t)
  if (shadow > 0) {
    ctx.globalAlpha = slide * shadow
    ctx.drawImage(p.art.silhouette, ax, ay)
  }
  ctx.globalAlpha = 1
  // แฟลชขาวตอนเปลี่ยนเป็นภาพสี
  const flash = t >= T.color0 ? 1 - prog(T.color0, T.color0 + 0.22, t) : 0
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.55 * flash})`
    ctx.fillRect(-W, -BAND_H, W * 2, BAND_H * 2)
  }
  ctx.restore()

  // ขอบแถบ: เส้นสว่างบน-ล่าง
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.fillStyle = light
  ctx.fillRect(-W, -bandH / 2 - 3, W * 2, 3)
  ctx.fillRect(-W, bandH / 2, W * 2, 3)
  ctx.restore()

  // 4) ชื่อสกิล: เอียงตามแถบ · เลื่อนเข้าจากฝั่งผู้ใช้ ชิดมุมล่างของแถบ
  const textIn = easeOut(prog(T.text0, T.text1, t))
  if (textIn > 0) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.globalAlpha = textIn * (1 - closing)
    ctx.textAlign = dir > 0 ? 'left' : 'right'
    ctx.lineJoin = 'round'
    let size = 54
    ctx.font = `bold ${size}px LineBold, Krub, ui-sans-serif, system-ui`
    const maxW = W * 0.55
    const tw = ctx.measureText(p.title).width
    if (tw > maxW) { size = Math.max(26, Math.floor(size * maxW / tw)); ctx.font = `bold ${size}px LineBold, Krub, ui-sans-serif, system-ui` }
    const tx = dir * (-W / 2 + 70) - dir * (1 - textIn) * 140
    const ty = bandH / 2 - 26
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeText(p.title, tx, ty)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(p.title, tx, ty)
    ctx.restore()
  }
  ctx.restore()
}
