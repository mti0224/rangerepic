// ====================================================
// shotRules.ts — กฎการยิงกระสุน/สกิล ยกมาจาก Line Ranger Kiwi (RangerAnimationPopup.tsx)
//
// ไฟล์นี้ไม่แตะ canvas และไม่มี state — รับข้อมูลเข้า คืน "แผนการยิง" ออก จึงเทสต์ได้ตรงๆ
//
// ระบบพิกัดของทุกค่าในไฟล์นี้ = "kiwi space" = พิกัดดิบในไฟล์ .sam ของตัวผู้ยิง
// (ตัวผู้ยิงถูกวาดที่ origin ไม่เลื่อน) — ฉากค่อยเลื่อนทั้งโลกทีหลังตอนวาด
// ====================================================

import type { AttackKind, MoveData, SkillInfo } from './gameData'
import type { Vec2 } from './rangerConfig'

// ── ค่าคงที่ (ตรงกับ Kiwi) ──
export const PT_TO_WORLD = 2.1
/**
 * ตัวคูณความเร็วกระสุนทั้งเกม — ปรับที่นี่ที่เดียว (มาก = เร็ว)
 * Kiwi ใช้ 1.95 จากสมมติฐานว่าฟิสิกส์ของเกมเดิน 60Hz (ยังไม่เคยยืนยัน)
 * แต่ระยะหุ่นของเราสั้นกว่า Kiwi กระสุนเลยถึงเป้าใน 2-4 ติ๊ก แทบมองไม่ทัน
 * ลดเหลือครึ่งหนึ่ง: ระยะ 480 ใช้เวลาราว 0.17-0.53 วิ ตาม moveSpeed ของแต่ละท่า
 */
export const PROJECTILE_SPEED_TUNE = 0.95
export const PROJECTILE_SPEED_SCALE = PT_TO_WORLD * PROJECTILE_SPEED_TUNE
export const PROJECTILE_FALLBACK_SPEED = 30
export const ARC_MAX_HEIGHT = 255
export const ARC_FLATTEN = 3800
export const SELF_ARC_MIN_RISE = 40
export const INSTANT_DROP_ART_TOP = -300
export const CHARGE_STOP_SHORT = 40
export const SPAWN_Y_BIAS = 0
export const DUMMY_FLASH_TICKS = 4
export const DUMMY_FLASH_ALPHA = 0.55
export const DEFAULT_FPS = 24

/** ไฟล์กระสุนสำรอง — ใช้เฉพาะตอนข้อมูลไม่ส่ง animationPart มา */
export const FALLBACK_SUFFIX: Record<AttackKind, string> = {
  normal: 'bul',
  skill1: 'bul2',
  skill2: 'bul3',
}

// ── ค่ายกเว้นรายไฟล์กระสุน (คีย์ตระกูล = ถอดตัวอักษรบอกร่างออก) ──
export interface BulletOverride {
  x?: number
  y?: number
  targetFace?: boolean
  fitNormal?: boolean
  contactFace?: boolean
  finishMain?: boolean
}

export const INSTANT_ANCHOR_OVERRIDE: Record<string, BulletOverride> = {
  'u1524-ak-bul3': { x: 0, y: 0 },
  'u1524-ak-bul': { x: 0 },
  'u1004-sally-bul2': { x: 184, y: 241 },
  'u1522-po-bul': { targetFace: true },
  'u1512-ty-bul': { targetFace: true },
  'u1281-lv-bul2': { x: 0, y: 0 },
  'u1556-af-bul3': { fitNormal: true },
  'u1612-cony-bul3': { contactFace: true },
  'u1539-en-bul': { x: 0, y: 0 },
  'u1374-fe-bul3': { x: 0, y: 0 },
}

/** จุดปล่อยที่จูนด้วยตา (พิกัด kiwi space ตรงๆ) — คีย์ "<ตระกูล>:<kind>" */
export const ATTACK_START_OVERRIDE: Record<string, Vec2> = {
  'u1317-brown:normal': { x: 180, y: -345 },
  'u1550-moon:skill1': { x: 135, y: 36 },
  'u1512-ty:normal': { x: 150, y: -6 },
}

