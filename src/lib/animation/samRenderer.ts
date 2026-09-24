// ====================================================
// samRenderer.ts — Canvas rendering สำหรับ SAM animation
// Port จาก lerico_res/sam_player.js (loadSprites + renderSAMFrame + autoFit)
// ====================================================

import { parsePlist } from './plistParser'
import type { SamFrame, SamImage, SAMParser } from './samParser'

export interface Sprite {
  bitmap: ImageBitmap
  w: number
  h: number
}

export type SpriteMap = Record<string, Sprite>

// ── Load sprites: parse plist + slice atlas PNG ──
export async function loadSprites(plistBuffer: ArrayBuffer, pngBlob: Blob): Promise<SpriteMap> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plistData = parsePlist(plistBuffer) as any
  if (!plistData) throw new Error('plist parse failed')

  const atlas = await createImageBitmap(pngBlob)
  const sprites: SpriteMap = {}
  const frames = plistData.frames || {}

  for (const [name, info] of Object.entries<{ textureRect?: string; frame?: string; textureRotated?: boolean; rotated?: boolean }>(frames)) {
    const rectStr = info.textureRect || info.frame || ''
    const nums = rectStr.match(/\d+/g)?.map(Number)
    if (!nums || nums.length < 4) continue
    const [ax, ay, fw, fh] = nums
    const rotated = !!(info.textureRotated || info.rotated)

    let bitmap: ImageBitmap
    if (rotated) {
      const oc = new OffscreenCanvas(fw, fh)
      const ctx = oc.getContext('2d')!
      ctx.translate(fw, 0); ctx.rotate(Math.PI / 2)
      ctx.drawImage(atlas, ax, ay, fh, fw, 0, 0, fh, fw)
      bitmap = oc.transferToImageBitmap()
    } else {
      bitmap = await createImageBitmap(atlas, ax, ay, fw, fh)
    }
    sprites[name] = { bitmap, w: fw, h: fh }
  }
  // คืน atlas (ไม่ต้องเก็บ — sprites มี bitmap ของตัวเองแล้ว)
  atlas.close()
  return sprites
}

// ── Cleanup sprites: free GPU memory เมื่อปิด popup ──
export function disposeSprites(sprites: SpriteMap): void {
  for (const spr of Object.values(sprites)) {
    spr.bitmap.close()
  }
}

// ── Frame renderer ──
/** เกินนี้ถือว่าเป็นการ "ตัดภาพ" ตั้งใจ ไม่ใช่การเคลื่อนที่ต่อเนื่อง → ไม่ผสม */
const LERP_MAX_MOVE = 40
const LERP_MAX_LINEAR = 0.8

/**
 * เฟรมกลางระหว่าง a กับ b (t = 0–1) — ไฟล์ .sam เก็บทีละเฟรมที่ 30fps
 * จอ 60/120/144Hz จะเห็นภาพค้างเป็นจังหวะ ผสมเฟรมแล้วลื่นตามรีเฟรชเรตของจอ
 *
 * จับคู่ชิ้นด้วย [รหัสชิ้น, รูป] ที่ตรงกันทั้งคู่ (ชิ้นในไฟล์มีรหัสไม่ซ้ำในเฟรม)
 * ไม่ผสม (ใช้ของ a ตามเดิม) เมื่อ: ไม่มีคู่ · เปลี่ยนรูป · กระโดดไกล · กลับด้าน/บิดแรง
 * ชิ้นที่เกิดใหม่หรือหายไปยึดตาม a — ลำดับการวาดไม่เปลี่ยน
 */
export function lerpSAMFrame(a: SamFrame, b: SamFrame | null, t: number): SamFrame {
  if (!b || t <= 0) return a
  const byId = new Map<number, SamFrame[number]>()
  for (const o of b) byId.set(o[0], o)
  return a.map(o => {
    const p = byId.get(o[0])
    if (!p || p[1] !== o[1]) return o
    const m = o[2], n = p[2]
    if (Math.hypot(n[4] - m[4], n[5] - m[5]) > LERP_MAX_MOVE) return o
    if (Math.sign(m[0] * m[3] - m[1] * m[2]) !== Math.sign(n[0] * n[3] - n[1] * n[2])) return o
    for (let i = 0; i < 4; i++) if (Math.abs(n[i] - m[i]) > LERP_MAX_LINEAR) return o
    const mix = (x: number, y: number) => x + (y - x) * t
    return [
      o[0], o[1],
      [mix(m[0], n[0]), mix(m[1], n[1]), mix(m[2], n[2]), mix(m[3], n[3]), mix(m[4], n[4]), mix(m[5], n[5])],
      [o[3][0], o[3][1], o[3][2], mix(o[3][3], p[3][3])],
    ] as SamFrame[number]
  })
}

