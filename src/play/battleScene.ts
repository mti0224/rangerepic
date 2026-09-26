// ====================================================
// battleScene.ts — สนามรบ 5v5 (ภาพ + จังหวะ) ขับด้วยกติกาใน battle.ts
//
// หน้าจอตรรกะ 1280×720 (16:9) · พิกัดโลกเป็นหน่วยของ .sam แล้วคูณ CAMERA_ZOOM ตอนวาด
// ทีม 0 อยู่ซ้ายหันขวา · ทีม 1 อยู่ขวาหันซ้าย (กลับด้านทั้งตัวละครและกระสุน)
//
// เปิดฉาก (intro): ม่านดำแยกขึ้น–ลง → เรนเจอร์เดินจากนอกจอเข้าประจำช่องตัวเอง → ขึ้น START → เริ่มเทิร์นแรก
//
// 1 เทิร์น = [เดินเข้าไป] → ร่าย → ปล่อย (เฟรมผ่าน readyLen) → กระสุน/ประชิด → โดนตี
//           → [เดินกลับ] → หยุดพักสั้นๆ → เทิร์นถัดไป
// การวางแผนยิงใช้ lib/actionPlan ตัวเดียวกับ editor — ตั้งค่าอะไรไว้ในหน้า editor ก็เห็นผลตรงนี้
// ====================================================

import { lerpSAMFrame, renderSAMFrame } from '@/lib/animation/samRenderer'
import { SamPlayer, SPEED_PROFILES } from '@/lib/samPlayer'
import type { RangerAssets } from '@/lib/rangerAssets'
import type { ActionName, RangerConfig, Vec2 } from '@/lib/rangerConfig'
import {
  DUMMY_FLASH_ALPHA, DUMMY_FLASH_TICKS,
  shotExpired, shotFrameMix, shotPose,
  type ShotPlan, type ShotPlanData, type TargetPoints,
} from '@/lib/shotRules'
import { approachOffsetOf, bodyFpsOf, bodyPointsOf, planAction } from '@/lib/actionPlan'
import { loadDeathEffects, loadStatusIcons, type DeathEffects, type StatusIconFx, type StatusIcons } from '@/lib/effects'
import { previewLoss, type ActionPreview, type ActionResult, type Battle, type DotType, type Team, type Unit } from './battle'
import { CUTIN_SEC, cutinsOn, frameBounds, paintCutin, renderCutinArt, type CutinArt, type CutinPlay } from '@/lib/cutin'
import { elementIcon } from './uiAssets'
import type { GameInfo } from '@/lib/rangerApi'
import { BattleHud, PREVIEW_BLINK_HZ } from './battleHud'
import { isDebuffLabel } from './statusLabels'
import { getLang, localName, statusLabel, t, turnsShort } from './i18n'
import { properNameZhTw } from './zhNames'
import { imageReady, portraitCenter } from '@/lib/portrait'
import { adaptRangerConfigForGameplay } from '@/lib/gameplayAdapter'

export { STATUS_LABEL } from './statusLabels'

const STUN_SKIP_SEC = 0.6
/** ตำแหน่งไอคอนเทียบหลอดเลือด (หน่วยโลก): โล่อยู่เหนือหลอด · ดาวชะงักวนรอบหัวใต้หลอด */
const ICON_SHIELD_ABOVE_BAR = 30
/** ตัวที่ยังไม่ตั้งจุดเหนือหัว: หลอดเลือด/ป้ายสถานะ/ตัวเลขลอยเหนือระดับหน้าเท่านี้ (หน่วยโลก) */
const HEAD_ABOVE_FACE = 93
/** หลอดเลือดยกสูงกว่าจุดเหนือหัวเท่านี้ (หน่วยโลก) — เว้นที่ให้ป้าย Lv. ใต้หลอด */
const HP_BAR_RAISE = 16
/** ดาวชะงักอยู่ที่ระดับหัวเดิม (ใต้หลอด) — หลอดยกสูงขึ้น ดาวไม่ขยับตาม */
const ICON_STUN_BELOW_BAR = 38 + (HEAD_ABOVE_FACE - 75)
/** ไอคอนสถานะเหนือหัว: สถานะไหนมีไอคอน */
type IconType = 'barrier' | 'stun'
const ICON_TYPES: IconType[] = ['barrier', 'stun']
interface IconState { phase: 'in' | 'loop' | 'out'; t: number }
/** บาเรีย (อมตะ): ย้อมทองทั้งตัว ความทึบ 0.45 ± 0.12 */
const BARRIER_TINT_ALPHA = 0.45
const BARRIER_TINT_PULSE = 0.12

export const VIEW_W = 1280
export const VIEW_H = 720
/** ตัวละครสูงราว 170 หน่วย × 0.82 ≈ 140px บนจอ 720 — เห็นท่าชัดโดยสนามยังไม่แน่น */
export const CAMERA_ZOOM = 0.82
const WORLD_W = VIEW_W / CAMERA_ZOOM

/**
 * ตำแหน่งเท้าของแต่ละช่อง กำหนดเป็นพิกเซลบนจอ (1280×720) ของทีมซ้าย แล้วแปลงเป็นพิกัดโลก
 * แถวหลังเรียงเฉียงสลับซ้าย-ขวา (กลางถอยหลังสุด) — ห่างกันในแกน X มากพอที่เอฟเฟกต์บัฟของตัวหน้าจะไม่บังตัวที่อยู่หลัง
 * ทีมขวาคือภาพสะท้อนของทีมซ้าย
 */
const LEFT_SLOTS_PX = {
  front: [{ x: 470, y: 470 }, { x: 400, y: 585 }],
  back: [{ x: 315, y: 430 }, { x: 170, y: 530 }, { x: 275, y: 630 }],
}
/** ลูกศรเล็งอยู่เหนือหลอดเลือดกี่ px (จอ) */
/** ลูกศรเล็งเหนือหลอดเลือด (px) — เผื่อที่ให้ป้ายบัฟ/ดีบัฟ + ตัวเลขไกด์ที่อยู่เหนือหลอด */
const AIM_MARK_ABOVE = 57
/** ยกทั้งกลุ่มขึ้น (px จอ) เว้นที่ด้านล่างจอไว้ใส่ UI · แถวหลังบนสุดยังยืนบนพื้นหญ้า ต่ำกว่าแนวน้ำ (~y 313) */
const FIELD_SHIFT_Y = -60
/** เลื่อนทั้งสนาม (ทั้งสองทีม) ไปทางขวา (px จอ) — เว้นที่ซ้ายจอให้รางลำดับเทิร์น */
export const FIELD_SHIFT_X = 28
export function slotPosition(team: Team, row: 'front' | 'back', lane: number): Vec2 {
  const list = LEFT_SLOTS_PX[row]
  const px = list[Math.min(lane, list.length - 1)]
  return toWorld(team, px)
}

/**
 * ผังตามจำนวนตัวในแถว (px จอของทีมซ้าย · เรียงบน → ล่าง) — ตัวน้อยก็ยังดูสมดุล ไม่กองอยู่ฝั่งเดียว
 *   แถวหน้า 1 ตัว = กลางระหว่างสองช่อง · 2 ตัว = ช่องปกติ
 *   แถวหลัง 1 ตัว = กลาง (ถอยหลังสุด) · 2 ตัว = บน/ล่างแบบเฉียง · 3 ตัว = ช่องปกติ
 * ตัวที่อยู่ช่องบนกว่า (เลนน้อยกว่า) ได้ตำแหน่งบนกว่าเสมอ
 */
const FRONT_LAYOUT_PX: Record<number, Vec2[]> = {
  1: [{ x: 435, y: 528 }],
  2: LEFT_SLOTS_PX.front,
}
const BACK_LAYOUT_PX: Record<number, Vec2[]> = {
  1: [{ x: 235, y: 530 }],
  2: [{ x: 300, y: 500 }, { x: 225, y: 610 }],
  3: LEFT_SLOTS_PX.back,
}
/** แถวหน้ากับแถวหลังห่างกันแนวตั้งอย่างน้อยเท่านี้ (px จอ) — กันยืนระนาบเดียวกันเป๊ะจนดูแข็ง */
const ROW_STAGGER_PX = 24
/** ขอบบน/ล่างที่แถวหลังขยับหลบได้ (px จอ ก่อนยกกลุ่ม) */
const BACK_Y_RANGE = [420, 645] as const

const toWorld = (team: Team, px: Vec2): Vec2 => {
  const p = { x: px.x / CAMERA_ZOOM, y: (px.y + FIELD_SHIFT_Y) / CAMERA_ZOOM }
  const w = team === 0 ? p : { x: WORLD_W - p.x, y: p.y }
  return { x: w.x + FIELD_SHIFT_X / CAMERA_ZOOM, y: w.y }
}

/**
 * ตำแหน่งยืนจริงของทุกตัว (พิกัดโลก) ตามจำนวนตัวในแต่ละแถวของแต่ละทีม
 * แถวหลังที่สูงใกล้แถวหน้าเกิน ROW_STAGGER_PX → เลื่อนหนี (ต่ำกว่าเลื่อนลง · สูงกว่าเลื่อนขึ้น)
 */
export function formationSlots(units: { uid: string; team: Team; row: 'front' | 'back'; lane: number }[]): Map<string, Vec2> {
  const out = new Map<string, Vec2>()
  for (const team of [0, 1] as Team[]) {
    const byLane = (row: 'front' | 'back') => units.filter(u => u.team === team && u.row === row).sort((a, b) => a.lane - b.lane)
    const front = byLane('front'), back = byLane('back')
    const fp = (FRONT_LAYOUT_PX[front.length] ?? LEFT_SLOTS_PX.front).map(p => ({ ...p }))
    const bp = (BACK_LAYOUT_PX[back.length] ?? LEFT_SLOTS_PX.back).map(p => ({ ...p }))
    const frontYs = fp.slice(0, front.length).map(p => p.y)
    for (let pass = 0; pass < 2; pass++) {
      for (const b of bp) {
        for (const fy of frontYs) {
          if (Math.abs(b.y - fy) >= ROW_STAGGER_PX) continue
          b.y = b.y >= fy ? fy + ROW_STAGGER_PX : fy - ROW_STAGGER_PX
          b.y = Math.max(BACK_Y_RANGE[0], Math.min(BACK_Y_RANGE[1], b.y))
        }
      }
    }
    front.forEach((u, i) => out.set(u.uid, toWorld(team, fp[Math.min(i, fp.length - 1)])))
    back.forEach((u, i) => out.set(u.uid, toWorld(team, bp[Math.min(i, bp.length - 1)])))
  }
  return out
}

/**
 * ลิมิตชนหน้า: ระยะแนวนอนระหว่างช่องแถวหน้าบนของเรากับแถวหน้าบนของศัตรู (หน่วยโลก)
 * ใช้เป็นระยะหยุดเดิน "เท่าแถวหน้าห่างกัน" ใน editor (จุดหยุด x = −ค่านี้)
 */
export function frontLineGap(): number {
  return slotPosition(1, 'front', 0).x - slotPosition(0, 'front', 0).x
}

// ── หลบทางให้เพื่อน ──
// เพื่อนร่วมทีม (รวมตัวที่อัญเชิญมา) เดินมาหยุด/ยืนใกล้ที่ยืนของเรา (ในวงรีส่วนตัว) → หลบเฉียงออก "หนีจากตัวนั้น"
//   เราอยู่หลังเขา → ถอยหลัง (หันหน้าเข้าศัตรู = moonwalk) · เราอยู่หน้าเขา → เฉียงออกไปข้างหน้า (ไม่ถอยเข้าไปทับ)
//   เฉียงขึ้น/ลงตามที่อยู่เหนือ/ใต้เขา · เขายังยืนอยู่ = ยังหลบ · เขาไปแล้ว (เดินกลับ/วาปกลับ) → เดินกลับเข้าที่
// ผู้อัญเชิญที่ถอยไปยืนรอ: ที่ยืนรอ = ที่ของมันชั่วคราว (ตัวอัญเชิญเดินมาใกล้ก็หลบต่อจากตรงนั้น)
/** วงรีพื้นที่ส่วนตัวรอบเท้า (หน่วยโลก): กว้างซ้าย-ขวา / ลึกหน้า-หลังจอ */
const SPACE_RX = 120
const SPACE_RY = 50
/** ความเร็วเดินหลบ (หน่วยโลก/วินาที) */
const DODGE_SPEED = 360
/** ถอยได้ไกลสุด */
const DODGE_MAX = 170
/** ทิศหลบ: ถอยหลัง 1 ส่วน เฉียงขึ้น/ลง (หนีจากเพื่อน) เท่านี้ */
const DODGE_SLANT = 0.45
/** ท่าเดินเข้าไปตี: เข้าใกล้ระดับ Y ของเป้าไม่เกินเท่านี้ (px) = ถือว่าถึงเป้า → ขึ้นไปอยู่เหนือเป้า */
const WALK_LAYER_NEAR_PX = 40

/** พื้นหลังสนามชั่วคราว (public/maps/) */
const BACKGROUND_URL = '/maps/map1.jpg'
const TURN_PAUSE_SEC = 0.25
/**
 * อัญเชิญแถวพิเศษ: ผู้อัญเชิญถอยหลัง (px) → ตัวอัญเชิญวาปมายืนหน้าที่ยืนเดิมของผู้อัญเชิญ (px) → ร่าย → วาปกลับ → ผู้อัญเชิญเดินกลับ
 * วาปเข้า/ออกกี่วินาที (สั้นๆ ไม่เวอร์)
 */
const SUMMON_BACK_PX = 55
const SUMMON_AHEAD_PX = 70
const SUMMON_WALK_SPEED = 260
const WARP_IN_SEC = 0.42
const WARP_OUT_SEC = 0.36
/**
 * เวลาต่อเกม (วินาทีที่ x1) — วัดจากเกมจริง: x1 เฉลี่ย 123 วิ · มัธยฐาน 129 · p90 172 (scripts/probe-real-battles.mjs)
 * 3 นาที → เกมส่วนใหญ่ยังจบด้วยการล้มกันหมด หมดเวลาเฉพาะเกมที่ยืดจริงๆ
 */
export const BATTLE_TIME_SEC = 180
/**
 * นาฬิกาเดินเร็วเท่าที่เกมเร็วขึ้นจริงในแต่ละความเร็ว (เวลาจริงต่อเกม x1 ÷ x2 = 123/73 · x1 ÷ x4 = 123/38)
 * เกมเดียวกันจึงใช้เวลาบนนาฬิกาเท่ากันไม่ว่าจะเปิดความเร็วไหน
 */