/** แก้เฉพาะ start.y ที่ข้อมูลเขียนต่ำผิดสังเกต (หน่วยเดียวกับข้อมูล = นับขึ้นจากพื้น) */
export const START_Y_OVERRIDE: Record<string, number> = {
  'u1306-az:skill1': 150,
  'u1305-az:skill1': 150,
}

/** u1297e-sn-bul → u1297-sn-bul (ไฟล์ของทุกร่างวิวัฒน์ใช้ค่ายกเว้นร่วมกัน) */
export function familyKey(key: string): string {
  return key.replace(/^(u\d+)[a-z]+-/, '$1-')
}

export function bulletOverride(fileKey: string): BulletOverride | undefined {
  return INSTANT_ANCHOR_OVERRIDE[fileKey] ?? INSTANT_ANCHOR_OVERRIDE[familyKey(fileKey)]
}

/** หมุดแนวตั้งของท่าไม่บิน: จุดยืน หรือรอยพื้นในไฟล์ถ้ามันอยู่สูงกว่า */
export function instantAnchorY(rangerStandY: number, decalY: number | null): number {
  return decalY === null ? rangerStandY : Math.min(rangerStandY, decalY)
}

/**
 * จุดปล่อยจากค่า start ของข้อมูล — x นับจาก origin, y นับขึ้นจากจุดยืน
 * start.y = 0 แปลว่า "ไม่ได้ระบุ" → ใช้ระดับ origin ของ rig (ราวระดับอก)
 */