export function renderSAMFrame(
  ctx: CanvasRenderingContext2D,
  frame: SamFrame,
  images: SamImage[],
  sprites: SpriteMap,
  ox: number,
  oy: number,
  zoom: number,
  hiddenLayers?: Set<string>,   // ชื่อ sprite ที่ถูกซ่อน (Layer system)
  flipX = false,                // กลับด้านซ้าย-ขวา
  flipPivotX = 0,               // แกนมิเรอร์ (world unit) — ใช้จุดกึ่งกลางตัวละครเพื่อกลับด้านโดยไม่ย้ายตำแหน่ง
  rotation = 0,                 // หมุนทั้งภาพรอบจุด origin ของตัวเอง (เรเดียน) — ใช้กับกระสุนปาโค้งให้หันหน้าตามทิศทางบิน
  alpha = 1,                    // ตัวคูณความทึบทั้งภาพ (0-1) — ต้องรับตรงนี้ เพราะแต่ละชิ้นตั้ง
                                // globalAlpha ของตัวเองอยู่แล้ว ค่าที่ผู้เรียกตั้งไว้ข้างนอกจึงถูกทับทิ้ง
): void {
  const rc = rotation ? Math.cos(rotation) : 1
  const rs = rotation ? Math.sin(rotation) : 0
  // ต่อจาก transform เดิมของ ctx (เช่น จอดวลขยายทั้งฉากตามความละเอียดจอ) — ไม่ใช่ทับทิ้ง
  // ผู้เรียกที่ตั้ง identity ไว้ (editor / แคนวาสพัก) ได้ผลเหมือนเดิมทุกอย่าง
  const T = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
  const setT = (a: number, b: number, c: number, d: number, e: number, f: number) => {
    if (!T || T.isIdentity) { ctx.setTransform(a, b, c, d, e, f); return }
    ctx.setTransform(
      T.a * a + T.c * b, T.b * a + T.d * b,
      T.a * c + T.c * d, T.b * c + T.d * d,
      T.a * e + T.c * f + T.e, T.b * e + T.d * f + T.f,
    )
  }
  for (const [, resNum, m, color] of frame) {
    const a = color[3]
    if (a === 0 || resNum >= images.length) continue
    const imgDef = images[resNum]
    // ซ่อนตามชื่อ sprite — playback + capture หายตามกัน
    if (hiddenLayers && hiddenLayers.has(imgDef.name)) continue
    const spr = sprites[imgDef.name]
    if (!spr) continue

    const [m00, m01, m10, m11, m02, m12] = m
    const [i00, i01, i10, i11, i02, i12] = imgDef.m
    const { w, h, bitmap } = spr
    const cx = w * 0.5, cy = h * 0.5
    const pCx = i00 * cx + i01 * cy + i02
    const pCy = i10 * cx + i11 * cy + i12
    let wCx = m00 * pCx + m01 * pCy + m02
    let wCy = m10 * pCx + m11 * pCy + m12
    let f00 = m00 * i00 + m01 * i10
    let f01 = m00 * i01 + m01 * i11
    let f10 = m10 * i00 + m11 * i10
    let f11 = m10 * i01 + m11 * i11

    // หมุนทั้งตำแหน่ง (wCx,wCy) และทิศทางสไปรต์ (fXX) รอบ origin ของตัวเอง — หมุนทั้งชิ้นไปด้วยกัน
    if (rotation) {
      const rwCx = rc * wCx - rs * wCy, rwCy = rs * wCx + rc * wCy
      wCx = rwCx; wCy = rwCy
      const rf00 = rc * f00 - rs * f10, rf10 = rs * f00 + rc * f10
      const rf01 = rc * f01 - rs * f11, rf11 = rs * f01 + rc * f11
      f00 = rf00; f10 = rf10; f01 = rf01; f11 = rf11
    }

    ctx.save()
    ctx.globalAlpha = (a / 255) * alpha
    // flipX = มิเรอร์รอบแกนตั้งที่ (ox + flipPivotX*zoom) → กลับสัญลักษณ์คอลัมน์ x + สะท้อนตำแหน่ง
    if (flipX) {
      setT(-f00 * zoom, f10 * zoom, -f01 * zoom, f11 * zoom, ox + (2 * flipPivotX - wCx) * zoom, oy + wCy * zoom)
    } else {
      setT(f00 * zoom, f10 * zoom, f01 * zoom, f11 * zoom, ox + wCx * zoom, oy + wCy * zoom)
    }
    ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
    ctx.restore()
  }
}

// ── Bounding box เต็ม (X และ Y) ของ "animation หนึ่งๆ" (ทุกเฟรมรวมกัน) ──
// ใช้เป็นกรอบอ้างอิงคงที่สำหรับแปลง shadowCenter (สัดส่วน 0..1 จาก projectile_data)
// เป็นพิกัด world จริง — ต้องเป็นค่าคงที่ ไม่ขึ้นกับเฟรม/ท่าที่กำลังเล่นอยู่ขณะนั้น
// จึงคำนวณจาก anim เดียว (ปกติคือ "idle") ครั้งเดียวตอนโหลด ไม่ใช่ทุกเฟรม
// ── ขอบล่างของ "เฟรมสุดท้ายที่ยังมีภาพ" ของ animation หนึ่งๆ ──
// = ระดับพื้นของเอฟเฟกต์ตอนลงจอด/จบท่า ใช้จัดให้เอฟเฟกต์ (วาปไปตี/ทุบพื้น) วางบนพื้นเป้าหมายพอดี
// ต้องดูเฟรมสุดท้ายเท่านั้น ไม่ใช่ทั้ง anim เพราะช่วงกลางเอฟเฟกต์อาจกวาดลงต่ำกว่าจุดจอดจริง
export function animRestBottom(sam: SAMParser, sprites: SpriteMap, animName: string): number | null {
  const frames = sam.animations[animName] || []
  for (let fi = frames.length - 1; fi >= 0; fi--) {
    let maxY = -Infinity
    for (const [, resNum, m, color] of frames[fi]) {
      if (color[3] === 0 || resNum >= sam.images.length) continue
      const imgDef = sam.images[resNum]
      const spr = sprites[imgDef.name]
      if (!spr) continue
      // ฟังก์ชันนี้สนใจแค่แกน Y จึงหยิบเฉพาะแถวล่างของเมทริกซ์ (m10, m11, m12)
      const [, , m10, m11, , m12] = m
      const [i00, i01, i10, i11, i02, i12] = imgDef.m
      const cx = spr.w * 0.5, cy = spr.h * 0.5
      const pCx = i00 * cx + i01 * cy + i02
      const pCy = i10 * cx + i11 * cy + i12
      const wCy = m10 * pCx + m11 * pCy + m12
      const f10 = m10 * i00 + m11 * i10, f11 = m10 * i01 + m11 * i11
      for (const sx of [-cx, cx]) for (const sy of [-cy, cy]) maxY = Math.max(maxY, wCy + f10 * sx + f11 * sy)
    }
    if (maxY !== -Infinity) return maxY   // เจอเฟรมที่มีภาพแล้ว → คืนขอบล่างของเฟรมนั้น
  }
  return null
}

