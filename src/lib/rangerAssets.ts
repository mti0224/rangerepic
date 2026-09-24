// ====================================================
// rangerAssets.ts — โหลดไฟล์เรนเจอร์จาก public/rangers/<id>/
//
// หมายเหตุสำคัญ: ที่นี่ "ไม่" เรียก applyAttackCombos()
// เพราะเราต้องการคลิป cast กับ release แยกกัน ไม่ใช่รวมเป็น All_*
// รอยต่อระหว่างสองคลิปคือจังหวะที่ดาเมจ/กระสุนออก ซึ่งเป็นข้อมูลที่เราต้องใช้
//
// รูปทรงที่คำนวณตอนโหลดยกมาจาก Kiwi (loadBulletSam / loadDummyRanger)
// ====================================================

import { SAMParser, type SamFrame } from './animation/samParser'
import {
  loadSprites, disposeSprites,
  animBBox, animBBoxLoose, animBodyBBox, animMedianBBox, animCenterX,
  animFrame0Center, animGroundDecalY, animSelfArcRise, animStandPoint, anchorFromRatio,
  type SpriteMap,
} from './animation/samRenderer'
import { loadGameData, type GameData } from './gameData'
import { DEFAULT_FPS, SELF_ARC_MIN_RISE, type BulletGeometry } from './shotRules'
import type { Vec2 } from './rangerConfig'

/** ไฟล์กระสุน 1 ไฟล์ — normal = ช่วงเดินทาง, finish = ช่วงกระทบ */
export interface BulletAssets {
  sam: SAMParser
  sprites: SpriteMap
  normalName: string
  finishName: string | null
  flight: SamFrame[]
  impact: SamFrame[]
  geometry: BulletGeometry
}

/** รูปทรงของตัวเรนเจอร์ (ใช้ทั้งตอนเป็นผู้ยิงและตอนเป็นหุ่นเป้า) */
export interface RangerGeometry {
  idleName: string
  hitName: string | null
  /** แกนมิเรอร์ = กึ่งกลางตัว → กลับด้านแล้วยังยืนที่เดิม */
  pivotX: number
  /** จุดยืนที่หาเองจากเงาในไฟล์ (สำรองใช้ตอนยังไม่ได้ตั้ง anchors.ground) */
  autoStand: Vec2 | null
  /** จุดรับดาเมจ = กรอบลำตัว × faceCenter */
  faceAnchor: Vec2 | null
  /** ระดับอก = กึ่งกลางกรอบมัธยฐานรายเฟรม (แกน Y เท่านั้น) */
  centerY: number | null
}

export interface RangerAssets {
  id: string
  sam: SAMParser
  sprites: SpriteMap
  bullets: Record<string, BulletAssets>
  gameData: GameData | null
  geometry: RangerGeometry
  /** ปลดหน่วยความจำแล้วหรือยัง — วาดต่อไม่ได้ ImageBitmap ถูกปิดไปแล้ว */
  disposed: boolean
  dispose: () => void
}

const base = (id: string) => `/rangers/${encodeURIComponent(id)}`
const IDLE_ANIM_NAMES = ['idle', 'wait', 'stand']

/** โหลดชุด .sam + .plist + .png หนึ่งชุด (ใช้ได้ทั้งตัวละครและกระสุน) */
async function loadSamSet(id: string, stem: string) {
  const [samBuf, plistBuf, pngBlob] = await Promise.all([
    fetch(`${base(id)}/${stem}.sam`).then(r => { if (!r.ok) throw new Error(`ไม่พบ ${stem}.sam ของ ${id}`); return r.arrayBuffer() }),
    fetch(`${base(id)}/${stem}.plist`).then(r => { if (!r.ok) throw new Error(`ไม่พบ ${stem}.plist ของ ${id}`); return r.arrayBuffer() }),
    fetch(`${base(id)}/${stem}.png`).then(r => { if (!r.ok) throw new Error(`ไม่พบ ${stem}.png ของ ${id}`); return r.blob() }),
  ])
  return { sam: new SAMParser(samBuf), sprites: await loadSprites(plistBuf, pngBlob) }
}

function pickIdleAnimName(sam: SAMParser): string {
  return IDLE_ANIM_NAMES.find(n => sam.animations[n]?.length)
    ?? sam.animNames.find(n => n !== '_all' && sam.animations[n]?.length)
    ?? '_all'
}

