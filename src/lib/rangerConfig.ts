// ====================================================
// rangerConfig.ts — โครงสร้างข้อมูลเรนเจอร์ 1 ตัว (ไฟล์ ranger.json)
//
// ทุกพิกัดเป็น world unit ของ .sam (หน่วยเดียวกับ renderSAMFrame) ไม่ผูกกับ zoom
// แกน Y ชี้ลงตามระบบ canvas → ค่าที่อยู่เหนือพื้นจะติดลบ
//
// ── ระบบพิกัด 2 ชั้น (สำคัญมาก) ──
//
//   1. sprite space  พิกัดดิบในไฟล์ .sam — ใช้กับ anchors.ground ตัวเดียวเท่านั้น
//      anchors.ground = "จุดไหนบนภาพคือเท้า"
//
//   2. slot space    เทียบจากเท้า (0,0 = จุดที่ตัวละครยืน) — ใช้กับพิกัดอื่นทั้งหมด
//      hitPoint, overhead, muzzle, impactOffset
//
// เวลาวางลงแมพ: ตัวละครถูกวาดโดยเลื่อน -ground เพื่อให้ "เท้า" ไปตรงกับจุดยืนของช่องนั้นพอดี
//   drawOrigin = slotPosition − anchors.ground
// ดังนั้นพิกัดใน slot space เอาไปใช้กับตำแหน่งช่องในแมพได้ตรงๆ ไม่ต้องแปลงอีก
// ====================================================

import type { SAMParser, SamFrame } from './animation/samParser'
import { ELEMENTS, type Category, type Element, type Role } from './rangerClass'
import { defaultSkills, type SkillDef, type SkillSlot } from './skills'
import type { PassiveDef } from './passives'
import type { CutinConfig } from './cutin'

export interface Vec2 { x: number; y: number }

export type ActionName = 'attack' | 'skill1' | 'skill2'
export const ACTION_NAMES: ActionName[] = ['attack', 'skill1', 'skill2']

// ── การเดินทางของกระสุน ──
// ไฟล์กระสุนเป็น .sam แยกต่างหาก (bul / bul2 / bul3) ทุกไฟล์มีคลิปเหมือนกัน 2 คลิป:
//   normal = ภาพตอนบิน (เล่นวน บางตัวมีเฟรมเดียว = กระสุนนิ่ง)
//   finish = ภาพตอนกระทบ (เล่นครั้งเดียวแล้วหาย)
// ดาเมจลงตอนกระสุน "ถึงเป้า" ไม่ใช่ตอนยิงออก — ต่างจากท่าประชิดที่ลงทันทีที่ releaseFrame
export type BulletAsset = 'bul' | 'bul2' | 'bul3'

/**
 * วิธีที่กระสุนไปถึงเป้า
 *   flight   — บินจากปากกระบอกไปหาเป้า แล้วค่อยระเบิด (กระสุนปกติ)
 *   atTarget — เกิดที่ตัวเป้าเลย ไม่มีการบิน เล่นคลิป normal เต็มความยาวตรงนั้นก่อนค่อยระเบิด
 *              (ท่าตกจากฟ้า / ทุบพื้น / เอฟเฟกต์เกิดคาตัวศัตรู)
 * ถ้าใช้ flight กับท่าที่ควรเป็น atTarget ภาพจะบินข้ามจอมาแบบผิดๆ — นี่คือสาเหตุหลัก
 * ที่อนิเมชั่นยิงดูแปลก
 */
export type DeliveryMode = 'flight' | 'atTarget'

export interface ProjectileConfig {
  asset: BulletAsset                 // ใช้ไฟล์กระสุนไหน
  mode: DeliveryMode
  path: 'straight' | 'arc'
  /**
   * ความสูงส่วนโค้ง (world unit) — null = คำนวณเอง
   * อัตโนมัติ = min(ARC_MAX_HEIGHT, ระยะทาง² / ARC_FLATTEN) — ดู shotRules.ts
   * แต่ถ้าคลิปกระสุนมีการลอยขึ้น-ลงในตัวอยู่แล้ว (selfArc) จะไม่ใส่โค้งซ้อนทับ
   */
  arcHeight: number | null
  speed: number                      // world unit ต่อวินาที
  rotate: 'none' | 'alongPath'       // หมุนสไปรต์ตามทิศทางบินไหม
  /**
   * true  = ยืดคลิป normal ให้เล่นจบพอดีตอนถึงเป้า
   * false = เล่นวนซ้ำไปเรื่อยๆ ระหว่างบิน (ค่าปกติ — คลิปบินมักสั้นกว่าเวลาบินมาก)
   */
  fitFlight: boolean
}