// ── กรอบแบบหลวม: รัศมี max(w,h)/2 รอบจุดกึ่งกลางสไปรต์ ไม่คิดสเกลจากเมทริกซ์ anim ──
// นี่คือวิธีที่ animBBox ใช้ก่อนจะเขียนใหม่ให้แปลง 4 มุมจริง — ในเชิงเรขาคณิตมันไม่ตรงกับภาพที่วาด
// แต่ยังต้องเก็บไว้ใช้กับ "จุดเล็งกระสุน" อย่างเดียว เพราะจุดเล็งเป็นแค่สัดส่วนของกรอบ (faceCenter
// ของตัวละคร) ที่ไม่มีความหมายทางเรขาคณิตอยู่แล้ว — ค่าที่ผู้ใช้ตรวจแล้วว่าเล็งตรงคือค่าจากกรอบแบบนี้
//
// วัดกระสุนบินจริง 19 ไฟล์ เทียบระยะที่จุดเล็งเพี้ยนไปถ้าใช้กรอบแบบแม่นยำแทน:
//   มัธยฐาน 6 หน่วย (แทบไม่ต่าง) แต่ u286u-brown-bul3 เพี้ยนถึง 75 เพราะสไปรต์ในไฟล์นั้น
//   ถูก anim ขยายไว้มาก กรอบแบบหลวมจึงเล็กกว่าของจริงเยอะ
// ห้ามเอาไปใช้กับงานที่ต้องการกรอบตรงกับพิกเซลจริง (จัดกึ่งกลาง/แกนมิเรอร์/ขนาดภาพ) — ใช้ animBBox
export function animBBoxLoose(sam: SAMParser, sprites: SpriteMap, animName: string): { x0: number; x1: number; y0: number; y1: number } | null {
  const frames = sam.animations[animName] || []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const frame of frames) {
    for (const [, resNum, m, color] of frame) {
      if (color[3] === 0 || resNum >= sam.images.length) continue
      const imgDef = sam.images[resNum]
      const spr = sprites[imgDef.name]
      if (!spr) continue
      const [m00, m01, m10, m11, m02, m12] = m
      const [i00, i01, i10, i11, i02, i12] = imgDef.m
      const cx = spr.w * 0.5, cy = spr.h * 0.5
      const pCx = i00 * cx + i01 * cy + i02
      const pCy = i10 * cx + i11 * cy + i12
      const wCx = m00 * pCx + m01 * pCy + m02
      const wCy = m10 * pCx + m11 * pCy + m12
      const r = Math.max(spr.w, spr.h) * 0.5
      minX = Math.min(minX, wCx - r); maxX = Math.max(maxX, wCx + r)
      minY = Math.min(minY, wCy - r); maxY = Math.max(maxY, wCy + r)
    }
  }
  return minX === Infinity ? null : { x0: minX, x1: maxX, y0: minY, y1: maxY }
}

// ── เส้นพื้นของเอฟเฟกต์ จาก "เงา/รอยกระแทกพื้น" ที่ศิลปินวาดไว้ในไฟล์ ──
// สไปรต์ที่กว้างกว่าสูงมากๆ (w/h >= DECAL_MIN_RATIO) คือรอยพื้น ไม่ใช่ตัวเอฟเฟกต์
// → ตำแหน่ง Y ของมันบอกได้ว่าเอฟเฟกต์นี้ "ยืน" อยู่ระดับไหนในพิกัดของตัวเอง
// คืนค่าที่ต่ำสุดบนจอ (max ในระบบ Y ชี้ลง) เพราะรอยพื้นที่แท้จริงคือชั้นล่างสุด
// คืน null = ไฟล์นี้ไม่มีรอยพื้น ให้ผู้เรียกไปใช้จุดยืนของเรนเจอร์เจ้าของแทน
//
// วัดจริง 5 ไฟล์: ตัวที่ไม่มีรอยพื้น อัตราส่วนแบนสุดอยู่แค่ 1.6 กับ 2.1
// ส่วนตัวที่มี อยู่ที่ 4.6 ขึ้นไป — ไม่มีไฟล์ไหนคาบเส้น 3 ค่านี้จึงไม่เปราะ
const DECAL_MIN_RATIO = 3
export function animGroundDecalY(sam: SAMParser, sprites: SpriteMap, animName: string): number | null {
  const frames = sam.animations[animName] || []
  let maxY = -Infinity
  for (const frame of frames) {
    for (const [, resNum, m] of frame) {
      if (resNum >= sam.images.length) continue
      const imgDef = sam.images[resNum]
      const spr = sprites[imgDef.name]
      if (!spr || spr.h <= 0 || spr.w / spr.h < DECAL_MIN_RATIO) continue
      const [, , m10, m11, , m12] = m
      const [i00, i01, i10, i11, i02, i12] = imgDef.m
      const cx = spr.w * 0.5, cy = spr.h * 0.5
      const pCx = i00 * cx + i01 * cy + i02
      const pCy = i10 * cx + i11 * cy + i12
      const y = m10 * pCx + m11 * pCy + m12
      // พื้นอยู่ใต้ origin เสมอ (จุดยืนของตัวละครทุกตัวที่วัดมาอยู่ที่ +60 ถึง +238)
      // สไปรต์แบนที่ลอยเหนือ origin คือลำแสง/รอยฟันกลางอากาศ ไม่ใช่เงา — ตัดทิ้ง
      // (u1174e-cony-bul สไปรต์แบนทุกชิ้นอยู่ที่ -80 ถ้าไม่กัน ภาพจะถูกดันลง 172 หน่วย)
      if (y <= 0) continue
      maxY = Math.max(maxY, y)
    }
  }
  return maxY === -Infinity ? null : maxY
}

