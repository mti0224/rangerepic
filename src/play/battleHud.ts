// ====================================================
// battleHud.ts — UI บนจอรบ (วาดลงแคนวาสเดียวกับฉาก พิกัดตรรกะ 1280×720)
//
//   ซ้ายบน    เทิร์น + รางลำดับเทิร์นแนวตั้ง (ล่างสุด = ตาที่กำลังเล่น · ยิ่งสูง = ยิ่งต้องรอนาน)
//   กลางบน    เลือดรวมทั้งทีม ซ้าย/ขวา · VS · นับถอยหลัง (ถ้าเปิด timer — ตอนนี้ปิดไว้) · พลังงานศัตรู
//   ขวาบน     ตั้งค่า · AUTO · ความเร็ว (ปุ่มเดียว กดวน x1 → x2 → x4)
//   ล่างซ้าย  แผงคำสั่ง: รูปเรนเจอร์ · ข้อมูล · ปุ่มท่า 3 ปุ่ม · บัฟ/ดีบัฟ · แถบพลังงาน (Cost)
//             ชี้เมาส์ที่ปุ่มท่า → กล่องรายละเอียดสกิล
//   ตั้งค่า   เมนูกลางจอ: หยุด/เล่นต่อ · เริ่มใหม่ · กลับไปจัดทีม
//   ชี้เรนเจอร์ → การ์ดข้อมูล (ชื่อ ธาตุ สาย เลือด ค่าพลัง สถานะ) · วางนิ่งข้างตัว (ขวา · ชิดขอบขวา → ซ้าย)
//
// ข้อความบนจอดวลมาจาก i18n.ts (อังกฤษ/ไทย เลือกในเมนูตั้งค่า) · ชื่อเรนเจอร์/สกิลใช้ชื่อจากข้อมูลเกมตามภาษา
// ยังไม่ใช้รูป UI — วาดด้วยรูปทรงล้วน (เปลี่ยนเป็นรูปจาก public/ui/ ได้ทีหลังทีละชิ้น)
// HUD ไม่เปลี่ยนกติกาเอง: คลิกแล้วคืน HudHit ให้หน้าเล่น (PlayMode) เป็นคนสั่งต่อ
// ====================================================

import type { ActionName, Vec2 } from '@/lib/rangerConfig'
import type { Element } from '@/lib/rangerClass'
import type { GameInfo, GameSkillInfo } from '@/lib/rangerApi'
import { ENERGY_MAX, TURN_LIMIT, previewLoss, type ActionPreview, type Battle, type Team, type Unit } from './battle'
import { isDebuffLabel } from './statusLabels'
import { cutinsOn } from '@/lib/cutin'
import { areaLong, areaShort, describeEffect, elementName, localName, roleName, statusLabel, t, turnsShort } from './i18n'
import { UI_SRC, categoryIcon, elementIcon, uiImage } from './uiAssets'
import { lerpSAMFrame, renderSAMFrame } from '@/lib/animation/samRenderer'
import { loadButtonRing, type RingFx } from '@/lib/effects'
import { PANEL_FACE_ZOOM, drawFocused } from '@/lib/portrait'
import { evolutionOf, starImageUrl } from '@/lib/rangerGrade'

/** ข้อมูลที่ HUD อ่านจากฉาก (ฉากเป็นคนถือสถานะจริงทั้งหมด) */
export interface HudSource {
  readonly battle: Battle
  readonly phase: 'intro' | 'thinking' | 'input' | 'acting' | 'ended'
  readonly auto: boolean
  /** ความเร็วที่ผู้เล่นเลือก (ตอนเปิดฉาก/จบเกมเล่น x1 แต่ปุ่มยังแสดงค่าที่เลือก) */
  readonly selectedSpeed: number
  readonly paused: boolean
  readonly pendingActor: Unit | null
  readonly pendingAction: ActionName | null
  /** เลือกอัญเชิญตัวแถวพิเศษอยู่ (null = ท่าของตัวเอง) */
  readonly pendingCaster: Unit | null
  readonly targetingAllies: boolean
  /** เวลาที่เหลือ (วินาที นับถอยหลัง) */
  readonly timeLeftSec: number
  /** นับถอยหลังเปิดอยู่ไหม (ปิด = ไม่แสดงนาฬิกา) */
  readonly timerOn: boolean
  /** ตัวที่กำลังเล่นเทิร์นนี้ (null = ระหว่างเทิร์น) */
  readonly currentActor: Unit | null
  /** เกมจบเพราะหมดเวลา */
  readonly endedByTime: boolean
  /** ตัวที่แสดงในแผงคำสั่ง (ทีมเรา) */
  readonly panelUnit: Unit | null
  nameOf(u: Unit): string
  infoOf(u: Unit): GameInfo | null
  /** รูปเรนเจอร์ (thumb.png) + จุดกึ่งกลางหน้า — ยังไม่โหลด = null */
  faceOf(u: Unit): { img: HTMLImageElement; center: Vec2 } | null
  /** เรนเจอร์ที่อยู่ใต้จุดนี้ (พิกัดจอตรรกะ) */
  unitAt(sx: number, sy: number): string | null
  /** จุดกึ่งกลางหลอดเลือดบนหัว (พิกัดจอตรรกะ) */
  unitAnchor(uid: string): Vec2 | null
  /** ไกด์ผลลัพธ์ของท่าที่กำลังเลือก (เลือด/ฮีล/โล่ ที่คาดว่าจะเปลี่ยน) */
  previewOf(uid: string): ActionPreview | null
}

export type HudHit =
  | { kind: 'action'; action: ActionName }
  | { kind: 'auto' }
  /** ปุ่มความเร็ว: กดวนไปความเร็วถัดไป */
  | { kind: 'speed' }
  | { kind: 'settings' }
  | { kind: 'pause' }
  | { kind: 'restart' }
  | { kind: 'back' }
  | { kind: 'closeMenu' }
  /** สลับภาษาของหน้าดวล */
  | { kind: 'lang' }
  /** เปิด/ปิดคัตซีนร่ายสกิล */
  | { kind: 'cutin' }
  /** เปิด/ปิดการ์ดข้อมูลเมื่อชี้เมาส์ที่เรนเจอร์ */
  | { kind: 'unitCard' }
  /** อัญเชิญตัวแถวพิเศษลำดับ index มาร่ายสกิล action */
  | { kind: 'summon'; index: number; action: ActionName }
  /** คลิกโดนพื้นของแผง — กลืนคลิกไว้ ไม่ให้ไปเลือกเป้าข้างหลัง */
  | { kind: 'block' }

interface Box { x: number; y: number; w: number; h: number; hit: HudHit }

/** ช่อง 1 ช่องบนรางลำดับเทิร์น — dist = ระยะจากล่างสุดของราง (px) */
interface RailNode {
  unit: Unit
  /** ตำแหน่งที่วาดอยู่จริง (ไหลเข้าหา target) */
  dist: number
  target: number
  alpha: number
  /** ตาที่กำลังเล่นอยู่ (ล่างสุด · กรอบทอง) */
  cur: boolean
  /** ออกจากคิวแล้ว — จางหายแล้วค่อยลบทิ้ง */
  dying: boolean
}

const W = 1280
const H = 720
const F = (px: number) => `bold ${px}px LineBold, Krub, ui-sans-serif, system-ui`

/** สีของ HUD: แผงน้ำเงินเข้มโปร่ง ขอบทอง · ทีมเราฟ้า ศัตรูแดง · พลังงานเขียว */
const C = {
  panel: 'rgba(11,17,38,0.86)',
  panelHi: 'rgba(34,48,98,0.94)',
  inset: 'rgba(255,255,255,0.06)',
  gold: '#f5c542',
  goldDim: 'rgba(245,197,66,0.45)',
  text: '#f8fafc',
  dim: 'rgba(226,232,240,0.72)',
  ally: '#38bdf8',
  allyDeep: '#0c4a6e',
  enemy: '#ef4444',
  enemyDeep: '#7f1d1d',
  energy: '#4ade80',
  energyDeep: '#166534',
  empty: 'rgba(255,255,255,0.12)',
  outline: 'rgba(0,0,0,0.8)',
  buff: '#4ade80',
  debuff: '#f87171',
}
const TEAM = [C.ally, C.enemy] as const
const TEAM_DEEP = [C.allyDeep, C.enemyDeep] as const
const ELEMENT_COLOR: Record<Element, string> = { fire: '#fb923c', water: '#38bdf8', wood: '#4ade80', light: '#fde047', dark: '#a78bfa' }
const ACTIONS: ActionName[] = ['attack', 'skill1', 'skill2']

// ── ตำแหน่งชิ้นส่วน ──
/**
 * รางลำดับเทิร์นด้านซ้าย: ล่างสุด = ตาที่กำลังเล่น · ไหลลงล่างเรื่อยๆ
 * ยิ่งอยู่สูง = ยิ่งต้องรอนาน (ช้ากว่า) — ระยะบนรางคิดจากเวลารอจริง (AV)
 */
const RAIL = { x: 63, top: 88, bottom: 556, size: 62, cur: 76, count: 10 }   // x = กึ่งกลางกรอบรูปเรนเจอร์ซ้ายล่าง (PORTRAIT)
/** ระยะห่างพื้นฐานของช่องที่ติดกัน (ถึงตาไล่ๆ กันก็ยังไม่ซ้อน) */
const RAIL_MIN_GAP = 74
/** ห่างเพิ่มอีก (px) ต่อเวลารอที่ต่างกัน 1 หน่วย (AV) — ตัวที่ต้องรออีกนานจะถอยห่างขึ้นไป */
const RAIL_PX_PER_AV = 2.2
/** ห่างเพิ่มได้มากสุดเท่านี้ต่อ 1 ช่อง (กันตัวช้ามากดันตัวอื่นตกรางหมด) */
const RAIL_GAP_MAX_EXTRA = 44
/** ช่องบนสุดของรางเล็กลงเหลือเท่านี้ของขนาดเต็ม (ไกล = เล็ก) */
const RAIL_FAR_SCALE = 0.78
/** ความเร็วไหลของช่อง (ยิ่งมากยิ่งเข้าที่ไว) */
const RAIL_EASE = 8
/** เป้าหมายใหม่สูงกว่าที่เดิมเกินเท่านี้ = ถือว่าเป็นคนละตา (ตัวเก่าจางหาย · ตัวใหม่จางขึ้นที่ปลายราง) */
const RAIL_RESPAWN_UP = 120
/** ช่องลำดับเทิร์น: กรอบหน้ากว้างเท่านี้ของขนาดช่อง (>1 = หน้าใหญ่ขึ้น) */
const RAIL_FACE_ZOOM = 0.88
/** ความหนาของกรอบสีทีมรอบช่อง (px) */
const RAIL_BORDER = 4
/** พื้นช่องตามทีม (น้ำเงิน = เรา · แดง = ศัตรู) */
const RAIL_FILL = ['#0b2f55', '#4a0f1a'] as const
/** กรอบสีทีม — ใช้สีสดเต็มที่ให้แยกฝั่งได้ในพริบตา */
const RAIL_EDGE = ['#22a3ff', '#ff3b3b'] as const
const TEAM_HP = { y: 20, w: 336, h: 46, skew: 14, gapFromCenter: 44 }
/** ปุ่มขวาบน (ชิดขวาที่ x = right) · AUTO / ความเร็วเป็นปุ่มกลมมีวงแหวนเอฟเฟกต์ */
const CTRL = { right: 1266, round: 54, gap: 12 }
/** รูป setting.png มีพื้นที่ว่างรอบตัวปุ่ม ~20% → ขยายเท่านี้ให้ตัวปุ่มในรูปเท่าปุ่มกลม */
const SETTING_IMAGE_SCALE = 1.22
/** ขยายพื้นที่กดของปุ่มออกไปรอบๆ (px) — จอย่อเล็กแล้วปุ่มยังกดง่าย */
const HIT_PAD = 5
const PANEL = { x: 118, y: 612, w: 510, h: 82 }
/** รูปเรนเจอร์มุมซ้ายล่าง: สัดส่วนเท่ารูปกรอบ (114×127) · ขอบล่างอยู่ที่เดิม */
const PORTRAIT = { x: 14, y: 599, w: 98, h: 109 }
/**
 * ช่องมองรูปในกรอบ (สัดส่วนของกรอบ): ขอบกรอบกว้างราว 11% · แถบทึบล่างเริ่มราว 70% ของความสูง
 * รูปเรนเจอร์ย่อลงนิดหน่อย (FACE) ให้หน้าไม่ชนขอบกรอบ แล้ววางหน้าไว้กลางช่องมอง (เหนือแถบล่าง)
 */