export function attackStartWorld(start: Vec2, standY: number, key?: string): Vec2 {
  const o = key ? ATTACK_START_OVERRIDE[key] ?? ATTACK_START_OVERRIDE[familyKey(key)] : undefined
  if (o) return { ...o }
  const y = (key ? START_Y_OVERRIDE[key] ?? START_Y_OVERRIDE[familyKey(key)] : undefined) ?? start.y
  return { x: start.x, y: (y === 0 ? 0 : standY - y) + SPAWN_Y_BIAS }
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** ความสูงยอดโค้ง — ใช้กำลังสองเพื่อให้เป้าใกล้แบนลงเร็ว แต่เป้าไกลยังชนเพดาน */
export function arcPeak(dist: number): number {
  return Math.min(ARC_MAX_HEIGHT, (dist * dist) / ARC_FLATTEN)
}

/** ตำแหน่งกระสุนที่ความคืบหน้า p (0..1) — โค้งทรงพาราโบลา 4p(1-p) */
export function arcPathPos(start: Vec2, end: Vec2, p: number, peak: number): Vec2 {
  return {
    x: lerp(start.x, end.x, p),
    y: lerp(start.y, end.y, p) - peak * 4 * p * (1 - p),
  }
}

// ── ข้อมูลรูปทรงของไฟล์กระสุน (คำนวณครั้งเดียวตอนโหลด) ──
export interface BulletGeometry {
  fileKey: string            // เช่น "u1524e-ak-bul3" — ใช้หาค่ายกเว้น
  normalFrames: number
  finishFrames: number
  fps: number
  faceAnchor: Vec2 | null    // กรอบหลวมของ normal × faceCenter ของเจ้าของ
  shadowAnchor: Vec2 | null  // กรอบแม่นยำของ normal × shadowCenter ของเจ้าของ (= MAIN ของกระสุน)
  spawnRef: Vec2 | null      // กึ่งกลางภาพเฟรมแรกของ normal
  burstRef: Vec2 | null      // กึ่งกลางภาพเฟรมแรกของ finish
  artTop: number | null      // ขอบบนของภาพเอฟเฟกต์ — ≤ -300 = ของตกจากฟ้า
  decalY: number | null      // รอยกระแทกพื้นที่วาดไว้ในไฟล์
  selfArc: boolean           // normal ลอยขึ้นเองอย่างน้อย 40 หน่วย
  bulShadow: Vec2 | null     // เงาในไฟล์กระสุน — มี = ไฟล์นี้เป็นตัวละครวิ่งเข้าไปตี
}

/** จุดบนตัวเป้าหมาย (kiwi space) */
export interface TargetPoints {
  main: Vec2          // จุดยืน
  face: Vec2          // จุดรับดาเมจ
  center: Vec2 | null // ระดับอก
}

export interface HitPlan {
  aimRear: boolean
  isSkill: boolean
  areaWorld: number
  centerX: number
}

export interface ShotContext {
  rangerId: string
  kind: AttackKind
  meta: MoveData
  skill: SkillInfo | null
  stand: Vec2
  bodyFps: number
  front: TargetPoints
  rear: TargetPoints | null
  /** undefined = ไฟล์นี้ไม่มีอยู่จริง (ตีประชิด) */
  bulletFor: (suffix: string) => BulletGeometry | undefined
  /** ตั้งตำแหน่งเอง: แทนจุดปล่อยและจุดตกที่คำนวณได้ (muzzle เทียบจุดยืน, impact เทียบ MAIN ของเป้า — บัฟเทียบจุดยืนผู้ร่าย) */
  manual?: { muzzle: Vec2; impactOffset: Vec2 } | null
  /** เพิ่มเติมนอกเหนือ Kiwi — ใช้กับข้อมูลที่สร้างเองตอนไม่มีข้อมูลเกม */
  arcPeakOverride?: number | null
  fitNormalOverride?: boolean
  /** กระสุนเฉียงตามทิศไปจุดกระทบ + หมุนเพิ่ม (องศา) */
  aimTilt?: boolean
  aimTiltOffset?: number
  /** finish เฉียงตามทิศตอนถึงเป้าด้วย (ต้องเปิด aimTilt) */
  aimTiltFinish?: boolean
}

export interface MeleePlan {
  type: 'melee'
  isBuff: boolean
  hit: HitPlan | null
}

export interface ShotPlanData {
  type: 'shot'
  suffix: string
  isBuff: boolean
  isInstant: boolean
  aimGround: boolean
  useRear: boolean
  start: Vec2
  end: Vec2
  /** จุดเล่น finish ที่ตั้งแยกไว้ (kiwi space) — null = เล่นที่ end ตามกฎเดิม */
  finishAt: Vec2 | null
  travelTicks: number
  finishTicks: number
  anchor: Vec2
  finishAnchor: Vec2
  hasArc: boolean
  arcPeak: number
  rotation: string
  angleStart: number
  angleEnd: number
  /** เฉียงตามทิศจุดปล่อย → จุดกระทบ (ทางโค้ง = ตามเส้นสัมผัสของโค้ง) */
  aimTilt: boolean
  /** หมุนเพิ่มตอนเฉียง (เรเดียน) */
  aimTiltOffset: number
  /** finish เฉียงตามทิศตอนถึงเป้า (+ หมุนเพิ่ม) · false = finish แนวนอนแบบเดิม */
  aimTiltFinish: boolean
  fitNormal: boolean
  bulletFps: number
  bodyFps: number
  normalFrames: number
  finishFrames: number
  hit: HitPlan | null
}

export type ShotPlan = MeleePlan | ShotPlanData

export function resolveSuffix(kind: AttackKind, meta: MoveData): string {
  return meta.animationPart ?? FALLBACK_SUFFIX[kind]
}

/** บัฟ = 觸發基準 เป็น Self · ถ้าไม่มีค่านี้ ดู motion.type === 'NONE' แทน */
export function isBuffMove(kind: AttackKind, meta: MoveData, skill: SkillInfo | null): boolean {
  const basis = kind === 'normal' ? null : skill?.basis?.type ?? null
  return basis ? basis === 'self' : meta.motion.type === 'NONE'
}

/** ไม่บิน = motion ปิด / ไม่มีความเร็ว / ไม่มีจุดปล่อย */
export function isInstantMove(meta: MoveData): boolean {
  return !meta.motion.enabled || meta.moveSpeed <= 0 || (!meta.start.x && !meta.start.y)
}

/** วางแผนการยิง 1 นัด ตามกฎของ Kiwi ทุกข้อ */
export function planShot(ctx: ShotContext): ShotPlan {
  const { kind, meta, skill, stand, front, rear } = ctx
  const basis = kind === 'normal' ? null : skill?.basis?.type ?? null
  const useRear = kind !== 'normal' && basis === 'rear' && !!rear
  const aimed = useRear && rear ? rear : front
  const isBuff = isBuffMove(kind, meta, skill)
  const isSkill = kind !== 'normal'
  const areaWorld = kind === 'normal' ? 0 : (skill?.area ?? 0) * PT_TO_WORLD
  const suffix = resolveSuffix(kind, meta)
  const asset = ctx.bulletFor(suffix)

  // ── ไม่มีไฟล์กระสุน = ตีประชิด → เป้าโดนตีทันทีที่จุดปล่อย ──
  if (!asset) {
    return {
      type: 'melee',
      isBuff,
      hit: isBuff ? null : { aimRear: useRear, isSkill, areaWorld, centerX: aimed.main.x },
    }
  }

  const sp = attackStartWorld(meta.start, stand.y, `${ctx.rangerId}:${kind}`)
  const isInstant = isInstantMove(meta)
  const rate = meta.hitPointRate
  const halfRate = rate !== null && rate > 0 && rate <= 1
  const ov = bulletOverride(asset.fileKey)
  const forceFace = ov?.targetFace === true || halfRate
  const dropFromSky = asset.artTop !== null && asset.artTop <= INSTANT_DROP_ART_TOP
  const pinnedAnchor = ov?.x !== undefined || ov?.y !== undefined
  const aimGround = !forceFace && (rate === 0 || (isInstant && (dropFromSky || pinnedAnchor)))

  const instA: Vec2 = {
    x: ov?.x ?? (halfRate ? 0 : stand.x),
    y: ov?.y ?? (halfRate ? 0 : instantAnchorY(stand.y, asset.decalY)),
  }
  const faceA = asset.faceAnchor ?? { x: 0, y: 0 }
  const mainA = asset.shadowAnchor ?? { x: 0, y: 0 }
  const contactFace = ov?.contactFace === true

  const targetCenterPt = ov?.targetFace === true || !aimed.center ? aimed.face : aimed.center
  let target: Vec2 = isBuff ? stand : aimGround ? aimed.main : targetCenterPt

  // หมุดช่วงบิน: ลงพื้นใช้ instA · rate เศษส่วนใช้ MAIN ของกระสุน · ปกติใช้กึ่งกลางเฟรมแรก
  const flightA: Vec2 = (isInstant && aimGround) ? instA
    : (halfRate ? mainA : (asset.spawnRef ?? asset.burstRef ?? faceA))

  const shiftX = !isInstant && aimGround ? flightA.x - mainA.x
    : !isInstant && halfRate && contactFace ? flightA.x - faceA.x : 0
  const shiftY = !isInstant && aimGround ? flightA.y - mainA.y
    : !isInstant && halfRate && contactFace ? flightA.y - faceA.y : 0
  const stopShort = !isInstant && aimGround ? CHARGE_STOP_SHORT : 0

  // ตั้งตำแหน่งเอง: จุดตกเทียบ MAIN ของเป้าที่เล็ง · บัฟเทียบจุดยืนของผู้ร่าย
  if (ctx.manual) {
    const base = isBuff ? stand : aimed.main
    target = { x: base.x + ctx.manual.impactOffset.x, y: base.y + ctx.manual.impactOffset.y }
  }
  const endX = ctx.manual ? target.x : target.x + shiftX - stopShort
  const endY = ctx.manual ? target.y : target.y + shiftY

  // ── จุดปล่อย ──
  const runIn = !isInstant && !!asset.bulShadow
  const spawnRefPt = runIn ? asset.bulShadow : asset.spawnRef
  const spawnAt = runIn ? stand : sp
  // คีย์ตรงตัวเท่านั้น (ไม่ใช่คีย์ตระกูล) — ตรงตามโค้ดเดิมที่จูนด้วยตามาแล้ว
  const startKey = `${ctx.rangerId}:${kind}`
  const spawnShift = !isInstant && !ATTACK_START_OVERRIDE[startKey] && spawnRefPt
    ? { x: flightA.x - spawnRefPt.x, y: flightA.y - spawnRefPt.y }
    : { x: 0, y: 0 }
  let startX = spawnAt.x + spawnShift.x
  let startY = spawnAt.y + spawnShift.y
  if (ctx.manual) {
    startX = stand.x + ctx.manual.muzzle.x
    startY = stand.y + ctx.manual.muzzle.y
  }

  const dist = Math.hypot(endX - startX, endY - startY)
  const speed = (meta.moveSpeed > 0 ? meta.moveSpeed : PROJECTILE_FALLBACK_SPEED) * PROJECTILE_SPEED_SCALE
  const normalFrames = asset.normalFrames || 1
  const finishFrames = asset.finishFrames || 0
  const bulletFps = asset.fps || DEFAULT_FPS
  const bodyFps = ctx.bodyFps || DEFAULT_FPS

  // ไม่บิน: เล่น normal จนครบความยาวของมันเองที่เป้า · บิน: ระยะ ÷ ความเร็วต่อติ๊ก
  const travelTicks = isInstant
    ? Math.max(1, Math.round(normalFrames * (bodyFps / bulletFps)))
    : Math.max(1, Math.round(dist / speed))

  const hasArc = meta.motion.type === 'CURVE' && !asset.selfArc

  return {
    type: 'shot',
    suffix,
    isBuff,
    isInstant,
    aimGround,
    useRear,
    start: isInstant ? { x: endX, y: endY } : { x: startX, y: startY },
    end: { x: endX, y: endY },
    finishAt: null,
    travelTicks,
    finishTicks: finishFrames > 0 ? (finishFrames / bulletFps) * bodyFps : 0,
    anchor: flightA,
    // ท่าลงพื้นใช้หมุดเดียวทั้งท่า (ไม่งั้นภาพกระตุกตอนกระทบ)
    finishAnchor: ov?.finishMain
      ? { x: 0, y: 0 }
      : (aimGround ? flightA : (asset.burstRef ?? flightA)),
    hasArc,
    arcPeak: hasArc ? (ctx.arcPeakOverride ?? arcPeak(dist)) : 0,
    rotation: meta.motion.rotation,
    angleStart: meta.angle.start,
    angleEnd: meta.angle.end,
    aimTilt: ctx.aimTilt === true,
    aimTiltOffset: ((ctx.aimTiltOffset ?? 0) * Math.PI) / 180,
    aimTiltFinish: ctx.aimTilt === true && ctx.aimTiltFinish === true,
    fitNormal: ov?.fitNormal === true || ctx.fitNormalOverride === true,
    bulletFps,
    bodyFps,
    normalFrames,
    finishFrames,
    hit: isBuff ? null : { aimRear: useRear, isSkill, areaWorld, centerX: aimed.main.x },
  }
}

/** ตำแหน่ง + มุมหมุน ของกระสุน ณ ติ๊กที่ T นับจากเกิด */
export function shotPose(plan: ShotPlanData, T: number): { pos: Vec2; angle: number; landed: boolean } {
  if (T >= plan.travelTicks) {
    // finish เฉียงตามทิศตอนกระสุนถึง (ปลายทาง = เส้นสัมผัสตอนจบ · ทางโค้ง = ขาลง) + หมุนเพิ่ม
    let angle = 0
    if (plan.aimTiltFinish && plan.travelTicks > 0) {
      const k = plan.hasArc ? plan.arcPeak : 0
      const a = arcPathPos(plan.start, plan.end, 0.99, k)
      const b = arcPathPos(plan.start, plan.end, 1, k)
      angle = Math.atan2(b.y - a.y, b.x - a.x) + plan.aimTiltOffset
    }
    return { pos: plan.finishAt ?? plan.end, angle, landed: true }
  }
  const p = plan.travelTicks > 0 ? Math.min(1, Math.max(0, T / plan.travelTicks)) : 1
  const pos = arcPathPos(plan.start, plan.end, p, plan.hasArc ? plan.arcPeak : 0)

  let angle = 0
  if (plan.rotation === 'ANGLE_LERP') {
    angle = (lerp(plan.angleStart, plan.angleEnd, p) * Math.PI) / 180
  }
  // หมุนตามทิศทางเส้นทาง: ข้อมูลที่ตั้งเอง (ALONG_PATH) หรือติ๊ก "เฉียงตามจุดกระทบ" ใน editor
  if (plan.rotation === 'ALONG_PATH' || plan.aimTilt) {
    const k = plan.hasArc ? plan.arcPeak : 0
    const a = arcPathPos(plan.start, plan.end, Math.max(0, p - 0.005), k)
    const b = arcPathPos(plan.start, plan.end, Math.min(1, p + 0.005), k)
    const along = Math.atan2(b.y - a.y, b.x - a.x)
    angle = (plan.rotation === 'ALONG_PATH' ? along : angle + along) + (plan.aimTilt ? plan.aimTiltOffset : 0)
  }
  return { pos, angle, landed: false }
}

/**
 * เฟรมกระสุนที่ต้องวาด ณ ติ๊ก T (ติ๊กของ body) — null = หมดอายุหรือไม่มีภาพ
 * แปลงติ๊ก body เป็นเฟรมกระสุนด้วยอัตรา bulletFps / bodyFps
 */
export function shotFrameIndex(plan: ShotPlanData, T: number): { clip: 'normal' | 'finish'; index: number } | null {
  if (T < 0) return null
  const rate = plan.bulletFps / plan.bodyFps
  if (T <= plan.travelTicks) {
    const p = plan.travelTicks > 0 ? Math.min(1, T / plan.travelTicks) : 1
    const index = plan.fitNormal
      // ยืดให้จบพอดีตอนถึงเป้า ไม่วนซ้ำ
      ? Math.min(plan.normalFrames - 1, Math.floor(p * plan.normalFrames))
      // ปกติ: วน normal ซ้ำตาม fps ของกระสุน
      : Math.floor(T * rate) % plan.normalFrames
    return { clip: 'normal', index }
  }
  if (plan.finishFrames > 0 && T <= plan.travelTicks + plan.finishTicks) {
    const age = T - plan.travelTicks
    return { clip: 'finish', index: Math.min(plan.finishFrames - 1, Math.floor(age * rate)) }
  }
  return null
}

/**
 * เหมือน shotFrameIndex แต่บอกเฟรมถัดไปกับเศษด้วย — ไว้ผสมเฟรมกลางให้ภาพลื่น
 * next = null เมื่อไม่มีเฟรมให้ผสมต่อ (เฟรมสุดท้ายของ finish / ของ normal แบบยืดพอดี)
 */
export function shotFrameMix(plan: ShotPlanData, T: number): { clip: 'normal' | 'finish'; index: number; next: number | null; frac: number } | null {
  const idx = shotFrameIndex(plan, T)
  if (!idx) return null
  const rate = plan.bulletFps / plan.bodyFps
  let pos: number, count: number, loop: boolean
  if (idx.clip === 'normal') {
    count = plan.normalFrames
    loop = !plan.fitNormal
    pos = plan.fitNormal
      ? (plan.travelTicks > 0 ? Math.min(1, T / plan.travelTicks) : 1) * count
      : T * rate
  } else {
    count = plan.finishFrames
    loop = false
    pos = (T - plan.travelTicks) * rate
  }
  const frac = Math.max(0, Math.min(1, pos - Math.floor(pos)))
  const next = idx.index + 1 < count ? idx.index + 1 : loop ? 0 : null
  return { ...idx, next, frac: next === null ? 0 : frac }
}

/** กระสุนนัดนี้หมดอายุหรือยัง — ไม่มี finish จะหายตอนถึงเป้า */
export function shotExpired(plan: ShotPlanData, T: number): boolean {
  return T > plan.travelTicks + plan.finishTicks
}