export const CLOCK_RATE: Record<number, number> = { 1: 1, 2: 1.7, 3: 2.3, 4: 3.2 }
// ── เปิดฉาก ──
/** ม่านดำแยกขึ้น–ลงจนพ้นจอ (วินาที) */
const INTRO_CURTAIN_SEC = 0.6
/** เริ่มเดินจากนอกจอกี่หน่วยโลก */
const INTRO_OFFSCREEN = 150
/** ความเร็วเดินเข้าประจำที่ (หน่วยโลก/วินาที) */
const INTRO_WALK_SPEED = 430
/** แถวหน้าออกตัวช้ากว่าแถวหลังนิดหน่อย — ไม่ให้เดินเป็นพืดเดียวกัน */
const INTRO_ROW_DELAY = 0.18
/** ค้างคำว่า START ก่อนเริ่มเทิร์นแรก */
const INTRO_START_SEC = 1
/** START: ย่อจากใหญ่เข้ามา แล้วจางออกช่วงท้าย */
const INTRO_START_POP = 0.18
const INTRO_START_FADE = 0.3
/** Wave clear: short pause, then surviving player Rangers walk forward off-screen before the next wave appears. */
const WAVE_EXIT_WAIT_SEC = 0.22
const WAVE_EXIT_SPEED = 520
const WAVE_EXIT_STAGGER_SEC = 0.07
// ตาย: เล่นท่ากระเด็น → ตัวหายไป → วิญญาณ (eff_die / eff_die_enemy) ลอยขึ้นแล้วจางหาย
const DEATH_KNOCK_SEC = 0.6   // ท่ากระเด็น
const SOUL_SEC = 1.4          // วิญญาณลอยจนหาย
const SOUL_RISE = 110         // ลอยขึ้นสูงสุด (หน่วยโลก)
const SOUL_HOLD = 0.35        // ทึบเต็มช่วงแรกกี่ส่วน แล้วค่อยจาง
const SOUL_BODY_Y = 80        // วิญญาณเริ่มที่ระดับลำตัว (เหนือเท้า)
const POPUP_LIFE = 1.1
/** กระสุนอยู่เหนือตัวผู้โจมตีนิดเดียว (ชั้นของตัวละครห่างกันอย่างน้อย ~40) */
const SHOT_ABOVE_ACTOR = 0.1
/** แคนวาสย้อมสีตัว (บาเรีย/โดนตี) ใหญ่สุดเท่านี้ต่อด้าน (px) — กรอบจริงพอดีเฟรมของตัวนั้นๆ */
const TINT_MAX_PX = 2048
const HIT_EVENT_KEEP = 8
/** หลอดเลือดบนหัว: ความเฉียง (px) และระยะที่ไอคอนธาตุซ้อนหัวหลอด (px — แค่ให้ดูต่อกัน ไม่บังเลือด) */
const HP_BAR_SKEW = 4
/** บาเรีย (อมตะ): ขอบหลอดเลือดสีทองเรืองแสง */
const BARRIER_EDGE = '#fcd34d'
const HP_ICON_OVERLAP = 2
/** สีหลอดเลือด: ทีมซ้าย (เรา) ฟ้า · ทีมขวา (ศัตรู) แดง */
const HP_BAR_COLOR = ['#38bdf8', '#ef4444'] as const

interface HitEvent { time: number; isSkill: boolean }

/** info = ข้อมูลจากเกม (ชื่อไทย ชื่อ/ไอคอนสกิล) ใช้แสดงใน HUD · ไม่มีก็แสดงชื่อ id แทน */
export interface RangerKit { assets: RangerAssets; config: RangerConfig; info?: GameInfo | null }

interface UnitView {
  unit: Unit
  kit: RangerKit
  slot: Vec2
  facing: 1 | -1
  stand: Vec2
  player: SamPlayer
  pos: Vec2              // ระยะที่เดินออกจากช่อง (พิกัดโลก)
  facingBack: boolean
  hits: HitEvent[]
  dying: number | null   // วินาทีตั้งแต่เริ่มตาย
  gone: boolean
  /** กำลังเล่นท่าโดนตี/กระเด็น (ห้ามสลับท่ายืนทับจนกว่าจะจบ) */
  reacting: boolean
  /** ท่ายืนที่เล่นอยู่: ปกติ หรือค้างเฟรมแรกของท่าโดนตีระหว่างชะงัก */
  pose: 'idle' | 'stun'
  /** ไอคอนเหนือหัวที่กำลังแสดง (อมตะ / ชะงัก) */
  icons: Partial<Record<IconType, IconState>>
  /** กำลังหลบทางให้เพื่อน (pos = ระยะหลบ ไม่ใช่ระยะเดินไปตีของตัวเอง) */
  dodging: boolean
  /** กำลังเดินหลบ/เดินกลับเข้าช่อง (เล่นท่าเดินอยู่) */
  dodgeWalking: boolean
  /** ความทึบทั้งตัว (ตัวอัญเชิญตอนวาปเข้า/ออก) — ไม่ระบุ = 1 */
  alpha?: number
}

/** ลำดับการอัญเชิญ: ถอย → วาปเข้า → ร่าย (คัตซีน + ท่าปกติ) → วาปออก → ผู้อัญเชิญเดินกลับ */
interface SummonSeq {
  summoner: UnitView
  caster: UnitView
  target: UnitView
  action: ActionName
  step: 'back' | 'warpIn' | 'cast' | 'warpOut' | 'home'
  t: number
}

/** แสงวาป (พิกัดโลกที่เท้า) */
interface Warp { at: Vec2; t: number; out: boolean }

interface FlyingShot {
  plan: ShotPlanData
  /** เวลาที่ปล่อย (วินาทีของฉาก) — ติ๊กของกระสุน = (เวลา − ค่านี้) × fps ของผู้ยิง */
  spawnTime: number
  hitFired: boolean
  attacker: UnitView
  target: UnitView
  action: ActionName
  /** ตำแหน่ง/ทิศของผู้ยิงตอนปล่อย — กระสุนไม่ขยับตามตัวละครที่เดินกลับ */
  frame: { slot: Vec2; stand: Vec2; facing: 1 | -1 }
  /**
   * ชั้นที่กระสุนนัดนี้ถูกปล่อย — ล็อกไว้ตั้งแต่เกิดจนหาย
   * เทิร์นถัดไปทีมเลื่อนชั้นใหม่ กระสุน/เอฟเฟกต์ที่ยังเล่นไม่จบก็ไม่ย้ายตาม
   */
  layer: number
  run: ActionRun
}

interface Popup { at: Vec2; text: string; life: number; color: string; big: boolean; uid: string; order: number }

type RunStep = 'approach' | 'act' | 'return' | 'wait'
interface ActionRun {
  actor: UnitView
  target: UnitView
  action: ActionName
  step: RunStep
  prevFrame: number
  spawned: boolean
  waitLeft: number
  /** ผลของท่าลงไปแล้วหรือยัง (ลงครั้งเดียวต่อเทิร์น) */
  resolved: boolean
}

export type Phase = 'intro' | 'thinking' | 'input' | 'acting' | 'ended'

/** สถานะของทรานซิชั่นเปิดฉาก · startAt = วินาทีที่ทุกตัวเข้าที่แล้ว (null = ยังเดินอยู่) */
interface IntroState { t: number; startAt: number | null }
interface WaveExitState { t: number; started: boolean; onComplete: () => void }

/** สีตัวเลขที่มีความเสียหายจริง (ไม่สนโล่) */
const TRUE_DAMAGE_COLOR = '#f0abfc'
/** สีตัวเลขดาเมจต่อเนื่อง: พิษเขียว · ไฟไหม้ส้ม · เลือดไหลแดง */
const DOT_COLOR: Record<DotType, string> = { poison: '#a3e635', burn: '#fb923c', bleed: '#f87171' }

export class BattleScene {
  /** ความเร็วที่ผู้เล่นเลือก (x1/x2/x4) */
  private chosenSpeed = 1
  /** ความเร็วที่ใส่ให้คลิปของทุกตัวล่าสุด — เปลี่ยนเมื่อไหร่ (เข้า/ออกช่วงดวล, กดปุ่มความเร็ว) ก็อัปเดตคลิปที่เล่นค้างอยู่ */
  private appliedSpeed = 1
  /** ทีมซ้ายเล่นเองหรือให้ระบบเล่น (ทีมขวาเล่นอัตโนมัติเสมอ) */
  private autoOn = true
  paused = false
  phase: Phase = 'thinking'
  /** ตัวที่กำลังรอผู้เล่นสั่ง */
  pendingActor: Unit | null = null
  /** ท่าที่ผู้เล่นเลือกไว้ รอเลือกเป้า */
  pendingAction: ActionName | null = null
  /** เลือกอัญเชิญตัวแถวพิเศษไว้ (pendingAction = สกิลของตัวนั้น) · null = ท่าของตัวเอง */
  pendingCaster: Unit | null = null
  /** ตัวแถวพิเศษ (วาดเฉพาะตอนถูกอัญเชิญ · ไม่มีหลอดเลือด ไม่ถูกคลิก) */
  private reserveViews: UnitView[] = []
  private summon: SummonSeq | null = null
  private warps: Warp[] = []

  private views: UnitView[] = []
  private shots: FlyingShot[] = []
  private popups: Popup[] = []
  private run: ActionRun | null = null
  /** เทิร์นที่ถูกข้ามเพราะชะงัก — รอให้เห็นป้ายแป๊บหนึ่งก่อนไปต่อ */
  private skip: { actor: Unit; left: number } | null = null
  /** ทีมที่อยู่สูงกว่าตอนชั้นเท่ากัน = ทีมที่โจมตีล่าสุด */
  private layerTeam: Team = 0
  /** เวลาของฉาก (วินาที ผ่านตัวคูณความเร็วแล้ว) */
  private time = 0
  private fx: HTMLCanvasElement | null = null
  /** วิญญาณตอนตาย — โหลดเบื้องหลัง ยังไม่เสร็จก็แค่ไม่วาดวิญญาณ */
  private deathFx: DeathEffects | null = null
  private background: HTMLImageElement | null = null
  /** เปิดฉากอยู่ (null = เล่นจบแล้ว/ไม่ได้เปิดใช้) */
  private intro: IntroState | null = null
  /** Wave-clear exit animation for surviving player Rangers. */
  private waveExit: WaveExitState | null = null
  /** UI บนจอรบ (battleHud.ts) — คลิกแล้วหน้าเล่นเป็นคนสั่งต่อ */
  readonly hud: BattleHud
  /** เวลาที่เหลือ (วินาทีของนาฬิกาเกม — x2/x4 เดินเร็วตาม CLOCK_RATE) */
  private timeLeft = BATTLE_TIME_SEC
  /** ตำแหน่งหน้าบน thumb.png ของแต่ละเรนเจอร์ (คิดครั้งแรกที่รูปโหลดเสร็จ) */
  private faces = new Map<string, Vec2>()
  /** ตัวทีมเราที่แสดงในแผงคำสั่งล่าสุด */
  private panelUid: string | null = null
  /** ไกด์ผลลัพธ์ของเฟรมล่าสุด (HUD ใช้แสดงในการ์ดข้อมูลด้วย) */
  private lastPreviews = new Map<string, ActionPreview>()
  /** ล้างสถานะตอนจบเกมไปแล้ว */
  private endCleared = false
  /** ไอคอนสถานะ — โหลดเบื้องหลัง ยังไม่เสร็จก็แค่ไม่วาด */
  private statusIcons: StatusIcons | null = null
  private onChange?: () => void

  constructor(
    readonly battle: Battle,
    kits: Map<string, RangerKit>,
    private thumbs: Map<string, HTMLImageElement> = new Map(),
    onChange?: () => void,
    /**
     * intro: false = ข้ามทรานซิชั่นเปิดฉาก (เทส/เครื่องมือวัดผล)
     * timer: true = เปิดนับถอยหลัง + ตัดสินตอนหมดเวลา — ปิดไว้ก่อน (นาฬิกาเดินแม้ตอนผู้เล่นกำลังคิด)
     * layout: 'fixed' = ยืนช่องตายตัวตามเลน (เทสกฎจัดชั้นที่อิงความสูงช่องเดิม) · ปกติ = ผังตามจำนวนตัวในแถว
     */
    opts: { intro?: boolean; timer?: boolean; layout?: 'count' | 'fixed' } = {},
  ) {
    this.onChange = onChange
    this.timerOn = opts.timer === true
    this.hud = new BattleHud(this)
    if (typeof Image !== 'undefined') { this.background = new Image(); this.background.src = BACKGROUND_URL }
    if (typeof document !== 'undefined') loadDeathEffects().then(fx => { this.deathFx = fx }).catch(() => {})
    if (typeof document !== 'undefined') loadStatusIcons().then(fx => { this.statusIcons = fx }).catch(() => {})
    // ตำแหน่งยืนตามจำนวนตัวในแถว (วางตัวเดียว → อยู่กลางแถว ฯลฯ)
    const slots = opts.layout === 'fixed' ? new Map<string, Vec2>() : formationSlots(battle.units)
    for (const unit of battle.units) {
      const baseKit = kits.get(unit.assetVariantId)
      if (!baseKit) continue
      // Gameplay actions are semantic (normal attack / normal support / Energy Move),
      // while Ranger assets expose visual slots (attack / skill1 / skill2).
      // Adapt the visual config per combat unit so the animation slot selected in Admin
      // is what the battle scene actually plays.
      const kit: RangerKit = unit.gameplayClass
        ? { ...baseKit, config: adaptRangerConfigForGameplay(baseKit.config, unit.gameplayClass) }
        : baseKit
      const player = new SamPlayer(kit.assets.sam)
      player.playClip(kit.config.clips.idle, { loop: true })
      this.views.push({
        unit, kit,
        slot: slots.get(unit.uid) ?? slotPosition(unit.team, unit.row, unit.lane),
        facing: unit.team === 0 ? 1 : -1,
        stand: bodyPointsOf(kit.assets, kit.config).stand,
        player,
        pos: { x: 0, y: 0 },
        facingBack: false,
        hits: [],
        dying: null,
        gone: false,
        reacting: false,
        pose: 'idle',
        dodging: false,
        dodgeWalking: false,
        icons: {},
      })
    }
    for (const unit of [...battle.reserves[0], ...battle.reserves[1]]) {
      const baseKit = kits.get(unit.assetVariantId)
      if (!baseKit) continue
      const kit: RangerKit = unit.gameplayClass
        ? { ...baseKit, config: adaptRangerConfigForGameplay(baseKit.config, unit.gameplayClass) }
        : baseKit
      const player = new SamPlayer(kit.assets.sam)
      player.playClip(kit.config.clips.idle, { loop: true })
      this.reserveViews.push({
        unit, kit, slot: { x: 0, y: 0 }, facing: unit.team === 0 ? 1 : -1,
        stand: bodyPointsOf(kit.assets, kit.config).stand, player, pos: { x: 0, y: 0 },
        facingBack: false, hits: [], dying: null, gone: false, reacting: false, pose: 'idle',
        dodging: false, dodgeWalking: false, icons: {}, alpha: 0,
      })
    }
    if (opts.intro !== false) this.beginIntro()
  }

  // ── เปิดฉาก: ม่านดำเปิด → เดินเข้าประจำที่ → START ──

  private beginIntro(): void {
    this.phase = 'intro'
    this.intro = { t: 0, startAt: null }
    for (const team of [0, 1] as Team[]) {
      const mates = this.views.filter(v => v.unit.team === team)
      if (!mates.length) continue
      // ระยะออกตัวเท่ากันทั้งทีม (คงรูปขบวน) — ยึดตัวที่อยู่ลึกเข้ามากลางจอที่สุด ให้พ้นขอบจอแน่ๆ
      const deepest = Math.max(...mates.map(v => (team === 0 ? v.slot.x : WORLD_W - v.slot.x)))
      const back = (deepest + INTRO_OFFSCREEN) * (team === 0 ? -1 : 1)
      for (const v of mates) {
        v.pos = { x: back, y: 0 }
        v.player.playClip(this.walkClip(v), { speed: this.speed, loop: true })
      }
    }
  }