const FRAME_VIEW = { inset: 0.1, top: 0.1, bottom: 0.7, face: 0.78 }
/** ดาวบนรูปมุมซ้ายล่าง: กว้าง (สัดส่วนของกรอบ) · ขอบล่างของดาวอยู่ที่ (สัดส่วนความสูง) */
const PORTRAIT_STARS = { w: 0.72, bottom: 0.86 }
/** ป้าย VS กลางบน (รูป 142×88) — สูงเท่านี้ กึ่งกลางที่ y นี้ */
const VS_BADGE = { h: 66, cy: 44 }
const BTN = { x: 256, y: 620, w: 118, h: 66, gap: 6 }
/**
 * แถวพิเศษ (ขวาล่าง): การ์ดละ 1 ตัว = รูปเล็ก (สัดส่วนเดียวกับรูปซ้ายล่าง) + ปุ่มสกิล 1 / 2
 * วางต่อจากแผงคำสั่งไปจนชิดขวา · คีย์ลัด A S (ตัวที่ 1) · D F (ตัวที่ 2)
 */
const SUP = { x: 636, card: 316, gap: 6, portraitW: 70, portraitH: 78, py: 612, btnW: 113, btnGap: 5 }
export const SUMMON_KEYS = [['A', 'S'], ['D', 'F']] as const
/** แถวพิเศษของศัตรู: รูปหน้าเล็กใต้ชื่อฝั่งศัตรู ชิดขวาตรงปลายหลอดเลือด · ติดคูลดาวน์ = เลขทับหน้า */
const FOE_SUP = { size: 38, gap: 6, top: 92, right: 1016 }
const COST_BAR = { x: 266, y: 698, w: 358, h: 18 }
/** กดปุ่มสลับซ้ำภายในเวลานี้ (ms) = ดับเบิลคลิก → ไม่นับครั้งที่สอง */
const REPEAT_GUARD_MS = 300
/** ปุ่มสว่างค้างหลังกด (ms) ให้รู้ว่ากดติดแล้ว */
const PRESS_FLASH_MS = 160
/** ปุ่มที่กดซ้ำแล้วกลับค่าเดิม (สลับเปิด/ปิด) — ความเร็วกดรัวได้ตามปกติ */
const TOGGLES = new Set<HudHit['kind']>(['auto', 'settings', 'closeMenu', 'pause', 'lang'])
/** เลือดรวมที่ "ค้าง" ลดตามทีหลัง (แถบขาว) — ลดลงกี่ส่วนของเลือดเต็มต่อวินาที */
const CHIP_RATE = 0.35
/** เวลาเหลือไม่เกินนี้ (วินาที) นาฬิกาเป็นสีแดง */
const CLOCK_HURRY_SEC = 30
/** กล่องรายละเอียดสกิล: ระยะเหนือแผงคำสั่ง (px) */
const TOOLTIP_GAP = 6
/** การ์ดข้อมูลเรนเจอร์: กว้าง · ขอบใน (px) */
const CARD = { w: 232, pad: 10 }
/** การ์ดวางข้างตัว: ห่างจากกึ่งกลางตัวไปด้านข้างเท่านี้ (พ้นลำตัว) · ขอบบนการ์ดสูงกว่าหลอดเลือดเท่านี้ */
const CARD_SIDE = 56
const CARD_ABOVE_BAR = 10
/** ไกด์ผลลัพธ์กะพริบกี่รอบต่อวินาที — ใช้ร่วมกันทั้งหลอดบนหัว (battleScene) และการ์ดข้อมูล ให้จังหวะตรงกันเสมอ */
export const PREVIEW_BLINK_HZ = 1.2

// ── การ์ดข้อมูลตอนชี้เมาส์ที่เรนเจอร์: เปิด/ปิดได้ในเมนูตั้งค่า (ค่าเริ่มต้น = เปิด) · จำไว้ในเครื่อง ──
const UNIT_CARD_KEY = 'lr:unitCard'
let unitCardEnabled = (() => {
  try { return typeof localStorage === 'undefined' || localStorage.getItem(UNIT_CARD_KEY) !== 'off' } catch { return true }
})()
export const unitCardOn = (): boolean => unitCardEnabled
export function toggleUnitCard(): void {
  unitCardEnabled = !unitCardEnabled
  try { localStorage.setItem(UNIT_CARD_KEY, unitCardEnabled ? 'on' : 'off') } catch { /* จำไม่ได้ก็ใช้แค่รอบนี้ */ }
}

export class BattleHud {
  menuOpen = false
  /** ตำแหน่งเมาส์บนจอตรรกะ (null = ไม่อยู่บนแคนวาส) */
  hover: Vec2 | null = null
  private boxes: Box[] = []
  private chip: [number, number] | null = null
  private images = new Map<string, HTMLImageElement>()
  /** ปุ่มที่เพิ่งกด (สำหรับไฟกระพริบ + กันดับเบิลคลิก) */
  private pressed: { key: string; at: number } | null = null
  /** เวลาที่ปุ่มสลับถูกกดล่าสุด (เปิดเมนู/ปิดเมนูนับเป็นกลุ่มเดียวกัน) */
  private lastToggle = -Infinity

  /** วงแหวนปุ่มกลม — โหลดเบื้องหลัง ยังไม่เสร็จก็วาดวงธรรมดาไปก่อน */
  private ring: RingFx | null = null
  /** ช่องบนรางลำดับเทิร์นที่กำลังแสดง (เก็บไว้ข้ามเฟรมเพื่อทำอนิเมชั่นไหล) */
  private railNodes: RailNode[] = []
  /** เวลาเฟรมก่อนของรางลำดับเทิร์น (ms) */
  private railAt = 0

  constructor(private s: HudSource) {
    if (typeof document !== 'undefined') loadButtonRing().then(r => { this.ring = r }).catch(() => {})
  }

  /**
   * บันทึกการกด — คืน false ถ้าเป็นการกดซ้ำของดับเบิลคลิกที่ควรมองข้าม
   * เช่น ดับเบิลคลิก "ตั้งค่า": ครั้งแรกเปิดเมนู ครั้งที่สองจะไปโดนพื้นหลังเมนู (= ปิด) ทันที
   */
  press(hit: HudHit): boolean {
    if (hit.kind === 'block') return true
    const now = nowMs()
    if (TOGGLES.has(hit.kind)) {
      if (now - this.lastToggle < REPEAT_GUARD_MS) return false
      this.lastToggle = now
    }
    this.pressed = { key: keyOf(hit), at: now }
    return true
  }

  /** เดินเวลาของเอฟเฟกต์ HUD (แถบเลือดค้าง) */
  update(dt: number): void {
    const now = [this.teamHp(0), this.teamHp(1)] as const
    if (!this.chip) { this.chip = [now[0].hp, now[1].hp]; return }
    for (const t of [0, 1] as Team[]) {
      const target = now[t].hp
      this.chip[t] = this.chip[t] > target ? Math.max(target, this.chip[t] - CHIP_RATE * now[t].max * dt) : target
    }
  }