// ── กรอบเฉพาะ "ตัวละคร" โดยตัดออร่า/เอฟเฟกต์ออก ──
// ใช้กับการหาจุดยืน (shadowCenter) และจุดรับดาเมจ (faceCenter) ซึ่งเป็นสัดส่วนของกรอบ
// ถ้ากรอบพองเกินจริง จุดพวกนี้จะเลื่อนหลุดตัวละคร (ตัวลอยเหนือพื้น / FACE ไปอยู่เหนือหัว)
//
// กันความพองสองชั้น เพราะเจอสองสาเหตุที่ต่างกันคนละเรื่อง:
//   1. สไปรต์ใหญ่ครอบตัว (ออร่า) → ตัดชิ้นที่พื้นที่เกินค่ากลางของ anim นั้น BODY_SPRITE_MAX_RATIO เท่า
//      u286u-brown ท่า idle มีออร่า 183x182 ทำให้ขอบล่างเป็น 112 แทนที่จะเป็น 82
//   2. ชิ้นส่วนเล็กแต่ลอยไปไกล → เอา "มัธยฐานของกรอบรายเฟรม" ไม่ใช่กรอบรวมทุกเฟรม
//      u1539e-en ท่า idle ยาว 190 เฟรม สไปรต์ใหญ่สุดแค่ 158x57 แต่กรอบรวมสูงถึง 622
//      เพราะมีชิ้นลอยขึ้นไปถึง -512 เฉพาะบางเฟรม → มัธยฐานได้ 184 ซึ่งเท่าความสูงตัวจริง
// ใช้มัธยฐานเพราะทนต่อค่าสุดโต่ง: เฟรมส่วนใหญ่มีแค่ตัวละคร เฟรมที่มีเอฟเฟกต์พุ่งออกไปเป็นส่วนน้อย
// วัดจริง: u1539e-en สูง 622→184 FACE -263→-11 ส่วน brown/benimaru/es/james/dwight ขยับ 0-12
const BODY_SPRITE_MAX_RATIO = 3
function medianOf(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
export function animBodyBBox(sam: SAMParser, sprites: SpriteMap, animName: string): { x0: number; x1: number; y0: number; y1: number } | null {
  const frames = sam.animations[animName] || []
  const areas: number[] = []
  for (const frame of frames) {
    for (const [, resNum, , color] of frame) {
      if (color[3] === 0 || resNum >= sam.images.length) continue
      const spr = sprites[sam.images[resNum].name]
      if (spr) areas.push(spr.w * spr.h)
    }
  }
  if (!areas.length) return animBBox(sam, sprites, animName)
  const limit = medianOf(areas) * BODY_SPRITE_MAX_RATIO
  const x0s: number[] = [], x1s: number[] = [], y0s: number[] = [], y1s: number[] = []
  for (const frame of frames) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [, resNum, m, color] of frame) {
      if (color[3] === 0 || resNum >= sam.images.length) continue
      const imgDef = sam.images[resNum]
      const spr = sprites[imgDef.name]
      if (!spr || spr.w * spr.h > limit) continue
      const [m00, m01, m10, m11, m02, m12] = m
      const [i00, i01, i10, i11, i02, i12] = imgDef.m
      const cx = spr.w * 0.5, cy = spr.h * 0.5
      const pCx = i00 * cx + i01 * cy + i02
      const pCy = i10 * cx + i11 * cy + i12
      const wCx = m00 * pCx + m01 * pCy + m02
      const wCy = m10 * pCx + m11 * pCy + m12
      const f00 = m00 * i00 + m01 * i10, f01 = m00 * i01 + m01 * i11
      const f10 = m10 * i00 + m11 * i10, f11 = m10 * i01 + m11 * i11
      for (const sx of [-cx, cx]) {
        for (const sy of [-cy, cy]) {
          const px = wCx + f00 * sx + f01 * sy, py = wCy + f10 * sx + f11 * sy
          minX = Math.min(minX, px); maxX = Math.max(maxX, px)
          minY = Math.min(minY, py); maxY = Math.max(maxY, py)
        }
      }
    }
    if (minX !== Infinity) { x0s.push(minX); x1s.push(maxX); y0s.push(minY); y1s.push(maxY) }
  }
  // ตัดจนไม่เหลืออะไร (anim ที่มีแต่เอฟเฟกต์) → ถอยไปใช้กรอบเต็ม
  if (!x0s.length) return animBBox(sam, sprites, animName)
  return { x0: medianOf(x0s), x1: medianOf(x1s), y0: medianOf(y0s), y1: medianOf(y1s) }
}