// กระสุนมาตรฐานของแต่ละแอ็กชัน ตามที่เกมต้นฉบับตั้งชื่อไว้
export const DEFAULT_BULLET: Record<ActionName, BulletAsset> = {
  attack: 'bul',
  skill1: 'bul2',
  skill2: 'bul3',
}

// ── เดินเข้าไปหาเป้าก่อนโจมตี (สำหรับตัวตีใกล้ / สกิลระยะประชิด) ──
export interface ApproachConfig {
  enabled: boolean
  /**
   * [slot space ของเป้า] จุดที่ "เท้า" ผู้โจมตีไปหยุด เทียบจากจุดยืนของเป้า
   * x ติดลบ = หยุดด้านหน้าเป้า (ฝั่งผู้โจมตี) — ลากหมุดใน editor ให้ได้ระยะพอดี
   */
  stopOffset: Vec2
  /** ความเร็วเดิน (world unit ต่อวินาที) */
  speed: number
  /** โจมตีเสร็จแล้วเดินกลับที่เดิม */
  returnHome: boolean
}

export const DEFAULT_APPROACH: ApproachConfig = {
  enabled: false,
  stopOffset: { x: -140, y: 0 },
  speed: 600,
  returnHome: true,
}

// ── หนึ่งแอ็กชัน (ตีธรรมดา / สกิล 1 / สกิล 2) ──
export interface ActionConfig {
  /** ส่วนแรกของท่าแบบ 3 ส่วน (s_action_attack_1) — ท่าแบบคู่เป็น null */
  castPre: string | null
  cast: string | null                // คลิปช่วงร่าย (null = ไม่มีช่วงร่าย)
  release: string                    // คลิปช่วงปล่อยจริง
  releaseFrame: number               // เฟรมที่ดาเมจ/กระสุนออก นับจากต้นคลิป cast
  castSpeedCap: number | null        // เพดานเวลาช่วงร่าย (วินาที) — เกินกว่านี้เร่งอัตโนมัติ
  /**
   * auto   = คำนวณจุดปล่อย/จุดตกจากข้อมูลเกมตามกฎของ Kiwi (ค่าตั้งต้น)
   * manual = ใช้ muzzle / impactOffset ที่ตั้งเองแทน — ลำดับเวลาและการเล่นยังเป็นกฎเดิมทั้งหมด
   */
  positioning: 'auto' | 'manual'
  /**
   * ความเร็วกระสุนที่ตั้งเอง (หน่วยเดียวกับ moveSpeed ของข้อมูลเกม = ระยะต่อ 1 ติ๊ก)
   * null = ใช้ค่าจากข้อมูลเกม · มีผลเฉพาะท่าที่เป็นกระสุนบิน
   */
  moveSpeedOverride: number | null
  /**
   * กระสุนเฉียงตามทิศจากจุดปล่อยไปจุดกระทบ (ยิงเป้าที่อยู่สูง/ต่ำกว่า = หัวกระสุนชี้ไปทางนั้น · ทางโค้ง = หมุนตามโค้ง)
   * ไม่ระบุ/false = แบบเดิม (แนวนอนตามข้อมูลเกม)
   */
  aimTilt?: boolean
  /** หมุนเพิ่ม (องศา · + = ตามเข็ม) ตอนเปิด aimTilt — แก้กระสุนที่รูปเริ่มต้นไม่ได้หันขวาตรงๆ */
  aimTiltOffset?: number
  /** finish (ระเบิดตอนถึงเป้า) เฉียงตามทิศตอนกระสุนถึงด้วย — ใช้ได้เมื่อเปิด aimTilt เท่านั้น */
  aimTiltFinish?: boolean
  /** เดินเข้าไปหาเป้าก่อนร่าย */
  approach: ApproachConfig
  muzzle: Vec2                       // [slot space] จุดที่กระสุนออกจากตัวเรา (เทียบจากเท้าเรา)
  impactOffset: Vec2                 // [slot space] จุดที่กระสุนไปตก (เทียบจากเท้าของเป้า)
  /**
   * แยกตำแหน่ง finish (ระเบิด) ออกจากปลายทางของ normal (กระสุน)
   * false = finish เล่นที่ปลายทางกระสุน (กฎเดิม) · true = finish เล่นที่ finishOffset
   */
  finishSplit: boolean
  /** [slot space] จุดเล่น finish เมื่อ finishSplit — ฐานเดียวกับ impactOffset (เท้าเป้า / เท้าผู้ร่ายถ้าเป็นบัฟ) */
  finishOffset: Vec2
  /** ใช้เฉพาะตอนไม่มีข้อมูลเกมของท่านี้ (เช่นตัวละครที่สร้างเองในอนาคต) */
  projectile: ProjectileConfig | null
}