  /** ชิ้นที่คลิกโดน (บนสุดก่อน) */
  hitAt(x: number, y: number): HudHit | null {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i]
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.hit
    }
    return null
  }

  /** ปุ่มท่าที่เมาส์ชี้อยู่ (ใช้แสดงไกด์ผลลัพธ์บนหลอดเลือด) */
  hoveredAction(): ActionName | null {
    if (!this.hover || this.menuOpen) return null
    const h = this.hitAt(this.hover.x, this.hover.y)
    return h?.kind === 'action' ? h.action : null
  }

  /** ปุ่มอัญเชิญที่เมาส์ชี้อยู่ */
  hoveredSummon(): { index: number; action: ActionName } | null {
    if (!this.hover || this.menuOpen) return null
    const h = this.hitAt(this.hover.x, this.hover.y)
    return h?.kind === 'summon' ? { index: h.index, action: h.action } : null
  }

  /** เมาส์อยู่บนปุ่มที่กดได้ไหม (ใช้เปลี่ยนเคอร์เซอร์) */
  get hoveringButton(): boolean {
    if (!this.hover) return false
    const h = this.hitAt(this.hover.x, this.hover.y)
    return !!h && h.kind !== 'block'
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.boxes = []
    ctx.save()
    const k = ctx.canvas ? ctx.canvas.width / W : 1   // แคนวาสความละเอียดสูง → พิกัด HUD เท่าเดิม
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.textBaseline = 'alphabetic'
    // จบเกม: ปุ่ม/ตัวอื่นไม่ตอบสนองเมาส์ (ไม่ไฮไลต์) — กดได้แค่ เล่นอีกครั้ง / กลับไปจัดทีม
    const ended = this.s.phase === 'ended'
    const hover = this.hover
    if (ended) this.hover = null
    this.drawTurn(ctx)
    this.drawOrder(ctx)
    this.drawTeamHp(ctx)
    this.drawClock(ctx)
    this.drawControls(ctx)
    this.drawPanel(ctx)
    this.drawReserves(ctx)
    this.drawFoeReserves(ctx)
    this.drawUnitCard(ctx)
    this.hover = hover
    if (ended) this.drawResult(ctx)
    else if (this.s.paused && !this.menuOpen) this.drawPausedTag(ctx)
    if (this.menuOpen) this.drawMenu(ctx)
    ctx.restore()
  }

  // ── ซ้ายบน: เทิร์น + ลำดับเทิร์น ──

  private drawTurn(ctx: CanvasRenderingContext2D): void {
    ctx.font = F(22)
    ctx.textAlign = 'left'
    const lw = ctx.measureText(t('turn')).width
    outlined(ctx, t('turn'), 20, 46, C.gold, 5)
    // 13/80 — 10 เทิร์นสุดท้ายเลขเป็นสีแดง (ใกล้ถูกบังคับจบ)
    const turn = this.s.battle.turn
    ctx.font = F(30)
    const nx = 20 + lw + 12
    outlined(ctx, String(turn), nx, 47, TURN_LIMIT - turn < 10 ? C.debuff : C.text, 5)
    const tw = ctx.measureText(String(turn)).width
    ctx.font = F(20)
    outlined(ctx, `/${TURN_LIMIT}`, nx + tw + 3, 47, C.dim, 4)
  }

  /**
   * รางลำดับเทิร์น: ล่างสุด = ตาที่กำลังเล่น · เหนือขึ้นไป = ตาถัดๆ ไปตามเวลาที่ต้องรอ
   * จบเทิร์นทีหนึ่ง เวลารอของทุกตัวลดลงเท่ากัน → ทุกช่องไหลลงล่างพร้อมกัน แล้วตัวที่เพิ่งเล่นไปโผล่ที่ปลายราง
   */
  private drawOrder(ctx: CanvasRenderingContext2D): void {
    const now = nowMs()
    const dt = this.railAt ? Math.min(0.12, (now - this.railAt) / 1000) : 0
    this.railAt = now
    this.syncRail()

    // เส้นราง + หัวราง
    const { x, top, bottom } = RAIL
    const line = ctx.createLinearGradient(0, top, 0, bottom)
    line.addColorStop(0, 'rgba(148,197,255,0.08)')
    line.addColorStop(0.35, 'rgba(148,197,255,0.5)')
    line.addColorStop(1, 'rgba(148,197,255,0.75)')
    ctx.strokeStyle = line
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x, top - 24)
    ctx.lineTo(x, bottom + 4)
    ctx.stroke()
    diamond(ctx, x, top - 30, 9)
    ctx.fillStyle = 'rgba(191,219,254,0.85)'
    ctx.fill()

    // ไกลสุดวาดก่อน → ช่องที่ใกล้ถึงตาทับอยู่ข้างบน
    const nodes = [...this.railNodes].sort((a, b) => b.dist - a.dist)
    const move = 1 - Math.exp(-RAIL_EASE * dt)
    for (const n of nodes) {
      n.dist += (n.target - n.dist) * move
      n.alpha += ((n.dying ? 0 : 1) - n.alpha) * Math.min(1, move * 1.4)
      this.drawRailNode(ctx, n)
    }
    this.railNodes = this.railNodes.filter(n => !n.dying || n.alpha > 0.02)
  }

  /** คิดเป้าหมายของทุกช่องใหม่ แล้วจับคู่กับช่องเดิมเพื่อให้ไหลต่อจากที่เดิม */
  private syncRail(): void {
    const cur = this.s.currentActor
    const sched = this.s.battle.previewSchedule(RAIL.count)
    // ระยะจากล่างสุด: ตาที่กำลังเล่น = 0 · ตาถัดไป = เวลารอ × สเกล (ห่างกันอย่างน้อย RAIL_MIN_GAP)
    const want: { unit: Unit; dist: number; cur: boolean }[] = []
    if (cur?.alive) want.push({ unit: cur, dist: 0, cur: true })
    let prev = cur?.alive ? 0 : -RAIL_MIN_GAP
    let prevWait = 0
    for (const e of sched) {
      // ห่างจากช่องก่อนหน้า = ระยะพื้นฐาน + ส่วนต่างของเวลารอ (รอห่างกันมาก = ยืดออกให้เห็น)
      const dist = prev + RAIL_MIN_GAP + Math.min(RAIL_GAP_MAX_EXTRA, Math.max(0, e.wait - prevWait) * RAIL_PX_PER_AV)
      if (dist > RAIL.bottom - RAIL.top) break
      want.push({ unit: e.unit, dist, cur: false })
      prev = dist
      prevWait = e.wait
    }

    const free = [...this.railNodes]
    const kept: RailNode[] = []
    for (const w of want) {
      // ช่องเดิมของตัวเดียวกันที่อยู่ "ต่ำกว่าหรือใกล้เคียง" เป้าหมายใหม่ = ตาเดียวกัน → ไหลต่อ
      let best = -1
      for (let i = 0; i < free.length; i++) {
        const n = free[i]
        if (n.unit !== w.unit || n.dying || w.dist > n.target + RAIL_RESPAWN_UP) continue
        if (best < 0 || Math.abs(n.target - w.dist) < Math.abs(free[best].target - w.dist)) best = i
      }
      if (best >= 0) {
        const n = free.splice(best, 1)[0]
        n.target = w.dist
        n.cur = w.cur
        kept.push(n)
      } else {
        // ตาใหม่ (เพิ่งเล่นจบแล้ววนไปท้ายคิว) → โผล่จางๆ เหนือเป้าหมายเล็กน้อยแล้วไหลลงมา
        kept.push({ unit: w.unit, dist: w.dist + 26, target: w.dist, alpha: 0, cur: w.cur, dying: false })
      }
    }
    // ช่องที่ไม่มีในคิวแล้ว (เล่นจบ/ตาย) → จางหายอยู่กับที่
    for (const n of free) { n.dying = true; kept.push(n) }
    this.railNodes = kept
  }

  /** ช่องลำดับเทิร์น 1 ช่อง: สี่เหลี่ยมข้าวหลามตัดมีรูปเรนเจอร์ข้างใน */
  private drawRailNode(ctx: CanvasRenderingContext2D, n: RailNode): void {
    const span = RAIL.bottom - RAIL.top
    const far = Math.max(0, Math.min(1, n.dist / span))
    const y = RAIL.bottom - n.dist
    const size = (n.cur ? RAIL.cur : RAIL.size) * (1 - (1 - RAIL_FAR_SCALE) * far)
    const r = size / 2
    const u = n.unit
    ctx.save()
    // ใกล้ปลายรางให้จางลงด้วย (ตาไกลๆ ไม่ต้องเด่น)
    ctx.globalAlpha = Math.max(0, n.alpha * (1 - far * 0.35) * (u.alive ? 1 : 0.35))

    // กรอบหนาสีทีม (เห็นชัดว่าฝั่งไหน): ขอบดำนอกสุด → กรอบสีทีม → พื้นเข้ม → รูป
    // ตาปัจจุบันใช้สีทีมเหมือนกัน — รู้ว่าเป็นตาไหนจากช่องที่ใหญ่กว่า + เรืองแรงกว่า
    const edge = RAIL_EDGE[u.team]
    diamond(ctx, RAIL.x, y, r + RAIL_BORDER + 2)
    ctx.fillStyle = 'rgba(2,6,23,0.85)'
    ctx.fill()
    ctx.save()
    ctx.shadowColor = edge
    ctx.shadowBlur = n.cur ? 14 : 8
    diamond(ctx, RAIL.x, y, r + RAIL_BORDER)
    ctx.fillStyle = edge
    ctx.fill()
    ctx.restore()
    diamond(ctx, RAIL.x, y, r)
    ctx.fillStyle = RAIL_FILL[u.team]
    ctx.fill()

    const face = this.s.faceOf(u)
    if (face) {
      ctx.save()
      diamond(ctx, RAIL.x, y, r - 1)
      ctx.clip()
      drawFocused(ctx, face.img, face.center, RAIL.x, y + r * 0.06, size * RAIL_FACE_ZOOM)
      ctx.restore()
    }

    // เส้นคั่นบางๆ ระหว่างรูปกับกรอบ ให้กรอบสีทีมเด่นขึ้นอีก
    diamond(ctx, RAIL.x, y, r)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(2,6,23,0.55)'
    ctx.stroke()
    ctx.restore()
  }

  // ── กลางบน: เลือดรวม · VS · เวลา ──

  private teamHp(team: Team): { hp: number; max: number; shield: number; alive: number; count: number } {
    const list = this.s.battle.units.filter(u => u.team === team)
    const hp = list.reduce((n, u) => n + (u.alive ? u.hp : 0), 0)
    const max = list.reduce((n, u) => n + u.maxHp, 0)
    const shield = list.reduce((n, u) => n + (u.alive ? u.statuses.find(s => s.type === 'shield')?.shieldHp ?? 0 : 0), 0)
    return { hp, max, shield, alive: list.filter(u => u.alive).length, count: list.length }
  }

  private drawTeamHp(ctx: CanvasRenderingContext2D): void {
    for (const team of [0, 1] as Team[]) {
      const hp = this.teamHp(team)
      const left = team === 0
      const x = left ? W / 2 - TEAM_HP.gapFromCenter - TEAM_HP.w - TEAM_HP.skew : W / 2 + TEAM_HP.gapFromCenter + TEAM_HP.skew
      const skew = left ? TEAM_HP.skew : -TEAM_HP.skew
      const { y, w, h } = TEAM_HP

      para(ctx, x, y, w, h, skew)
      ctx.fillStyle = C.panel
      ctx.fill()
      ctx.lineWidth = 2.5
      ctx.strokeStyle = C.gold
      ctx.stroke()

      // แถบเลือด: เต็มจากขอบนอก หมดจากฝั่ง VS · แถบขาว = เลือดที่เพิ่งหาย (ลดตามทีหลัง)
      const ix = x + 9, iy = y + 8, iw = w - 18, ih = h - 16
      const iskew = skew * (ih / h)
      ctx.save()
      para(ctx, ix, iy, iw, ih, iskew)
      ctx.clip()
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(ix - 20, iy, iw + 40, ih)
      const span = iw + Math.abs(iskew) + 4
      const x0 = Math.min(ix, ix + iskew) - 2
      // ช่วง [from, to] ของหลอด (0–1) นับจากขอบนอก
      const seg = (from: number, to: number, fill: string | CanvasGradient) => {
        if (to <= from) return
        ctx.fillStyle = fill
        const a = span * from, len = span * (to - from)
        ctx.fillRect(left ? x0 + a : x0 + span - a - len, iy, len, ih)
      }
      // เลือด + โล่ เกินเลือดเต็ม → ย่อทั้งหลอดให้พอดี (โล่ยังเห็นครบ)
      const total = Math.max(hp.max, hp.hp + hp.shield) || 1
      const hpR = hp.hp / total
      seg(0, Math.max(hpR, (this.chip?.[team] ?? hp.hp) / total), 'rgba(250,204,21,0.9)')   // เลือดที่เพิ่งหาย (เหลือง ลดตามทีหลัง)
      const g = ctx.createLinearGradient(0, iy, 0, iy + ih)
      g.addColorStop(0, withAlpha(TEAM[team], 1))
      g.addColorStop(1, TEAM_DEEP[team])
      seg(0, hpR, g)
      seg(hpR, hpR + hp.shield / total, 'rgba(255,255,255,0.95)')                          // โล่รวมทั้งทีม
      ctx.restore()

      ctx.font = F(17)
      ctx.textAlign = 'center'
      ctx.font = F(17)
      ctx.textAlign = 'center'
      outlined(ctx, `${fmt(hp.hp)} / ${fmt(hp.max)}`, x + w / 2 + skew / 2, y + h / 2 + 6, C.text, 4)

      // ใต้แบนเนอร์: ชื่อฝั่ง + จำนวนที่ยังยืนอยู่ · ศัตรูมีพลังงานด้วย
      ctx.font = F(12)
      ctx.textAlign = left ? 'left' : 'right'
      const lx = left ? x + skew + 4 : x + w + skew - 4
      const side = `${left ? t('ally') : t('enemy')} ${hp.alive}/${hp.count}`
      outlined(ctx, side, lx, y + h + 17, TEAM[team], 3)
      // พลังงานศัตรู: แท่งเล็กๆ ถัดจากชื่อฝั่ง (ของเราดูที่แถบ Cost ด้านล่าง)
      if (!left) {
        const px = lx - ctx.measureText(side).width - 10 - (ENERGY_MAX * 9 - 1)
        this.drawPips(ctx, px, y + h + 8, this.s.battle.energy[1], 8, 10, 1)
        const gem = uiImage(UI_SRC.mineral)
        if (gem) ctx.drawImage(gem, px - 19, y + h + 4, 16, 15)
      }
    }

    // VS — ใช้รูปป้าย · ยังไม่โหลด → ตัวอักษรแบบเดิม
    const vs = uiImage(UI_SRC.vs)
    if (vs) {
      const vh = VS_BADGE.h, vw = vh * vs.naturalWidth / vs.naturalHeight
      ctx.drawImage(vs, W / 2 - vw / 2, VS_BADGE.cy - vh / 2, vw, vh)
      return
    }
    ctx.font = F(56)
    ctx.textAlign = 'center'
    const g = ctx.createLinearGradient(0, 22, 0, 66)
    g.addColorStop(0, '#fff7cc')
    g.addColorStop(1, C.gold)
    ctx.lineWidth = 7
    ctx.strokeStyle = C.outline
    ctx.lineJoin = 'round'
    ctx.strokeText('VS', W / 2, 66)
    ctx.fillStyle = g
    ctx.fillText('VS', W / 2, 66)
  }

  private drawClock(ctx: CanvasRenderingContext2D): void {
    // ไม่ได้เปิดนับถอยหลัง → เหลือแค่ป้ายต่อเวลา (ขยับขึ้นมาแทนที่นาฬิกา)
    if (!this.s.timerOn) { this.drawOvertime(ctx, 98); return }
    const left = this.s.timeLeftSec
    const sec = Math.ceil(left)
    const text = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
    // 30 วิสุดท้าย: สีแดง + เต้นเบาๆ ทุกวินาที
    const hurry = left <= CLOCK_HURRY_SEC && this.s.phase !== 'ended'
    const beat = hurry ? 1 + 0.12 * Math.max(0, 1 - (sec - left) * 4) : 1
    ctx.save()
    ctx.translate(W / 2, 90)
    ctx.scale(beat, beat)
    ctx.font = F(24)
    ctx.textAlign = 'center'
    outlined(ctx, text, 0, 8, hurry ? C.debuff : C.text, 5)
    ctx.restore()
    this.drawOvertime(ctx, 120)
  }

  /** ต่อเวลา: ดาเมจแรงขึ้นเรื่อยๆ กันเกมยืด */
  private drawOvertime(ctx: CanvasRenderingContext2D, y: number): void {
    const ot = this.s.battle.overtimeMult
    if (ot <= 1) return
    ctx.font = F(13)
    ctx.textAlign = 'center'
    outlined(ctx, `${t('overtime')}${ot.toFixed(2)}`, W / 2, y, C.debuff, 4)
  }

  // ── ขวาบน: ตั้งค่า · AUTO · ความเร็ว ──

  private drawControls(ctx: CanvasRenderingContext2D): void {
    // ตั้งค่า · AUTO · ความเร็ว เรียงเป็นแนวเดียวกัน ขนาดเท่ากัน ระยะห่างเท่ากัน
    const { right, round, gap } = CTRL
    const cx = right - round / 2
    const y0 = 14 + round / 2
    // รูปตั้งค่ามีขอบโปร่งใสรอบๆ → ขยายกรอบรูปให้ตัวปุ่มในรูปใหญ่เท่าปุ่มกลม
    const img = round * SETTING_IMAGE_SCALE
    this.imageButton(ctx, cx - img / 2, y0 - img / 2, img, img, uiImage(UI_SRC.setting), '⚙', { kind: 'settings' })
    const y1 = y0 + round + gap
    this.roundButton(ctx, cx, y1, round, 'AUTO', { kind: 'auto' }, this.s.auto, 13)
    this.roundButton(ctx, cx, y1 + round + gap, round, `x${this.s.selectedSpeed}`, { kind: 'speed' }, this.s.selectedSpeed > 1, 18)
  }

  // ── ล่างซ้าย: แผงคำสั่ง ──

  /** รูปเรนเจอร์ในกรอบ — เลเยอร์ (ล่าง → บน): พื้นหลังกรอบ · รูปเรนเจอร์ · กรอบหน้า · ดาว */
  private drawPortrait(ctx: CanvasRenderingContext2D, u: Unit, P: { x: number; y: number; w: number; h: number }, input: boolean): void {
    const frame = UI_SRC.frame[evolutionOf(u.rangerId)]
    const back = uiImage(frame.back), front = uiImage(frame.front)
    const face = this.s.faceOf(u)
    if (back && front) {
      ctx.drawImage(back, P.x, P.y, P.w, P.h)
      // รูปเรนเจอร์: ตัดในช่องมองของกรอบ · ย่อลงนิดหน่อย · หน้าอยู่กลางช่องมอง (เหนือแถบทึบล่าง)
      const vx = P.x + P.w * FRAME_VIEW.inset, vw = P.w * (1 - FRAME_VIEW.inset * 2)
      const vy = P.y + P.h * FRAME_VIEW.top, vh = P.h * (1 - FRAME_VIEW.top - FRAME_VIEW.inset)
      if (face) {
        ctx.save()
        roundRect(ctx, vx, vy, vw, vh, 8)
        ctx.clip()
        if (!u.alive) ctx.globalAlpha = 0.4
        ctx.imageSmoothingQuality = 'high'
        const cy = P.y + P.h * (FRAME_VIEW.top + FRAME_VIEW.bottom) / 2
        drawFocused(ctx, face.img, face.center, P.x + P.w / 2, cy, vw * FRAME_VIEW.face)
        ctx.restore()
      }
      // กรอบหน้า (มีเงาในรูปอยู่แล้ว — ไม่เติมเงา/แสงเพิ่ม)
      ctx.drawImage(front, P.x, P.y, P.w, P.h)
    } else {
      // รูปกรอบยังไม่โหลด → กล่องมนแบบเดิมไปก่อน
      roundRect(ctx, P.x, P.y, P.w, P.h, 16)
      ctx.fillStyle = C.panelHi
      ctx.fill()
      ctx.lineWidth = input ? 3 : 2
      ctx.strokeStyle = input ? C.gold : C.ally
      ctx.stroke()
      ctx.save()
      roundRect(ctx, P.x + 3, P.y + 3, P.w - 6, P.h - 6, 13)
      ctx.clip()
      if (face) {
        if (!u.alive) ctx.globalAlpha = 0.4
        ctx.imageSmoothingQuality = 'high'
        drawFocused(ctx, face.img, face.center, P.x + P.w / 2, P.y + P.h / 2, (P.w - 6) * PANEL_FACE_ZOOM)
      }
      ctx.restore()
    }
    // ดาวบนสุด: อยู่กลางแถบทึบล่างของกรอบ (ย่อลงเล็กน้อย จัดกึ่งกลางแนวนอน)
    const starW = P.w * PORTRAIT_STARS.w
    this.drawStars(ctx, u, P.x + (P.w - starW) / 2, P.y + P.h * PORTRAIT_STARS.bottom, starW)
    if (!u.alive) {
      roundRect(ctx, P.x, P.y, P.w, P.h, 16)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fill()
    }
  }

  private drawPanel(ctx: CanvasRenderingContext2D): void {
    const u = this.s.panelUnit
    if (!u) return
    const b = this.s.battle
    const input = this.s.phase === 'input' && this.s.pendingActor?.uid === u.uid

    this.drawPortrait(ctx, u, PORTRAIT, input)
    const P = PORTRAIT
    this.boxes.push({ ...P, hit: { kind: 'block' } })

    // กรอบหลัก
    roundRect(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 10)
    ctx.fillStyle = C.panel
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = C.goldDim
    ctx.stroke()
    this.boxes.push({ ...PANEL, hit: { kind: 'block' } })

    this.drawInfo(ctx, u)
    ACTIONS.forEach((a, i) => this.drawActionButton(ctx, u, a, BTN.x + i * (BTN.w + BTN.gap), input))
    this.drawStatuses(ctx, u)
    this.drawCostBar(ctx, b.energy[0])

    // กล่องรายละเอียด: ชี้เมาส์ที่ปุ่มท่า
    const hovered = this.hover ? this.hitAt(this.hover.x, this.hover.y) : null
    if (hovered?.kind === 'action' && !this.menuOpen) {
      const i = ACTIONS.indexOf(hovered.action)
      this.drawTooltip(ctx, u, hovered.action, BTN.x + i * (BTN.w + BTN.gap))
    }
  }

  private drawInfo(ctx: CanvasRenderingContext2D, u: Unit): void {
    const x = PANEL.x + 8, y = BTN.y, w = BTN.x - PANEL.x - 16, h = BTN.h
    roundRect(ctx, x, y, w, h, 6)
    ctx.fillStyle = C.inset
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = withAlpha(C.ally, 0.5)
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.font = F(13)
    outlined(ctx, fit(ctx, this.s.nameOf(u), w - 12), x + 6, y + 17, C.text, 3)

    // ไอคอนธาตุ · ไอคอนชนิด · ตำแหน่ง (ยังโหลดรูปไม่เสร็จ → จุดสีแทน)
    const el = u.element
    let tx = x + 5
    const eIcon = elementIcon(el)
    if (eIcon) { ctx.drawImage(eIcon, tx, y + 21, 17, 17); tx += 19 }
    else if (el) {
      ctx.beginPath()
      ctx.arc(tx + 5, y + 30, 5, 0, Math.PI * 2)
      ctx.fillStyle = ELEMENT_COLOR[el]
      ctx.fill()
      tx += 14
    }
    const cIcon = categoryIcon(u.category)
    if (cIcon) { ctx.drawImage(cIcon, tx, y + 21, 17, 17); tx += 20 }
    ctx.font = F(11)
    // มีไอคอนธาตุแล้ว → เขียนแค่ตำแหน่ง (ไม่มีรูป → เขียนชื่อธาตุด้วย)
    const elName = el && !eIcon ? elementName(el) : ''
    outlined(ctx, fit(ctx, [elName, roleName(u.role)].filter(Boolean).join(' · '), w - (tx - x) - 6), tx, y + 34, C.dim, 3)

    // HP
    const bx = x + 6, by = y + 42, bw = w - 12
    // โล่ขาวต่อท้ายเลือด · เลือด+โล่ เกินเลือดเต็ม → ย่อทั้งหลอดให้พอดี (โล่ยังเห็นครบ)
    const shield = u.statuses.find(s => s.type === 'shield')?.shieldHp ?? 0
    const total = Math.max(u.maxHp, u.hp + shield) || 1
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(bx, by, bw, 7)
    const hpW = bw * Math.max(0, u.hp / total)
    ctx.fillStyle = C.ally
    ctx.fillRect(bx, by, hpW, 7)
    if (shield > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(bx + hpW, by, bw * (shield / total), 7)
    }
    ctx.font = F(10)
    const hpText = `${fmt(u.hp)}/${fmt(u.maxHp)}${shield > 0 ? ` +${fmt(shield)}` : ''}`
    iconText(ctx, uiImage(UI_SRC.hp), hpText, bx, y + 61, 10, 13, C.text, 'left', 3, 'HP ')
  }

  private actionName(u: Unit, a: ActionName): string {
    if (a === 'attack') return t('attack')
    const info = gameSkill(this.s.infoOf(u), a)
    return localName(info?.name, info?.code) ?? (a === 'skill1' ? t('skill1') : t('skill2'))
  }

  private actionIcon(u: Unit, a: ActionName): HTMLImageElement | null {
    if (a === 'attack') return null
    const icon = gameSkill(this.s.infoOf(u), a)?.icon
    return icon ? this.image(`/rangers/${u.rangerId}/${icon}`) : null
  }

  private drawActionButton(ctx: CanvasRenderingContext2D, u: Unit, a: ActionName, x: number, input: boolean): void {
    const b = this.s.battle
    const { y, w, h } = BTN
    const usable = input && b.canUse(u, a)
    // เลือกท่าของตัวแถวพิเศษอยู่ → ปุ่มท่าของตัวเองไม่ต้องสว่างตาม (ไฮไลท์ได้ทีละปุ่มเดียว)
    const selected = input && !this.s.pendingCaster && this.s.pendingAction === a
    const hover = this.isHover(x, y, w, h)

    roundRect(ctx, x, y, w, h, 6)
    if (selected) {
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      g.addColorStop(0, 'rgba(245,197,66,0.45)')
      g.addColorStop(1, 'rgba(245,197,66,0.12)')
      ctx.fillStyle = g
    } else ctx.fillStyle = hover && usable ? 'rgba(255,255,255,0.14)' : C.inset
    ctx.fill()
    ctx.lineWidth = selected ? 2.5 : 1.5
    ctx.strokeStyle = selected ? C.gold : usable ? withAlpha(C.ally, 0.8) : 'rgba(255,255,255,0.18)'
    ctx.stroke()

    ctx.save()
    if (!usable) ctx.globalAlpha = 0.5
    // ไอคอน
    const ic = 42, icx = x + 6, icy = y + (h - ic) / 2
    roundRect(ctx, icx, icy, ic, ic, 8)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fill()
    const img = this.actionIcon(u, a)
    if (img?.complete && img.naturalWidth) ctx.drawImage(img, icx, icy, ic, ic)
    else if (a === 'attack' && uiImage(UI_SRC.atk)) drawFit(ctx, uiImage(UI_SRC.atk)!, icx + 6, icy + 6, ic - 12, ic - 12)
    else {
      ctx.font = F(20)
      ctx.textAlign = 'center'
      outlined(ctx, a === 'attack' ? '⚔' : a === 'skill1' ? 'S1' : 'S2', icx + ic / 2, icy + ic / 2 + 7, C.gold, 3)
    }

    // ป้ายคีย์ลัด (Z / X / C) มุมล่างซ้ายของไอคอน
    if (input) {
      const key = a === 'attack' ? 'Z' : a === 'skill1' ? 'X' : 'C'
      roundRect(ctx, icx - 2, icy + ic - 13, 15, 15, 4)
      ctx.fillStyle = 'rgba(0,0,0,0.75)'
      ctx.fill()
      ctx.font = F(10)
      ctx.textAlign = 'center'
      ctx.fillStyle = C.gold
      ctx.fillText(key, icx + 5.5, icy + ic - 2)
    }

    // ชื่อท่า · ความกว้าง · Cost
    const skill = b.skillOf(u, a)
    const tx = icx + ic + 6, tw = x + w - tx - 4
    ctx.textAlign = 'left'
    ctx.font = F(12)
    outlined(ctx, fit(ctx, this.actionName(u, a), tw), tx, y + 20, C.text, 3)
    ctx.font = F(10)
    outlined(ctx, fit(ctx, areaShort(skill.area), tw), tx, y + 37, C.dim, 3)
    const cost = b.costOf(u, a)
    const short = cost > b.energy[u.team]
    iconText(ctx, uiImage(UI_SRC.mineral), a === 'attack' ? '+1' : String(cost), tx, y + 57, 13, 15,
      a === 'attack' ? C.energy : short ? C.debuff : C.gold, 'left', 3, a === 'attack' ? 'Cost ' : 'Cost ')
    ctx.restore()

    this.boxes.push({ x, y, w, h, hit: { kind: 'action', action: a } })
  }

  private drawStatuses(ctx: CanvasRenderingContext2D, u: Unit): void {
    let x = PANEL.x + 2
    const y = PANEL.y - 22, h = 18
    ctx.font = F(10)
    ctx.textAlign = 'center'
    for (const st of u.statuses) {
      const debuff = isDebuffLabel(st.type)
      const shieldIcon = st.type === 'shield' ? uiImage(UI_SRC.def) : null
      // โล่: รูปโล่ + ค่าที่เหลือ (บอกได้มากกว่าจำนวนเทิร์น)
      const text = shieldIcon ? fmt(st.shieldHp ?? 0) : `${statusLabel(st.type)} ${st.turns}`
      const w = ctx.measureText(text).width + 14 + (shieldIcon ? 15 : 0)
      if (x + w > PANEL.x + PANEL.w) break
      roundRect(ctx, x, y, w, h, 9)
      ctx.fillStyle = withAlpha(debuff ? C.debuff : C.buff, 0.22)
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = debuff ? C.debuff : C.buff
      ctx.stroke()
      if (shieldIcon) iconText(ctx, shieldIcon, text, x + w / 2, y + 13, 10, 13, C.text, 'center', 3)
      else outlined(ctx, text, x + w / 2, y + 13, C.text, 3)
      ctx.font = F(10)
      ctx.textAlign = 'center'
      x += w + 4
    }
  }

  private drawCostBar(ctx: CanvasRenderingContext2D, energy: number): void {
    const { x, y, w, h } = COST_BAR
    para(ctx, x, y, w, h, -8)
    ctx.fillStyle = C.panel
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = C.goldDim
    ctx.stroke()
    ctx.font = F(11)
    ctx.textAlign = 'left'
    iconText(ctx, uiImage(UI_SRC.mineral), `${energy}/${ENERGY_MAX}`, x + 6, y + 14, 12, 16, C.energy, 'left', 3, 'Cost ')
    this.drawPips(ctx, x + 78, y + 4, energy, (w - 90 - (ENERGY_MAX - 1) * 3) / ENERGY_MAX, h - 8, 3)
  }

  /** แท่งพลังงานเฉียงๆ n ช่อง */
  private drawPips(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, pw: number, ph: number, gap: number): void {
    for (let i = 0; i < ENERGY_MAX; i++) {
      const px = x + i * (pw + gap)
      para(ctx, px + 2, y, pw, ph, -2)
      if (i < n) {
        const g = ctx.createLinearGradient(0, y, 0, y + ph)
        g.addColorStop(0, '#bbf7d0')
        g.addColorStop(1, C.energy)
        ctx.fillStyle = g
      } else ctx.fillStyle = C.empty
      ctx.fill()
    }
  }

  /** แถวพิเศษของทีมเรา (ขวาล่าง): รูปเล็ก + ปุ่มสกิล 1/2 · ติดคูลดาวน์ = ปุ่มมืดพร้อมเลขเทิร์นที่เหลือ */
  private drawReserves(ctx: CanvasRenderingContext2D): void {
    const b = this.s.battle
    const list = b.reserves[0]
    if (!list.length || this.s.phase === 'intro') return
    const actor = this.s.pendingActor
    const input = this.s.phase === 'input' && !!actor && actor.team === 0
    list.forEach((r, i) => {
      const x = SUP.x + i * (SUP.card + SUP.gap)
      const card = { x, y: PANEL.y, w: SUP.card, h: PANEL.h }
      roundRect(ctx, card.x, card.y, card.w, card.h, 10)
      ctx.fillStyle = C.panel
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = this.s.pendingCaster === r ? C.gold : C.goldDim
      ctx.stroke()
      this.boxes.push({ ...card, hit: { kind: 'block' } })
      const P = { x: x + 4, y: card.y + (card.h - SUP.portraitH) / 2, w: SUP.portraitW, h: SUP.portraitH }
      this.drawPortrait(ctx, r, P, false)
      // ธาตุ: มุมซ้ายบนของกรอบรูป
      const el = r.element ? uiImage(UI_SRC.element[r.element]) : null
      if (el) ctx.drawImage(el, P.x - 5, P.y - 4, 28, 28)
      const cd = b.reserveCooldown(r)
      ;(['skill1', 'skill2'] as ActionName[]).forEach((a, k) => {
        const bx = P.x + P.w + 6 + k * (SUP.btnW + SUP.btnGap)
        this.drawSummonButton(ctx, r, i, a, bx, input && !!actor && b.canSummon(actor, r, a), input, cd)
      })
    })
    const hovered = this.hoveredSummon()
    if (hovered) {
      const r = list[hovered.index]
      const k = hovered.action === 'skill1' ? 0 : 1
      const bx = SUP.x + hovered.index * (SUP.card + SUP.gap) + 4 + SUP.portraitW + 6 + k * (SUP.btnW + SUP.btnGap)
      if (r) this.drawTooltip(ctx, r, hovered.action, bx - (BTN.w - SUP.btnW) / 2)
    }
  }

  /** แถวพิเศษของศัตรู (ใต้หลอดเลือดศัตรู) — ชี้เมาส์ = ชื่อ + สกิล */
  private drawFoeReserves(ctx: CanvasRenderingContext2D): void {
    const b = this.s.battle
    const list = b.reserves[1]
    if (!list.length || this.s.phase === 'intro') return
    const { size, gap, top, right } = FOE_SUP
    let hovered: { r: Unit; x: number } | null = null
    list.forEach((r, i) => {
      const x = right - (list.length - i) * size - (list.length - 1 - i) * gap
      const cd = b.reserveCooldown(r)
      ctx.save()
      roundRect(ctx, x, top, size, size, 8)
      ctx.fillStyle = C.panelHi
      ctx.fill()
      ctx.clip()
      const face = this.s.faceOf(r)
      if (face) {
        ctx.imageSmoothingQuality = 'high'
        drawFocused(ctx, face.img, face.center, x + size / 2, top + size / 2, size * 0.95)
      }
      if (cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(x, top, size, size)
      }
      ctx.restore()
      roundRect(ctx, x, top, size, size, 8)
      ctx.lineWidth = 2
      ctx.strokeStyle = cd > 0 ? withAlpha(C.enemy, 0.5) : C.enemy
      ctx.stroke()
      const el = r.element ? uiImage(UI_SRC.element[r.element]) : null
      if (el) ctx.drawImage(el, x - 5, top - 5, 18, 18)
      if (cd > 0) {
        ctx.font = F(18)
        ctx.textAlign = 'center'
        outlined(ctx, String(cd), x + size / 2, top + size / 2 + 7, C.text, 4)
      }
      this.boxes.push({ x, y: top, w: size, h: size, hit: { kind: 'block' } })
      if (this.isHover(x, top, size, size) && !this.menuOpen) hovered = { r, x }
    })
    if (hovered) this.drawFoeReserveTip(ctx, (hovered as { r: Unit; x: number }).r, (hovered as { r: Unit; x: number }).x)
  }

  /** ชี้รูปแถวพิเศษศัตรู: ชื่อ · สกิล 1/2 (ความกว้าง · Cost) · คูลดาวน์ */
  private drawFoeReserveTip(ctx: CanvasRenderingContext2D, r: Unit, ax: number): void {
    const b = this.s.battle
    const w = 310, pad = 10, lh = 19
    const cd = b.reserveCooldown(r)
    const rows = (['skill1', 'skill2'] as ActionName[]).map(a => `${this.actionName(r, a)} · ${areaShort(b.skillOf(r, a).area)} · Cost ${b.costOf(r, a)}`)
    const h = pad * 2 + 20 + rows.length * lh + (cd > 0 ? lh : 0)
    const x = Math.max(8, Math.min(W - w - 8, ax + FOE_SUP.size - w))
    const y = FOE_SUP.top + FOE_SUP.size + 6
    roundRect(ctx, x, y, w, h, 10)
    ctx.fillStyle = 'rgba(11,17,38,0.95)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = C.enemy
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.font = F(14)
    outlined(ctx, fit(ctx, this.s.nameOf(r), w - pad * 2), x + pad, y + pad + 14, C.text, 3)
    ctx.font = F(11)
    rows.forEach((line, i) => outlined(ctx, fit(ctx, (i ? 'S2 ' : 'S1 ') + line, w - pad * 2), x + pad, y + pad + 20 + (i + 1) * lh - 4, C.dim, 3))
    if (cd > 0) outlined(ctx, `${t('cooldown')} ${cd}`, x + pad, y + pad + 20 + 3 * lh - 4, C.gold, 3)
  }

  private drawSummonButton(ctx: CanvasRenderingContext2D, r: Unit, index: number, a: ActionName, x: number, usable: boolean, input: boolean, cd: number): void {
    const b = this.s.battle
    const y = BTN.y, w = SUP.btnW, h = BTN.h
    const selected = input && this.s.pendingCaster === r && this.s.pendingAction === a
    const hover = this.isHover(x, y, w, h)
    roundRect(ctx, x, y, w, h, 6)
    if (selected) {
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      g.addColorStop(0, 'rgba(245,197,66,0.45)')
      g.addColorStop(1, 'rgba(245,197,66,0.12)')
      ctx.fillStyle = g
    } else ctx.fillStyle = hover && usable ? 'rgba(255,255,255,0.14)' : C.inset
    ctx.fill()
    ctx.lineWidth = selected ? 2.5 : 1.5
    ctx.strokeStyle = selected ? C.gold : usable ? withAlpha(C.ally, 0.8) : 'rgba(255,255,255,0.18)'
    ctx.stroke()

    ctx.save()
    if (!usable) ctx.globalAlpha = 0.5
    const ic = 34, icx = x + 5, icy = y + 6
    roundRect(ctx, icx, icy, ic, ic, 7)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fill()
    const img = this.actionIcon(r, a)
    if (img?.complete && img.naturalWidth) ctx.drawImage(img, icx, icy, ic, ic)
    else {
      ctx.font = F(16)
      ctx.textAlign = 'center'
      outlined(ctx, a === 'skill1' ? 'S1' : 'S2', icx + ic / 2, icy + ic / 2 + 6, C.gold, 3)
    }
    if (input) {
      const key = SUMMON_KEYS[index]?.[a === 'skill1' ? 0 : 1]
      if (key) {
        roundRect(ctx, icx - 2, icy + ic - 12, 14, 14, 4)
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.fill()
        ctx.font = F(9)
        ctx.textAlign = 'center'
        ctx.fillStyle = C.gold
        ctx.fillText(key, icx + 5, icy + ic - 2)
      }
    }
    const tx = icx + ic + 5, tw = x + w - tx - 3
    ctx.textAlign = 'left'
    ctx.font = F(10)
    outlined(ctx, fit(ctx, areaShort(b.skillOf(r, a).area), tw), tx, y + 20, C.dim, 3)
    const cost = b.costOf(r, a)
    iconText(ctx, uiImage(UI_SRC.mineral), String(cost), tx, y + 38, 12, 14, cost > b.energy[0] ? C.debuff : C.gold, 'left', 3)
    ctx.font = F(11)
    outlined(ctx, fit(ctx, this.actionName(r, a), w - 10), x + 5, y + h - 8, C.text, 3)
    ctx.restore()

    // คูลดาวน์: มืดทั้งปุ่ม + เลขเทิร์นที่เหลือ
    if (cd > 0) {
      roundRect(ctx, x, y, w, h, 6)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fill()
      ctx.font = F(22)
      ctx.textAlign = 'center'
      outlined(ctx, String(cd), x + w / 2, y + h / 2 + 4, C.text, 4)
      ctx.font = F(9)
      outlined(ctx, t('cooldown'), x + w / 2, y + h / 2 + 18, C.dim, 3)
    }
    this.boxes.push({ x, y, w, h, hit: { kind: 'summon', index, action: a } })
  }

  private drawTooltip(ctx: CanvasRenderingContext2D, u: Unit, a: ActionName, bx: number): void {
    const b = this.s.battle
    const skill = b.skillOf(u, a)
    const lines = skill.effects.map(describeEffect)
    if (a === 'attack') lines.push(t('teamCost'))
    const w = 280, pad = 12, lh = 19
    const h = 64 + lines.length * lh
    const x = Math.max(8, Math.min(W - w - 8, bx + BTN.w / 2 - w / 2))
    // ชิดแผงคำสั่ง (ทับแถวชิปสถานะได้ — กล่องนี้ขึ้นแค่ตอนชี้ปุ่ม)
    const y = PANEL.y - TOOLTIP_GAP - h

    roundRect(ctx, x, y, w, h, 10)
    ctx.fillStyle = 'rgba(11,17,38,0.95)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = C.gold
    ctx.stroke()

    const ic = 34
    roundRect(ctx, x + pad, y + pad, ic, ic, 7)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fill()
    const img = this.actionIcon(u, a)
    if (img?.complete && img.naturalWidth) ctx.drawImage(img, x + pad, y + pad, ic, ic)
    else if (a === 'attack' && uiImage(UI_SRC.atk)) drawFit(ctx, uiImage(UI_SRC.atk)!, x + pad + 5, y + pad + 5, ic - 10, ic - 10)
    else {
      ctx.font = F(16)
      ctx.textAlign = 'center'
      outlined(ctx, a === 'attack' ? '⚔' : a === 'skill1' ? 'S1' : 'S2', x + pad + ic / 2, y + pad + ic / 2 + 6, C.gold, 3)
    }

    const costText = a === 'attack' ? '+1' : String(b.costOf(u, a))
    const cw = iconText(ctx, uiImage(UI_SRC.mineral), costText, x + w - pad, y + pad + 16, 14, 17, a === 'attack' ? C.energy : C.gold, 'right', 3, 'Cost ')
    ctx.textAlign = 'left'
    ctx.font = F(15)
    const nx = x + pad + ic + 8
    outlined(ctx, fit(ctx, this.actionName(u, a), x + w - pad - cw - 8 - nx), nx, y + pad + 15, C.text, 3)
    ctx.font = F(11)
    outlined(ctx, fit(ctx, areaLong(skill.area), x + w - pad - nx), nx, y + pad + 31, C.dim, 3)

    ctx.font = F(12)
    lines.forEach((line, i) => {
      outlined(ctx, fit(ctx, '+ ' + line, w - pad * 2), x + pad, y + 64 + i * lh, C.text, 3)
    })
  }

  // ── การ์ดข้อมูลเรนเจอร์ (ชี้เมาส์ที่ตัว) ──

  /**
   * ชี้เรนเจอร์ → การ์ดข้อมูล: รูปหน้า · ชื่อ · ธาตุ/ชนิด/ตำแหน่ง · เลือด (+โล่) · ATK DEF SPD CRIT (รวมบัฟแล้ว) · สถานะทั้งหมด
   * วางนิ่งข้างตัวเรนเจอร์ (ทั้งเราและศัตรู): ขวาของตัว · ชิดขอบขวาจนล้น → ซ้ายของตัวแทน · ชี้อยู่บนปุ่ม/แผง HUD หรือเปิดเมนู = ไม่ขึ้น
   */
  private drawUnitCard(ctx: CanvasRenderingContext2D): void {
    const p = this.hover
    if (!p || !unitCardEnabled || this.menuOpen || this.s.phase === 'intro' || this.s.phase === 'ended') return
    if (this.hitAt(p.x, p.y)) return
    const uid = this.s.unitAt(p.x, p.y)
    const u = uid ? this.s.battle.unit(uid) : null
    if (!u || !u.alive) return
    const b = this.s.battle
    const ally = u.team === 0
    const { w, pad } = CARD

    // ── เนื้อหา (คำนวณความสูงก่อนวาด) ──
    const shield = u.statuses.find(s => s.type === 'shield')?.shieldHp ?? 0
    // ไกด์ท่าที่กำลังเลือก: สถานะที่จะติด/ได้ต่อท้ายแบบกะพริบ · ที่จะถูกล้าง (DISPEL/CLEANSE) กะพริบด้วย
    const pv = this.s.previewOf(u.uid)
    const chips: { text: string; debuff: boolean; blink: boolean }[] = u.statuses.map(s => {
      const debuff = isDebuffLabel(s.type)
      const text = s.type === 'shield' ? `${t('shield')} ${fmt(s.shieldHp ?? 0)} · ${turnsShort(s.turns)}`
        : `${statusLabel(s.type)}${s.pct ? ` ${s.pct}%` : ''} · ${turnsShort(s.turns)}`
      const removed = !!pv && ((pv.dispel && !debuff) || (pv.cleanse && debuff))
      return { text, debuff, blink: removed }
    })
    if (pv && !pv.immune) {
      for (const st of pv.statuses) {
        chips.push({ text: `${statusLabel(st.type)}${st.pct ? ` ${st.pct}%` : ''} · ${turnsShort(st.turns)}`, debuff: isDebuffLabel(st.type), blink: true })
      }
      if (pv.dispel) chips.push({ text: t('dispel'), debuff: true, blink: true })
      if (pv.cleanse) chips.push({ text: t('cleanse'), debuff: false, blink: true })
    }
    ctx.font = F(10)
    const chipRows: { text: string; debuff: boolean; blink: boolean; x: number; w: number }[][] = [[]]
    let cx = 0
    for (const c of chips) {
      const cw = ctx.measureText(c.text).width + 14
      if (cx + cw > w - pad * 2 && chipRows[chipRows.length - 1].length) { chipRows.push([]); cx = 0 }
      chipRows[chipRows.length - 1].push({ ...c, x: cx, w: cw })
      cx += cw + 4
    }
    const statusH = chips.length ? 18 + chipRows.length * 21 : 18
    const h = pad + 44 + 30 + 34 + statusH + pad

    // ── ตำแหน่ง: นิ่งอยู่ข้างตัวเรนเจอร์ (ไม่ตามเมาส์) — ขวาของตัว ขอบบนเสมอหลอดเลือด
    //    ล้นขอบขวา → ย้ายไปซ้ายของตัวแทน · ไม่ล้นจอ
    const anchor = this.s.unitAnchor(u.uid) ?? p
    let x = anchor.x + CARD_SIDE
    if (x + w > W - 6) x = anchor.x - CARD_SIDE - w
    x = Math.max(6, Math.min(W - w - 6, x))
    const y = Math.max(6, Math.min(H - h - 6, anchor.y - CARD_ABOVE_BAR))

    const edge = TEAM[u.team]
    roundRect(ctx, x, y, w, h, 10)
    ctx.fillStyle = 'rgba(8,12,28,0.94)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = edge
    ctx.stroke()

    // หัวการ์ด: รูปหน้า + ชื่อ + ธาตุ/ชนิด/ตำแหน่ง
    let yy = y + pad
    const face = this.s.faceOf(u)
    const fs = 44
    ctx.save()
    roundRect(ctx, x + pad, yy, fs, fs, 8)
    ctx.fillStyle = withAlpha(edge, 0.18)
    ctx.fill()
    ctx.clip()
    if (face) drawFocused(ctx, face.img, face.center, x + pad + fs / 2, yy + fs / 2, fs * PANEL_FACE_ZOOM)
    ctx.restore()
    this.drawStars(ctx, u, x + pad - 2, yy + fs + 3, fs + 4)
    const tx = x + pad + fs + 8
    ctx.textAlign = 'left'
    ctx.font = F(14)
    outlined(ctx, fit(ctx, this.s.nameOf(u), x + w - pad - tx), tx, yy + 17, C.text, 3)
    let ix = tx
    const eIcon = elementIcon(u.element), cIcon = categoryIcon(u.category)
    if (eIcon) { ctx.drawImage(eIcon, ix, yy + 24, 17, 17); ix += 19 }
    if (cIcon) { ctx.drawImage(cIcon, ix, yy + 24, 17, 17); ix += 20 }
    ctx.font = F(11)
    const sub = [u.element ? elementName(u.element) : '', roleName(u.role), ally ? t('ally') : t('enemy')].filter(Boolean).join(' · ')
    outlined(ctx, fit(ctx, sub, x + w - pad - ix), ix, yy + 37, C.dim, 3)
    yy += 44 + 6

    // เลือด (+โล่ต่อท้ายสีขาว แบบเดียวกับหลอดบนหัว)
    // กำลังเลือกท่าอยู่ → ส่วนที่จะหายกะพริบมืด · ฮีล/โล่ที่จะได้กะพริบเขียว/ขาว
    const heal = pv?.heal ?? 0, shieldGain = pv?.shield ?? 0
    const bw = w - pad * 2, bh = 8
    const total = Math.max(u.maxHp, u.hp + heal + shield + shieldGain)
    const bx = x + pad
    const hpW = bw * u.hp / total, healW = bw * heal / total, shW = bw * shield / total
    roundRect(ctx, bx, yy, bw, bh, 4)
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fill()
    ctx.save()
    roundRect(ctx, bx, yy, bw, bh, 4)
    ctx.clip()
    ctx.fillStyle = edge
    ctx.fillRect(bx, yy, hpW, bh)
    if (shield > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(bx + hpW + healW, yy, shW, bh)
    }
    if (pv) {
      const blink = 0.5 + 0.5 * Math.sin((nowMs() / 1000) * Math.PI * 2 * PREVIEW_BLINK_HZ)
      if (pv.damage > 0) {
        const { shieldLoss, hpLoss } = previewLoss(pv, u.hp, shield)
        ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.6 * blink})`
        ctx.fillRect(bx + hpW - bw * hpLoss / total, yy, bw * hpLoss / total, bh)
        if (shieldLoss > 0) ctx.fillRect(bx + hpW + healW, yy, bw * shieldLoss / total, bh)
      }
      if (heal > 0) {
        ctx.fillStyle = `rgba(74,222,128,${0.35 + 0.6 * blink})`
        ctx.fillRect(bx + hpW, yy, healW, bh)
      }
      if (shieldGain > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.6 * blink})`
        ctx.fillRect(bx + hpW + healW + shW, yy, bw * shieldGain / total, bh)
      }
    }
    ctx.restore()
    ctx.font = F(12)
    const hpText = `${fmt(u.hp)} / ${fmt(u.maxHp)}${shield > 0 ? `  (+${fmt(shield)})` : ''}`
    iconText(ctx, uiImage(UI_SRC.hp), hpText, bx, yy + bh + 15, 12, 13, C.text, 'left', 3, 'HP ')
    // มุมขวา: ปกติ = % เลือดที่เหลือ · กำลังเลือกท่า = ผลคาดการณ์ (-ดาเมจ / KO / IMMUNE / +ฮีล)
    ctx.textAlign = 'right'
    ctx.font = F(12)
    const ry = yy + bh + 15, rx = x + w - pad
    if (pv?.immune) outlined(ctx, t('immune'), rx, ry, '#93c5fd', 3)
    else if (pv && pv.damage > 0) {
      const ko = previewLoss(pv, u.hp, shield).ko
      outlined(ctx, ko ? `-${fmt(pv.damage)}  KO` : `-${fmt(pv.damage)}`, rx, ry, ko ? C.enemy : '#fca5a5', 3)
    } else if (pv && (heal > 0 || shieldGain > 0)) {
      outlined(ctx, [heal > 0 ? `+${fmt(heal)}` : '', shieldGain > 0 ? `${t('shieldPlus')}${fmt(shieldGain)}` : ''].filter(Boolean).join(' '), rx, ry, '#86efac', 3)
    } else {
      ctx.font = F(11)
      outlined(ctx, `${Math.round(u.hp / u.maxHp * 100)}%`, rx, ry, C.dim, 3)
    }
    yy += 30

    // ค่าพลัง (รวมบัฟ/ดีบัฟแล้ว) — เปลี่ยนจากค่าเดิม = สีเขียว (ขึ้น) / แดง (ลง)
    const stat = (label: string, now: number, base: number, sx: number, suffix = '') => {
      ctx.textAlign = 'left'
      ctx.font = F(10)
      outlined(ctx, label, sx, yy + 11, C.dim, 3)
      ctx.font = F(13)
      const color = Math.round(now) > Math.round(base) ? C.buff : Math.round(now) < Math.round(base) ? C.debuff : C.text
      outlined(ctx, fmt(now) + suffix, sx, yy + 27, color, 3)
    }
    const col = (w - pad * 2) / 4
    stat('ATK', b.effAtk(u), u.atk, x + pad)
    stat('DEF', u.def, u.def, x + pad + col)
    stat('SPD', b.effSpd(u), u.spd, x + pad + col * 2)
    stat('CRIT', b.effCrit(u), u.crit, x + pad + col * 3, '%')
    yy += 34

    // สถานะ: บัฟเขียว ดีบัฟแดง (ค่า % · เทิร์นที่เหลือ)
    ctx.textAlign = 'left'
    ctx.font = F(10)
    outlined(ctx, t('status'), x + pad, yy + 11, C.dim, 3)
    yy += 18
    if (!chips.length) {
      outlined(ctx, '—', x + pad + 50, yy - 7, C.dim, 3)
    }
    const blink = 0.5 + 0.5 * Math.sin((nowMs() / 1000) * Math.PI * 2 * PREVIEW_BLINK_HZ)
    for (const row of chipRows) {
      for (const c of row) {
        const chx = x + pad + c.x
        ctx.save()
        // ป้ายคาดการณ์ (จะติด / จะถูกล้าง) กะพริบจังหวะเดียวกับเลือดที่จะหาย: เลือดมืดลงเมื่อไหร่ ป้ายก็จางลงพร้อมกัน
        if (c.blink) ctx.globalAlpha = 1 - 0.7 * blink
        roundRect(ctx, chx, yy, c.w, 17, 8)
        ctx.fillStyle = withAlpha(c.debuff ? C.debuff : C.buff, 0.2)
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = c.debuff ? C.debuff : C.buff
        ctx.stroke()
        ctx.textAlign = 'center'
        ctx.font = F(10)
        outlined(ctx, c.text, chx + c.w / 2, yy + 12, C.text, 3)
        ctx.restore()
      }
      yy += 21
    }
  }

  // ── ป้ายกลางจอ ──

  private drawPausedTag(ctx: CanvasRenderingContext2D): void {
    ctx.font = F(20)
    ctx.textAlign = 'center'
    const w = ctx.measureText(t('paused')).width + 36
    roundRect(ctx, W / 2 - w / 2, 136, w, 34, 17)
    ctx.fillStyle = C.panel
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = C.gold
    ctx.stroke()
    outlined(ctx, t('paused'), W / 2, 160, C.gold, 3)
  }

  private drawResult(ctx: CanvasRenderingContext2D): void {
    const b = this.s.battle
    const win = b.winner
    const g = ctx.createLinearGradient(0, 0, W, 0)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(0.5, 'rgba(0,0,0,0.7)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, H / 2 - 90, W, 180)
    this.boxes = [{ x: 0, y: 0, w: W, h: H, hit: { kind: 'block' } }]   // ทั้งจอกลืนคลิก เหลือแค่ปุ่มสองปุ่มล่าง
    ctx.font = F(60)
    ctx.textAlign = 'center'
    const title = b.isDraw ? t('draw') : win === 0 ? t('victory') : t('defeat')
    outlined(ctx, title, W / 2, H / 2 - 12, b.isDraw ? C.text : win === 0 ? C.gold : C.debuff, 7)
    // หมดเวลา: บอกว่าตัดสินที่เลือดคงเหลือ
    const r = b.timeUpResult
    if (this.s.endedByTime && r) {
      ctx.font = F(18)
      outlined(ctx, `${t(this.s.timerOn && this.s.timeLeftSec <= 0 ? 'timeUp' : 'turnLimit')} ${r.pct[0].toFixed(1)}% vs ${r.pct[1].toFixed(1)}%`, W / 2, H / 2 - 64, C.gold, 4)
    }
    this.button(ctx, W / 2 - 150, H / 2 + 20, 140, 42, t('retry'), { kind: 'restart' }, { size: 16, active: true })
    this.button(ctx, W / 2 + 10, H / 2 + 20, 140, 42, t('team'), { kind: 'back' }, { size: 16 })
  }

  private drawMenu(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, W, H)
    this.boxes = [{ x: 0, y: 0, w: W, h: H, hit: { kind: 'closeMenu' } }]   // คลิกนอกเมนู = ปิด
    const w = 320, h = 406, x = (W - w) / 2, y = (H - h) / 2
    roundRect(ctx, x, y, w, h, 14)
    ctx.fillStyle = 'rgba(11,17,38,0.97)'
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = C.gold
    ctx.stroke()
    this.boxes.push({ x, y, w, h, hit: { kind: 'block' } })
    ctx.font = F(22)
    ctx.textAlign = 'center'
    outlined(ctx, t('settings'), W / 2, y + 38, C.gold, 4)
    const bw = w - 60, bx = x + 30
    this.button(ctx, bx, y + 58, bw, 40, this.s.paused ? t('resume') : t('pause'), { kind: 'pause' }, { size: 16 })
    this.button(ctx, bx, y + 106, bw, 40, t('restart'), { kind: 'restart' }, { size: 16 })
    this.button(ctx, bx, y + 154, bw, 40, t('backToTeam'), { kind: 'back' }, { size: 16 })
    // ภาษา: กดวน อังกฤษ ⇄ ไทย (ปุ่มบอกภาษาที่ใช้อยู่)
    this.button(ctx, bx, y + 202, bw, 40, t('language'), { kind: 'lang' }, { size: 16 })
    this.button(ctx, bx, y + 250, bw, 40, cutinsOn() ? t('cutinOn') : t('cutinOff'), { kind: 'cutin' }, { size: 16 })
    this.button(ctx, bx, y + 298, bw, 40, unitCardEnabled ? t('unitCardOn') : t('unitCardOff'), { kind: 'unitCard' }, { size: 16 })
    this.button(ctx, bx, y + 350, bw, 38, t('close'), { kind: 'closeMenu' }, { size: 15, active: true })
  }

  // ── ชิ้นส่วนย่อย ──

  private button(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, hit: HudHit,
    opt: { active?: boolean; size?: number; icon?: HTMLImageElement | null } = {},
  ): void {
    const hover = this.isHover(x - HIT_PAD, y - HIT_PAD, w + HIT_PAD * 2, h + HIT_PAD * 2)
    const flash = this.pressed?.key === keyOf(hit) && nowMs() - this.pressed.at < PRESS_FLASH_MS
    ctx.save()
    if (flash) {
      // กดติดแล้ว: ปุ่มยุบลงนิดหนึ่ง + สว่างขึ้น
      ctx.translate(x + w / 2, y + h / 2)
      ctx.scale(0.94, 0.94)
      ctx.translate(-(x + w / 2), -(y + h / 2))
    }
    roundRect(ctx, x, y, w, h, Math.min(10, h / 2))
    if (flash) ctx.fillStyle = '#fff7cc'
    else if (opt.active) {
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      g.addColorStop(0, '#fde68a')
      g.addColorStop(1, '#d99a1a')
      ctx.fillStyle = g
    } else ctx.fillStyle = hover ? C.panelHi : C.panel
    ctx.fill()
    ctx.lineWidth = hover ? 2.5 : 1.5
    ctx.strokeStyle = C.gold
    ctx.stroke()
    ctx.font = F(opt.size ?? 14)
    ctx.textAlign = 'center'
    if (opt.icon) {
      // ไอคอนพอดีปุ่ม (เว้นขอบ) คงสัดส่วนรูป
      const s = Math.min((w - 12) / opt.icon.naturalWidth, (h - 12) / opt.icon.naturalHeight)
      const iw = opt.icon.naturalWidth * s, ih = opt.icon.naturalHeight * s
      ctx.drawImage(opt.icon, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
    } else if (opt.active) {
      ctx.fillStyle = '#3b2503'
      ctx.fillText(text, x + w / 2, y + h / 2 + (opt.size ?? 14) * 0.36)
    } else outlined(ctx, text, x + w / 2, y + h / 2 + (opt.size ?? 14) * 0.36, C.text, 3)
    ctx.restore()
    this.boxes.push({ x: x - HIT_PAD, y: y - HIT_PAD, w: w + HIT_PAD * 2, h: h + HIT_PAD * 2, hit })
  }

  /**
   * ปุ่มกลมพร้อมวงแหวน (endless_battle_icon_eff)
   *   เปิดอยู่ → เส้นโค้งทองหมุนรอบปุ่ม (loop) · กด → วงแหวนแฟลชแล้วจาง (success) 1 รอบ
   *   เอฟเฟกต์ใช้เวลาจริง ไม่หยุดตามเกม (หยุดเกมอยู่ก็ยังเห็นว่ากดติด)
   */
  private roundButton(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, d: number, text: string, hit: HudHit, on: boolean, size: number,
  ): void {
    const r = d / 2
    const hover = this.isHover(cx - r - HIT_PAD, cy - r - HIT_PAD, d + HIT_PAD * 2, d + HIT_PAD * 2)
    const now = nowMs()
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    const g = ctx.createRadialGradient(cx, cy - r * 0.4, r * 0.2, cx, cy, r)
    g.addColorStop(0, on ? 'rgba(92,70,20,0.95)' : hover ? 'rgba(44,60,112,0.95)' : 'rgba(24,34,72,0.95)')
    g.addColorStop(1, on ? 'rgba(40,28,6,0.95)' : 'rgba(11,17,38,0.95)')
    ctx.fillStyle = g
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = on ? C.gold : C.goldDim
    ctx.stroke()
    ctx.restore()

    const fx = this.ring
    if (fx) {
      const scale = (r + 3) / fx.radius
      const play = (frames: typeof fx.clips.loop, t: number, loop: boolean) => {
        if (!frames.length) return
        const pos = t * fx.fps
        const i = Math.floor(pos)
        if (!loop && i >= frames.length) return
        const a = loop ? i % frames.length : i
        const b = loop ? (a + 1) % frames.length : Math.min(a + 1, frames.length - 1)
        const frame = lerpSAMFrame(frames[a], frames[b], pos - i)
        renderSAMFrame(ctx, frame, fx.sam.images, fx.sprites, cx - fx.anchor.x * scale, cy - fx.anchor.y * scale, scale)
      }
      if (on) play(fx.clips.loop, now / 1000, true)
      if (this.pressed?.key === keyOf(hit)) play(fx.clips.success, (now - this.pressed.at) / 1000, false)
    }
    // ตัวหนังสืออยู่บนเอฟเฟกต์เสมอ (แฟลชตอนกดไม่กลบชื่อปุ่ม)
    ctx.font = F(size)
    ctx.textAlign = 'center'
    outlined(ctx, text, cx, cy + size * 0.36, on ? '#fde68a' : C.text, 3)
    this.boxes.push({ x: cx - r - HIT_PAD, y: cy - r - HIT_PAD, w: d + HIT_PAD * 2, h: d + HIT_PAD * 2, hit })
  }

  /** ปุ่มที่เป็นรูป UI ทั้งชิ้น (ไม่มีพื้น/กรอบ) · ชี้ = สว่างขึ้นนิด · กด = ยุบลงแวบหนึ่ง · รูปยังไม่มา = ตัวอักษรแทน */
  private imageButton(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, img: HTMLImageElement | null, fallback: string, hit: HudHit,
  ): void {
    const hover = this.isHover(x - HIT_PAD, y - HIT_PAD, w + HIT_PAD * 2, h + HIT_PAD * 2)
    const flash = this.pressed?.key === keyOf(hit) && nowMs() - this.pressed.at < PRESS_FLASH_MS
    ctx.save()
    const k = flash ? 0.9 : hover ? 1.06 : 1
    ctx.translate(x + w / 2, y + h / 2)
    ctx.scale(k, k)
    ctx.translate(-(x + w / 2), -(y + h / 2))
    if (img) {
      const s = Math.min(w / img.naturalWidth, h / img.naturalHeight)
      const iw = img.naturalWidth * s, ih = img.naturalHeight * s
      if (hover || flash) ctx.filter = 'brightness(1.2)'
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
    } else {
      ctx.font = F(24)
      ctx.textAlign = 'center'
      outlined(ctx, fallback, x + w / 2, y + h / 2 + 9, C.text, 3)
    }
    ctx.restore()
    this.boxes.push({ x: x - HIT_PAD, y: y - HIT_PAD, w: w + HIT_PAD * 2, h: h + HIT_PAD * 2, hit })
  }

  /** รูปดาว (ระดับ + Evolution) กว้าง w ชิดขอบล่างที่ bottom · ไม่มีข้อมูลระดับ/รูปยังไม่โหลด = ไม่วาด */
  private drawStars(ctx: CanvasRenderingContext2D, u: Unit, x: number, bottom: number, w: number): void {
    const src = starImageUrl(this.s.infoOf(u)?.grade, evolutionOf(u.rangerId))
    const img = src ? uiImage(src) : null
    if (!img) return
    const h = w * img.naturalHeight / img.naturalWidth
    ctx.drawImage(img, x, bottom - h, w, h)
  }

  private isHover(x: number, y: number, w: number, h: number): boolean {
    const p = this.hover
    return !!p && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h
  }

  private image(src: string): HTMLImageElement | null {
    if (typeof Image === 'undefined') return null
    let img = this.images.get(src)
    if (!img) { img = new Image(); img.src = src; this.images.set(src, img) }
    return img
  }
}