  /** ข้ามทรานซิชั่น (คลิกจอตอนเปิดฉาก) — ทุกตัวเข้าที่ทันทีแล้วเริ่มเลย */
  skipIntro(): void {
    if (!this.intro) return
    for (const v of this.views) { v.pos = { x: 0, y: 0 }; this.playIdle(v) }
    this.intro = null
    this.phase = 'thinking'
    this.onChange?.()
  }

  private stepIntro(dt: number): void {
    const io = this.intro!
    io.t += dt
    if (io.startAt === null) {
      let walking = false
      for (const v of this.views) {
        if (v.pos.x === 0) continue
        // แถวหน้าเริ่มออกตัวทีหลัง
        if (v.unit.row === 'front' && io.t < INTRO_ROW_DELAY) { walking = true; continue }
        const dir = v.unit.team === 0 ? 1 : -1
        const step = INTRO_WALK_SPEED * dt * dir
        v.pos.x = dir > 0 ? Math.min(0, v.pos.x + step) : Math.max(0, v.pos.x + step)
        if (v.pos.x === 0) this.playIdle(v)
        else walking = true
      }
      if (!walking) { io.startAt = io.t; this.onChange?.() }
      return
    }
    if (io.t - io.startAt >= INTRO_START_SEC) {
      this.intro = null
      this.phase = 'thinking'
      this.onChange?.()
    }
  }


  /**
   * Stage wave clear transition. Surviving player Rangers leave the battlefield
   * before React swaps to the next wave, so the scene never hard-cuts immediately.
   */
  beginWaveExit(onComplete: () => void): boolean {
    if (this.waveExit) return false
    const survivors = this.views.filter(v => v.unit.team === 0 && v.unit.alive && !v.gone)
    if (!survivors.length) {
      onComplete()
      return true
    }
    this.hud.customResult = true
    this.pendingActor = null
    this.pendingAction = null
    this.pendingCaster = null
    this.phase = 'acting'
    this.waveExit = { t: 0, started: false, onComplete }
    for (const v of survivors) {
      v.dodging = false
      v.dodgeWalking = false
      v.reacting = false
      v.facingBack = false
      this.playIdle(v)
    }
    this.onChange?.()
    return true
  }

  private stepWaveExit(dt: number): void {
    const state = this.waveExit
    if (!state) return
    // Let the defeated enemy finish its knockback/soul animation first.
    // This avoids having the winning party leave while the final KO is still playing.
    if (this.views.some(v => v.unit.team === 1 && !v.unit.alive && v.dying !== null && !v.gone)) return
    state.t += dt
    const survivors = this.views.filter(v => v.unit.team === 0 && v.unit.alive && !v.gone)
    if (!state.started && state.t >= WAVE_EXIT_WAIT_SEC) {
      state.started = true
      for (const v of survivors) v.player.playClip(this.walkClip(v), { speed: this.speed, loop: true })
    }
    let allGone = true
    survivors.forEach((v, index) => {
      const delay = WAVE_EXIT_WAIT_SEC + index * WAVE_EXIT_STAGGER_SEC
      if (state.t < delay) { allGone = false; return }
      v.pos.x += WAVE_EXIT_SPEED * dt
      if (v.slot.x + v.pos.x < WORLD_W + INTRO_OFFSCREEN) allGone = false
    })
    if (!allGone) return
    const done = state.onComplete
    this.waveExit = null
    this.phase = 'ended'
    this.onChange?.()
    done()
  }

  /**
   * จบเกม: ล้างสถานะทุกตัวที่ยังยืนอยู่ (ชะงัก บาเรีย โล่ บัฟ/ดีบัฟ) → กลับมายืน idle ปกติ
   * ตัวที่ค้างท่าชะงักจะเล่นท่าตื่นจนจบแล้วเข้า idle เอง (ดู update: ท่ายืนไม่ตรงกับสถานะ → playIdle)
   * ไอคอนเหนือหัวเล่น out แล้วหายไปเอง
   */
  private clearOnEnd(): void {
    this.endCleared = true
    for (const u of this.battle.units) {
      if (!u.alive) continue
      u.statuses = []
      u.stunGuard = 0
    }
  }

  // ── ความเร็ว / ออโต้ ──

  /**
   * ความเร็วที่ใช้เล่นจริง: ฉากเปิด (intro) และหน้าผลจบเกมเล่น x1 เสมอ ให้เห็นชัด
   * ระหว่างรบใช้ความเร็วที่เลือกไว้
   */
  get speed(): number {
    return this.phase === 'intro' || this.phase === 'ended' ? 1 : this.chosenSpeed
  }
  set speed(v: number) { this.chosenSpeed = v }
  /** ความเร็วที่ผู้เล่นเลือก (ปุ่มบน HUD แสดงค่านี้ แม้ตอนเปิดฉาก/จบเกมจะเล่น x1) */
  get selectedSpeed(): number { return this.chosenSpeed }

  get auto(): boolean { return this.autoOn }
  /** เปิดออโต้ระหว่างที่รอผู้เล่นสั่ง → ให้ระบบเล่นเทิร์นนี้ต่อทันที ไม่ต้องรอเทิร์นหน้า */
  set auto(v: boolean) {
    this.autoOn = v
    if (v && this.phase === 'input' && this.pendingActor) {
      const actor = this.pendingActor
      this.pendingActor = null
      this.pendingAction = null
      this.pendingCaster = null
      const plan = this.battle.planAuto(actor)
      // แผนอาจเป็นการอัญเชิญ (เป้าเป็นของสกิลตัวแถวพิเศษ) — ต้องเรียกผ่าน startSummon
      // (เดิมใช้ startAction ตลอด → ตัวที่ถึงตาเอาท่าตัวเองไปใส่เป้าของสกิลอัญเชิญ เช่น ตีเพื่อนที่ควรได้ฮีล)
      if (!plan) { this.phase = 'ended'; this.onChange?.() }
      else if (plan.caster) this.startSummon(actor, plan.caster, plan.action, plan.target)
      else this.startAction(actor, plan.action, plan.target)
    }
  }

  // ── ข้อมูลให้ HUD ──

  get timeLeftSec(): number { return Math.max(0, this.timeLeft) }
  /** นับถอยหลังเปิดอยู่ไหม (ปิด = ไม่มีเวลาจำกัด ไม่แสดงนาฬิกา) */
  readonly timerOn: boolean
  /** เกมจบเพราะหมดเวลา */
  get endedByTime(): boolean { return this.battle.timeUpResult !== null }

  /** หมดเวลา: ตัดสินผลทันที (เรียกตอนไม่มีท่าค้างอยู่ — ไม่ให้เลือดเปลี่ยนหลังตัดสิน) */
  private finishByTime(): void {
    this.battle.timeUp()
    this.pendingActor = null
    this.pendingAction = null
    this.phase = 'ended'
    this.onChange?.()
  }

  /** ตัวที่กำลังเล่นเทิร์นนี้ (รอสั่ง / กำลังออกท่า / ชะงักอยู่) · ไม่มี = ระหว่างเทิร์น */
  get currentActor(): Unit | null {
    if (this.phase === 'intro' || this.phase === 'ended') return null
    return this.pendingActor ?? this.summon?.summoner.unit ?? this.run?.actor.unit ?? this.skip?.actor ?? null
  }

  /** แผงคำสั่งแสดงตัวทีมเราที่กำลังเล่น (หรือตัวล่าสุด / ตัวถัดไปของทีมเราถ้ายังไม่มี) */
  get panelUnit(): Unit | null {
    const current = this.pendingActor ?? this.summon?.summoner.unit ?? this.run?.actor.unit ?? this.skip?.actor ?? null
    if (current?.team === 0) return current
    const last = this.panelUid ? this.battle.unit(this.panelUid) : undefined
    if (last?.alive) return last
    return this.battle.previewOrder(10).find(u => u.team === 0) ?? last ?? null
  }

  nameOf(u: Unit): string {
    if (u.gameplayClass) {
      const names = u.gameplayClass.names
      return names[getLang()] || names.zh || names.en || names.th || names.jp || u.classId
    }
    const kit = this.view(u.uid)?.kit
    return (getLang() === 'zh' ? properNameZhTw(u.assetVariantId) : null) ?? localName(kit?.info?.name) ?? kit?.config.name ?? u.assetVariantId
  }
  infoOf(u: Unit): GameInfo | null { return u.gameplayClass ? null : this.view(u.uid)?.kit.info ?? null }
  /** รูปเรนเจอร์ใน HUD = thumb.png + ตำแหน่งหน้า (แท็บ "รูปหน้า" ใน editor) · รูปยังไม่โหลด = null */
  faceOf(u: Unit): { img: HTMLImageElement; center: Vec2 } | null {
    const img = this.thumbs.get(u.assetVariantId)
    if (!imageReady(img)) return null
    let center = this.faces.get(u.assetVariantId)
    if (!center) {
      center = portraitCenter(img, this.view(u.uid)?.kit.config.face)
      this.faces.set(u.assetVariantId, center)
    }
    return { img, center }
  }

  /** ตัวในสนาม หรือตัวแถวพิเศษ (ชื่อ/ข้อมูล/รูปของ HUD ใช้ร่วมกัน) */
  private view(uid: string): UnitView | undefined {
    return this.views.find(v => v.unit.uid === uid) ?? this.reserveViews.find(v => v.unit.uid === uid)
  }

  private get releaseMul(): number {
    return (SPEED_PROFILES[this.speed] ?? SPEED_PROFILES[1]).release
  }

  // ── แปลงพิกัด ──

  /** จุดในไฟล์ของตัวละคร → พิกัดโลก (ทีมขวากลับด้านรอบจุดยืน) */
  private localToWorld(v: UnitView, p: Vec2, withPos = true): Vec2 {
    const ox = withPos ? v.pos.x : 0, oy = withPos ? v.pos.y : 0
    return { x: v.slot.x + ox + v.facing * (p.x - v.stand.x), y: v.slot.y + oy + (p.y - v.stand.y) }
  }

  /** kiwi space ของผู้โจมตี (ยืนที่ช่องเดิม) ↔ พิกัดโลก */
  private kiwiToWorld(f: { slot: Vec2; stand: Vec2; facing: 1 | -1 }, k: Vec2): Vec2 {
    return { x: f.slot.x + f.facing * (k.x - f.stand.x), y: f.slot.y + (k.y - f.stand.y) }
  }
  private worldToKiwi(f: { slot: Vec2; stand: Vec2; facing: 1 | -1 }, w: Vec2): Vec2 {
    return { x: f.stand.x + f.facing * (w.x - f.slot.x), y: f.stand.y + (w.y - f.slot.y) }
  }

  /** จุดบนตัวเป้า ใน kiwi space ของผู้โจมตี */
  private targetPointsFor(attacker: UnitView, target: UnitView): TargetPoints {
    const b = bodyPointsOf(target.kit.assets, target.kit.config)
    const toK = (p: Vec2) => this.worldToKiwi(attacker, this.localToWorld(target, p, false))
    return { main: toK(b.stand), face: toK(b.face), center: b.center ? toK(b.center) : null }
  }

  // ── เทิร์น ──

  /** ผู้เล่นสั่ง: เลือกท่าก่อน แล้วเลือกเป้า */
  chooseAction(action: ActionName): void {
    if (this.phase !== 'input' || !this.pendingActor) return
    if (!this.battle.canUse(this.pendingActor, action)) return
    // กดท่าเดิมซ้ำ (ปุ่ม/คีย์ลัด) และเลือกได้ทางเดียว (เป้าเดียว · ท่าทั้งแถวที่เหลือแถวเดียว) → เล็งให้เลย
    const again = this.pendingAction === action && !this.pendingCaster
    this.pendingCaster = null
    if (again) {
      const only = this.onlyChoice(action)
      if (only) { this.chooseTarget(only.uid); return }
    }
    this.pendingAction = action
    // ไม่ต้องเลือกเป้า (ตัวเอง / แถวตัวเอง / เพื่อนทั้งหมด / ศัตรูทั้งหมด) → ใช้ทันที
    const area = this.battle.skillOf(this.pendingActor, action).area
    if (area === 'self' || area === 'own_row' || area === 'ally_all' || area === 'all') {
      const target = this.battle.autoTarget(this.pendingActor, action)
      if (target) { this.chooseTarget(target.uid); return }
    }
    this.onChange?.()
  }

  /**
   * ผู้เล่นเลือกอัญเชิญตัวแถวพิเศษลำดับ index มาร่าย action (skill1/skill2) — แล้วเลือกเป้าเหมือนท่าปกติ
   * กดซ้ำ + เลือกได้ทางเดียว → เล็งให้เลย · ท่าไม่ต้องเลือกเป้า → ใช้ทันที
   */
  chooseSummon(index: number, action: ActionName): void {
    const actor = this.pendingActor
    if (this.phase !== 'input' || !actor) return
    const r = this.battle.reserves[actor.team][index]
    if (!r) return
    this.battle.prepareSummon(actor, r)
    if (!this.battle.canSummon(actor, r, action)) return
    const again = this.pendingCaster === r && this.pendingAction === action
    this.pendingCaster = r
    this.pendingAction = action
    if (again) {
      const only = this.onlyChoice(action)
      if (only) { this.chooseTarget(only.uid); return }
    }
    const area = this.battle.skillOf(r, action).area
    if (area === 'self' || area === 'own_row' || area === 'ally_all' || area === 'all') {
      const target = this.battle.autoTarget(r, action)
      if (target) { this.chooseTarget(target.uid); return }
    }
    this.onChange?.()
  }

  /** ท่านี้มีทางเลือกเป้าที่ต่างกันจริงแค่ทางเดียวไหม (ใช่ = คืนเป้านั้น) */
  private onlyChoice(action: ActionName): Unit | null {
    const actor = this.pendingCaster ?? this.pendingActor
    if (!actor) return null
    const list = this.battle.selectableTargets(actor, action)
    if (!list.length) return null
    // ท่าทั้งแถว: ชี้ตัวไหนในแถวเดียวกันก็โดนเหมือนกัน → นับเป็นแถวละทางเลือก
    const distinct = this.battle.skillOf(actor, action).area === 'row' ? new Set(list.map(u => u.row)).size : list.length
    return distinct === 1 ? this.battle.autoTarget(actor, action) ?? list[0] : null
  }

  /** Select an unacted player Ranger during Gameplay V1 and clear any old action selection. */
  selectPlayerActor(uid: string): boolean {
    if (this.phase !== 'input' || !this.battle.usesGameplayPhases) return false
    const next = this.battle.unit(uid)
    if (!next || next.team !== 0 || !this.battle.canChooseGameplayActor(next)) return false
    this.pendingActor = next
    this.pendingAction = null
    this.pendingCaster = null
    this.panelUid = next.uid
    this.onChange?.()
    return true
  }