// ── คลิปสถานะที่ไม่ใช่แอ็กชัน ──
export interface StateClips {
  idle: string
  walk: string | null
  hitLight: string | null            // โดนตีเบา
  hitHeavy: string | null            // โดนตีหนัก / คริ
  stun: string | null                // ค้างเฟรมสุดท้ายของคลิปนี้ระหว่างติดสตัน
  die: string | null
}

/**
 * ค่าพลัง — อัตราต่างๆ เป็น % (เช่น crit 25 = 25%)
 * เพดานที่ใช้จริงในการรบ (กันตัวละครเป็นอมตะ) อยู่ที่ play/battle.ts
 */
export interface Stats {
  hp: number
  atk: number
  def: number
  spd: number
  crit: number          // Critical Rate
  critDmg: number       // Critical Damage (150 = ดาเมจ ×1.5 · ไม่มีเพดาน)
  evade: number         // Evade Rate — หลบการโจมตีปกติ
  hit: number           // Hit Rate — หักล้าง Evade ของเป้า
  skillEvade: number    // Skill Evade Rate — หลบสกิลโจมตี
  skillHit: number      // Skill Hit Rate — หักล้าง Skill Evade ของเป้า
  skillRes: number      // Skill Resistance — ต้านผลด้านลบของสกิล (ชะงัก ลดพลัง ฯลฯ)
  /** Skill Damage Resistance — ลดดาเมจที่ได้รับ "จากสกิล" (%) · ไม่ระบุ = 0 */
  skillDmgRes?: number
}

/** แถวของช่องในแมพ (มาจากตำแหน่งที่วางในหน้าจัดทีม ไม่ได้เก็บใน config) */
export type Row = 'front' | 'back'
export type { Element, Category, Role } from './rangerClass'

export interface RangerConfig {
  schemaVersion: 10
  id: string
  name: string
  form: 'body' | 'e-body'
  fps: number
  element: Element
  /** ชนิด: str พลัง / agi ว่องไว / int ไหวพริบ (ตีเวท) */
  category: Category
  /** ตำแหน่ง: แทงค์ ไฟเตอร์ นักยิง นักฆ่า นักเวท ซัพพอร์ต */
  role: Role
  anchors: {
    ground: Vec2                     // [sprite space] จุดบนภาพที่เป็นเท้า — ใช้เลื่อนตัวละครให้ยืนตรงช่อง
    hitPoint: Vec2                   // [slot space] จุดที่ถูกโจมตี — เป้าของกระสุนคนอื่น
    overhead: Vec2                   // [slot space] จุดวางตัวเลขดาเมจ / ไอคอนบัฟ
  }
  clips: StateClips
  actions: Record<ActionName, ActionConfig>
  stats: Stats
  /** ความสามารถของสกิลในการรบ (แยกจาก actions ที่เป็นเรื่องอนิเมชั่น) */
  skills: Record<SkillSlot, SkillDef>
  /** พาสซีฟพิเศษประจำตัว (lib/passives.ts) — ติดตัวตลอดเกม ไม่ต้องร่าย · ไม่มี = ไม่มีพาสซีฟ */
  passives?: PassiveDef[]
  /** [พิกเซลของ thumb.png] จุดกึ่งกลางกรอบรูปหน้า (ขนาดคงที่ — lib/portrait.ts) · ไม่ตั้ง = เดาจากหัว */
  face?: Vec2
  /** อนุมัติแล้ว = ตั้งค่าเสร็จ พร้อมเล่น → แสดงในหน้าจัดทีม (ไม่มี = ยังไม่อนุมัติ) */
  approved?: boolean
  /** คัตซีนตอนร่ายสกิล (lib/cutin.ts) · ไม่มี/ปิด = ไม่มีคัตซีน */
  cutins?: Partial<Record<SkillSlot, CutinConfig>>
  /** เลิกใช้ — ตำแหน่งรูปหน้าแบบแรก (พิกัดไฟล์ .sam) ใช้กับ thumb.png ไม่ได้ จึงไม่อ่านแล้ว */
  portrait?: Vec2
}