// ── ตัวช่วยวาด ──

/** สี่เหลี่ยมด้านขนาน: skew > 0 = ขอบล่างเยื้องไปทางขวา */
/** สี่เหลี่ยมข้าวหลามตัด (หมุน 45°) รัศมี r รอบจุด (x, y) */
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r, y)
  ctx.closePath()
}

function para(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, skew: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w + skew, y + h)
  ctx.lineTo(x + skew, y + h)
  ctx.closePath()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** ตัวอักษรมีขอบดำ อ่านชัดบนฉากสว่าง */
function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, stroke: number): void {
  ctx.lineJoin = 'round'
  ctx.lineWidth = stroke
  ctx.strokeStyle = C.outline
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

/**
 * ไอคอนเล็กหน้าข้อความ (ไอคอนอยู่กึ่งกลางความสูงตัวอักษร) — คืนความกว้างรวม
 * ยังโหลดรูปไม่เสร็จ → ใช้คำนำหน้า fallback แทนรูป (เช่น "Cost ")
 */
function iconText(
  ctx: CanvasRenderingContext2D, icon: HTMLImageElement | null, text: string, x: number, y: number,
  px: number, iconSize: number, color: string, align: 'left' | 'center' | 'right', stroke: number, fallback = '',
): number {
  ctx.font = F(px)
  const label = icon ? text : fallback + text
  const tw = ctx.measureText(label).width
  const iw = icon ? iconSize * (icon.naturalWidth / icon.naturalHeight) : 0
  const gap = icon ? 3 : 0
  const total = iw + gap + tw
  const sx = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total
  if (icon) ctx.drawImage(icon, sx, y - px * 0.36 - iconSize / 2, iw, iconSize)
  ctx.textAlign = 'left'
  outlined(ctx, label, sx + iw + gap, y, color, stroke)
  return total
}

/** วาดรูปให้พอดีกรอบ คงสัดส่วน อยู่กึ่งกลาง */
function drawFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight)
  const iw = img.naturalWidth * s, ih = img.naturalHeight * s
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
}

/** ตัดข้อความให้พอดีความกว้าง (ต่อท้าย …) */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const keyOf = (hit: HudHit) => JSON.stringify(hit)

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** สกิลจากข้อมูลเกม: สกิล 2 บางตัวเก็บไว้ช่อง skill3 (สกิลพิเศษ) */
function gameSkill(info: GameInfo | null, a: ActionName): GameSkillInfo | null {
  if (!info) return null
  if (a === 'skill1') return info.skills.skill1
  if (a === 'skill2') return info.skills.skill2 ?? info.skills.skill3
  return null
}