export function rangerGeometry(sam: SAMParser, sprites: SpriteMap, gd: GameData | null): RangerGeometry {
  const idleName = pickIdleAnimName(sam)
  const shadowCenter = gd?.render?.shadowCenter ?? null
  const faceCenter = gd?.render?.faceCenter ?? null
  const bodyBox = animBodyBBox(sam, sprites, idleName)
  const medBox = animMedianBBox(sam, sprites, idleName)
  return {
    idleName,
    hitName: sam.animations['target']?.length ? 'target' : null,
    pivotX: animCenterX(sam, sprites, idleName),
    autoStand: animStandPoint(sam, sprites, idleName, shadowCenter)
      ?? (bodyBox && shadowCenter ? anchorFromRatio(bodyBox, shadowCenter) : null),
    faceAnchor: bodyBox && faceCenter ? anchorFromRatio(bodyBox, faceCenter) : null,
    centerY: medBox ? (medBox.y0 + medBox.y1) / 2 : null,
  }
}

/** ตาม loadBulletSam ของ Kiwi ทุกขั้น */
export function bulletGeometry(
  id: string, suffix: string, sam: SAMParser, sprites: SpriteMap, gd: GameData | null,
): { normalName: string; finishName: string | null; geometry: BulletGeometry } | null {
  // ไม่มี normal → ใช้ anim แรกในไฟล์แทน
  const normalName = sam.animations['normal']?.length
    ? 'normal'
    : sam.animNames.find(n => n !== '_all' && sam.animations[n]?.length) ?? null
  if (!normalName) return null
  const finishName = sam.animations['finish']?.length ? 'finish' : null

  const faceCenter = gd?.render?.faceCenter ?? null
  const shadowCenter = gd?.render?.shadowCenter ?? null

  // กรอบของ normal เป็นหลัก ถอยไป finish เฉพาะตอน normal ว่างจริง (ห้ามรวมสองกรอบ)
  const loose = animBBoxLoose(sam, sprites, normalName) ?? (finishName ? animBBoxLoose(sam, sprites, finishName) : null)
  const exact = animBBox(sam, sprites, normalName) ?? (finishName ? animBBox(sam, sprites, finishName) : null)
  // ท่าไม่บิน: ศิลปะจริงมักอยู่ใน finish (normal เป็นเฟรมเปล่า)
  const effectAnim = finishName && animBBox(sam, sprites, finishName) ? finishName : normalName
  const effectBox = animBBox(sam, sprites, effectAnim) ?? loose

  return {
    normalName,
    finishName,
    geometry: {
      fileKey: `${id}-${suffix}`,
      normalFrames: sam.animations[normalName]?.length ?? 0,
      finishFrames: finishName ? sam.animations[finishName]?.length ?? 0 : 0,
      fps: sam.animRate || DEFAULT_FPS,
      faceAnchor: loose && faceCenter ? anchorFromRatio(loose, faceCenter) : null,
      shadowAnchor: exact && shadowCenter ? anchorFromRatio(exact, shadowCenter) : null,
      spawnRef: animFrame0Center(sam, sprites, normalName),
      burstRef: finishName ? animFrame0Center(sam, sprites, finishName) : null,
      artTop: effectBox ? effectBox.y0 : null,
      decalY: animGroundDecalY(sam, sprites, effectAnim),
      selfArc: animSelfArcRise(sam, sprites, normalName) >= SELF_ARC_MIN_RISE,
      // shadowCenter = null → ได้เงาที่วาดไว้จริงเท่านั้น ไม่เดาจากสัดส่วนกรอบ
      bulShadow: animStandPoint(sam, sprites, normalName, null),
    },
  }
}

/**
 * โหลดตัวละคร + ข้อมูลเกม + กระสุนทุกไฟล์ที่มี
 * @param bullets รายชื่อไฟล์กระสุนที่มีจริง (จาก /api/rangers) เช่น ['bul','bul3']
 */
export async function loadRangerAssets(id: string, bullets: string[] = []): Promise<RangerAssets> {
  const [body, gameData] = await Promise.all([loadSamSet(id, 'body'), loadGameData(id)])

  const loaded: Record<string, BulletAssets> = {}
  for (const suffix of bullets) {
    try {
      const { sam, sprites } = await loadSamSet(id, suffix)
      const info = bulletGeometry(id, suffix, sam, sprites, gameData)
      if (!info) { disposeSprites(sprites); continue }
      loaded[suffix] = {
        sam,
        sprites,
        normalName: info.normalName,
        finishName: info.finishName,
        flight: sam.animations[info.normalName] ?? [],
        impact: info.finishName ? sam.animations[info.finishName] ?? [] : [],
        geometry: info.geometry,
      }
    } catch {
      // ไฟล์นี้โหลดไม่ได้ — นับเป็นไม่มีไฟล์ ตัวละครยังใช้งานได้ปกติ
    }
  }

  const assets: RangerAssets = {
    id,
    sam: body.sam,
    sprites: body.sprites,
    bullets: loaded,
    gameData,
    geometry: rangerGeometry(body.sam, body.sprites, gameData),
    disposed: false,
    dispose: () => {
      if (assets.disposed) return
      assets.disposed = true
      disposeSprites(body.sprites)
      for (const b of Object.values(loaded)) disposeSprites(b.sprites)
    },
  }
  return assets
}