// ── ค่าเริ่มต้น ──

const V0 = (): Vec2 => ({ x: 0, y: 0 })

const DEFAULT_STATS: Stats = {
  hp: 4000, atk: 400, def: 250, spd: 100,
  crit: 5, critDmg: 150, evade: 5, hit: 5, skillEvade: 5, skillHit: 5, skillRes: 10, skillDmgRes: 0,
}

// จับคู่ชื่อคลิปจริงในไฟล์เข้ากับบทบาทที่เกมต้องใช้
// เป็นการแมป "ชื่อ" ล้วนๆ ไม่ใช่การเดาตำแหน่งจากภาพ — ตำแหน่งทั้งหมดตั้งเองใน editor
// ท่าแบบ 3 ส่วน: part1 + part2 = ช่วงร่าย, part3 = ช่วงปล่อยจริงและพักท่า
const ACTION_CLIPS: Record<ActionName, { castPre?: string; cast: string; release: string }[]> = {
  attack: [
    { cast: 'attack_ready', release: 'attack' },
  ],
  skill1: [
    { cast: 's_attack_ready', release: 's_attack' },
    { castPre: 's_action_attack_1', cast: 's_action_attack_2', release: 's_action_attack_3' },
  ],
  skill2: [
    { cast: 's2_attack_ready', release: 's2_attack' },
    { castPre: 's2_action_attack_1', cast: 's2_action_attack_2', release: 's2_action_attack_3' },
  ],
}

/**
 * ความเร็วกระสุนเริ่มต้น (world unit ต่อวินาที)
 *
 * ถอดมาจากค่าที่ใช้จริงในโปรเจคเดิม:
 *   PROJECTILE_FALLBACK_SPEED 30 × PROJECTILE_SPEED_SCALE (2.1 × 1.95) = 122.85 หน่วย/เฟรม
 *   ที่ 30 fps จึงเป็น ~3685 หน่วย/วินาที
 * กระสุนในเกมต้นฉบับเร็วมาก — ระยะยิงปกติ ~840 หน่วยใช้เวลาแค่ ~0.23 วินาที
 * (ค่าเดิมที่ผมตั้งไว้คือ 900 ซึ่งช้ากว่าของจริงราว 4 เท่า)
 */
export const DEFAULT_PROJECTILE_SPEED = 3685

/** ค่าเดิมที่เคยตั้งผิดไว้ — ใช้ตรวจตอนย้ายเวอร์ชันว่าควรแทนด้วยค่าที่ถูก */
const LEGACY_PROJECTILE_SPEED = 900

const defaultProjectile = (asset: BulletAsset): ProjectileConfig => ({
  asset, mode: 'flight', path: 'straight', arcHeight: null,
  speed: DEFAULT_PROJECTILE_SPEED, rotate: 'none', fitFlight: false,
})

/** เฟรมนี้มีภาพให้เห็นไหม (มีชิ้นส่วนที่ alpha > 0 และอ้างรูปที่มีจริง) */
function frameHasArt(sam: SAMParser, frame: SamFrame): boolean {
  for (const [, resNum, , color] of frame) {
    if (color[3] > 0 && resNum < sam.images.length) return true
  }
  return false
}