// ── anim นี้ "โค้งในตัวเอง" ไหม (ภาพลอยขึ้นแล้วลงระหว่าง anim) ──
// กระสุนปาโค้งบางไฟล์ศิลปินวาดการกระโดดมาให้ในตัว anim แล้ว ถ้าเราใส่โค้งสังเคราะห์ทับอีก
// ความสูงจะซ้อนกันเป็นสองเท่า (u1561e-af2-bul3 / u1556e-af-bul3 ใช้ภาพชุดเดียวกัน เจอปัญหานี้)
// วิธีตรวจ: ดูกึ่งกลางกรอบรายเฟรม ถ้าช่วงกลาง anim สูงกว่าทั้งเฟรมแรกและเฟรมท้ายเกินเกณฑ์
//   af2  : แรก 48 → กลาง -80 → ท้าย 47   ลอยขึ้น 128  → มีโค้งในตัว
//   cony : แรก 30 → กลาง 61  → ท้าย 53   ไม่ลอยขึ้น   → ไม่มี
// คืนค่าเป็น "ระยะที่ลอยขึ้น" (world unit) — 0 = ไม่มีโค้งในตัว
export function animSelfArcRise(sam: SAMParser, sprites: SpriteMap, animName: string): number {
  const frames = sam.animations[animName] || []
  const centers: number[] = []
  for (const frame of frames) {
    let minY = Infinity, maxY = -Infinity
    for (const [, resNum, m, color] of frame) {
      if (color[3] === 0 || resNum >= sam.images.length) continue
      const imgDef = sam.images[resNum]
      const spr = sprites[imgDef.name]
      if (!spr) continue
      const [, , m10, m11, , m12] = m
      const [i00, i01, i10, i11, i02, i12] = imgDef.m
      const cx = spr.w * 0.5, cy = spr.h * 0.5
      const wCy = m10 * (i00 * cx + i01 * cy + i02) + m11 * (i10 * cx + i11 * cy + i12) + m12
      const f10 = m10 * i00 + m11 * i10, f11 = m10 * i01 + m11 * i11
      for (const sx of [-cx, cx]) for (const sy of [-cy, cy]) {
        const py = wCy + f10 * sx + f11 * sy
        minY = Math.min(minY, py); maxY = Math.max(maxY, py)
      }
    }
    if (minY !== Infinity) centers.push((minY + maxY) / 2)
  }
  if (centers.length < 3) return 0
  // Y ชี้ลง → "สูงสุด" คือค่าน้อยสุด ต้องอยู่ช่วงกลาง ไม่ใช่ที่ปลายทั้งสองข้าง
  const top = Math.min(...centers)
  const ends = Math.min(centers[0], centers[centers.length - 1])
  return Math.max(0, ends - top)
}