  /** Cancel an armed target selection without consuming the Ranger's action. */
  cancelPendingAction(): void {
    if (this.phase !== 'input') return
    this.pendingAction = null
    this.pendingCaster = null
    this.onChange?.()
  }

  chooseTarget(uid: string): void {
    if (this.phase !== 'input' || !this.pendingActor) return

    // Gameplay V1: while no action has been chosen yet, clicking any ally that
    // has not acted in the current side phase switches the active Ranger.
    if (!this.pendingAction && this.battle.usesGameplayPhases) {
      this.selectPlayerActor(uid)
      return
    }

    if (!this.pendingAction) return
    const caster = this.pendingCaster
    const target = this.battle.selectableTargets(caster ?? this.pendingActor, this.pendingAction).find(u => u.uid === uid)
    if (!target) return
    const actor = this.pendingActor
    const action = this.pendingAction
    this.pendingActor = null
    this.pendingAction = null
    this.pendingCaster = null
    if (caster) this.startSummon(actor, caster, action, target)
    else this.startAction(actor, action, target)
  }

  get validTargetIds(): Set<string> {
    if (this.phase !== 'input' || !this.pendingActor || !this.pendingAction) return new Set()
    return new Set(this.battle.selectableTargets(this.pendingCaster ?? this.pendingActor, this.pendingAction).map(u => u.uid))
  }

  /** ท่าที่เลือกอยู่เล็งเพื่อน (วงเขียว) หรือศัตรู (วงแดง) */
  get targetingAllies(): boolean {
    return !!this.pendingActor && !!this.pendingAction && this.battle.targetsAllies(this.pendingCaster ?? this.pendingActor, this.pendingAction)
  }

  private beginTurn(): void {
    const actor = this.battle.nextActor()
    if (!actor) { this.phase = 'ended'; this.onChange?.(); return }

    const start = this.battle.beginTurn(actor)
    const view = this.view(actor.uid)
    // ดาเมจต่อเนื่องต้นเทิร์น (สีตามชนิด) → ล้มเพราะมัน = ข้ามเทิร์นแบบเดียวกับชะงัก
    if (view) for (const d of start.dots) this.popup(view, String(d.damage), DOT_COLOR[d.type], false)
    if (view && start.dot > 0) {
      if (start.killed) {
        view.dying = 0
        const die = view.kit.config.clips.die ?? view.kit.config.clips.hitHeavy
        if (die) view.player.playClip(die, { speed: this.speed })
      } else {
        view.hits.push({ time: this.time, isSkill: false })
        if (view.hits.length > HIT_EVENT_KEEP) view.hits.shift()
      }
    }
    if (view && start.regen > 0) this.popup(view, '+' + start.regen, '#4ade80', false)
    if (start.killed) {
      this.phase = 'acting'
      this.skip = { actor, left: STUN_SKIP_SEC }
      this.onChange?.()
      return
    }
    if (start.stunned) {
      // ชะงัก: ข้ามเทิร์นนี้ ให้เห็นป้ายแป๊บหนึ่ง
      if (view) this.popup(view, t('stunned'), '#c084fc', true)
      this.phase = 'acting'
      this.skip = { actor, left: STUN_SKIP_SEC }
      this.onChange?.()
      return
    }

    if (actor.team === 0 && !this.auto) {
      this.phase = 'input'
      this.pendingActor = actor
      this.pendingAction = null
      this.pendingCaster = null
      this.onChange?.()
      return
    }
    const plan = this.battle.planAuto(actor)
    if (!plan) { this.phase = 'ended'; this.onChange?.(); return }
    if (plan.caster) this.startSummon(actor, plan.caster, plan.action, plan.target)
    else this.startAction(actor, plan.action, plan.target)
  }

  private startAction(actorUnit: Unit, action: ActionName, targetUnit: Unit): void {
    // กันพลาด: สกิลโจมตีห้ามวิ่งไปหาเพื่อน / บัฟห้ามไปหาศัตรู → เปลี่ยนเป็นเป้าที่ดีที่สุดของท่านี้
    if ((this.battle.skillOf(actorUnit, action).kind === 'attack') === (targetUnit.team === actorUnit.team)) {
      targetUnit = this.battle.autoTarget(actorUnit, action) ?? targetUnit
    }
    const actor = this.view(actorUnit.uid)
    const target = this.view(targetUnit.uid)
    if (!actor || !target) { this.phase = 'thinking'; return }
    // ถึงตาตัวที่กำลังหลบทาง → เลิกหลบ (ออกท่าจากตรงที่ยืนอยู่ แล้วเดินกลับเข้าช่องตามปกติ)
    actor.dodging = false
    actor.dodgeWalking = false

    this.battle.commitAction(actorUnit, action)
    this.phase = 'acting'
    // สกิลที่ตั้งคัตซีนไว้: เล่นคัตซีนให้จบก่อน แล้วค่อยออกท่าจริง
    const play = this.cutinFor(actor, action)
    if (play) {
      this.cutin = { play, t: 0, then: () => this.beginRun(actor, target, action) }
      this.onChange?.()
      return
    }
    this.beginRun(actor, target, action)
  }

  /** อัญเชิญ: จ่าย Cost + ผู้อัญเชิญเริ่มถอยหลัง (ขั้นต่อไปอยู่ใน stepSummon) */
  private startSummon(summonerUnit: Unit, casterUnit: Unit, action: ActionName, targetUnit: Unit): void {
    const summoner = this.view(summonerUnit.uid)
    const caster = this.reserveViews.find(v => v.unit === casterUnit)
    const target = this.view(targetUnit.uid)
    if (!summoner || !caster || !target) { this.phase = 'thinking'; return }
    summoner.dodging = false
    summoner.dodgeWalking = false
    this.battle.commitSummon(summonerUnit, casterUnit, action)
    // ตัวอัญเชิญยืนหน้าที่ยืนเดิมของผู้อัญเชิญนิดหนึ่ง (Y เดียวกัน + นิดเดียว = อยู่ชั้นหน้าผู้อัญเชิญ)
    caster.slot = { x: summoner.slot.x + summoner.facing * SUMMON_AHEAD_PX, y: summoner.slot.y + 1 }
    caster.facing = summoner.facing
    caster.pos = { x: 0, y: 0 }
    caster.facingBack = false
    caster.hits = []
    caster.alpha = 0
    caster.player.playClip(caster.kit.config.clips.idle, { speed: this.speed, loop: true })
    this.phase = 'acting'
    this.summon = { summoner, caster, target, action, step: 'back', t: 0 }
    // ถอยหลังแบบหันหน้าเข้าหาศัตรู
    summoner.facingBack = false
    summoner.player.playClip(this.walkClip(summoner), { speed: this.speed, loop: true })
    this.onChange?.()
  }

  /** เดินผู้อัญเชิญไปที่ goalX (ระยะจากช่อง · แนวเดียวกับช่อง) จากตรงที่ยืนอยู่จริง — คืน true เมื่อถึง */
  private walkSummoner(v: UnitView, goalX: number, dt: number): boolean {
    const step = SUMMON_WALK_SPEED * dt * this.releaseMul
    const dx = goalX - v.pos.x, dy = -v.pos.y
    const dist = Math.hypot(dx, dy)
    v.dodging = false
    v.dodgeWalking = false
    if (dist <= step) { v.pos = { x: goalX, y: 0 }; return true }
    v.pos = { x: v.pos.x + (dx / dist) * step, y: v.pos.y + (dy / dist) * step }
    return false
  }

  private stepSummon(dt: number): void {
    const s = this.summon!
    const mul = this.releaseMul
    const feet = () => ({ x: s.caster.slot.x + s.caster.pos.x, y: s.caster.slot.y + s.caster.pos.y })
    if (s.step === 'back') {
      if (!this.walkSummoner(s.summoner, -s.summoner.facing * SUMMON_BACK_PX, dt)) return
      this.playIdle(s.summoner)
      s.step = 'warpIn'
      s.t = 0
      this.warps.push({ at: feet(), t: 0, out: false })
    } else if (s.step === 'warpIn') {
      s.t += dt * mul
      s.caster.alpha = Math.max(0, Math.min(1, (s.t - WARP_IN_SEC * 0.25) / (WARP_IN_SEC * 0.6)))
      if (s.t < WARP_IN_SEC) return
      s.caster.alpha = 1
      s.step = 'cast'
      // สกิลที่มีคัตซีน: วาปมาเสร็จก่อน แล้วค่อยขึ้นคัตซีน
      const play = this.cutinFor(s.caster, s.action)
      if (play) { this.cutin = { play, t: 0, then: () => this.beginRun(s.caster, s.target, s.action) }; this.onChange?.() }
      else this.beginRun(s.caster, s.target, s.action)
    } else if (s.step === 'warpOut') {
      s.t += dt * mul
      s.caster.alpha = Math.max(0, 1 - s.t / (WARP_OUT_SEC * 0.7))
      if (s.t < WARP_OUT_SEC) return
      s.caster.alpha = 0
      s.step = 'home'
      s.summoner.facingBack = s.summoner.pos.x * s.summoner.facing > 0
      s.summoner.player.playClip(this.walkClip(s.summoner), { speed: this.speed, loop: true })
    } else if (s.step === 'home') {
      if (!this.walkSummoner(s.summoner, 0, dt)) return
      s.summoner.facingBack = false
      this.playIdle(s.summoner)
      this.battle.endTurn(s.summoner.unit)
      this.summon = null
      this.phase = this.battle.over ? 'ended' : 'thinking'
      this.onChange?.()
    }
  }

  /** ออกท่าจริง (หลังคัตซีน ถ้ามี) */
  private beginRun(actor: UnitView, target: UnitView, action: ActionName): void {
    this.run = { actor, target, action, step: 'act', prevFrame: -1, spawned: false, waitLeft: 0, resolved: false }

    // บัฟไม่ต้องเดินเข้าไปหาใคร
    if (actor.kit.config.actions[action].approach?.enabled && !this.battle.targetsAllies(actor.unit, action)) this.beginApproach()
    else this.beginAct()
    this.onChange?.()
  }

  // ── คัตซีนร่ายสกิล (lib/cutin.ts) ──

  private cutin: { play: CutinPlay; t: number; then: () => void } | null = null
  /** ภาพคัตซีนที่วาดแล้ว ต่อ (เรนเจอร์, สกิล, ทีม) — วาดครั้งแรกที่ใช้ แล้วใช้ซ้ำ */
  private cutinArt = new Map<string, CutinArt | null>()

  /** กำลังเล่นคัตซีนอยู่ (คลิกจอ = ข้าม) */
  get cutinActive(): boolean { return this.cutin !== null }

  /** ข้ามคัตซีน → ออกท่าทันที */
  skipCutin(): void {
    const c = this.cutin
    if (!c) return
    this.cutin = null
    c.then()
  }

  private cutinFor(v: UnitView, action: ActionName): CutinPlay | null {
    if (action === 'attack' || !cutinsOn()) return null
    const cfg = v.kit.config.cutins?.[action]
    if (!cfg?.enabled) return null
    const flip = v.unit.team === 1
    const key = `${v.kit.config.id}|${action}|${flip ? 1 : 0}`
    if (!this.cutinArt.has(key)) {
      this.cutinArt.set(key, renderCutinArt(v.kit.assets, v.kit.config.actions[action], cfg, flip))
    }
    const art = this.cutinArt.get(key)
    if (!art) return null
    const info = v.kit.info ?? null
    const skill = info ? (action === 'skill1' ? info.skills.skill1 : info.skills.skill2 ?? info.skills.skill3) : null
    return {
      art,
      title: v.unit.gameplayClass ? (action === 'skill1' ? '技能' : '普通輔助') : cfg.title?.trim() || (getLang() === 'zh' ? properNameZhTw(skill?.code ?? '') : null) || localName(skill?.name) || (action === 'skill1' ? t('skill1') : t('skill2')),
      element: v.unit.element,
      side: flip ? 'right' : 'left',
    }
  }

  private walkClip(v: UnitView): string {
    return v.kit.config.clips.walk ?? v.kit.config.clips.idle
  }

  private beginApproach(): void {
    const r = this.run!
    r.step = 'approach'
    r.actor.facingBack = false
    r.actor.player.playClip(this.walkClip(r.actor), { speed: this.speed, loop: true })
  }

  private beginAct(): void {
    const r = this.run!
    const a = r.actor.kit.config.actions[r.action]
    r.step = 'act'
    r.prevFrame = -1
    r.spawned = false
    r.actor.facingBack = false
    r.actor.player.playAction([a.castPre, a.cast], a.release, {
      speed: this.speed,
      castSpeedCap: a.castSpeedCap,
      onEnd: () => {
        if (this.run !== r) return
        if (!r.spawned) this.spawn(r)
        if ((r.actor.pos.x !== 0 || r.actor.pos.y !== 0) && a.approach?.returnHome !== false) this.beginReturn()
        else { this.playIdle(r.actor); r.step = 'wait'; r.waitLeft = TURN_PAUSE_SEC }
      },
    })
  }

  private beginReturn(): void {
    const r = this.run!
    r.step = 'return'
    // กลับบ้าน: หันหลังเดินเฉพาะตอนบ้านอยู่ข้างหลัง · จุดตีอยู่ไกลกว่าที่ยืน (ถอยไปตี) → บ้านอยู่ข้างหน้า เดินหน้าตรงๆ
    // (ขาไปถอยหลังแบบ moonwalk ได้ตามเดิม · ขากลับไม่ moonwalk)
    r.actor.facingBack = r.actor.pos.x * r.actor.facing > 0
    r.actor.player.playClip(this.walkClip(r.actor), { speed: this.speed, loop: true })
  }

  /** ท่ายืน: ปกติ = idle วน · ติดชะงัก = ท่าโดนตี (target) ค้างเฟรมแรกจนกว่าจะหาย แล้วเล่นต่อจนจบตอนหาย */
  private playIdle(v: UnitView): void {
    if (v.dying !== null) return
    v.reacting = false
    const stunClip = v.kit.config.clips.stun ?? v.kit.assets.geometry.hitName ?? v.kit.config.clips.hitLight
    if (this.battle.has(v.unit, 'stun')) {
      if (stunClip) {
        v.player.freezeClip(stunClip, 0)
        v.pose = 'stun'
        return
      }
    }
    // เพิ่งหายชะงัก (ค้างเฟรมแรกอยู่) → เล่นท่านั้นต่อจนจบก่อน แล้วค่อยกลับท่ายืน — ไม่ตัดภาพกระโดด
    if (v.pose === 'stun' && stunClip) {
      v.pose = 'idle'
      this.react(v, stunClip)
      return
    }
    v.player.playClip(v.kit.config.clips.idle, { speed: this.speed, loop: true })
    v.pose = 'idle'
  }

  /** เล่นท่าโดนตีครั้งเดียว แล้วกลับท่ายืน (ปกติ/ชะงัก) */
  private react(v: UnitView, clip: string | null | undefined): void {
    if (!clip) { this.playIdle(v); return }
    v.reacting = true
    v.player.playClip(clip, { speed: this.speed, onEnd: () => this.playIdle(v) })
  }