/**
 * ความยาวจริงของช่วงร่าย โดยตัดเฟรมท้ายที่ไม่มีภาพออก
 *
 * บางตัวละครหายตัวไปก่อนช่วงร่ายจะจบ (ท่าวาป/ดำดิน) เฟรมท้ายๆ จึงว่างเปล่า
 * ถ้ารอจนครบช่วงร่ายจริง กระสุนจะออกช้ากว่าที่ควรโดยไม่มีอะไรให้ดูระหว่างนั้น
 * เช่น u1229h-poseidon s2_attack_ready ยาว 40 เฟรม แต่ 17 เฟรมท้ายว่าง (หายตัวที่เฟรม 23)
 * → คืน 23 กระสุนจึงออกทันทีที่ตัวละครหายตัว เร็วขึ้น 0.57 วินาที
 * ตัวที่ไม่มีเฟรมว่าง (ส่วนใหญ่) ได้ค่าเดิมไม่เปลี่ยน
 */
export function readyLengthUntilVanish(sam: SAMParser, ...castClips: (string | null | undefined)[]): number {
  // ท่าแบบ 3 ส่วนนับ part1 + part2 ต่อกันเป็นช่วงร่ายเดียว
  const frames = castClips.flatMap(c => (c ? sam.animations[c] ?? [] : []))
  let n = frames.length
  while (n > 0 && !frameHasArt(sam, frames[n - 1])) n--
  return n
}

function pickAction(sam: SAMParser, name: ActionName, bullets: string[]): ActionConfig {
  const has = (n: string) => !!sam.animations[n]?.length
  // มีไฟล์กระสุนของแอ็กชันนี้ = ตัวนี้ยิงไกล ใส่ค่าเริ่มต้นให้เลย
  const bullet = DEFAULT_BULLET[name]
  const projectile = bullets.includes(bullet) ? defaultProjectile(bullet) : null

  for (const c of ACTION_CLIPS[name]) {
    if (has(c.release)) {
      const castPre = c.castPre && has(c.castPre) ? c.castPre : null
      const castClip = has(c.cast) ? c.cast : null
      return {
        castPre,
        cast: castClip,
        release: c.release,
        // ค่าเริ่มต้น = รอยต่อช่วงร่าย→ปล่อย แต่ตัดเฟรมท้ายที่ว่างเปล่าออกก่อน
        releaseFrame: readyLengthUntilVanish(sam, castPre, castClip),
        castSpeedCap: null,
        positioning: 'auto',
        moveSpeedOverride: null,
        approach: { ...DEFAULT_APPROACH, stopOffset: { ...DEFAULT_APPROACH.stopOffset } },
        muzzle: V0(),
        impactOffset: V0(),
        finishSplit: false,
        finishOffset: V0(),
        projectile,
      }
    }
  }
  // ไม่มีคลิปของแอ็กชันนี้ — ยืม idle ไปก่อน ให้ editor เตือนทีหลัง
  return {
    castPre: null, cast: null, release: sam.animNames.find(n => n === 'idle') ?? sam.animNames[1] ?? '_all',
    releaseFrame: 0, castSpeedCap: null, positioning: 'auto', moveSpeedOverride: null,
    approach: { ...DEFAULT_APPROACH, stopOffset: { ...DEFAULT_APPROACH.stopOffset } },
    muzzle: V0(), impactOffset: V0(), finishSplit: false, finishOffset: V0(), projectile,
  }
}

/**
 * สร้าง config เริ่มต้นจากไฟล์ .sam ที่เพิ่งถอดมา — แมปชื่อคลิปให้ ส่วนพิกัดเป็น 0 รอตั้งเอง
 * @param bullets ไฟล์กระสุนที่มีจริงของตัวนี้ (เช่น ['bul','bul3']) — มีกระสุน = ตั้งเป็นตัวยิงไกลให้เลย
 */
