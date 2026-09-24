// ====================================================
// portrait.ts — รูปหน้าเรนเจอร์ = ครอปสี่เหลี่ยมจัตุรัสจาก thumb.png (รูปเดียวกับในรายชื่อ editor)
//
// กรอบครอปขนาดคงที่ PORTRAIT_SIZE พิกเซลของ thumb — เท่ากันทุกตัว ปรับขนาดไม่ได้ ย้ายได้อย่างเดียว
// (thumb ทุกตัวสเกลเดียวกัน ~100×160 px หน้าที่ครอปออกมาจึงขนาดใกล้เคียงกันเอง)
// ตำแหน่งกรอบ (จุดกึ่งกลาง เป็นพิกเซลของ thumb) เก็บใน ranger.json → config.face
// ไม่ตั้ง = เดาจากหัว (ขอบบนสุดของตัวในรูป)
// ใช้ใน: HUD จอดวล — มุมซ้ายล่าง = ครอปตามกรอบ · แถบลำดับเทิร์น = ทั้งรูป (ไม่ตัดกรอบ) โดยให้หน้าอยู่กลางช่อง
// ตั้งค่าในแท็บ "รูปหน้า" ของ editor
// ====================================================

import type { Vec2 } from './rangerConfig'

/** ด้านของกรอบครอป (พิกเซลของ thumb.png) — หัวในรูปกว้างราว 55–70 px · กรอบใหญ่กว่าหัวนิดหน่อย ไม่ซูมจนแน่น */
export const PORTRAIT_SIZE = 80
/** รูปใหญ่มุมซ้ายล่างจอดวล: กรอบหน้ากว้างเท่านี้ของกล่อง (<1 = เห็นไหล่/ตัวรอบๆ หน้ามากขึ้น) */
export const PANEL_FACE_ZOOM = 0.9
/** เดาอัตโนมัติ: เว้นเหนือหัวเท่านี้ (px) */
const AUTO_TOP_MARGIN = 2

export const thumbUrl = (id: string) => `/rangers/${id}/thumb.png`

export const imageReady = (img: HTMLImageElement | null | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0

type Bounds = { x0: number; y0: number; x1: number; y1: number }
const boundsCache = new WeakMap<HTMLImageElement, Bounds | null>()

/** กรอบของพิกเซลที่ไม่โปร่งใสในรูป (ตัดขอบใสรอบๆ ออก) */
export function imageBounds(img: HTMLImageElement): Bounds | null {
  if (boundsCache.has(img)) return boundsCache.get(img) ?? null
  if (typeof document === 'undefined' || !imageReady(img)) return null
  const w = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return null
  g.drawImage(img, 0, 0)
  const data = g.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  const b = x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 }
  boundsCache.set(img, b)
  return b
}

/** ให้กรอบอยู่ในรูปเสมอ (รูปเล็กกว่ากรอบ → จัดกึ่งกลาง) */
export function clampPortrait(img: HTMLImageElement, p: Vec2): Vec2 {
  const half = PORTRAIT_SIZE / 2
  const w = img.naturalWidth, h = img.naturalHeight
  const clamp = (v: number, size: number) => (size <= PORTRAIT_SIZE ? size / 2 : Math.min(size - half, Math.max(half, v)))
  return { x: clamp(p.x, w), y: clamp(p.y, h) }
}

/** เดากรอบหน้า: กึ่งกลางแนวนอนของตัว · ขอบบนกรอบอยู่เหนือหัวนิดหน่อย */
export function defaultPortrait(img: HTMLImageElement): Vec2 {
  const b = imageBounds(img)
  if (!b) return clampPortrait(img, { x: img.naturalWidth / 2, y: PORTRAIT_SIZE / 2 })
  return clampPortrait(img, { x: Math.round((b.x0 + b.x1) / 2), y: Math.round(b.y0 - AUTO_TOP_MARGIN + PORTRAIT_SIZE / 2) })
}

/** จุดกึ่งกลางกรอบที่ใช้จริง (ตั้งไว้ใน config ก่อน · ไม่มีก็เดาจากหัว) */
export function portraitCenter(img: HTMLImageElement, saved: Vec2 | undefined): Vec2 {
  return saved ? clampPortrait(img, saved) : defaultPortrait(img)
}

/** วาดรูปหน้าลงบริบทที่มีอยู่แล้ว ที่ (x, y) ขนาด px × px */
export function drawPortrait(g: CanvasRenderingContext2D, img: HTMLImageElement, center: Vec2, x: number, y: number, px: number): void {
  const half = PORTRAIT_SIZE / 2
  g.save()
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, center.x - half, center.y - half, PORTRAIT_SIZE, PORTRAIT_SIZE, x, y, px, px)
  g.restore()
}

/**
 * วาด "ทั้งรูป" (ไม่ตัดกรอบ) โดยให้จุดกึ่งกลางกรอบหน้าอยู่ที่ (cx, cy) และกรอบหน้ามีขนาด px
 * ส่วนที่เกินออกไป (ตัว แขน ขา) วาดต่อไปตามปกติ — ผู้เรียกตัดขอบเองถ้าต้องการ
 */
export function drawFocused(g: CanvasRenderingContext2D, img: HTMLImageElement, center: Vec2, cx: number, cy: number, px: number): void {
  const k = px / PORTRAIT_SIZE
  g.drawImage(img, cx - center.x * k, cy - center.y * k, img.naturalWidth * k, img.naturalHeight * k)
}

/** รูปหน้าเป็นแคนวาส px × px (ใช้ในเกม) · รูปยังไม่โหลด/ไม่มี DOM = null */
export function renderPortrait(img: HTMLImageElement, saved: Vec2 | undefined, px: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !imageReady(img)) return null
  const c = document.createElement('canvas')
  c.width = px; c.height = px
  const g = c.getContext('2d')
  if (!g) return null
  drawPortrait(g, img, portraitCenter(img, saved), 0, 0, px)
  return c
}