// ── จุดยืน (MAIN) ของตัวละคร ──
// เดิมคำนวณจาก shadowCenter x กรอบ ซึ่งพังทุกครั้งที่กรอบไม่ตรงกับตัวละครจริง
// ตอนนี้อ่าน "เงา" ที่ศิลปินวาดไว้ใต้เท้าโดยตรง — ตรงกว่าและไม่ขึ้นกับความแม่นของกรอบเลย
// วัดเทียบ 19 ตัว: เงาที่หาเจอ (16 ตัว) ห่างจากค่าที่คำนวณได้ มัธยฐาน 0 หน่วย อยู่ในช่วง ±6
// เงื่อนไขคัดเงา (สองข้อแรกกันจับผิดชิ้น สำคัญมาก):
//   • แบนกว้าง w/h >= 2.2 — เงาเป็นวงรีแบน ต่างจากชิ้นส่วนตัวละคร
//     ไล่มา 3 → 2.5 (พลาดเงา u1029e/h-inu ที่ 2.87) → 2.2 (พลาดเงา u1103h-taiga ที่ 2.38)
//   • อยู่ใต้ลำตัว หรือแบนจนชัดว่าเป็นเงา — กันของประกอบแบนๆ ที่วางอยู่ข้างตัว
//     เคยตั้งไว้ 3 แล้วพลาดเงาของ u1029e/h-inu ที่เป็นสไปรต์ 86x30 = 2.87 (ตกเกณฑ์หวุดหวิด)
//     ตัวที่ h เจอปัญหาหนักเพราะไม่มีผู้ผ่านเกณฑ์เลย ต้องถอยไปใช้สัดส่วนของกรอบ ซึ่งกรอบถูก
//     ออร่า 183x182 ดันขอบล่างลงไปถึง 116 → จุดยืนเพี้ยนต่ำกว่าเงาจริง 18 หน่วย
//     ลดเป็น 2.5 แล้ววัดกับ 29 ตัว: เปลี่ยนแค่ 3 ตัว (inu สองร่างมาตรงกันที่ 84 ทั้งคู่
//     กับ u1004h-sally ที่เลิกเดาจากกรอบมาอ่านเงาจริง) อีก 26 ตัวค่าเดิมทั้งหมด
//     ชิ้นส่วนตัวละครที่ใกล้เกณฑ์สุดคือ 78x30 = 2.6 แต่อยู่เหนือ origin จึงถูกกรองด้วยข้อถัดไป
//   • อยู่ใต้ origin และอยู่ใน 30% ล่างของกรอบ — u1381e-mk มีสไปรต์ 44x8 ลอยอยู่ที่ y=3
//     ถ้าไม่กันช่วงล่าง จะไปจับชิ้นนั้นแล้วจุดยืนเพี้ยนไป 73 หน่วย
// หาเงาไม่เจอ → ถอยไปใช้ shadowCenter x กรอบมัธยฐานรายเฟรม (ไม่กรองขนาดสไปรต์)
//   ห้ามใช้ animBodyBBox เป็น fallback: ตัวกรองขนาดของมันตัดชิ้นส่วนตัวละครจริงออกได้
//   u1517h-ron ลำตัวเป็นสไปรต์ 104x102 ซึ่งใหญ่เกินเกณฑ์ พอถูกตัดจุดยืนเลื่อนจาก 76 ไป 30
const SHADOW_MIN_RATIO = 2.2
const SHADOW_BOTTOM_ZONE = 0.30
// เงาต้องอยู่ "ใต้ลำตัว" — เยื้องจากกึ่งกลางกรอบได้ไม่เกินสัดส่วนนี้ของครึ่งความกว้างกรอบ
// u1231e-cony มีของประกอบแบนๆ อยู่ข้างตัว (72x29 เยื้อง 40% / 53x24 เยื้อง 56%) ไม่ใช่เงา
const SHADOW_SIDE_MAX = 0.35
// แบนถึงขนาดนี้ถือว่าเป็นเงาแม้จะเยื้องออกข้าง — u1612e-cony เงาจริง (60x20 w/h 3.00) เยื้องถึง 41%
// เพราะกรอบถูกอาวุธยาวดึงกึ่งกลางเบี้ยวไป ถ้ากันด้วยเกณฑ์เยื้องเพียวๆ จะตัดเงาจริงตัวนี้ทิ้ง
// (ของประกอบของ u1231e-cony แบนแค่ 2.48 จึงยังถูกตัดออกถูกต้อง)
const SHADOW_CLEARLY_FLAT = 2.6
// ต่างกันไม่เกินนี้ = ถือว่าอยู่ระดับเดียวกัน แล้วไปตัดสินด้วยความเยื้องต่อ
// u1260e-brown มีเงา 76x22 สองชิ้น (เยื้อง 6% ที่ y=75 / เยื้อง 62% ที่ y=76)
// เกณฑ์ "เอาตัวต่ำสุด" ล้วนๆ จะไปคว้าชิ้นเยื้อง 62% เพราะต่ำกว่าแค่ 1 หน่วย → จุดยืนเพี้ยนไป 52
const SHADOW_SAME_Y = 2
export function animStandPoint(
  sam: SAMParser, sprites: SpriteMap, animName: string,
  shadowCenter: { x: number; y: number } | null,
): { x: number; y: number } | null {
  const frames = sam.animations[animName] || []
  const box = animMedianBBox(sam, sprites, animName)
  if (!box) return null
  const lowLimit = box.y1 - (box.y1 - box.y0) * SHADOW_BOTTOM_ZONE
  const midX = (box.x0 + box.x1) / 2
  const halfW = (box.x1 - box.x0) / 2 || 1
  for (const frame of frames) {
    let best: { x: number; y: number; ratio: number; off: number } | null = null
    for (const [, resNum, m, color] of frame) {
      if (color[3] === 0 || resNum >= sam.images.length) continue
      const imgDef = sam.images[resNum]
      const spr = sprites[imgDef.name]
      if (!spr || spr.h <= 0) continue
      const ratio = spr.w / spr.h
      if (ratio < SHADOW_MIN_RATIO) continue
      const [m00, m01, m10, m11, m02, m12] = m
      const [i00, i01, i10, i11, i02, i12] = imgDef.m
      const cx = spr.w * 0.5, cy = spr.h * 0.5
      const pCx = i00 * cx + i01 * cy + i02
      const pCy = i10 * cx + i11 * cy + i12
      const x = m00 * pCx + m01 * pCy + m02
      const y = m10 * pCx + m11 * pCy + m12
      if (y <= 0 || y < lowLimit) continue
      // อยู่ใต้ลำตัว หรือแบนจนชัดว่าเป็นเงา — อย่างใดอย่างหนึ่ง (ดูเหตุผลที่ค่าคงที่ทั้งสอง)
      const sideOff = Math.abs(x - midX) / halfW
      if (sideOff > SHADOW_SIDE_MAX && ratio < SHADOW_CLEARLY_FLAT) continue
      // ลำดับการเลือก: ต่ำสุดก่อน → ถ้าอยู่ระดับเดียวกันเอาตัวที่อยู่ใต้ลำตัวกว่า → แล้วค่อยเอาตัวแบนกว่า
      // เอาตัวต่ำสุดเพราะเงาอยู่บนพื้นเสมอ (u1374e-fe มีชิ้น 142x38 แบนกว่าเงาจริง 0.07 แต่สูงกว่า 39)
      const better = !best
        || y > best.y + SHADOW_SAME_Y
        || (Math.abs(y - best.y) <= SHADOW_SAME_Y
            && (sideOff < best.off - 0.02 || (Math.abs(sideOff - best.off) <= 0.02 && ratio > best.ratio)))
      if (better) best = { x, y, ratio, off: sideOff }
    }
    if (best) return { x: best.x, y: best.y }
  }
  return shadowCenter ? anchorFromRatio(box, shadowCenter) : null
}