export function defaultRangerConfig(
  id: string, sam: SAMParser, bullets: string[] = [], form: 'body' | 'e-body' = 'body',
): RangerConfig {
  const has = (n: string) => (sam.animations[n]?.length ? n : null)
  return {
    schemaVersion: 10,
    id,
    name: id,
    form,
    fps: sam.animRate || 30,
    element: 'fire',
    // ยิงกระสุนได้ → นักยิง · ไม่มีกระสุน → ไฟเตอร์ (เปลี่ยนได้ในแท็บทั่วไป)
    category: bullets.includes('bul') ? 'agi' : 'str',
    role: bullets.includes('bul') ? 'shooter' : 'fighter',
    anchors: { ground: V0(), hitPoint: V0(), overhead: V0() },
    clips: {
      idle: has('idle') ?? sam.animNames[1] ?? '_all',
      walk: has('walk'),
      hitLight: has('target'),
      hitHeavy: has('knockback'),
      stun: has('target'),
      die: has('knockback'),
    },
    actions: {
      attack: pickAction(sam, 'attack', bullets),
      skill1: pickAction(sam, 'skill1', bullets),
      skill2: pickAction(sam, 'skill2', bullets),
    },
    stats: { ...DEFAULT_STATS },
    skills: defaultSkills(bullets.includes('bul') ? 'shooter' : 'fighter'),
  }
}

// ── แปลงไฟล์เวอร์ชันเก่าให้เข้ากับโครงสร้างปัจจุบัน ──
// v1 → v2: hitPoint/overhead/muzzle ย้ายจาก sprite space เป็น slot space (ลบ ground ออก)
// v2 → v3: projectile เพิ่ม mode/fitFlight และ arcHeight เปลี่ยนเป็น null = คำนวณเอง
// v3 → v4: แก้ความเร็วกระสุนที่เคยตั้งไว้ผิด (900 → 3685) เฉพาะตัวที่ยังเป็นค่าเดิมเป๊ะ
// v4 → v5: เพิ่ม positioning (auto = กฎของ Kiwi) และ castPre (ท่าแบบ 3 ส่วน)
//          แอ็กชันที่ผู้ใช้เคยตั้งจุดปล่อย/จุดตกไว้เอง → manual เพื่อไม่ทับงานที่ทำไว้
// v5 → v6: เพิ่ม moveSpeedOverride (null = ใช้ความเร็วจากข้อมูลเกม)
// v6 → v7: เพิ่ม approach (เดินเข้าไปหาเป้าก่อนโจมตี — ปิดไว้เป็นค่าตั้งต้น)
// v7 → v8: เพิ่ม finishSplit / finishOffset (แยกจุดระเบิดออกจากปลายทางกระสุน — ปิดไว้)
// v8 → v9: ธาตุ red/blue/green → fire/water/wood · ลบ row + attackRange แทนด้วย category + role
// v9 → v10: ค่าพลังชุดใหม่ (ลบ matk/mdef/eff/res · เพิ่ม evade/hit/skillEvade/skillHit/skillRes)
//           เพิ่ม skills (สกิลเริ่มต้นตามตำแหน่ง)
export function migrateRangerConfig(raw: RangerConfig): RangerConfig {
  const ver = (raw as { schemaVersion?: number }).schemaVersion ?? 1
  if (ver >= 10) return raw
  const v9 = ver >= 9 ? raw : migrateToV9(raw)
  type OldStats = Partial<Stats> & { matk?: number; mdef?: number; eff?: number; res?: number }
  const old = (v9.stats ?? {}) as OldStats
  const magicRole = v9.role === 'mage' || v9.role === 'support'
  return {
    ...v9,
    schemaVersion: 10,
    stats: {
      hp: old.hp ?? DEFAULT_STATS.hp,
      // สายเวทเคยตั้ง ATK เวทไว้ → ใช้เป็น ATK
      atk: magicRole && (old.matk ?? 0) > (old.atk ?? 0) ? old.matk! : old.atk ?? DEFAULT_STATS.atk,
      def: old.def ?? DEFAULT_STATS.def,
      spd: old.spd ?? DEFAULT_STATS.spd,
      crit: old.crit ?? DEFAULT_STATS.crit,
      critDmg: old.critDmg ?? DEFAULT_STATS.critDmg,
      evade: old.evade ?? DEFAULT_STATS.evade,
      hit: old.hit ?? DEFAULT_STATS.hit,
      skillEvade: old.skillEvade ?? DEFAULT_STATS.skillEvade,
      skillHit: old.skillHit ?? DEFAULT_STATS.skillHit,
      skillRes: old.skillRes ?? old.res ?? DEFAULT_STATS.skillRes,
    },
    skills: v9.skills ?? defaultSkills(v9.role),
  }
}