  private spawn(r: ActionRun): void {
    r.spawned = true
    const plan: ShotPlan = planAction(r.actor.kit.assets, r.actor.kit.config, r.action, this.targetPointsFor(r.actor, r.target))
    // ไม่มีจังหวะโดนตี (ประชิด หรือท่าบัฟ) → ลงผลตอนปล่อยเลย
    if (plan.type === 'melee' || !plan.hit) this.resolveRun(r)
    if (plan.type === 'melee') return
    this.shots.push({
      plan, spawnTime: this.time, hitFired: false,
      attacker: r.actor, target: r.target, action: r.action,
      frame: { slot: { ...r.actor.slot }, stand: r.actor.stand, facing: r.actor.facing },
      // = ชั้นของผู้โจมตีตอนนี้ (ทีมเลื่อนจนอยู่เหนือเป้า) + เหนือตัวผู้โจมตีนิดเดียว
      layer: this.layerOf(r.actor, r) + SHOT_ABOVE_ACTOR,
      run: r,
    })
  }

  /**
   * ไอคอนเหนือหัว: ได้สถานะ → in แล้ว loop วนไปเรื่อยๆ · หมด/แตก/ตาย → out แล้วหาย
   * ได้สถานะซ้ำระหว่างกำลัง out → กลับไปเริ่ม in ใหม่
   */
  private stepIcons(v: UnitView, dt: number): void {
    const fx = this.statusIcons
    const len = (type: IconType, clip: 'in' | 'out') => (fx ? fx[type].clips[clip].length / fx[type].fps : 0.3)
    for (const type of ICON_TYPES) {
      const active = v.unit.alive && v.dying === null && this.battle.has(v.unit, type)
      const st = v.icons[type]
      if (!st) {
        if (active) v.icons[type] = { phase: 'in', t: 0 }
        continue
      }
      st.t += dt
      if (active && st.phase === 'out') { v.icons[type] = { phase: 'in', t: 0 }; continue }
      if (!active && st.phase !== 'out') { v.icons[type] = { phase: 'out', t: 0 }; continue }
      if (st.phase === 'in' && st.t >= len(type, 'in')) v.icons[type] = { phase: 'loop', t: st.t - len(type, 'in') }
      else if (st.phase === 'out' && st.t >= len(type, 'out')) delete v.icons[type]
    }
  }

  /**
   * จุดที่เพื่อนร่วมทีม "จะยืน/กำลังยืน" นอกช่องของตัวเอง:
   *   ตัวที่กำลังเดินไปตี = จุดหยุด (หลบรอก่อนมาถึง) · ยืนออกท่าอยู่ = ตรงที่ยืน · ตัวที่ยืนค้างนอกช่อง (ตีแล้วไม่กลับ) = ตรงที่ยืน
   *   ระหว่างเดินผ่าน (ขาไป/ขากลับ) ไม่นับ — แค่เดินผ่านใกล้ๆ ไม่ต้องหลบ
   */
  private spaceClaims(): { uid: string; team: Team; p: Vec2 }[] {
    const out: { uid: string; team: Team; p: Vec2 }[] = []
    const r = this.run
    if (r && r.step === 'approach') {
      const k = approachOffsetOf(r.actor.kit.config, r.action, r.actor.stand, this.targetPointsFor(r.actor, r.target).main)
      out.push({ uid: r.actor.unit.uid, team: r.actor.unit.team, p: { x: r.actor.slot.x + r.actor.facing * k.x, y: r.actor.slot.y + k.y } })
    }
    for (const v of this.views) {
      if (!v.unit.alive || v.dying !== null || v.dodging) continue
      if (Math.abs(v.pos.x) < 1 && Math.abs(v.pos.y) < 1) continue
      if (r && v === r.actor && (r.step === 'approach' || r.step === 'return')) continue
      out.push({ uid: v.unit.uid, team: v.unit.team, p: { x: v.slot.x + v.pos.x, y: v.slot.y + v.pos.y } })
    }
    // ตัวที่อัญเชิญมา: ยืนตรงไหนก็กินที่ตรงนั้น (ตั้งแต่วาปมาจนวาปกลับเสร็จ · ช่วงเดินไป/กลับนับแค่จุดหมายด้านบน)
    const s = this.summon
    if (s && (s.caster.alpha ?? 1) > 0.05 && !(r && r.actor === s.caster && (r.step === 'approach' || r.step === 'return'))) {
      const c = s.caster
      out.push({ uid: c.unit.uid, team: c.unit.team, p: { x: c.slot.x + c.pos.x, y: c.slot.y + c.pos.y } })
    }
    return out
  }

  /** ระยะหลบที่ต้องการของตัวนี้ (0 = ไม่มีใครมาใกล้) — หนีจุดที่ใกล้ที่สุดให้พ้นวงรีส่วนตัว */
  /** ระยะจากช่องของที่ยืนพักตอนนี้ (ผู้อัญเชิญ = จุดที่ถอยไปรอ · ตัวอื่น = ช่องตัวเอง) */
  private restOffset(v: UnitView): Vec2 {
    const s = this.summon
    return s && v === s.summoner ? { x: -v.facing * SUMMON_BACK_PX, y: 0 } : { x: 0, y: 0 }
  }

  dodgeTargetOf(v: UnitView, claims = this.spaceClaims()): Vec2 {
    const rest = this.restOffset(v)
    let want: Vec2 = rest
    let best = 0
    for (const c of claims) {
      if (c.team !== v.unit.team || c.uid === v.unit.uid) continue
      const d = { x: v.slot.x + rest.x - c.p.x, y: v.slot.y + rest.y - c.p.y }
      if (Math.hypot(d.x / SPACE_RX, d.y / SPACE_RY) >= 1) continue
      // หนีออกจากตัวนั้น: อยู่ข้างหน้าเขา → ไปข้างหน้า · ข้างหลัง/ตรงกันพอดี → ถอยหลัง · เฉียงหนี (ระดับเดียวกัน → เฉียงขึ้น)
      const vx = d.x * v.facing > 4 ? v.facing : -v.facing
      const vy = Math.abs(d.y) > 4 ? Math.sign(d.y) : -1
      const len = Math.hypot(1, DODGE_SLANT)
      const dir = { x: vx / len, y: (vy * DODGE_SLANT) / len }
      let k = 0
      while (k < DODGE_MAX && Math.hypot((d.x + dir.x * k) / SPACE_RX, (d.y + dir.y * k) / SPACE_RY) < 1.08) k += 4
      if (k > best) { best = k; want = { x: rest.x + dir.x * k, y: rest.y + dir.y * k } }
    }
    return want
  }

  /** เดินหลบ/เดินกลับเข้าช่อง — ท่าเดินหันหน้าเข้าศัตรูเสมอ (ถอยออก = moonwalk · กลับเข้าช่อง = เดินหน้า) */
  private stepDodges(dt: number): void {
    const claims = this.spaceClaims()
    const s = this.summon
    for (const v of this.views) {
      if (v === this.run?.actor || !v.unit.alive || v.dying !== null) continue
      // ผู้อัญเชิญกำลังเดินถอย/เดินกลับเอง → ลำดับอัญเชิญคุม
      if (s && v === s.summoner && (s.step === 'back' || s.step === 'home')) continue
      // ยืนค้างนอกที่พักจากท่าของตัวเอง (ไม่ใช่หลบ) → ไม่ยุ่ง
      const rest = this.restOffset(v)
      if (!v.dodging && (Math.abs(v.pos.x - rest.x) >= 1 || Math.abs(v.pos.y - rest.y) >= 1)) continue
      // ชะงักอยู่ขยับไม่ได้
      if (this.battle.has(v.unit, 'stun')) continue
      const want = this.dodgeTargetOf(v, claims)
      const dx = want.x - v.pos.x, dy = want.y - v.pos.y
      const dist = Math.hypot(dx, dy)
      const step = DODGE_SPEED * dt
      if (dist <= step) {
        v.pos = want
        v.dodging = Math.abs(want.x - rest.x) >= 1 || Math.abs(want.y - rest.y) >= 1
        if (v.dodgeWalking) { v.dodgeWalking = false; if (!v.reacting) this.playIdle(v) }
        continue
      }
      v.dodging = true
      v.pos = { x: v.pos.x + (dx / dist) * step, y: v.pos.y + (dy / dist) * step }
      if (!v.dodgeWalking && !v.reacting) {
        v.dodgeWalking = true
        v.facingBack = false
        v.player.playClip(this.walkClip(v), { speed: this.speed, loop: true })
      }
    }
  }

  /** ลงผลของท่า (ครั้งเดียวต่อเทิร์น) แล้วแสดงผลบนทุกตัวที่โดน */
  private resolveRun(r: ActionRun): void {
    if (r.resolved) return
    r.resolved = true
    const res = this.battle.resolveAction(r.actor.unit, r.action, r.target.unit)
    this.presentResult(r, res)
  }

  private presentResult(r: ActionRun, res: ActionResult): void {
    const isSkill = r.action !== 'attack'
    if (res.energyGained > 0) this.popup(r.actor, '+' + res.energyGained + ' Cost', '#60a5fa', true)
    // ดูดเลือด (ผู้ใช้/แถว/ทั้งทีม)
    for (const l of res.lifesteal) {
      const v = this.view(l.uid)
      if (v) this.popup(v, '+' + l.amount, '#4ade80', false)
    }
    for (const o of res.outcomes) {
      const v = this.view(o.uid)
      if (!v) continue
      if (o.evaded) { this.popup(v, t('miss'), '#e5e7eb', false); continue }
      if (o.immune) { this.popup(v, t('immune'), '#93c5fd', false); continue }
      if (o.barrierBroken) this.popup(v, t('barrierBreak'), '#f472b6', true)
      if (o.damage > 0) {
        // ธาตุได้เปรียบ ▲ (ส้ม) · เสียเปรียบ ▼ (เทา)
        this.popup(v, String(o.damage) + (o.elementMult > 1 ? ' ▲' : o.elementMult < 1 ? ' ▼' : ''),
          o.trueDamage > 0 ? TRUE_DAMAGE_COLOR : o.elementMult > 1 ? '#fb923c' : o.elementMult < 1 ? '#9ca3af' : o.crit ? '#fbbf24' : isSkill ? '#fde68a' : '#ffffff',
          o.crit || isSkill)
      }
      if (o.shieldAbsorbed > 0 && o.damage === o.shieldAbsorbed) this.popup(v, t('blocked'), '#e5e7eb', false)
      if (o.healed > 0) this.popup(v, '+' + o.healed, '#4ade80', true)
      if (o.dispelled > 0) this.popup(v, t('dispel'), '#f472b6', false)
      if (o.cleansed > 0) this.popup(v, t('cleanse'), '#a7f3d0', false)
      if (o.advanced) this.popup(v, t('advanced'), '#fde047', false)
      for (const st of o.applied) this.popup(v, statusLabel(st), isDebuffLabel(st) ? '#c084fc' : '#67e8f9', false)
      for (const st of o.resisted) this.popup(v, t('resist') + ' ' + statusLabel(st), '#9ca3af', false)

      if (o.killed) {
        v.dying = 0
        const die = v.kit.config.clips.die ?? v.kit.config.clips.hitHeavy
        if (die) v.player.playClip(die, { speed: this.speed })
      } else if (o.damage > 0) {
        // เลือดตกผ่านครึ่งหลอด (≥50% → <50%) → กระเด็น (knockback)
        // สกิล → ท่าโดนตี 1 รอบ · ตีธรรมดา → กะพริบแดงอย่างเดียว (วาดตอน render)
        const half = v.unit.maxHp / 2
        const crossedHalf = o.hpBefore >= half && v.unit.hp < half
        // โดนสกิลที่ติดชะงัก → เข้าท่าชะงักทันที (ไม่ต้องเล่นท่าโดนตี/กระเด็นก่อน)
        if (o.applied.includes('stun')) this.playIdle(v)
        else if (crossedHalf) this.react(v, v.kit.config.clips.hitHeavy ?? v.kit.config.clips.die)
        else if (isSkill) this.react(v, v.kit.assets.geometry.hitName ?? v.kit.config.clips.hitLight)
        v.hits.push({ time: this.time, isSkill })
        if (v.hits.length > HIT_EVENT_KEEP) v.hits.shift()
      }
      // ติดชะงัก/หายชะงัก (โดนล้าง) → เปลี่ยนท่ายืนทันที ถ้าไม่ได้กำลังเล่นท่าโดนตี
      // เฉพาะตัวที่ท่ายืนไม่ตรงกับสถานะชะงักจริง · ห้ามแตะผู้ใช้ท่า (บัฟทั้งทีมโดนตัวเองด้วย) —
      // ไม่งั้นท่าร่ายถูกแทนด้วย idle วนไม่จบ แล้วเทิร์นค้างรอท่าจบตลอดไป
      const stunPoseWrong = (v.pose === 'stun') !== this.battle.has(v.unit, 'stun')
      if (!o.killed && !v.reacting && v !== r.actor && stunPoseWrong) this.playIdle(v)
    }
    this.onChange?.()
  }

  /** ตัวเลข/ป้ายลอยเหนือหัว — ป้ายของตัวเดียวกันที่ขึ้นพร้อมกันเรียงซ้อนขึ้นไป */
  private popup(v: UnitView, text: string, color: string, big: boolean): void {
    const order = this.popups.filter(p => p.uid === v.unit.uid && p.life > POPUP_LIFE - 0.35).length
    this.popups.push({ at: this.headWorld(v), text, life: POPUP_LIFE, color, big, uid: v.unit.uid, order })
  }

  /**
   * จุดเหนือหัว = จุดยึด "เหนือหัว" ที่ตั้งใน editor (anchors.overhead · เทียบเท้า) — ที่เดียวกับตัวเลขดาเมจในหน้าตัวอย่าง
   * ยังไม่ตั้ง (0,0) → เดาจากระดับหน้า + HEAD_ABOVE_FACE
   */
  private headWorld(v: UnitView): Vec2 {
    const b = bodyPointsOf(v.kit.assets, v.kit.config)
    const oh = v.kit.config.anchors.overhead
    if (oh.x !== 0 || oh.y !== 0) return this.localToWorld(v, { x: b.stand.x + oh.x, y: b.stand.y + oh.y })
    const w = this.localToWorld(v, { x: b.stand.x, y: b.face.y })
    return { x: w.x, y: w.y - HEAD_ABOVE_FACE }
  }

  /** จุดกึ่งกลางหลอดเลือด (พิกัดโลก) = เหนือหัวยกขึ้นอีก HP_BAR_RAISE */
  private barWorld(v: UnitView): Vec2 {
    const h = this.headWorld(v)
    return { x: h.x, y: h.y - HP_BAR_RAISE }
  }

  // ── เดินเวลา ──