// ── กึ่งกลางภาพ "เฟรมแรก" ของ animation หนึ่งๆ (world unit ในพิกัดไฟล์) ──
// ใช้เป็นจุดอ้างอิงตอนกระสุนโผล่: เฟรมแรกคือภาพที่ผู้เล่นเห็นตอนกระสุนออกจากปากกระบอกจริงๆ
// ต่างจาก animBBox ที่เฉลี่ยทุกเฟรม — พอ anim มีหลายสไปรต์หรือมีหางลากตาม กรอบรวมจะไถลตามไปด้วย
// วัดแล้ว: anim normal ที่มีสไปรต์ตัวเดียว ค่านี้ตรงกับ animBBox เป๊ะ (จึงไม่เปลี่ยนไฟล์ที่ถูกอยู่แล้ว)
// ส่วนไฟล์หลายสไปรต์เพี้ยนจากกรอบรวมมัธยฐาน 19 สูงสุด 148 หน่วย
export function animFrame0Center(sam: SAMParser, sprites: SpriteMap, animName: string): { x: number; y: number } | null {
  const frame = (sam.animations[animName] || [])[0]
  if (!frame) return null
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [, resNum, m, color] of frame) {
    if (color[3] === 0 || resNum >= sam.images.length) continue
    const imgDef = sam.images[resNum]
    const spr = sprites[imgDef.name]
    if (!spr) continue
    const [m00, m01, m10, m11, m02, m12] = m
    const [i00, i01, i10, i11, i02, i12] = imgDef.m
    const cx = spr.w * 0.5, cy = spr.h * 0.5
    const pCx = i00 * cx + i01 * cy + i02
    const pCy = i10 * cx + i11 * cy + i12
    const wCx = m00 * pCx + m01 * pCy + m02
    const wCy = m10 * pCx + m11 * pCy + m12
    const f00 = m00 * i00 + m01 * i10, f01 = m00 * i01 + m01 * i11
    const f10 = m10 * i00 + m11 * i10, f11 = m10 * i01 + m11 * i11
    for (const sx of [-cx, cx]) {
      for (const sy of [-cy, cy]) {
        const px = wCx + f00 * sx + f01 * sy
        const py = wCy + f10 * sx + f11 * sy
        minX = Math.min(minX, px); maxX = Math.max(maxX, px)
        minY = Math.min(minY, py); maxY = Math.max(maxY, py)
      }
    }
  }
  return minX === Infinity ? null : { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

// ── กรอบมัธยฐานรายเฟรม (ไม่กรองขนาดสไปรต์) ──
// ทนต่อชิ้นส่วนที่พุ่งออกไปเฉพาะบางเฟรม แต่ไม่ตัดชิ้นส่วนตัวละครที่ใหญ่ทิ้ง
export function animMedianBBox(sam: SAMParser, sprites: SpriteMap, animName: string): { x0: number; x1: number; y0: number; y1: number } | null {
  const frames = sam.animations[animName] || []
  const x0s: number[] = [], x1s: number[] = [], y0s: number[] = [], y1s: number[] = []
  for (const frame of frames) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [, resNum, m, color] of frame) {
      if (color[3] === 0 || resNum >= sam.images.length) continue
      const imgDef = sam.images[resNum]
      const spr = sprites[imgDef.name]
      if (!spr) continue
      const [m00, m01, m10, m11, m02, m12] = m
      const [i00, i01, i10, i11, i02, i12] = imgDef.m
      const cx = spr.w * 0.5, cy = spr.h * 0.5
      const pCx = i00 * cx + i01 * cy + i02
      const pCy = i10 * cx + i11 * cy + i12
      const wCx = m00 * pCx + m01 * pCy + m02
      const wCy = m10 * pCx + m11 * pCy + m12
      const f00 = m00 * i00 + m01 * i10, f01 = m00 * i01 + m01 * i11
      const f10 = m10 * i00 + m11 * i10, f11 = m10 * i01 + m11 * i11
      for (const sx of [-cx, cx]) {
        for (const sy of [-cy, cy]) {
          const px = wCx + f00 * sx + f01 * sy, py = wCy + f10 * sx + f11 * sy
          minX = Math.min(minX, px); maxX = Math.max(maxX, px)
          minY = Math.min(minY, py); maxY = Math.max(maxY, py)
        }
      }
    }
    if (minX !== Infinity) { x0s.push(minX); x1s.push(maxX); y0s.push(minY); y1s.push(maxY) }
  }
  if (!x0s.length) return animBBox(sam, sprites, animName)
  return { x0: medianOf(x0s), x1: medianOf(x1s), y0: medianOf(y0s), y1: medianOf(y1s) }
}

export function animBBox(sam: SAMParser, sprites: SpriteMap, animName: string): { x0: number; x1: number; y0: number; y1: number } | null {
  const frames = sam.animations[animName] || []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const frame of frames) {
    for (const [, resNum, m, color] of frame) {
      if (color[3] === 0 || resNum >= sam.images.length) continue
      const imgDef = sam.images[resNum]
      const spr = sprites[imgDef.name]
      if (!spr) continue
      const [m00, m01, m10, m11, m02, m12] = m
      const [i00, i01, i10, i11, i02, i12] = imgDef.m
      const cx = spr.w * 0.5, cy = spr.h * 0.5
      const pCx = i00 * cx + i01 * cy + i02
      const pCy = i10 * cx + i11 * cy + i12
      const wCx = m00 * pCx + m01 * pCy + m02
      const wCy = m10 * pCx + m11 * pCy + m12
      // แปลง 4 มุมของสไปรต์ตามเมทริกซ์รวมจริง (f) เหมือนที่ renderSAMFrame วาด — ได้กรอบตรงกับภาพบนจอเป๊ะ
      // (เดิมใช้ max(w,h)/2 เป็นรัศมี = กรอบพองเกินจริง เพี้ยนหนักกับสไปรต์ยาวๆ เช่นไฟล์กระสุน ~40px)
      const f00 = m00 * i00 + m01 * i10, f01 = m00 * i01 + m01 * i11
      const f10 = m10 * i00 + m11 * i10, f11 = m10 * i01 + m11 * i11
      for (const sx of [-cx, cx]) {
        for (const sy of [-cy, cy]) {
          const px = wCx + f00 * sx + f01 * sy
          const py = wCy + f10 * sx + f11 * sy
          minX = Math.min(minX, px); maxX = Math.max(maxX, px)
          minY = Math.min(minY, py); maxY = Math.max(maxY, py)
        }
      }
    }
  }
  return minX === Infinity ? null : { x0: minX, x1: maxX, y0: minY, y1: maxY }
}

// ── แปลง shadowCenter (สัดส่วน 0..1 ของ bbox) → พิกัด world จริง ──
// x: 0=ซ้ายสุด bbox, 1=ขวาสุด bbox
// y: 0=ล่างสุด bbox (พื้น/anchor), 1=บนสุด bbox (หัว) — ตรงข้ามทิศกับ canvas Y (Y+ ลง)
export function anchorFromRatio(bbox: { x0: number; x1: number; y0: number; y1: number }, ratio: { x: number; y: number }): { x: number; y: number } {
  return {
    x: bbox.x0 + ratio.x * (bbox.x1 - bbox.x0),
    y: bbox.y1 - ratio.y * (bbox.y1 - bbox.y0),
  }
}