/** v1 → v9 (ขั้นก่อนหน้า) — เรียกจาก migrateRangerConfig เท่านั้น */
function migrateToV9(raw: RangerConfig): RangerConfig {
  const ver = (raw as { schemaVersion?: number }).schemaVersion ?? 1
  if (ver >= 9) return raw
  const v8 = migrateToV8(raw)
  const old = v8 as RangerConfig & { row?: string; attackRange?: string; element: string }
  const ELEMENT_RENAME: Record<string, Element> = { red: 'fire', blue: 'water', green: 'wood', light: 'light', dark: 'dark' }
  const ranged = old.attackRange === 'ranged'
  const { row: _row, attackRange: _range, ...rest } = old
  void _row; void _range
  return {
    ...rest,
    schemaVersion: 10,   // ถึง v9 แล้ว — migrateRangerConfig แปลงเป็น v10 ต่อทันที
    element: ELEMENT_RENAME[old.element] ?? (ELEMENTS.includes(old.element as Element) ? old.element as Element : 'fire'),
    category: old.category ?? (ranged ? 'agi' : 'str'),
    role: old.role ?? (ranged ? 'shooter' : 'fighter'),
    // ค่าพลังเก่าคงไว้ตามเดิม — ขั้น v10 แปลงเป็นชุดใหม่ต่อทันที
    stats: { ...old.stats } as Stats,
  }
}