  update(dtMs: number): void {
    // เปิดเมนูตั้งค่า = หยุดเกมไว้ระหว่างนั้น
    if (this.paused || this.hud.menuOpen) return
    if (this.phase === 'ended' && !this.endCleared) this.clearOnEnd()
    // ความเร็วเปลี่ยน (จบเปิดฉาก → ความเร็วที่เลือก · จบเกม → x1 · กดปุ่มความเร็ว) → คลิปที่เล่นอยู่ (idle วน ฯลฯ) เปลี่ยนตามทันที
    const sp = this.speed
    if (sp !== this.appliedSpeed) {
      this.appliedSpeed = sp
      for (const v of this.views) v.player.setSpeed(sp)
    }
    const dt = dtMs / 1000
    const mul = this.releaseMul
    this.time += dt * mul
    if (this.timerOn && this.phase !== 'intro' && this.phase !== 'ended') {
      this.timeLeft -= dt * (CLOCK_RATE[this.speed] ?? this.speed)
      if (this.timeLeft <= 0) this.timeLeft = 0
    }
    const current = this.pendingActor ?? this.summon?.summoner.unit ?? this.run?.actor.unit ?? this.skip?.actor ?? null
    if (current?.team === 0) this.panelUid = current.uid
    this.hud.update(dt)

    for (const v of this.views) {
      if (v.dying === null && !v.reacting && (v.pose === 'stun') !== this.battle.has(v.unit, 'stun') && v !== this.run?.actor) this.playIdle(v)
      v.player.update(dtMs)
      if (v.dying !== null) v.dying += dt * mul
      if (v.dying !== null && v.dying > DEATH_KNOCK_SEC + SOUL_SEC) v.gone = true
    }

    for (const v of this.views) this.stepIcons(v, dt * mul)
    if (!this.intro && !this.waveExit) this.stepDodges(dt * mul)

    if (this.intro) { this.stepIntro(dt * mul); return }
    if (this.waveExit) { this.stepWaveExit(dt * mul); return }

    if (this.skip) {
      this.skip.left -= dt * mul
      if (this.skip.left <= 0) {
        this.battle.endTurn(this.skip.actor)
        const woke = this.view(this.skip.actor.uid)
        if (woke && !woke.reacting && woke.dying === null) this.playIdle(woke)
        this.skip = null
        this.phase = this.battle.over ? 'ended' : 'thinking'
        this.onChange?.()
      }
    }
    if (this.timerOn && this.timeLeft <= 0 && (this.phase === 'thinking' || this.phase === 'input')) this.finishByTime()
    if (this.cutin) {
      // x2/x4 เร่งคัตซีนตาม √ความเร็ว (ยังทันเห็นชื่อสกิล)
      this.cutin.t += dt * Math.sqrt(this.speed)
      if (this.cutin.t >= CUTIN_SEC) this.skipCutin()
    }
    if (this.phase === 'thinking') this.beginTurn()
    if (this.summon) {
      this.summon.caster.player.update(dtMs)
      if (this.summon.step !== 'cast') this.stepSummon(dt)
    }
    if (this.run) this.stepRun(dt)
    for (let i = this.warps.length - 1; i >= 0; i--) {
      const w = this.warps[i]
      w.t += dt * mul
      if (w.t > (w.out ? WARP_OUT_SEC : WARP_IN_SEC)) this.warps.splice(i, 1)
    }

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]
      const T = (this.time - s.spawnTime) * s.plan.bodyFps
      if (T >= s.plan.travelTicks && !s.hitFired) {
        s.hitFired = true
        if (s.plan.hit) this.resolveRun(s.run)
      }
      if (shotExpired(s.plan, T)) this.shots.splice(i, 1)
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].life -= dt
      if (this.popups[i].life <= 0) this.popups.splice(i, 1)
    }
  }

  private stepRun(dt: number): void {
    const r = this.run!
    const cfg = r.actor.kit.config
    const a = cfg.actions[r.action]

    if (r.step === 'approach' || r.step === 'return') {
      let goal: Vec2 = { x: 0, y: 0 }
      if (r.step === 'approach') {
        const k = approachOffsetOf(cfg, r.action, r.actor.stand, this.targetPointsFor(r.actor, r.target).main)
        goal = { x: r.actor.facing * k.x, y: k.y }
      }
      const step = (a.approach?.speed ?? 600) * dt * this.releaseMul
      const dx = goal.x - r.actor.pos.x, dy = goal.y - r.actor.pos.y
      const dist = Math.hypot(dx, dy)
      if (dist <= step) {
        r.actor.pos = goal
        if (r.step === 'approach') this.beginAct()
        else { r.actor.facingBack = false; this.playIdle(r.actor); r.step = 'wait'; r.waitLeft = TURN_PAUSE_SEC }
      } else {
        r.actor.pos = { x: r.actor.pos.x + (dx / dist) * step, y: r.actor.pos.y + (dy / dist) * step }
      }
      return
    }

    if (r.step === 'act') {
      const p = r.actor.player
      const readyLen = Math.min(a.releaseFrame, Math.max(0, p.totalFrames - 1))
      const cur = p.globalFrame
      if (!r.spawned && r.prevFrame < readyLen && cur >= readyLen) this.spawn(r)
      r.prevFrame = cur
      return
    }

    // รอกระสุน/เอฟเฟกต์ของเทิร์นนี้เล่นจนจบ (รวมควัน finish) ก่อนไปเทิร์นถัดไป
    // เทิร์นใหม่จะจัดชั้นตัวละครใหม่ — ถ้ายังมีเอฟเฟกต์ค้าง ชั้นของมันเทียบกับตัวละครจะเปลี่ยนกลางคัน
    if (this.shots.some(s => s.attacker === r.actor)) return
    r.waitLeft -= dt * this.releaseMul
    if (r.waitLeft <= 0) {
      if (!r.resolved) this.resolveRun(r)   // กันหลุด: ท่าจบโดยยังไม่ได้ลงผล
      this.run = null
      const s = this.summon
      if (s && r.actor === s.caster) {
        s.step = 'warpOut'
        s.t = 0
        this.warps.push({ at: { x: s.caster.slot.x + s.caster.pos.x, y: s.caster.slot.y + s.caster.pos.y }, t: 0, out: true })
        return
      }
      this.battle.endTurn(r.actor.unit)
      this.phase = this.battle.over ? 'ended' : 'thinking'
      this.onChange?.()
    }
  }

  // ── คลิกเลือกเป้า ──

  /** หาหน่วยที่คลิกโดน (พิกัดจอตรรกะ 1280×720) */
  /** ผลคาดการณ์ของท่าที่กำลังเลือก ต่อเรนเจอร์ตัวนี้ (ไม่มี = null) */
  previewOf(uid: string): ActionPreview | null { return this.lastPreviews.get(uid) ?? null }

  /** ตำแหน่งยืนประจำช่องของตัวนี้ (พิกัดโลก) */
  slotOf(uid: string): Vec2 | null {
    const v = this.view(uid)
    return v ? { ...v.slot } : null
  }

  /** จุดกึ่งกลางหลอดเลือดบนหัวของตัวนี้ (พิกัดจอตรรกะ) — HUD ใช้วางการ์ดข้อมูลข้างตัว */
  unitAnchor(uid: string): Vec2 | null {
    const v = this.view(uid)
    if (!v) return null
    const h = this.barWorld(v)
    return { x: h.x * CAMERA_ZOOM, y: h.y * CAMERA_ZOOM }
  }

  unitAt(sx: number, sy: number): string | null {
    const Z = CAMERA_ZOOM
    let best: { uid: string; d: number } | null = null
    for (const v of this.views) {
      if (!v.unit.alive) continue
      const w = this.localToWorld(v, v.stand)
      const x0 = (w.x - 70) * Z, x1 = (w.x + 70) * Z
      const y0 = (w.y - 190) * Z, y1 = (w.y + 20) * Z
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) {
        const d = Math.abs(sx - w.x * Z) + Math.abs(sy - (w.y - 80) * Z)
        if (!best || d < best.d) best = { uid: v.unit.uid, d }
      }
    }
    return best?.uid ?? null
  }

  // ── วาด ──

  render(ctx: CanvasRenderingContext2D): void {
    const Z = CAMERA_ZOOM
    // แคนวาสจริงอาจใหญ่กว่าจอตรรกะ (เต็มจอความละเอียดสูง) → ย่อ/ขยายพิกัดทั้งฉากให้พอดี
    const k = ctx.canvas ? ctx.canvas.width / VIEW_W : 1
    ctx.setTransform(k, 0, 0, k, 0, 0)
    this.paintBackground(ctx)

    const targets = this.validTargetIds
    // ตัวที่กำลังรอผู้เล่นสั่ง (มีวงเหลืองใต้เท้า) นับเป็นผู้โจมตีด้วย — จัดชั้นใหม่ตั้งแต่ยังไม่กดสั่ง
    const acting = this.run?.actor ?? (this.pendingActor ? this.view(this.pendingActor.uid) ?? null : null)
    const summoned = this.summon && (this.summon.caster.alpha ?? 1) > 0 ? [this.summon.caster] : []
    const ordered = [...this.views, ...summoned].filter(v => !v.gone).sort((a, b) => (a.slot.y + a.pos.y) - (b.slot.y + b.pos.y))

    // ตัวที่ท่านี้จะโดนจริง (ลูกศรเหนือหัว + วงใต้เท้าเข้มกว่า) — เห็นทันทีว่าโดนทั้งแถวหรือตัวเดียว
    const aim = this.intro ? [] : this.aimTargets()
    const aimIds = new Set(aim.map(u => u.uid))

    // วงใต้เท้า: ตัวที่กำลังเล่น / เป้าที่เลือกได้ (ตัวที่จะโดนจริงวงเข้มกว่า)
    for (const v of ordered) {
      if (!v.unit.alive || this.intro) continue
      const w = this.localToWorld(v, v.stand)
      const isActor = acting === v || this.pendingActor?.uid === v.unit.uid
      const isTarget = targets.has(v.unit.uid)
      const isAim = aimIds.has(v.unit.uid)
      if (!isActor && !isTarget && !isAim) continue
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(w.x * Z, w.y * Z, 46 * Z * 1.6, 13 * Z * 1.6, 0, 0, Math.PI * 2)
      const ally = !isActor && this.targetingAllies
      ctx.fillStyle = isActor ? 'rgba(251,191,36,0.28)'
        : ally ? `rgba(74,222,128,${isAim ? 0.42 : 0.25})` : `rgba(248,113,113,${isAim ? 0.42 : 0.25})`
      ctx.strokeStyle = isActor ? '#fbbf24' : ally ? '#4ade80' : '#f87171'
      ctx.lineWidth = isAim ? 3 : 2
      ctx.fill(); ctx.stroke()
      ctx.restore()
    }

    this.paintLayers(ctx, ordered, acting)
    for (const w of this.warps) this.paintWarp(ctx, w)
    for (const v of ordered) this.paintSoul(ctx, v)
    if (this.intro) { this.paintIntro(ctx); return }
    // ไอคอนอมตะ/ชะงักอยู่ใต้หลอดเลือดและตัวเลข/ข้อความ
    for (const v of this.views) if (!v.gone) this.paintIcons(ctx, v)
    const previews = this.actionPreviews()
    this.lastPreviews = previews
    for (const v of ordered) if (v.unit.alive && !v.unit.reserve) this.paintHpBar(ctx, v, previews.get(v.unit.uid))
    // ลูกศรเล็งอยู่บนสุด (เหนือหลอดเลือด/ตัวเลขไกด์) จะได้ไม่โดนบัง
    if (aim.length) this.paintAimMarks(ctx, aim)
    this.paintPopups(ctx)
    this.hud.draw(ctx)
    if (this.cutin) paintCutin(ctx, this.cutin.play, this.cutin.t, VIEW_W, VIEW_H)
  }

  /** ม่านดำแยกขึ้น–ลง แล้วขึ้นคำว่า START ตอนทุกตัวเข้าที่ */
  private paintIntro(ctx: CanvasRenderingContext2D): void {
    const io = this.intro!
    const half = VIEW_H / 2
    const open = Math.min(1, io.t / INTRO_CURTAIN_SEC)
    // เปิดแบบชะลอตอนท้าย (ease-out) ให้ดูมีน้ำหนัก
    const shift = half * (1 - (1 - open) * (1 - open))
    if (open < 1) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, -shift, VIEW_W, half)
      ctx.fillRect(0, half + shift, VIEW_W, half)
    }
    if (io.startAt === null) return

    const e = io.t - io.startAt
    const pop = Math.min(1, e / INTRO_START_POP)
    const scale = 1 + (1 - pop) * (1 - pop) * 0.8
    const alpha = e > INTRO_START_SEC - INTRO_START_FADE
      ? Math.max(0, (INTRO_START_SEC - e) / INTRO_START_FADE)
      : 1
    ctx.save()
    ctx.globalAlpha = alpha
    const band = ctx.createLinearGradient(0, 0, VIEW_W, 0)
    band.addColorStop(0, 'rgba(0,0,0,0)')
    band.addColorStop(0.5, 'rgba(0,0,0,0.6)')
    band.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = band
    ctx.fillRect(0, half - 62, VIEW_W, 124)
    ctx.translate(VIEW_W / 2, half)
    ctx.scale(scale, scale)
    ctx.textAlign = 'center'
    ctx.font = 'bold 104px LineBold, Krub, ui-sans-serif, system-ui'
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'
    ctx.strokeText('START', 0, 34)
    ctx.fillStyle = '#fbbf24'
    ctx.fillText('START', 0, 34)
    ctx.restore()
  }

  /**
   * ลำดับเลเยอร์ (วาดจากล่างขึ้นบน)
   *
   * ชั้นพื้นฐาน = ความสูงของจุดยืนประจำช่องบนแผนที่ (ไกลจอ = ล่าง) ไม่เปลี่ยนตามตอนเดิน
   *   ซ้าย/ขวาช่องเดียวกันอยู่ชั้นเดียวกัน → ฝั่งที่โจมตี (หรือโจมตีล่าสุด) อยู่สูงกว่า
   *
   * X โจมตี Y → ทีมของ X เลื่อนชั้น "ทั้งกลุ่ม" ด้วยระยะเท่ากัน จน X อยู่เหนือ Y พอดี
   *   ในทีมห่างกันเท่าเดิม X จึงไม่ทับเพื่อน · เป้าอยู่ต่ำกว่า X → ทั้งทีมเลื่อนลง (กฎเดียวกัน)
   *   ตัวอย่าง: ri (ชั้น 1) ตี db (ชั้น 1) → ri อยู่บน db, so แต่ใต้ mg, ka, iz
   *             brown (ชั้น 0) ตี mg (ชั้น 2) → brown ขึ้นไปบน mg พร้อมทั้งทีม แต่ยังใต้ ka, iz
   *
   * กระสุน/เอฟเฟกต์ = ชั้นของผู้โจมตี (เหนือตัวผู้โจมตีนิดเดียว ใต้ตัวที่อยู่ชั้นสูงกว่า)
   */
  private paintLayers(ctx: CanvasRenderingContext2D, ordered: UnitView[], acting: UnitView | null): void {
    if (acting) this.layerTeam = acting.unit.team
    const items: { key: number; paint: () => void }[] = []
    for (const v of ordered) items.push({ key: this.layerOf(v, this.run), paint: () => this.paintUnit(ctx, v) })
    // กระสุนใช้ชั้นที่ล็อกไว้ตอนปล่อย (ไม่คำนวณใหม่ตามเทิร์นปัจจุบัน)
    this.shots.forEach((s, i) => items.push({ key: s.layer + i * 1e-4, paint: () => this.paintShot(ctx, s) }))
    items.sort((a, b) => a.key - b.key)
    for (const it of items) it.paint()
  }

  /**
   * ชั้นของตัวละคร: จุดยืนประจำช่อง + (ทีมที่กำลังตี: เลื่อนทั้งทีมจนผู้ตีอยู่เหนือเป้า)
   *
   * ท่าที่เดินเข้าไปตี: ใช้ความลึกจริงแทนการเลื่อนทั้งทีม (Y สูง = ไกลจอ = ชั้นล่าง)
   *   ตัวที่เดินอยู่ = ชั้นตาม Y ปัจจุบัน → เดินลงมาผ่านเพื่อนแถวหน้าบน จะขึ้นไปอยู่เหนือเพื่อน
   *   ก็ต่อเมื่อ Y ต่ำกว่าเพื่อนแล้วจริงๆ (ขาเดินกลับก็เหมือนกัน)
   *   ถึงเป้า/ยืนตี = เหนือเป้าเสมอ (กฎเดิม) · ตัวอื่นอยู่ชั้นประจำช่อง (ทีมที่ตีชนะเมื่อ Y เท่ากัน)
   */
  private layerOf(v: UnitView, run: ActionRun | null): number {
    if (run && this.walksToTarget(run)) {
      if (v !== run.actor) return v.slot.y + (v.unit.team === run.actor.unit.team ? 0.25 : 0)
      const y = v.slot.y + v.pos.y
      const targetY = run.target.slot.y
      const atTarget = run.step === 'act' || (run.step === 'approach' && Math.abs(y - targetY) < WALK_LAYER_NEAR_PX)
      return (atTarget ? Math.max(y, targetY) : y) + 0.5
    }
    const topTeam = run ? run.actor.unit.team : this.layerTeam
    if (v.unit.team !== topTeam) return v.slot.y
    const lift = run ? run.target.slot.y - run.actor.slot.y : 0
    return v.slot.y + lift + 0.5
  }

  /** ท่านี้เดินเข้าไปหาเป้า (ตีระยะประชิด) — บัฟไม่เดิน */
  private walksToTarget(run: ActionRun): boolean {
    return !!run.actor.kit.config.actions[run.action].approach?.enabled && !this.battle.targetsAllies(run.actor.unit, run.action)
  }

  /**
   * แสงวาป (อัญเชิญเข้า/กลับ): เสาแสงฟ้าจากฟ้าลงมาที่เท้า + วงหมุนรอบตัว + ประกายลอยขึ้น · สั้นๆ ไม่เวอร์
   * เข้า = สว่างขึ้นเร็วแล้วค่อยจางตอนตัวปรากฏ · ออก = สว่างวาบแล้วจางพร้อมตัวที่หายไป
   */
  private paintWarp(ctx: CanvasRenderingContext2D, w: Warp): void {
    const Z = CAMERA_ZOOM
    const dur = w.out ? WARP_OUT_SEC : WARP_IN_SEC
    const k = Math.min(1, w.t / dur)
    const peak = w.out ? 0.3 : 0.4
    const env = k < peak ? k / peak : Math.max(0, 1 - (k - peak) / (1 - peak))
    if (env <= 0) return
    const x = w.at.x * Z, y = w.at.y * Z
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    // เสาแสง: กว้างสุดตอนพีค · ไล่จางขึ้นไปด้านบน (ทีละแถบ)
    const bw = 40 * Z * (0.55 + 0.45 * env)
    const top = y - 300 * Z
    const bands = 10
    for (let i = 0; i < bands; i++) {
      const y0 = top + ((y - top) * i) / bands
      const fade = (i + 1) / bands
      const g = ctx.createLinearGradient(x - bw, 0, x + bw, 0)
      g.addColorStop(0, 'rgba(40,220,255,0)')
      g.addColorStop(0.3, `rgba(40,220,255,${0.35 * env * fade})`)
      g.addColorStop(0.5, `rgba(215,255,255,${0.85 * env * fade})`)
      g.addColorStop(0.7, `rgba(40,220,255,${0.35 * env * fade})`)
      g.addColorStop(1, 'rgba(40,220,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - bw, y0, bw * 2, (y - top) / bands + 1)
    }
    // แสงที่พื้น
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 70 * Z)
    glow.addColorStop(0, `rgba(150,250,255,${0.55 * env})`)
    glow.addColorStop(1, 'rgba(40,220,255,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.ellipse(x, y, 70 * Z, 20 * Z, 0, 0, Math.PI * 2)
    ctx.fill()
    // วงหมุนรอบตัว 3 ชั้น (เส้นแตกเป็นช่วงๆ แบบในเกม)
    ctx.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      const h = y - (35 + i * 45) * Z * (w.out ? 1 : 0.6 + 0.4 * k)
      const rx = (58 - i * 8) * Z, ry = 13 * Z
      const spin = w.t * (7 + i * 2) + i * 2.1
      ctx.strokeStyle = `rgba(90,245,255,${0.9 * env})`
      ctx.lineWidth = 3 * Z
      for (let seg = 0; seg < 3; seg++) {
        const a0 = spin + seg * (Math.PI * 2 / 3)
        ctx.beginPath()
        ctx.ellipse(x, h, rx, ry, 0, a0, a0 + 1.1)
        ctx.stroke()
      }
    }
    // ประกายเม็ดเล็กลอยขึ้น
    ctx.fillStyle = `rgba(200,255,255,${env})`
    for (let i = 0; i < 12; i++) {
      const sx = x + Math.sin(i * 12.9898) * 42 * Z
      const rise = ((w.t * 1.6 + i * 0.13) % 1) * 170 * Z
      const size = (2 + (i % 3)) * Z
      ctx.fillRect(sx, y - 10 * Z - rise, size, size)
    }
    ctx.restore()
  }

  /** ไอคอนสถานะ: โล่อมตะลอยเหนือหลอดเลือด · ดาวชะงักหมุนรอบหัว (มีทั้งคู่ไม่ทับกัน) */
  private paintIcons(ctx: CanvasRenderingContext2D, v: UnitView): void {
    const fx = this.statusIcons
    if (!fx) return
    const head = this.headWorld(v)
    const Z = CAMERA_ZOOM
    const draw = (icon: StatusIconFx, st: IconState, at: Vec2, flip = false) => {
      const frames = icon.clips[st.phase]
      if (!frames.length) return
      const pos = st.t * icon.fps
      const i = Math.floor(pos)
      let a: number, b: number | null
      if (st.phase === 'loop') { a = i % frames.length; b = (a + 1) % frames.length }
      else { a = Math.min(i, frames.length - 1); b = a + 1 < frames.length ? a + 1 : null }
      const frame = b === null ? frames[a] : lerpSAMFrame(frames[a], frames[b], pos - i)
      renderSAMFrame(ctx, frame, icon.sam.images, icon.sprites, (at.x - icon.anchor.x) * Z, (at.y - icon.anchor.y) * Z, Z, undefined, flip, icon.anchor.x)
    }
    const stun = v.icons.stun
    if (stun) draw(fx.stun, stun, { x: head.x, y: head.y + ICON_STUN_BELOW_BAR })
    const barrier = v.icons.barrier
    // โล่อมตะหันไปทางเดียวกับตัวละคร → ฝั่งศัตรูกลับด้าน (ดาวชะงักหมุนรอบตัว ไม่ต้องกลับ)
    if (barrier) draw(fx.barrier, barrier, { x: head.x, y: head.y - HP_BAR_RAISE - ICON_SHIELD_ABOVE_BAR }, v.unit.team === 1)
  }

  private paintBackground(ctx: CanvasRenderingContext2D): void {
    // พื้นหลังสนาม (1920×1080 ย่อลงพอดีจอ 16:9) — ระหว่างโหลดใช้สีพื้นเรียบแทน
    const bg = this.background
    if (bg?.complete && bg.naturalWidth) {
      ctx.drawImage(bg, 0, 0, VIEW_W, VIEW_H)
      return
    }
    ctx.fillStyle = '#12303a'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }

  /**
   * วิญญาณหลังท่ากระเด็นจบ — ฝั่งซ้าย (ทีมเรา) eff_die · ฝั่งขวา (ศัตรู) eff_die_enemy
   * เกิดที่ระดับลำตัวตรงจุดที่ตาย ลอยขึ้นแบบค่อยๆ ช้าลง · ทึบช่วงแรกแล้วค่อยจางหาย · เล่นคลิป die วนตลอด
   */
  private paintSoul(ctx: CanvasRenderingContext2D, v: UnitView): void {
    if (!this.deathFx || v.dying === null || v.dying <= DEATH_KNOCK_SEC) return
    const t = v.dying - DEATH_KNOCK_SEC
    const k = Math.min(1, t / SOUL_SEC)
    const alpha = k < SOUL_HOLD ? 1 : 1 - (k - SOUL_HOLD) / (1 - SOUL_HOLD)
    if (alpha <= 0) return
    const fx = v.unit.team === 0 ? this.deathFx.ally : this.deathFx.enemy
    if (!fx.frames.length) return
    const pos = t * fx.fps, i = Math.floor(pos) % fx.frames.length
    const frame = lerpSAMFrame(fx.frames[i], fx.frames[(i + 1) % fx.frames.length], pos - Math.floor(pos))
    const rise = SOUL_RISE * (1 - (1 - k) * (1 - k))
    const Z = CAMERA_ZOOM
    const at = this.localToWorld(v, v.stand)
    renderSAMFrame(ctx, frame, fx.sam.images, fx.sprites,
      (at.x - fx.anchor.x) * Z, (at.y - SOUL_BODY_Y - rise - fx.anchor.y) * Z, Z,
      // ไม่กลับด้าน — ไฟล์ eff_die_enemy วาดหันถูกทางสำหรับฝั่งศัตรูมาแล้ว
      undefined, false, 0, 0, alpha)
  }

  private paintUnit(ctx: CanvasRenderingContext2D, v: UnitView): void {
    const Z = CAMERA_ZOOM
    // ผสมเฟรมกลางของ .sam (30fps) ให้ลื่นตามรีเฟรชเรตจอ
    const frame = v.player.smoothFrame
    if (!frame) return
    const { sam, sprites } = v.kit.assets
    const flip = (v.facing === -1) !== v.facingBack
    const origin = { x: v.slot.x + v.pos.x - v.stand.x, y: v.slot.y + v.pos.y - v.stand.y }

    // ตาย: เล่นท่ากระเด็นจบแล้วตัวหายไปเลย (วิญญาณวาดแยกใน paintSoul)
    if (v.dying !== null && v.dying > DEATH_KNOCK_SEC) return

    const alpha = v.alpha ?? 1
    if (alpha <= 0) return
    const draw = (c: CanvasRenderingContext2D, dx = 0, dy = 0) =>
      renderSAMFrame(c, frame, sam.images, sprites, origin.x * Z - dx, origin.y * Z - dy, Z, undefined, flip, v.stand.x, 0, alpha)

    // ย้อมสี: บาเรีย (อมตะ) = โทนทองเรืองขึ้นลงช้าๆ · ตีธรรมดาโดน = กะพริบแดง
    const tints: [string, number][] = []
    if (this.battle.has(v.unit, 'barrier')) tints.push(['#fbbf24', BARRIER_TINT_ALPHA + Math.sin(this.time * 4) * BARRIER_TINT_PULSE])
    const hit = v.hits[v.hits.length - 1]
    if (hit && !hit.isSkill && (this.time - hit.time) * 30 < DUMMY_FLASH_TICKS) tints.push(['#ff2d2d', DUMMY_FLASH_ALPHA])
    if (!tints.length || typeof document === 'undefined') { draw(ctx); return }

    // แบบ clipping mask: วาดตัวลงแคนวาสแยก (กรอบพอดีเฟรมนี้ ท่าพุ่ง/สกิลยื่นออกไปก็ไม่ขาด) → ย้อมสีเฉพาะพิกเซลของตัวเอง
    // → แปะทั้งภาพที่ย้อมแล้วลงจอครั้งเดียว · ของที่อยู่ใต้/ผ่านตัว (เลเซอร์ของคนอื่น ฯลฯ) ไม่โดนย้อมด้วย
    const bb = frameBounds(sam, sprites, frame)
    if (!bb) { draw(ctx); return }
    const x0 = flip ? 2 * v.stand.x - bb.x1 : bb.x0, x1 = flip ? 2 * v.stand.x - bb.x0 : bb.x1
    const pad = 4
    const dx = Math.floor((origin.x + x0) * Z) - pad, dy = Math.floor((origin.y + bb.y0) * Z) - pad
    const w = Math.min(TINT_MAX_PX, Math.ceil((x1 - x0) * Z) + pad * 2), h = Math.min(TINT_MAX_PX, Math.ceil((bb.y1 - bb.y0) * Z) + pad * 2)
    if (!this.fx) this.fx = document.createElement('canvas')
    if (this.fx.width < w || this.fx.height < h) { this.fx.width = Math.max(this.fx.width, w); this.fx.height = Math.max(this.fx.height, h) }
    const f = this.fx.getContext('2d')
    if (!f) { draw(ctx); return }
    f.setTransform(1, 0, 0, 1, 0, 0)
    f.globalAlpha = 1
    f.globalCompositeOperation = 'source-over'
    f.clearRect(0, 0, w, h)
    draw(f, dx, dy)
    f.setTransform(1, 0, 0, 1, 0, 0)
    // source-atop: ทาสีทับเฉพาะที่มีพิกเซลของตัว (คงความใสเดิมของแต่ละจุด)
    f.globalCompositeOperation = 'source-atop'
    for (const [color, alpha] of tints) {
      f.globalAlpha = Math.max(0, Math.min(1, alpha))
      f.fillStyle = color
      f.fillRect(0, 0, w, h)
    }
    f.globalAlpha = 1
    f.globalCompositeOperation = 'source-over'
    ctx.drawImage(this.fx, 0, 0, w, h, dx, dy, w, h)
  }

  private paintShot(ctx: CanvasRenderingContext2D, s: FlyingShot): void {
    const Z = CAMERA_ZOOM
    const T = (this.time - s.spawnTime) * s.plan.bodyFps
    const idx = shotFrameMix(s.plan, T)
    const bullet = s.attacker.kit.assets.bullets[s.plan.suffix]
    if (!idx || !bullet) return
    const frames = idx.clip === 'normal' ? bullet.flight : bullet.impact
    const raw = frames[idx.index]
    if (!raw) return
    const frame = idx.next !== null ? lerpSAMFrame(raw, frames[idx.next] ?? null, idx.frac) : raw

    const pose = shotPose(s.plan, T)
    const anchor = idx.clip === 'finish' ? s.plan.finishAnchor : s.plan.anchor
    const ca = Math.cos(pose.angle), sa = Math.sin(pose.angle)
    const kiwiOrigin = { x: pose.pos.x - (ca * anchor.x - sa * anchor.y), y: pose.pos.y - (sa * anchor.x + ca * anchor.y) }
    // ทีมขวา: แปลงจุดกำเนิดไปฝั่งกระจก แล้วให้ renderSAMFrame กลับด้านภาพรอบจุดนั้น
    const w = this.kiwiToWorld(s.frame, kiwiOrigin)
    renderSAMFrame(ctx, frame, bullet.sam.images, bullet.sprites, w.x * Z, w.y * Z, Z,
      undefined, s.frame.facing === -1, 0, pose.angle)
  }

  /**
   * ไกด์ผลลัพธ์ตอนถึงตาเรา: ชี้/เลือกท่า → ทุกตัวที่ท่านั้นไปโดนได้ · เลือกท่าแล้วชี้ตัวไหน → เฉพาะตัวที่จะโดนจริง
   * (ท่าทั้งแถวชี้ตัวเดียวก็เห็นทั้งแถว) · ไม่คิดหลบ/คริ/สุ่ม เป็นค่าคาดการณ์
   */
  private actionPreviews(): Map<string, ActionPreview> {
    const out = new Map<string, ActionPreview>()
    if (this.phase !== 'input' || !this.pendingActor || this.hud.menuOpen) return out
    const hoverSummon = this.pendingAction ? null : this.hud.hoveredSummon()
    const caster = this.pendingCaster ?? (hoverSummon ? this.battle.reserves[this.pendingActor.team][hoverSummon.index] ?? null : null)
    if (caster) this.battle.prepareSummon(this.pendingActor, caster)
    const actor = caster ?? this.pendingActor
    const action = this.pendingAction ?? hoverSummon?.action ?? this.hud.hoveredAction()
    if (!action) return out
    let chosen: Unit | null = null
    const p = this.hud.hover
    if (this.pendingAction && p) {
      const uid = this.unitAt(p.x, p.y)
      chosen = uid ? this.battle.unit(uid) ?? null : null
    }
    for (const r of this.battle.previewAction(actor, action, chosen)) out.set(r.uid, r)
    return out
  }

  // ── ไฮไลท์ขอบเขตของท่าที่กำลังเล็ง ──

  /**
   * ตัวที่ "จะโดนจริง" ของท่าที่เลือกไว้ — คิดจากเป้าที่ชี้อยู่ (ท่าทั้งแถวชี้ตัวเดียวก็ได้ทั้งแถว)
   * ยังไม่เลือกท่า / ไม่ได้ชี้เป้าที่เลือกได้ = ไม่มีไฮไลท์ (ยกเว้นท่าที่มีทางเลือกเดียวอยู่แล้ว)
   */
  private aimTargets(): Unit[] {
    if (this.phase !== 'input' || !this.pendingActor || !this.pendingAction || this.hud.menuOpen) return []
    const action = this.pendingAction
    const actor = this.pendingCaster ?? this.pendingActor
    const p = this.hud.hover
    let chosen: Unit | null = null
    if (p) {
      const uid = this.unitAt(p.x, p.y)
      chosen = uid ? this.battle.unit(uid) ?? null : null
    }
    // ไม่ได้ชี้ใคร หรือชี้ตัวที่เลือกไม่ได้ → ถ้าท่านี้มีทางเลือกเดียวอยู่แล้วก็โชว์ขอบเขตให้เลย
    if (!chosen || !this.validTargetIds.has(chosen.uid)) chosen = this.onlyChoice(action)
    if (!chosen) return []
    return this.battle.affectedUnits(actor, action, chosen).filter(u => u.alive)
  }

  /** ลูกศรชี้ลงเหนือหัวของทุกตัวที่จะโดน (เด้งขึ้นลงเบาๆ) */
  private paintAimMarks(ctx: CanvasRenderingContext2D, aim: Unit[]): void {
    const Z = CAMERA_ZOOM
    const color = this.targetingAllies ? '#4ade80' : '#f87171'
    const bob = Math.sin(nowSec() * Math.PI * 2 * 1.5) * 4
    for (const u of aim) {
      const v = this.view(u.uid)
      if (!v || v.gone || !u.alive) continue
      const h = this.barWorld(v)
      const x = h.x * Z, y = h.y * Z - AIM_MARK_ABOVE + bob
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x - 11, y - 13)
      ctx.lineTo(x + 11, y - 13)
      ctx.lineTo(x, y + 3)
      ctx.closePath()
      ctx.strokeStyle = 'rgba(2,6,23,0.85)'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.shadowColor = color
      ctx.shadowBlur = 10
      ctx.fillStyle = color
      ctx.fill()
      ctx.restore()
    }
  }

  private paintHpBar(ctx: CanvasRenderingContext2D, v: UnitView, preview?: ActionPreview): void {
    const Z = CAMERA_ZOOM
    const head = this.barWorld(v)
    // หลอดสี่เหลี่ยมด้านขนานมุมมน (เฉียงแบบเดียวกับหลอดเลือดรวม: ทีมซ้าย "\" ทีมขวา "/") มีขอบดำ
    // ไอคอนธาตุอยู่ชิดหัวหลอด — แตะขอบกันพอดี ไม่ทับเนื้อหลอด
    const icon = elementIcon(v.unit.element)
    const iconSize = 24
    const w = 62, h = 9
    const skew = v.unit.team === 0 ? HP_BAR_SKEW : -HP_BAR_SKEW
    const lean = Math.max(0, -skew)                     // ขอบล่างเยื้องซ้าย → เว้นให้ไม่ชนไอคอน
    const full = (icon ? iconSize - HP_ICON_OVERLAP + lean : 0) + w + Math.abs(skew)
    const x0 = head.x * Z - full / 2
    const x = x0 + (icon ? iconSize - HP_ICON_OVERLAP + lean : 0)
    const y = head.y * Z
    // แบบ MOBA: เลือด (สีทีม) จากซ้าย → โล่ (ขาว) ต่อท้ายทางขวาในหลอดเดียวกัน
    // เลือด + โล่ เกิน HP สูงสุด → ย่อทั้งหลอดให้พอดี (โล่ยังเห็นเต็ม)
    const shieldHp = v.unit.statuses.find(st => st.type === 'shield')?.shieldHp ?? 0
    const heal = preview?.heal ?? 0, shieldGain = preview?.shield ?? 0
    const total = Math.max(v.unit.maxHp, v.unit.hp + heal + shieldHp + shieldGain)
    // เนื้อหลอดกว้างรวมส่วนเฉียง → เต็มหลอด = เต็มรูปทรงพอดี
    const span = w + Math.abs(skew)
    const sx = Math.min(x, x + skew)
    const hpW = span * v.unit.hp / total
    const shieldW = span * shieldHp / total
    ctx.save()
    const barrier = this.battle.has(v.unit, 'barrier')
    if (barrier) {
      // แสงทองรอบหลอด วาดก่อนเนื้อหลอด → เรืองออกด้านนอกอย่างเดียว ไม่ย้อมสีเลือด
      const pulse = 0.5 + 0.5 * Math.sin(nowSec() * Math.PI * 2 * 0.8)
      roundPara(ctx, x, y, w, h, skew, 2.5)
      ctx.shadowColor = BARRIER_EDGE
      ctx.shadowBlur = 6 + 7 * pulse
      ctx.lineWidth = 3
      ctx.strokeStyle = BARRIER_EDGE
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    roundPara(ctx, x, y, w, h, skew, 2.5)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = HP_BAR_COLOR[v.unit.team]
    ctx.fillRect(sx, y, hpW, h)
    const healW = span * heal / total
    // ลำดับในหลอด: เลือด │ ฮีลที่จะได้ │ โล่เดิม │ โล่ที่จะได้
    if (shieldW > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(sx + hpW + healW, y, shieldW, h)
    }
    if (preview) {
      const blink = 0.5 + 0.5 * Math.sin(nowSec() * Math.PI * 2 * PREVIEW_BLINK_HZ)
      if (preview.damage > 0) {
        // ส่วนที่จะหาย (โล่รับก่อน แล้วค่อยเลือด) กะพริบมืด
        const { shieldLoss, hpLoss } = previewLoss(preview, v.unit.hp, shieldHp)
        ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.6 * blink})`
        ctx.fillRect(sx + hpW - span * hpLoss / total, y, span * hpLoss / total, h)
        if (shieldLoss > 0) ctx.fillRect(sx + hpW + healW, y, span * shieldLoss / total, h)
      }
      if (heal > 0) {
        ctx.fillStyle = `rgba(74,222,128,${0.35 + 0.6 * blink})`
        ctx.fillRect(sx + hpW, y, healW, h)
      }
      if (shieldGain > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.6 * blink})`
        ctx.fillRect(sx + hpW + healW + shieldW, y, span * shieldGain / total, h)
      }
    }
    ctx.restore()
    // ขอบ (stroke) รอบหลอด · มีบาเรีย (อมตะ) = ขอบทองเรืองแสง เหมือนมีเกราะคุ้มหลอดเลือดไว้
    roundPara(ctx, x, y, w, h, skew, 2.5)
    ctx.lineJoin = 'round'
    if (barrier) {
      ctx.lineWidth = 2.6
      ctx.strokeStyle = BARRIER_EDGE
      ctx.stroke()
      ctx.lineWidth = 0.8
      ctx.strokeStyle = 'rgba(120,70,0,0.9)'                 // เส้นในเข้ม ให้ขอบทองดูเป็นกรอบ
      ctx.stroke()
    } else {
      ctx.lineWidth = 1.6
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'
      ctx.stroke()
    }
    ctx.restore()
    if (icon) ctx.drawImage(icon, x0, y + h / 2 - iconSize / 2, iconSize, iconSize)

    // Lv. ใต้หลอด (กึ่งกลางเนื้อหลอด ไม่นับไอคอนธาตุ)
    ctx.save()
    ctx.font = 'bold 10px LineBold, Krub, ui-sans-serif, system-ui'
    ctx.textAlign = 'center'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    const lv = `Lv.${v.unit.level}`
    const lx = x + w / 2
    ctx.strokeText(lv, lx, y + h + 11)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(lv, lx, y + h + 11)
    ctx.restore()

    // ป้ายบัฟ/ดีบัฟเหนือหลอด · อมตะ/ชะงักมีไอคอนเหนือหัว · โล่เห็นในหลอดเลือด → ไม่ต้องเขียนป้ายซ้ำ
    const labeled = v.unit.statuses.filter(st => st.type !== 'barrier' && st.type !== 'stun' && st.type !== 'shield')
    if (labeled.length) {
      ctx.save()
      ctx.font = 'bold 10px LineBold, Krub, ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.5
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      const text = labeled.slice(0, 3).map(st => statusLabel(st.type)).join(' ')
      ctx.strokeText(text, x0 + full / 2, y - 4)
      ctx.fillStyle = labeled.some(st => isDebuffLabel(st.type)) ? '#e9d5ff' : '#a5f3fc'
      ctx.fillText(text, x0 + full / 2, y - 4)
      ctx.restore()
    }

    // ตัวเลขไกด์อยู่เหนือป้ายสถานะ (ไม่มีป้าย = ชิดหลอด)
    if (preview) this.paintPreviewText(ctx, v, preview, x0 + full / 2, y - (labeled.length ? 18 : 6))
  }

  /**
   * ตัวเลขไกด์เหนือหลอด: -ดาเมจ (KO ถ้าล้ม) / IMMUNE · +ฮีล · +โล่ · บรรทัดบนสุด = สถานะที่จะติด/ได้
   */
  private paintPreviewText(ctx: CanvasRenderingContext2D, v: UnitView, p: ActionPreview, cx: number, by: number): void {
    const u = v.unit
    const shieldHp = u.statuses.find(st => st.type === 'shield')?.shieldHp ?? 0
    const parts: { text: string; color: string }[] = []
    if (p.immune) parts.push({ text: t('immune'), color: '#93c5fd' })
    else if (p.damage > 0) {
      const ko = previewLoss(p, u.hp, shieldHp).ko
      parts.push({ text: `-${fmtNum(p.damage)}`, color: p.trueDamage > 0 ? TRUE_DAMAGE_COLOR : '#fca5a5' })
      if (ko) parts.push({ text: 'KO', color: '#ef4444' })
    }
    if (p.heal > 0) parts.push({ text: `+${fmtNum(p.heal)}`, color: '#86efac' })
    if (p.shield > 0) parts.push({ text: `${t('shieldPlus')}${fmtNum(p.shield)}`, color: '#f8fafc' })
    const tags = [
      ...p.statuses.filter(s => s.type !== 'shield').map(s => statusLabel(s.type) + (s.pct ? ` ${s.pct}%` : '') + ` ${turnsShort(s.turns)}`),
      ...(p.dispel ? [t('dispel')] : []),
      ...(p.cleanse ? [t('cleanse')] : []),
    ]
    ctx.save()
    ctx.textAlign = 'left'
    ctx.lineJoin = 'round'
    ctx.font = 'bold 13px LineBold, Krub, ui-sans-serif, system-ui'
    const gap = 5
    const widths = parts.map(q => ctx.measureText(q.text).width)
    let tx = cx - (widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, parts.length - 1)) / 2
    parts.forEach((q, i) => {
      ctx.lineWidth = 3.5
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeText(q.text, tx, by)
      ctx.fillStyle = q.color
      ctx.fillText(q.text, tx, by)
      tx += widths[i] + gap
    })
    if (tags.length) {
      ctx.font = 'bold 10px LineBold, Krub, ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      const line = tags.slice(0, 3).join(' · ')
      const ty = parts.length ? by - 14 : by
      ctx.lineWidth = 3
      ctx.strokeText(line, cx, ty)
      ctx.fillStyle = u.team === this.pendingActor?.team ? '#a5f3fc' : '#e9d5ff'
      ctx.fillText(line, cx, ty)
    }
    ctx.restore()
  }

  private paintPopups(ctx: CanvasRenderingContext2D): void {
    const Z = CAMERA_ZOOM
    for (const p of this.popups) {
      const k = 1 - p.life / POPUP_LIFE
      ctx.save()
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.2)
      ctx.textAlign = 'center'
      ctx.font = `bold ${p.big ? 24 : 18}px LineBold, Krub, ui-sans-serif, system-ui`
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      const x = p.at.x * Z, y = p.at.y * Z - 12 - k * 40 - p.order * 22
      ctx.strokeText(p.text, x, y)
      ctx.fillStyle = p.color
      ctx.fillText(p.text, x, y)
      ctx.restore()
    }
  }

  /** ใช้ในเทสต์ */
  get state(): { phase: Phase; turn: number; shots: number; acting: string | null } {
    return { phase: this.phase, turn: this.battle.turn, shots: this.shots.length, acting: this.run?.actor.unit.uid ?? null }
  }

  bodyFpsOf(uid: string): number {
    const v = this.view(uid)
    return v ? bodyFpsOf(v.kit.assets, v.kit.config) : 30
  }
}

/** สี่เหลี่ยมด้านขนานมุมมน: skew > 0 = ขอบล่างเยื้องไปทางขวา */
function roundPara(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, skew: number, r: number): void {
  const p = [[x, y], [x + w, y], [x + w + skew, y + h], [x + skew, y + h]]
  ctx.beginPath()
  // เริ่มกลางขอบบน แล้ววนมุมละ arcTo
  ctx.moveTo((p[0][0] + p[1][0]) / 2, y)
  for (let i = 1; i <= 4; i++) {
    const c = p[i % 4], n = p[(i + 1) % 4]
    ctx.arcTo(c[0], c[1], n[0], n[1], r)
  }
  ctx.closePath()
}

/** เวลาจริง (วินาที) สำหรับการกะพริบของ UI — ไม่ขึ้นกับความเร็วเกม */
const nowSec = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000
const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US')