// ── จุดกึ่งกลางแนวนอน (world unit) ของ animation หนึ่งๆ ──
// art ใน .sam ไม่ได้อยู่กึ่งกลาง origin → ถ้ามิเรอร์รอบ origin ตรงๆ ตัวละครจะเด้งไปอีกฝั่ง
// ใช้ค่านี้เป็นแกนมิเรอร์แทน เพื่อกลับด้านโดยตำแหน่งไม่เพี้ยน
export function animCenterX(sam: SAMParser, sprites: SpriteMap, animName: string): number {
  const frames = sam.animations[animName] || []
  let minX = Infinity, maxX = -Infinity
  for (const frame of frames) {
    for (const [, resNum, m, color] of frame) {
      if (color[3] === 0 || resNum >= sam.images.length) continue
      const imgDef = sam.images[resNum]
      const spr = sprites[imgDef.name]
      if (!spr) continue
      const [m00, m01, , , m02] = m
      const [i00, i01, i10, i11, i02, i12] = imgDef.m
      const cx = spr.w * 0.5, cy = spr.h * 0.5
      const pCx = i00 * cx + i01 * cy + i02
      const pCy = i10 * cx + i11 * cy + i12
      const wCx = m00 * pCx + m01 * pCy + m02
      const r = Math.max(spr.w, spr.h) * 0.6
      minX = Math.min(minX, wCx - r); maxX = Math.max(maxX, wCx + r)
    }
  }
  return minX === Infinity ? 0 : (minX + maxX) / 2
}

// ── Auto-fit: คำนวณ bounding box ของทุก frame แล้วปรับ zoom + origin ──
//   sample max 60 frames เพื่อเร็ว — bounding radius แบบ conservative
export function autoFit(
  sam: SAMParser,
  sprites: SpriteMap,
  canvasW: number,
  canvasH: number,
): { zoom: number; originX: number; originY: number } | null {
  const allFrames = sam.animations['_all'] || []
  if (!allFrames.length) return null
  const step = Math.max(1, Math.floor(allFrames.length / 60))
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

  for (let fi = 0; fi < allFrames.length; fi += step) {
    for (const [, resNum, m, color] of allFrames[fi]) {
      if (color[3] === 0 || resNum >= sam.images.length) continue
      const imgDef = sam.images[resNum]
      const spr = sprites[imgDef.name]
      if (!spr) continue

      const [m00, m01, m10, m11, m02, m12] = m
      const [i00, i01, i10, i11, i02, i12] = imgDef.m
      const cx = spr.w * 0.5, cy = spr.h * 0.5
      const pCx = i00 * cx + i01 * cy + i02
      const pCy = i10 * cx + i11 * cy + i12
      const wCx = m00 * pCx + m01 * pCy + m02
      const wCy = m10 * pCx + m11 * pCy + m12

      const r = Math.max(spr.w, spr.h) * 0.6
      minX = Math.min(minX, wCx - r); maxX = Math.max(maxX, wCx + r)
      minY = Math.min(minY, wCy - r); maxY = Math.max(maxY, wCy + r)
    }
  }

  if (minX === Infinity) return null

  const contentW = (maxX - minX) || 1
  const contentH = (maxY - minY) || 1
  const pad = 0.88
  let zoom = Math.min((canvasW * pad) / contentW, (canvasH * pad) / contentH, 4.0)
  zoom = Math.max(zoom, 0.2)

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const originX = canvasW / 2 - centerX * zoom
  const originY = canvasH / 2 - centerY * zoom

  return { zoom, originX, originY }
}

// ── Grid renderer (background) ──
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  originX: number,
  originY: number,
  zoom: number,
): void {
  const ox = originX, oy = originY, z = zoom

  // adaptive spacing: ตั้งเป้า ~70px ระหว่างเส้นบนหน้าจอ
  const rawSpacing = 70 / z
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000]
  const spacing = nice.find(n => n >= rawSpacing) || 2000

  const worldR = (W - ox) / z
  const worldB = (H - oy) / z
  const x0 = Math.floor(-ox / z / spacing) * spacing
  const y0 = Math.floor(-oy / z / spacing) * spacing

  ctx.save()

  // เส้นตาราง (จาง)
  ctx.strokeStyle = 'rgba(255,255,255,0.055)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = x0; x <= worldR; x += spacing) {
    if (x === 0) continue
    const sx = Math.round(ox + x * z) + 0.5
    ctx.moveTo(sx, 0); ctx.lineTo(sx, H)
  }
  for (let y = y0; y <= worldB; y += spacing) {
    if (y === 0) continue
    const sy = Math.round(oy + y * z) + 0.5
    ctx.moveTo(0, sy); ctx.lineTo(W, sy)
  }
  ctx.stroke()

  // แกน X=0, Y=0
  ctx.strokeStyle = 'rgba(160,180,220,0.28)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const cxScreen = Math.round(ox) + 0.5
  const cyScreen = Math.round(oy) + 0.5
  ctx.moveTo(cxScreen, 0); ctx.lineTo(cxScreen, H)
  ctx.moveTo(0, cyScreen); ctx.lineTo(W, cyScreen)
  ctx.stroke()

  // จุด origin
  if (ox >= 0 && ox <= W && oy >= 0 && oy <= H) {
    ctx.fillStyle = 'rgba(160,180,220,0.5)'
    ctx.beginPath(); ctx.arc(ox, oy, 3.5, 0, Math.PI * 2); ctx.fill()
  }

  ctx.restore()
}