/** v1 → v8 (ขั้นก่อนหน้า) — เรียกจาก migrateRangerConfig เท่านั้น */
function migrateToV8(raw: RangerConfig): RangerConfig {
  const ver = (raw as { schemaVersion?: number }).schemaVersion ?? 1
  if (ver >= 8) return raw
  const fillLate = (a: ActionConfig): ActionConfig => ({
    ...a,
    moveSpeedOverride: a.moveSpeedOverride ?? null,
    finishSplit: a.finishSplit ?? false,
    finishOffset: a.finishOffset ?? { ...a.impactOffset },
    approach: a.approach
      ? { ...DEFAULT_APPROACH, ...a.approach, stopOffset: { ...(a.approach.stopOffset ?? DEFAULT_APPROACH.stopOffset) } }
      : { ...DEFAULT_APPROACH, stopOffset: { ...DEFAULT_APPROACH.stopOffset } },
  })
  if (ver >= 5) {
    return {
      ...raw,
      schemaVersion: 10,   // ถึง v8 แล้ว — migrateRangerConfig แปลงต่อจนถึงเวอร์ชันล่าสุด
      actions: Object.fromEntries(ACTION_NAMES.map(n => [n, fillLate(raw.actions[n])])) as Record<ActionName, ActionConfig>,
    }
  }

  const g = raw.anchors.ground
  const toSlot = (v: Vec2): Vec2 => ({ x: v.x - g.x, y: v.y - g.y })
  const needsSlotMove = ver < 2

  const fixProjectile = (p: ProjectileConfig | null): ProjectileConfig | null => {
    if (!p) return null
    const old = p as Partial<ProjectileConfig> & { arcHeight?: number | null }
    return {
      asset: p.asset,
      mode: old.mode ?? 'flight',
      path: old.path ?? 'straight',
      // ของเดิม arcHeight = 0 หมายถึง "ยังไม่ได้ตั้ง" → เปลี่ยนเป็น null ให้คำนวณเอง
      arcHeight: old.arcHeight === undefined || old.arcHeight === 0 ? null : old.arcHeight,
      // ค่า 900 คือค่าเริ่มต้นเก่าที่ตั้งผิด (ช้ากว่าของจริง ~4 เท่า) ไม่ใช่ค่าที่ใครตั้งเอง
      // → แทนด้วยค่าที่ถูก ส่วนตัวที่จูนเองไว้เป็นเลขอื่นไม่แตะ
      speed: old.speed === undefined || old.speed === LEGACY_PROJECTILE_SPEED
        ? DEFAULT_PROJECTILE_SPEED
        : old.speed,
      rotate: old.rotate ?? 'none',
      fitFlight: old.fitFlight ?? false,
    }
  }

  return {
    ...raw,
    schemaVersion: 10,   // ถึง v8 แล้ว — migrateRangerConfig แปลงต่อจนถึงเวอร์ชันล่าสุด
    anchors: {
      ground: g,
      hitPoint: needsSlotMove ? toSlot(raw.anchors.hitPoint) : raw.anchors.hitPoint,
      overhead: needsSlotMove ? toSlot(raw.anchors.overhead) : raw.anchors.overhead,
    },
    actions: Object.fromEntries(ACTION_NAMES.map(n => {
      const a = raw.actions[n] as ActionConfig & { positioning?: 'auto' | 'manual'; castPre?: string | null }
      const muzzle = needsSlotMove ? toSlot(a.muzzle) : a.muzzle
      return [n, {
        ...a,
        castPre: a.castPre ?? null,
        moveSpeedOverride: a.moveSpeedOverride ?? null,
        approach: fillLate(a).approach,
        finishSplit: fillLate(a).finishSplit,
        finishOffset: fillLate(a).finishOffset,
        muzzle,
        projectile: fixProjectile(a.projectile),
        positioning: a.positioning ?? (wasHandSet(muzzle, a.impactOffset, g) ? 'manual' : 'auto'),
      }]
    })) as Record<ActionName, ActionConfig>,
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.05

/**
 * ผู้ใช้เคยลากตั้งตำแหน่งเองหรือยัง
 * muzzle ที่ยังไม่เคยตั้งจะเป็น (0,0) หรือ (-ground) — อย่างหลังเกิดจากการแปลง v1→v2
 * ของค่า (0,0) ที่ยังไม่ได้ตั้ง จึงไม่นับว่าตั้งเอง
 */
function wasHandSet(muzzle: Vec2, impact: Vec2, ground: Vec2): boolean {
  const muzzleUnset = (near(muzzle.x, 0) && near(muzzle.y, 0))
    || (near(muzzle.x, -ground.x) && near(muzzle.y, -ground.y))
  const impactUnset = near(impact.x, 0) && near(impact.y, 0)
  return !muzzleUnset || !impactUnset
}

/**
 * จุดยืนที่ยังไม่เคยตั้ง (0,0) → ใช้ "เงา" ที่หาได้จากไฟล์เป็นค่าเริ่มต้น
 * ค่าที่ใช้จริงไม่เปลี่ยน (ระบบใช้เงาแทนอยู่แล้วตอนยังไม่ตั้ง) แต่หมุด/ช่องตัวเลขใน editor
 * จะเริ่มที่เงาแทนที่จะไปอยู่มุมภาพ · จุดโดนตี/เหนือหัวเก็บแบบเทียบจุดยืน จึงไม่ขยับตาม
 */
export function withDefaultGround(cfg: RangerConfig, shadow: Vec2 | null): RangerConfig {
  const g = cfg.anchors.ground
  if (!shadow || g.x !== 0 || g.y !== 0) return cfg
  const r = (n: number) => Math.round(n * 10) / 10
  return { ...cfg, anchors: { ...cfg.anchors, ground: { x: r(shadow.x), y: r(shadow.y) } } }
}

/**
 * จุดที่ต้องส่งให้ renderSAMFrame เพื่อให้ "เท้า" ของตัวละครไปอยู่ตรง slot พอดี
 * @param slot ตำแหน่งช่องยืนในแมพ (world unit)
 * @param flipX ตัวละครหันกลับด้านไหม — เวลามิเรอร์ แกน x ของ ground จะกลับทิศ
 */
export function drawOriginFor(cfg: RangerConfig, slot: Vec2, flipX = false): Vec2 {
  const g = cfg.anchors.ground
  return {
    x: flipX ? slot.x + g.x : slot.x - g.x,
    y: slot.y - g.y,
  }
}
