// ====================================================
// battle.ts — กติกาการรบ 5v5 (ไม่แตะภาพ ไม่แตะเวลาจริง)
//
//   • ค่าพลังที่ใช้ = ค่าที่ตั้งไว้ + โบนัสตามแถวที่วาง (lib/formation.ts)
//   • ตำแหน่ง (role) มีความสามารถพิเศษติดตัว (lib/roleTraits.ts) เช่น นักฆ่าตีข้ามแถวได้ · แทงค์รับดาเมจลด
//   • ลำดับเทิร์น (แบบ Honkai: Star Rail): Action Value — AV = 10000 / Speed · ค่าต่ำสุดได้เล่นก่อน
//       - ความเร็วเปลี่ยน (บัฟ/ดีบัฟ/หมดเวลา) → มีผลทันที: AV ที่เหลือ × Speed เดิม / Speed ใหม่
//       - ดึงเทิร์น X% → AV ลด X% ของ 10000/Speed (100% = ได้เล่นต่อทันที) · ใช้กับตัวเองไม่ได้
//   • พลังงานทีม (แชร์ทั้งทีม): เริ่ม 3 สูงสุด 10 · ตีปกติ +1 · สกิลใช้ตาม Cost ที่ตั้งในสกิล
//   • ตีปกติ: เดี่ยว แถวหน้าก่อน 100% ATK · หลบได้ด้วย Evade (หักด้วย Hit ของผู้ตี)
//   • สกิลโจมตี: หลบได้ด้วย Skill Evade (หักด้วย Skill Hit) · ผลด้านลบต้านได้ด้วย Skill Resistance
//   • บาเรีย: กันตีปกติและสกิลทุกอย่าง ยกเว้นสกิลที่มี "ยกเลิกทักษะอมตะ" (ทะลุ + ทำลายบาเรีย) · ไม่กันดาเมจต่อเนื่อง
//   • ดาเมจต่อเนื่อง (พิษ/ไฟไหม้/เลือดไหล): ต้นเทิร์นของตัวที่ติด โดน % ของ ATK ผู้ใส่ (ค่า ณ ตอนใส่) หัก DEF · ธาตุ
//       ไม่คริ ไม่หลบ · คนละชนิดติดพร้อมกันได้ · ชนิดเดียวกันใส่ซ้ำ = แทนที่
//   • ชะงัก/ห้ามสกิลจากสกิลวงกว้าง ติดยากกว่า: ทั้งแถว ×0.7 · ทั้งหมด ×0.5 (คูณกับโอกาสหลังหักต้านทาน)
//   • แถวหน้าบัง: ตราบใดที่แถวหน้ายังมีตัวเหลืออยู่ ท่าเล็ง "แถวหน้าก่อน" จะตีแถวหลังไม่ได้เลย (นักฆ่าข้ามได้)
//   • ยั่วยุ (taunt): ศัตรูต้องใช้ "ตีธรรมดา" ใส่ตัวที่ยั่วยุเท่านั้น (สกิลยังเลือกเป้าได้ตามปกติ)
//   • เปราะบาง/ความทนทาน: ตัวคูณดาเมจที่เป้ารับ (แทนการลด/เพิ่ม DEF) · ต้านความเสียหายสกิลลดเฉพาะดาเมจจากสกิล
//   • เร่งเทิร์นของเป้า (turnBurn): บัฟ/ดีบัฟของเป้าหมดไวขึ้น n เทิร์น · ดาเมจต่อเนื่องทำงานทันที n ครั้ง
//   • ลดการฟื้นฟู: ลดผลฮีล/ฟื้นฟูต่อเนื่อง/ดูดเลือดตาม % (100% = ฟื้นไม่ได้เลย)
//   • ดาเมจอิงเลือดผู้ร่าย (damageHp): ฐาน = HP สูงสุดของผู้ร่าย แทน ATK (หัก DEF/ธาตุ/คริ เหมือนกัน)
//   • เพิกเฉยโล่ขาว x%: ดาเมจส่วนนั้นข้ามโล่ลงเลือดตรงๆ (0 = โล่กันก่อนตามปกติ · 100 = ข้ามทั้งหมด)
//   • เปลี่ยนธาตุ: เป้ากลายเป็นธาตุอื่นชั่วคราว — ตัวคูณธาตุใช้ธาตุที่เปลี่ยนแล้วทั้งฝั่งตีและฝั่งรับ
//   • แลกของผู้ร่าย: เสียเลือดตัวเอง % ของ HP สูงสุด (ไม่ตาย) หรือทำตัวเองเปราะบางชั่วคราว
//   • ฮีล/โล่: เลือกสเกลได้ — เลือดเป้า (ปกติ) · เลือดผู้ร่าย · ATK ผู้ร่าย
//   • พาสซีฟพิเศษประจำตัว (lib/passives.ts): ลอบสังหาร · ดูดเลือด · อึด · ATK/คริ/ความเร็ว/ฮีล ติดตัว
//   • ห้ามฟื้นฟู: กันการฟื้นเลือดทุกแบบ (ฮีล · ฟื้นฟูต่อเนื่อง · ดูดเลือด) — โล่ยังได้
//   • ดูดเลือด (ความสามารถของสกิลโจมตี): ฟื้นเลือดรวม % ของดาเมจของท่า แบ่งเท่าๆ กันให้ ตัวเอง / แถวตัวเอง / เพื่อนทั้งหมด
//   • เพิ่ม Cost ให้ทีม: ได้สุทธิไม่เกิน +1 ต่อท่า (Cost ของสกิล + 1) — กันสกิลปั๊มพลังงานไม่จำกัด
//   • โล่: รับดาเมจแทน HP จนหมด
//   • ความเสียหายจริง: % ของ ATK ลงเลือดตรงๆ — ไม่สนโล่ · ไม่หัก DEF · ไม่คริ ไม่สุ่ม ไม่มีธาตุ/ตำแหน่ง (ติดเพดานต่อครั้ง)
//       บาเรียอมตะยังกัน · หลบได้เหมือนดาเมจอื่นของสกิล
//   • ดาเมจ: ATK(±บัฟ) × % × (1 − DEF/(DEF+800)) × ธาตุ × คริ × ตำแหน่ง × สุ่ม 0.85–1.15 × DAMAGE_SCALE × ต่อเวลา
//   • ต่อเวลา: เลยเทิร์น 48 ดาเมจแรงขึ้น 6% ต่อเทิร์น (กันเกมยืด — เกมทีมสุ่มจบราวเทิร์น 42–45)
//   • ครบ TURN_LIMIT เทิร์นแล้วยังไม่จบ → บังคับจบ: ทีมที่เหลือเลือด % มากกว่าชนะ · ห่างกันไม่ถึง TIME_UP_DRAW_PCT = เสมอ
//     (นับถอยหลังในฉากก็ตัดสินแบบเดียวกัน — ตอนนี้ปิดไว้)
//   • กันชะงักรัว: หายชะงักแล้ว ติดชะงักซ้ำไม่ได้จนจบเทิร์นถัดไปของตัวเอง
//   • สถานะนับเทิร์นของ "ตัวที่ได้รับ" · เทิร์นที่ได้รับไม่นับ · ได้ซ้ำประเภทเดิม = แทนที่ของเดิม
//   • แถวพิเศษ (อัญเชิญ): ทีมละไม่เกิน RESERVE_MAX ตัว ไม่ลงสนาม ไม่มีเทิร์น ไม่โดนตี ไม่นับเลือดทีม
//       ถึงตาใครก็ได้ในทีม → ใช้ท่าตัวเอง หรืออัญเชิญตัวแถวพิเศษมาร่ายสกิล 1/2 ของมันแทน (เสีย Cost ตามสกิลนั้น · ไม่ได้ +1)
//       ตัวที่อัญเชิญ: ค่าพลังดิบ (ไม่ได้โบนัสแถวหน้า/หลัง) · ไม่มีบัฟ/สถานะใดๆ · ยืนแถวเดียวกับผู้อัญเชิญ (บัฟแถว = แถวนั้น)
//       บัฟตัวเอง / ดูดเลือดเข้าตัวเอง → ไปที่ผู้อัญเชิญ (ตัวอัญเชิญกลับไปทันที) · ดึงเทิร์นใช้กับผู้อัญเชิญไม่ได้
//       ใช้แล้วติดคูลดาวน์ RESERVE_COOLDOWN เทิร์นของทีม (อีกตัวยังเรียกได้) · ผู้อัญเชิญติดห้ามใช้ทักษะ = อัญเชิญไม่ได้
//   • สุ่มด้วย seed — ค่าเริ่มเดียวกันได้ผลเหมือนเดิมทุกครั้ง
// ====================================================

import type { ActionName, Category, Element, Role, Row, Stats } from '@/lib/rangerConfig'
import { elementMultiplier } from '@/lib/rangerClass'
import { traitOf } from '@/lib/roleTraits'
import { defaultSkills, type EffectType, type LifestealScope, type SkillArea, type SkillDef, type SkillEffect, type SkillSlot } from '@/lib/skills'
import { statsWithPosition } from '@/lib/formation'
import { passiveSum, type PassiveDef } from '@/lib/passives'
import { BattleAI } from './ai'
import { playableIdentityOfRanger, type AssetVariantId, type CharacterId, type ClassId } from '@/lib/characterModel'
import type { AbilityCondition, BattleRulesV1, GameplayClass, GameplayEffectType } from '@/lib/gameplaySchema'
import { gameplayNormalAttackSkill } from '@/lib/gameplayAdapter'

/** smart = ให้คะแนนทุกทางเลือก · basic = แบบเดิม (สุ่มท่า ตีตัวเลือดน้อยสุด) · random = สุ่มล้วน */
export type AiLevel = 'smart' | 'basic' | 'random'

export type Team = 0 | 1

export interface UnitSetup {
  /** 舊存檔／舊呼叫端相容欄位。新程式不要把它當成 Character id。 */
  rangerId: string
  characterId?: CharacterId
  classId?: ClassId
  assetVariantId?: AssetVariantId
  /** RangerEpic Gameplay V1 combat definition. When present, it is authoritative over legacy combat stats. */
  gameplayClass?: GameplayClass
  gameplayRules?: BattleRulesV1
  row: Row
  /** ช่องในแถว: แถวหน้า 0–1, แถวหลัง 0–2 */
  lane: number
  stats: Stats
  /** ไม่ระบุ = ไม่มีผลเรื่องธาตุ (×1) */
  element?: Element
  category?: Category
  role?: Role
  /** ไม่ระบุ = สกิลเริ่มต้นของตำแหน่ง (ไม่มีตำแหน่ง = ไฟเตอร์) */
  skills?: Record<SkillSlot, SkillDef>
  /** พาสซีฟพิเศษประจำตัว (lib/passives.ts) */
  passives?: PassiveDef[]
  /** เลเวลฮีโร่ — ไว้แสดงใต้หลอดเลือดเท่านั้น (ค่าพลังใน stats คิดเลเวลมาแล้ว) · ไม่ระบุ = 1 */
  level?: number
}

/** ผลที่ค้างอยู่บนตัว (มีเทิร์น) */
export type DotType = 'poison' | 'burn' | 'bleed'
export type StatusType =
  | 'stun' | 'skillEvadeDown' | 'skillResDown' | 'evadeDown' | 'atkDown' | 'healBlock' | 'silence'
  | 'speedDown' | 'critDown' | 'critDmgDown' | 'hitDown' | 'skillHitDown' | 'vulnerable' | 'sealCleanse' | 'elementShift' | DotType
  | 'atkUp' | 'regen' | 'shield' | 'barrier' | 'evadeUp' | 'skillEvadeUp' | 'skillResUp'
  | 'speedUp' | 'critDmgUp' | 'critUp' | 'hitUp' | 'skillHitUp' | 'toughUp' | 'skillDmgResUp' | 'taunt'

export const DOT_TYPES: DotType[] = ['poison', 'burn', 'bleed']
export const isDot = (t: StatusType): t is DotType => (DOT_TYPES as StatusType[]).includes(t)
export const DEBUFF_TYPES: StatusType[] = [
  'vulnerable', 'sealCleanse', 'elementShift',
  'stun', 'skillEvadeDown', 'skillResDown', 'evadeDown', 'atkDown', 'healBlock', 'silence',
  'speedDown', 'critDown', 'critDmgDown', 'hitDown', 'skillHitDown', ...DOT_TYPES,
]
export const isDebuff = (t: StatusType): boolean => DEBUFF_TYPES.includes(t)
const STATUS_EFFECTS = new Set<EffectType>([
  ...DEBUFF_TYPES,
  'atkUp', 'regen', 'shield', 'barrier', 'evadeUp', 'skillEvadeUp', 'skillResUp', 'speedUp', 'critDmgUp', 'critUp', 'hitUp', 'skillHitUp',
  'toughUp', 'skillDmgResUp', 'taunt',
])
/** สถานะควบคุม — จากสกิลวงกว้างติดยากกว่า (AREA_CONTROL_CHANCE) */
const CONTROL_TYPES = new Set<StatusType>(['stun', 'silence'])
/** โอกาสติดสถานะควบคุมตามความกว้างของสกิล (คูณกับโอกาสหลังหักต้านทาน) */
export const AREA_CONTROL_CHANCE: Partial<Record<SkillArea, number>> = { row: 0.7, all: 0.5 }

export interface Status {
  type: StatusType
  pct: number
  turns: number
  /** โล่ที่เหลือ (HP) */
  shieldHp?: number
  /** เทิร์นของเกมที่ได้รับ — จบเทิร์นนั้นไม่นับถอยหลัง */
  appliedTurn: number
  /** ดาเมจต่อเนื่อง: ATK ของผู้ใส่ ณ ตอนใส่ + ธาตุผู้ใส่ */
  srcAtk?: number
  srcElement?: Element
  /** เปลี่ยนธาตุ: ธาตุใหม่ของตัวที่ติดสถานะ */
  element?: Element
}

export interface Unit {
  uid: string
  /** 舊相容欄位；目前等同 assetVariantId，未來可能不再相同。 */
  rangerId: string
  characterId: CharacterId
  classId: ClassId
  assetVariantId: AssetVariantId
  gameplayClass?: GameplayClass
  gameplayRules?: BattleRulesV1
  /** เลเวลฮีโร่ (แสดงผลอย่างเดียว) */
  level: number
  team: Team
  row: Row
  lane: number
  hp: number
  maxHp: number
  atk: number
  def: number
  spd: number
  crit: number
  critDmg: number
  evade: number
  hit: number
  skillEvade: number
  skillHit: number
  skillRes: number
  /** ลดดาเมจที่ได้รับจากสกิล (%) */
  skillDmgRes: number
  element?: Element
  category?: Category
  /** ตำแหน่ง — ตัวกำหนดความสามารถพิเศษ (lib/roleTraits.ts) */
  role: Role
  skills: Record<SkillSlot, SkillDef>
  /** พาสซีฟพิเศษประจำตัว — ติดตัวตลอดเกม */
  passives: PassiveDef[]
  statuses: Status[]
  /** กันชะงักรัว: ตื่นจากชะงักแล้วติดชะงักซ้ำไม่ได้จนจบเทิร์นถัดไปของตัวเอง (0 = ติดได้) */
  stunGuard: number
  av: number
  /** Speed ที่ใช้คิด AV ล่าสุด — ความเร็วเปลี่ยนเมื่อไร AV ที่เหลือปรับตามทันที */
  spdNow: number
  alive: boolean
  /** ตัวแถวพิเศษ (อัญเชิญมาร่ายสกิลแล้วกลับ) */
  reserve?: boolean
  /** ตัวแถวพิเศษ: ผู้อัญเชิญครั้งล่าสุด (บัฟตัวเอง/ดูดเลือดไปที่ตัวนี้) */
  summoner?: Unit | null
}

/** ทางเลือกของเทิร์น: ท่าของตัวเอง หรือ caster = ตัวแถวพิเศษที่อัญเชิญมาร่าย action (skill1/skill2) ของมัน */
export interface Plan { action: ActionName; target: Unit; caster?: Unit }

/** แถวพิเศษ: ทีมละกี่ตัว · ใช้แล้วเรียกซ้ำไม่ได้กี่เทิร์นของทีม (ราว 1 รอบของทีม 5 ตัว) */
export const RESERVE_MAX = 2
export const RESERVE_COOLDOWN = 8

export const ENERGY_START = 3
export const ENERGY_MAX = 10
export const ATTACK_ENERGY_GAIN = 1

/**
 * เพดานโอกาสที่ใช้จริง (%) — กันตัวละครเป็นอมตะตีไม่เข้า
 * ค่าพลังตั้งเกินได้ (เผื่อโดนลด) แต่โอกาสหลบ/ต้านจริงไม่เกินค่านี้
 *   หลบตีปกติ 60 · หลบสกิล 60 · ต้านสถานะ 70 · คริ 100 · คริดาเมจไม่มีเพดาน
 * เกม 5v5 เทิร์นละตัว ตัวหนึ่งได้เล่นแค่ไม่กี่ครั้ง ถ้าหลบ/ต้านได้ 90% สกิลแทบไม่มีความหมาย
 */
export const CAPS = { crit: 100, evade: 60, skillEvade: 60, skillRes: 70, skillDmgRes: 60 }

/**
 * ตัวปรับความแรงทั้งเกม — จูนคู่กับ MAX_HIT_RATIO ด้วย scripts/analyze-rules.mjs ให้เกมยาวราว 45 เทิร์น
 * (เดิม 2.1 + เพดาน 40% → ตีโดนเพดาน 31% ของการตีทั้งหมด บัฟ ATK/คริ/ธาตุแทบไม่มีผล)
 */
export const DAMAGE_SCALE = 1.7
/**
 * เพดานดาเมจต่อครั้ง = สัดส่วนของ HP สูงสุดของเป้า — กันตายในทีเดียวจากธาตุ ×2 + คริ + บัฟซ้อนกัน
 * ต่อเวลา (overtime) ยกเพดานขึ้นตามตัวคูณ ไม่งั้นเกมยืดไม่จบ · ตอนนี้โดนเพดาน ~17% ของการตี
 */
export const MAX_HIT_RATIO = 0.5
/**
 * กันเกมยืด (เช่น ซัพพอร์ตฮีล/โล่กันไปมา): เลยเทิร์นนี้ไป ดาเมจทุกอย่างแรงขึ้นทีละ OVERTIME_STEP ต่อเทิร์น
 * เกมปกติจบก่อนถึง (ดู scripts/sim-balance.mjs)
 */
export const OVERTIME_TURN = 48
export const OVERTIME_STEP = 0.06
/**
 * เพดานเทิร์นทั้งเกม (นับทุกตัวที่ได้เล่น) — จบเทิร์นนี้แล้วยังไม่มีผู้ชนะ = ตัดสินที่เลือด
 * จำลอง 6,000 เกมทีมสุ่ม (scripts/analyze-rules.mjs): เกมปกติจบราวเทิร์น 42 (p90 70) · เพดาน 80 ตัดจบ ~3.5% ที่ยืดจริงๆ
 */
export const TURN_LIMIT = 80
/** หมดเวลา/ครบเทิร์นแล้วเลือดคงเหลือ (% ของเลือดเต็มทั้งทีม) ห่างกันไม่ถึงค่านี้ = เสมอ */
export const TIME_UP_DRAW_PCT = 0.1
const AV_BASE = 10000
const DEF_K = 800
/** ลดพลังโจมตีได้ต่ำสุดเหลือกี่ส่วน */
const MIN_ATK_RATIO = 0.2
/** ลดความเร็วได้ต่ำสุดเหลือกี่ส่วน */
const MIN_SPD_RATIO = 0.5

/** ตีปกติ = สกิลโจมตีเดี่ยวแถวหน้าก่อน 100% (ใช้ Evade แทน Skill Evade) */
export const NORMAL_ATTACK: SkillDef = { kind: 'attack', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }] }

export interface Outcome {
  uid: string
  damage: number
  crit: boolean
  killed: boolean
  elementMult: number
  evaded: boolean
  /** โดนบาเรียกัน */
  immune: boolean
  barrierBroken: boolean
  shieldAbsorbed: number
  healed: number
  /** ผลด้านลบที่ต้านได้ */
  resisted: StatusType[]
  /** สถานะที่ได้รับสำเร็จ */
  applied: StatusType[]
  dispelled: number
  cleansed: number
  /** ส่วนของดาเมจที่เป็นความเสียหายจริง (ไม่ผ่านโล่ · รวมอยู่ใน damage แล้ว) */
  trueDamage: number
  /** โดนดึงเทิร์น (ได้เล่นเร็วขึ้น) */
  advanced: boolean
  /** โดนเร่งเทิร์น (บัฟ/ดีบัฟหมดไวขึ้น) */
  burned: boolean
  /** HP ก่อนโดนท่านี้ (ใช้ตัดสินแอนิเมชัน เช่น เลือดตกผ่านครึ่งหลอด) */
  hpBefore: number
}

/**
 * คาดการณ์ผลของท่ากับเป้า 1 ตัว (ใช้แสดงไกด์ก่อนกด) — ไม่สุ่ม ไม่คิดหลบ ไม่คิดคริ ไม่คิดต้านสถานะ
 * damage = ดาเมจรวม (โล่รับก่อน แล้วค่อยเลือด) · heal/shield = ค่าที่จะได้จริง (ฮีลไม่เกินเลือดที่หาย)
 */
export interface ActionPreview {
  uid: string
  /** ดาเมจรวม (รวมความเสียหายจริง) */
  damage: number
  /** ส่วนที่เป็นความเสียหายจริง — ลงเลือดตรงๆ ไม่ผ่านโล่ */
  trueDamage: number
  /** โดนบาเรียกัน (ท่าไม่มี "ยกเลิกทักษะอมตะ") */
  immune: boolean
  heal: number
  shield: number
  /** สถานะที่จะติด/ได้ (ดีบัฟจากท่าโจมตี หรือบัฟจากท่าบัฟ) */
  statuses: { type: StatusType; pct: number; turns: number }[]
  dispel: boolean
  cleanse: boolean
}

/** ไกด์: ส่วนที่โล่/เลือดจะหาย (ดาเมจปกติเข้าโล่ก่อน · ความเสียหายจริงลงเลือดตรง) */
export function previewLoss(p: { damage: number; trueDamage?: number }, hp: number, shield: number): { shieldLoss: number; hpLoss: number; ko: boolean } {
  const tr = Math.min(p.trueDamage ?? 0, p.damage)
  const normal = p.damage - tr
  const shieldLoss = Math.min(shield, normal)
  const hpLoss = Math.min(hp, normal - shieldLoss + tr)
  return { shieldLoss, hpLoss, ko: hp > 0 && hpLoss >= hp }
}

export interface ActionResult {
  outcomes: Outcome[]
  energyGained: number
  /** ดูดเลือด: เลือดที่ฟื้นให้แต่ละตัว (รวมความสามารถไฟเตอร์) */
  lifesteal: { uid: string; amount: number }[]
}

export interface TurnStart {
  stunned: boolean
  regen: number
  /** ดาเมจต่อเนื่องที่โดนต้นเทิร์นนี้ (แยกชนิด) */
  dots: { type: DotType; damage: number }[]
  /** ดาเมจต่อเนื่องรวม */
  dot: number
  /** ล้มเพราะดาเมจต่อเนื่อง */
  killed: boolean
}

/** ผลของตีครั้งเดียว (ใช้ในเทส / เครื่องมือ) */
export interface HitResult { damage: number; crit: boolean; killed: boolean; elementMult: number }

/** mulberry32 — สุ่มแบบกำหนดผลได้ */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const emptyOutcome = (uid: string, hpBefore = 0): Outcome => ({
  uid, hpBefore, damage: 0, crit: false, killed: false, elementMult: 1, evaded: false, immune: false, barrierBroken: false,
  shieldAbsorbed: 0, healed: 0, resisted: [], applied: [], dispelled: 0, cleansed: 0, trueDamage: 0, advanced: false, burned: false,
})

export class Battle {
  units: Unit[]
  energy: [number, number] = [ENERGY_START, ENERGY_START]
  /** RangerEpic Gameplay V1: each team shares one 0..100 skill gauge. */
  gameplayGauge: [number, number] = [0, 0]
  turn = 0
  private rand: () => number

  /** แถวพิเศษของแต่ละทีม (ไม่อยู่ใน units — ไม่มีเทิร์น ไม่โดนตี) */
  reserves: [Unit[], Unit[]] = [[], []]
  /** คูลดาวน์ที่เหลือ (เทิร์นของทีม) ต่อตัวแถวพิเศษ */
  reserveCd: Record<string, number> = {}

  constructor(teams: [UnitSetup[], UnitSetup[]], seed = 1, reserves: [UnitSetup[], UnitSetup[]] = [[], []]) {
    this.rand = rng(seed)
    this.ai = new BattleAI(this, this.rand)
    this.units = []
    teams.forEach((list, t) => {
      list.forEach((u, i) => {
        // โบนัสตามตำแหน่งที่วาง (แถวหน้าถึก / แถวหลังตีแรง) — ดู lib/formation.ts
        // Gameplay V1 has no hidden row stat bonuses; the class JSON is authoritative.
        const s = u.gameplayClass ? u.stats : statsWithPosition(u.stats, u.row, u.lane)
        // SPD เท่ากันจะเสมอกันตลอด — บวกเศษเล็กน้อยให้ลำดับแน่นอน สลับกันเล่นทีละทีม
        const spd = Math.max(1, s.spd) + (5 - i) * 0.01 + (t === 0 ? 0.001 : 0)
        this.units.push(this.makeUnit(u, t as Team, s, spd, `${t}-${u.row}-${u.lane}`))
      })
    })
    // แถวพิเศษ: ค่าพลังดิบ (ไม่มีโบนัสแถว) · ไม่มีเทิร์น
    reserves.forEach((list, t) => {
      list.slice(0, RESERVE_MAX).forEach((u, i) => {
        const r = this.makeUnit(u, t as Team, u.stats, Math.max(1, u.stats.spd), `${t}-sup-${i}`)
        r.reserve = true
        r.lane = i
        this.reserves[t as Team].push(r)
        this.reserveCd[r.uid] = 0
      })
    })
    this.startEnergy()
  }

  private makeUnit(u: UnitSetup, t: Team, s: Stats, spd: number, uid: string): Unit {
    const legacy = playableIdentityOfRanger(u.assetVariantId ?? u.rangerId)
    return {
      uid,
      rangerId: u.rangerId,
      characterId: u.characterId ?? legacy.characterId,
      classId: u.classId ?? legacy.classId,
      assetVariantId: u.assetVariantId ?? legacy.assetVariantId,
      gameplayClass: u.gameplayClass,
      gameplayRules: u.gameplayRules,
      level: u.level ?? 1,
      team: t as Team,
      row: u.row,
      lane: u.lane,
      hp: s.hp,
      maxHp: s.hp,
      atk: s.atk,
      def: s.def,
      spd,
      crit: s.crit,
      critDmg: s.critDmg,
      evade: s.evade ?? 0,
      hit: s.hit ?? 0,
      skillEvade: s.skillEvade ?? 0,
      skillHit: s.skillHit ?? 0,
      skillRes: s.skillRes ?? 0,
      skillDmgRes: s.skillDmgRes ?? 0,
      element: u.element,
      category: u.category,
      role: u.role ?? 'fighter',
      skills: u.skills ?? defaultSkills(u.role ?? 'fighter'),
      passives: u.passives ?? [],
      statuses: [],
      stunGuard: 0,
      av: AV_BASE / spd,
      spdNow: spd,
      alive: true,
    }
  }

  // ── แถวพิเศษ (อัญเชิญ) ──

  reserveOf(uid: string): Unit | undefined {
    return this.reserves[0].find(r => r.uid === uid) ?? this.reserves[1].find(r => r.uid === uid)
  }

  /** คูลดาวน์ที่เหลือ (0 = เรียกได้) */
  reserveCooldown(r: Unit): number { return this.reserveCd[r.uid] ?? 0 }

  /** เตรียมตัวแถวพิเศษให้ร่ายในนามผู้อัญเชิญ: ยืนแถวเดียวกัน · เลือดเต็ม · ไม่มีบัฟ/สถานะใดๆ */
  prepareSummon(summoner: Unit, r: Unit): void {
    r.row = summoner.row
    r.summoner = summoner
    r.statuses = []
    r.hp = r.maxHp
    r.alive = true
  }

  /** อัญเชิญ r มาร่าย action ได้ไหม (คูลดาวน์หมด · Cost พอ · ผู้อัญเชิญไม่ติดห้ามใช้ทักษะ) */
  canSummon(summoner: Unit, r: Unit, action: ActionName): boolean {
    if (action === 'attack' || !summoner.alive || r.team !== summoner.team) return false
    if (this.has(summoner, 'silence') || this.reserveCooldown(r) > 0) return false
    return this.energy[summoner.team] >= this.costOf(r, action)
  }

  /** จ่าย Cost + เริ่มคูลดาวน์ (ผู้อัญเชิญไม่ได้ +1 แบบตีปกติ) */
  commitSummon(summoner: Unit, r: Unit, action: ActionName): void {
    this.prepareSummon(summoner, r)
    const t = summoner.team
    this.energy[t] = clamp(this.energy[t] - this.costOf(r, action), 0, ENERGY_MAX)
    this.reserveCd[r.uid] = RESERVE_COOLDOWN
  }

  /** ทำตามแผนของเทิร์น (ท่าตัวเอง หรืออัญเชิญ) — จ่าย Cost แล้วลงผล */
  perform(actor: Unit, plan: Plan): ActionResult {
    if (plan.caster) {
      this.commitSummon(actor, plan.caster, plan.action)
      return this.resolveAction(plan.caster, plan.action, plan.target)
    }
    this.commitAction(actor, plan.action)
    return this.resolveAction(actor, plan.action, plan.target)
  }

  /** พลังงานเริ่มเกมของทีม = ค่าเริ่ม + โบนัสตำแหน่ง (ซัพพอร์ต) */
  private startEnergy(): void {
    for (const t of [0, 1] as Team[]) {
      const bonus = Math.max(0, ...this.units.filter(u => u.team === t).map(u => u.gameplayClass ? 0 : (traitOf(u.role).energyBonus ?? 0)))
      this.energy[t] = Math.min(ENERGY_MAX, ENERGY_START + bonus)
    }
  }

  /** ความสามารถพิเศษของตำแหน่งตัวนี้ */
  trait(u: Unit) { return traitOf(u.role) }

  unit(uid: string): Unit | undefined {
    return this.units.find(u => u.uid === uid)
  }

  /** ผลตอนหมดเวลา (null = ยังไม่หมดเวลา) */
  timeUpResult: { winner: Team | null; pct: [number, number] } | null = null

  get winner(): Team | null {
    if (this.timeUpResult) return this.timeUpResult.winner
    const alive = (t: Team) => this.units.some(u => u.team === t && u.alive)
    if (!alive(1)) return 0
    if (!alive(0)) return 1
    return null
  }

  /** เกมจบแล้ว (มีผู้ชนะ หรือหมดเวลาเสมอ) */
  get over(): boolean {
    return this.timeUpResult !== null || this.winner !== null
  }

  get isDraw(): boolean {
    return this.timeUpResult !== null && this.timeUpResult.winner === null
  }

  /** เลือดคงเหลือของทีม เป็น % ของเลือดเต็มทั้งทีม (โล่ไม่นับ) */
  hpPct(team: Team): number {
    const list = this.units.filter(u => u.team === team)
    const max = list.reduce((n, u) => n + u.maxHp, 0)
    const hp = list.reduce((n, u) => n + (u.alive ? u.hp : 0), 0)
    return max ? (hp / max) * 100 : 0
  }

  /** หมดเวลา: ตัดสินที่เลือดคงเหลือ % · ห่างกันไม่ถึง TIME_UP_DRAW_PCT = เสมอ (เรียกซ้ำได้ ผลเดิม) */
  timeUp(): { winner: Team | null; pct: [number, number] } {
    if (this.timeUpResult) return this.timeUpResult
    const pct: [number, number] = [this.hpPct(0), this.hpPct(1)]
    const winner: Team | null = Math.abs(pct[0] - pct[1]) < TIME_UP_DRAW_PCT ? null : pct[0] > pct[1] ? 0 : 1
    this.timeUpResult = { winner, pct }
    return this.timeUpResult
  }

  // ── ค่าที่ใช้จริง (รวมบัฟ/ดีบัฟ) ──

  has(u: Unit, type: StatusType): boolean {
    return u.statuses.some(s => s.type === type)
  }
  private pctOf(u: Unit, type: StatusType): number {
    return u.statuses.filter(s => s.type === type).reduce((n, s) => n + s.pct, 0)
  }
  /** พาสซีฟประจำตัวชนิดนี้รวมกี่ % */
  passive(u: Unit, type: Parameters<typeof passiveSum>[1]): number { return passiveSum(u.passives, type) }

  isGameplayUnit(u: Unit): boolean { return !!u.gameplayClass }

  gameplayGaugeMax(u: Unit): number {
    return Math.max(1, u.gameplayRules?.skillGaugeMax ?? 100)
  }

  gameplayGaugeOf(team: Team): number { return this.gameplayGauge[team] }

  private conditionMatches(u: Unit, condition: AbilityCondition): boolean {
    const numberCompare = (actual: number, expected: number): boolean => {
      switch (condition.operator ?? '=') {
        case '<': return actual < expected
        case '<=': return actual <= expected
        case '=': return actual === expected
        case '>=': return actual >= expected
        case '>': return actual > expected
      }
    }
    const expected = typeof condition.value === 'number' ? condition.value : Number(condition.value)
    switch (condition.type) {
      case 'selfHpPercent':
        return numberCompare(u.maxHp > 0 ? u.hp / u.maxHp * 100 : 0, expected)
      case 'allyAliveCount':
        return numberCompare(this.units.filter(x => x.team === u.team && x.alive).length, expected)
      case 'enemyAliveCount':
        return numberCompare(this.units.filter(x => x.team !== u.team && x.alive).length, expected)
      case 'round':
        return numberCompare(this.turn, expected)
      case 'hasShield': {
        const actual = this.has(u, 'shield') ? 1 : 0
        return numberCompare(actual, Number.isFinite(expected) ? expected : 1)
      }
      case 'hasStatus':
      case 'statusType':
        return typeof condition.value === 'string' && u.statuses.some(s => s.type === condition.value)
      // Event-scoped conditions require the full V2 event runtime and must not be guessed here.
      case 'receivedDamage':
      default:
        return false
    }
  }

  /**
   * Constant effects from Gameplay V1 "whileOnField" abilities.
   * Event-triggered abilities are handled by the dedicated V2 runtime; this bridge
   * intentionally evaluates only continuously-active abilities.
   */
  gameplayAbilityValue(u: Unit, effectType: GameplayEffectType): number {
    const cls = u.gameplayClass
    if (!cls) return 0
    let total = 0
    for (const ability of cls.abilities) {
      if (ability.trigger !== 'whileOnField') continue
      if (!ability.conditions.every(condition => this.conditionMatches(u, condition))) continue
      for (const effect of ability.effects) if (effect.type === effectType) total += effect.value ?? 0
    }
    return total
  }
  /** ธาตุที่ใช้คิดตัวคูณ (โดนเปลี่ยนธาตุอยู่ = ใช้ธาตุใหม่) */
  effElement(u: Unit): Element | undefined {
    return u.statuses.find(s => s.type === 'elementShift')?.element ?? u.element
  }
  effAtk(u: Unit): number {
    const gameplayUp = this.gameplayAbilityValue(u, 'attackUp')
    return u.atk * (1 + this.passive(u, 'atkUp') / 100) * Math.max(MIN_ATK_RATIO, 1 + (gameplayUp + this.pctOf(u, 'atkUp') - this.pctOf(u, 'atkDown')) / 100)
  }
  effSpd(u: Unit): number { return u.spd * (1 + this.passive(u, 'speedUp') / 100) * Math.max(MIN_SPD_RATIO, 1 + (this.pctOf(u, 'speedUp') - this.pctOf(u, 'speedDown')) / 100) }
  effCrit(u: Unit): number { return clamp(u.crit + this.passive(u, 'critUp') + this.gameplayAbilityValue(u, 'critRateUp') + this.pctOf(u, 'critUp') - this.pctOf(u, 'critDown'), 0, CAPS.crit) }
  /** คริดาเมจ (%) — ลดได้ต่ำสุด 100 (คริแล้วไม่เบากว่าตีปกติ) */
  effCritDmg(u: Unit): number { return Math.max(100, u.critDmg + this.gameplayAbilityValue(u, 'critDamageUp') + this.pctOf(u, 'critDmgUp') - this.pctOf(u, 'critDmgDown')) }
  /** ฟื้นเลือดได้ไหม (โดนห้ามฟื้นฟู = ไม่ได้ทุกแบบ) */
  canHeal(u: Unit): boolean { return u.alive && this.healFactor(u) > 0 }
  effEvade(u: Unit): number { return u.evade + this.pctOf(u, 'evadeUp') - this.pctOf(u, 'evadeDown') }
  /** ความแม่นยำ (ตีปกติ) — ติดลบได้ (โดนลด → ศัตรูหลบได้ง่ายขึ้นแม้หลบน้อย) */
  effHit(u: Unit): number { return u.hit + this.pctOf(u, 'hitUp') - this.pctOf(u, 'hitDown') }
  effSkillEvade(u: Unit): number { return u.skillEvade + this.pctOf(u, 'skillEvadeUp') - this.pctOf(u, 'skillEvadeDown') }
  effSkillHit(u: Unit): number { return u.skillHit + this.pctOf(u, 'skillHitUp') - this.pctOf(u, 'skillHitDown') }
  effSkillRes(u: Unit): number { return u.skillRes + this.pctOf(u, 'skillResUp') - this.pctOf(u, 'skillResDown') }
  effSkillDmgRes(u: Unit): number { return u.skillDmgRes + this.pctOf(u, 'skillDmgResUp') }
  /**
   * ตัวคูณดาเมจที่ "เป้า" รับ: เปราะบาง − ความทนทาน (แทน DEF ขึ้น/ลง) · ดาเมจจากสกิลหักต้านความเสียหายสกิลอีกชั้น
   * (ลดได้ต่ำสุดเหลือ 10% — กันตีไม่เข้าเลย)
   */
  takenMult(target: Unit, isSkill: boolean): number {
    const amp = Math.max(0.1, 1 + (this.pctOf(target, 'vulnerable') - this.pctOf(target, 'toughUp') - this.passive(target, 'tough')) / 100)
    const res = isSkill ? 1 - clamp(this.effSkillDmgRes(target), 0, CAPS.skillDmgRes) / 100 : 1
    const gameplayReduction = 1 - clamp(this.gameplayAbilityValue(target, 'damageReduction'), 0, 100) / 100
    return amp * res * gameplayReduction
  }
  /** ฟื้นเลือดได้กี่ส่วน (โดนลดการฟื้นฟู 100% = 0) */
  healFactor(u: Unit): number {
    if (!this.has(u, 'healBlock')) return 1
    const cut = this.pctOf(u, 'healBlock') || 100
    return Math.max(0, 1 - cut / 100)
  }

  /** โอกาสหลบจริง (%) หลังหักความแม่นยำและติดเพดาน */
  evadeChance(attacker: Unit, target: Unit, normal: boolean): number {
    // Gameplay V1 hitRate is a direct hit probability and has no Evade stat.
    if (attacker.gameplayClass) return clamp(100 - this.effHit(attacker), 0, 100)
    return normal
      ? clamp(this.effEvade(target) - this.effHit(attacker), 0, CAPS.evade)
      : clamp(this.effSkillEvade(target) - this.effSkillHit(attacker), 0, CAPS.skillEvade)
  }
  resistChance(target: Unit): number {
    // Gameplay V1 has no hidden Skill Resistance.
    return target.gameplayClass ? 0 : clamp(this.effSkillRes(target), 0, CAPS.skillRes)
  }

  // ── เทิร์น ──

  /** ตัวที่จะได้เล่นต่อไป — เดินเวลาไปจนมีคน AV ถึง 0 */
  nextActor(): Unit | null {
    if (this.over) return null
    const alive = this.units.filter(u => u.alive)
    const actor = alive.reduce((a, b) => (b.av < a.av ? b : a))
    const dt = actor.av
    for (const u of alive) u.av -= dt
    actor.spdNow = this.effSpd(actor)
    actor.av = AV_BASE / actor.spdNow
    this.turn++
    return actor
  }

  /**
   * ความเร็วเปลี่ยน → AV ที่เหลือปรับทันที (กฎ Honkai: Star Rail): AV × Speed เดิม / Speed ใหม่
   * เรียกหลังสถานะเปลี่ยนทุกครั้ง (ลงผลท่า · จบเทิร์น) — ตัวที่ความเร็วไม่เปลี่ยนไม่กระทบ
   */
  syncSpeed(): void {
    for (const u of this.units) {
      if (!u.alive) continue
      const now = this.effSpd(u)
      if (Math.abs(now - u.spdNow) < 1e-9) continue
      u.av = u.av * u.spdNow / now
      u.spdNow = now
    }
  }

  /** ดึงเทิร์น: AV ลด pct% ของ 10000/Speed (ไม่ต่ำกว่า 0 = ได้เล่นต่อทันที) */
  advance(u: Unit, pct: number): void {
    u.av = Math.max(0, u.av - (pct / 100) * AV_BASE / this.effSpd(u))
  }

  /** ลำดับเทิร์นล่วงหน้า n ตัว (ไม่เปลี่ยนสถานะจริง) */
  previewOrder(n: number): Unit[] {
    return this.previewSchedule(n).map(e => e.unit)
  }

  /**
   * ลำดับเทิร์นถัดไป n ตา พร้อม "เวลารอ" ของแต่ละตา (หน่วย AV นับจากตอนนี้)
   * ยิ่งช้า = เวลารอยิ่งมาก — HUD ใช้ระยะนี้วางช่องบนรางลำดับเทิร์น
   */
  previewSchedule(n: number): { unit: Unit; wait: number }[] {
    const sim = this.units.filter(u => u.alive).map(u => ({ u, av: u.av }))
    const out: { unit: Unit; wait: number }[] = []
    if (!sim.length) return out
    let elapsed = 0
    for (let i = 0; i < n; i++) {
      const next = sim.reduce((a, b) => (b.av < a.av ? b : a))
      const dt = next.av
      elapsed += dt
      for (const s of sim) s.av -= dt
      next.av = AV_BASE / this.effSpd(next.u)
      out.push({ unit: next.u, wait: elapsed })
    }
    return out
  }

  /** ต้นเทิร์น: ดาเมจต่อเนื่อง → ฟื้นฟูต่อเนื่อง (ถ้าไม่โดนห้าม) · เช็คชะงัก */
  beginTurn(u: Unit): TurnStart {
    const dots: TurnStart['dots'] = []
    let dot = 0
    for (const s of u.statuses.filter(st => isDot(st.type))) {
      if (!u.alive) break
      const damage = this.dotTick(u, s)
      const o = emptyOutcome(u.uid, u.hp)
      this.takeDamage(u, damage, o)
      dots.push({ type: s.type as DotType, damage })
      dot += damage
    }
    let regen = 0
    const r = u.statuses.find(s => s.type === 'regen')
    if (r && this.canHeal(u)) {
      regen = Math.min(u.maxHp - u.hp, Math.round((r.shieldHp ?? u.maxHp * r.pct / 100) * this.healFactor(u)))
      u.hp += regen
    }
    return { stunned: u.alive && this.has(u, 'stun'), regen, dots, dot, killed: !u.alive }
  }

  /** ดาเมจต่อเนื่อง 1 ครั้ง: ATK ผู้ใส่ × % × DEF × ธาตุ × ความแรงเกม (ไม่คริ ไม่สุ่ม · เพดานต่อครั้งเท่าตีปกติ) */
  dotTick(target: Unit, s: Status): number {
    const defFactor = 1 - target.def / (target.def + DEF_K)
    const raw = (s.srcAtk ?? 0) * (s.pct / 100) * defFactor * elementMultiplier(s.srcElement, this.effElement(target))
      * this.damageMult * (traitOf(target.role).damageTaken ?? 1) * this.takenMult(target, false)
    return Math.max(1, Math.round(this.capDamage(raw, target)))
  }

  /** จบเทิร์น: สถานะของตัวนี้ลดลง 1 เทิร์น (ที่เพิ่งได้ในเทิร์นนี้ไม่นับ) */
  endTurn(u: Unit): void {
    for (const r of this.reserves[u.team]) if ((this.reserveCd[r.uid] ?? 0) > 0) this.reserveCd[r.uid]--
    if (u.stunGuard > 0) u.stunGuard--
    const wasStunned = this.has(u, 'stun')
    for (const s of u.statuses) if (s.appliedTurn !== this.turn) s.turns--
    u.statuses = u.statuses.filter(s => s.turns > 0 && !(s.type === 'shield' && (s.shieldHp ?? 0) <= 0))
    // หายชะงักตอนจบเทิร์นนี้ → กันติดซ้ำตลอดเทิร์นถัดไปของตัวเอง
    if (wasStunned && !this.has(u, 'stun')) u.stunGuard = 2
    // บัฟ/ดีบัฟความเร็วหมด → AV ปรับทันที
    this.syncSpeed()
    // ครบเพดานเทิร์น → บังคับจบ ตัดสินที่เลือด
    if (this.turn >= TURN_LIMIT && this.winner === null) this.timeUp()
  }

  /** ตัวคูณดาเมจช่วงต่อเวลา (1 = ยังไม่ถึง) */
  get overtimeMult(): number {
    return 1 + Math.max(0, this.turn - OVERTIME_TURN) * OVERTIME_STEP
  }

  // ── ท่าและเป้า ──

  /** ตีข้ามแถวได้ไหม — ความสามารถของตำแหน่ง (นักฆ่า) ไม่เกี่ยวกับช่องที่วาง */
  canStrikeAnyone(attacker: Unit): boolean {
    return traitOf(attacker.role).strikeAnyone === true
  }

  skillOf(u: Unit, action: ActionName): SkillDef {
    if (action === 'attack' && u.gameplayClass) return gameplayNormalAttackSkill(u.gameplayClass)
    if (action === 'attack') return this.canStrikeAnyone(u) ? { ...NORMAL_ATTACK, area: 'single_any' } : NORMAL_ATTACK
    return u.skills[action]
  }

  costOf(u: Unit, action: ActionName): number {
    if (u.gameplayClass) return 0
    return action === 'attack' ? 0 : Math.max(0, u.skills[action].cost)
  }

  canUse(u: Unit, action: ActionName): boolean {
    if (action === 'attack') return true
    if (u.gameplayClass) {
      if (action === 'skill1') return !this.has(u, 'silence') && this.gameplayGauge[u.team] >= this.gameplayGaugeMax(u)
      // skill2 is the class's normal support action, not the gauge Skill.
      return true
    }
    return !this.has(u, 'silence') && this.energy[u.team] >= this.costOf(u, action)
  }

  targetsAllies(u: Unit, action: ActionName): boolean {
    return this.skillOf(u, action).kind === 'buff'
  }

  /** เป้าที่คลิกเลือกได้ */
  selectableTargets(actor: Unit, action: ActionName): Unit[] {
    const enemies = this.units.filter(u => u.alive && u.team !== actor.team)
    const allies = this.units.filter(u => u.alive && u.team === actor.team)
    const front = enemies.filter(u => u.row === 'front')
    // ยั่วยุ: ตีธรรมดาต้องใส่ตัวที่ยั่วยุเท่านั้น (สกิลไม่เกี่ยว)
    if (action === 'attack') {
      const taunting = enemies.filter(u => this.has(u, 'taunt'))
      if (taunting.length) return taunting
    }
    switch (this.skillOf(actor, action).area) {
      case 'single_front': return front.length ? front : enemies
      case 'single_any': return enemies
      // แถวหน้ายังมีตัวเหลือ → ตีได้แค่แถวหน้า (ต้องเก็บแถวหน้าให้หมดก่อน)
      case 'row': return front.length ? front : enemies
      case 'row_any': return enemies
      case 'all': return enemies
      case 'self': return [actor.summoner ?? actor]
      case 'own_row': return allies.filter(u => u.row === actor.row)
      case 'ally_single': return allies
      case 'ally_all': return allies
    }
  }

  /** เป้าแถวหน้าที่ตีปกติเลือกได้ (ชื่อเดิม ใช้กับของเก่า) */
  validTargets(attacker: Unit): Unit[] {
    return this.selectableTargets(attacker, 'attack')
  }

  /** ทุกตัวที่โดนผล เมื่อเลือกเป้า chosen */
  affectedUnits(actor: Unit, action: ActionName, chosen: Unit): Unit[] {
    const enemies = this.units.filter(u => u.alive && u.team !== actor.team)
    const allies = this.units.filter(u => u.alive && u.team === actor.team)
    switch (this.skillOf(actor, action).area) {
      case 'single_front':
      case 'single_any':
      case 'ally_single': return chosen.alive ? [chosen] : []
      case 'row':
      case 'row_any': return enemies.filter(u => u.row === chosen.row)
      case 'all': return enemies
      case 'self': { const me = actor.summoner ?? actor; return me.alive ? [me] : [] }
      case 'own_row': return allies.filter(u => u.row === actor.row)
      case 'ally_all': return allies
    }
  }

  /** ความฉลาดของออโต้/บอทแต่ละทีม: smart = ให้คะแนนทุกทางเลือก (play/ai.ts) · random = สุ่มท่า */
  aiLevel: [AiLevel, AiLevel] = ['smart', 'smart']
  private ai: BattleAI
  /** AI มองล่วงหน้าด้วยการจำลอง (สำเนาที่ใช้จำลองปิดไว้ — กันจำลองซ้อนจำลอง) */
  aiSearch = true

  /**
   * สำเนาสำหรับ AI ลองเล่นล่วงหน้า: ค่าพลัง/สถานะ/พลังงาน/เทิร์นแยกจากของจริงทั้งหมด · สุ่มด้วย seed ของตัวเอง
   * สกิลใช้ร่วมกับของจริง (อ่านอย่างเดียว) · สำเนาไม่มองล่วงหน้าต่อ
   */
  clone(seed: number): Battle {
    const c = Object.create(Battle.prototype) as Battle
    Object.assign(c, this)
    c.units = this.units.map(u => ({ ...u, statuses: u.statuses.map(s => ({ ...s })) }))
    c.reserves = [this.reserves[0].map(r => ({ ...r, statuses: [] })), this.reserves[1].map(r => ({ ...r, statuses: [] }))]
    c.reserveCd = { ...this.reserveCd }
    c.energy = [this.energy[0], this.energy[1]]
    c.timeUpResult = this.timeUpResult ? { ...this.timeUpResult, pct: [...this.timeUpResult.pct] as [number, number] } : null
    c.aiLevel = [this.aiLevel[0], this.aiLevel[1]]
    c.rand = rng(seed)
    c.ai = new BattleAI(c, c.rand)
    c.aiSearch = false
    return c
  }

  /** สุ่มเลข (ให้ AI ใช้ทำ seed ของการจำลอง — ผลเดิมทุกครั้งที่ seed เกมเดิม) */
  nextRandom(): number { return this.rand() }

  get energyMax(): number { return ENERGY_MAX }
  /** ตัวคูณดาเมจรวมของเกม (ความแรงพื้นฐาน × ต่อเวลา) */
  get damageMult(): number { return DAMAGE_SCALE * this.overtimeMult }

  /** เพดานดาเมจต่อครั้ง (ต่อเวลายกเพดานตาม) */
  capDamage(raw: number, target: Unit): number {
    return Math.min(raw, target.maxHp * MAX_HIT_RATIO * this.overtimeMult)
  }

  /**
   * ตัวคูณดาเมจจากความสามารถของตำแหน่ง
   *   ผู้ตี: นักยิงตีปกติแรงขึ้น · นักเวทสกิลแรงขึ้น · นักฆ่าตีตัวเลือดต่ำกว่าครึ่งแรงขึ้น
   *   ผู้รับ: แทงค์รับดาเมจลดลง
   */
  roleDamageMult(attacker: Unit, target: Unit, normal: boolean): number {
    // Gameplay V1 role is a label only and must not grant legacy hidden combat traits.
    if (attacker.gameplayClass && target.gameplayClass) return 1
    const a = traitOf(attacker.role)
    let m = attacker.gameplayClass ? 1 : (normal ? a.normalDamage ?? 1 : a.skillDamage ?? 1)
    // ไฟเตอร์: ยิ่งเลือดตัวเองน้อยยิ่งแรง
    if (a.desperation) m *= 1 + a.desperation * (1 - attacker.hp / Math.max(1, attacker.maxHp))
    // นักยิง: ตีเป้าที่ยังเลือดเกินครึ่งแรงขึ้น (ล่าตัวถึก)
    if (a.bigTargetDamage && target.hp >= target.maxHp / 2) m *= 1 + a.bigTargetDamage
    if (target.hp < target.maxHp / 2) m *= (a.executeDamage ?? 1) * (1 + this.passive(attacker, 'execute') / 100)
    return m * (target.gameplayClass ? 1 : (traitOf(target.role).damageTaken ?? 1))
  }

  /** ดาเมจเฉลี่ยที่คาดว่าจะเข้า (ไม่สุ่ม ไม่รวมหลบ) — ให้ AI ใช้ประเมิน */
  expectedDamage(attacker: Unit, target: Unit, pct: number, normal = false, base?: number): number {
    const critExp = 1 + (this.effCrit(attacker) / 100) * (this.effCritDmg(attacker) / 100 - 1)
    const defFactor = 1 - target.def / (target.def + DEF_K)
    const raw = (base ?? this.effAtk(attacker)) * (pct / 100) * defFactor * elementMultiplier(this.effElement(attacker), this.effElement(target)) * critExp * this.damageMult
      * this.roleDamageMult(attacker, target, normal) * this.takenMult(target, !normal)
    return this.capDamage(raw, target)
  }

  /** เลือกท่า + เป้าอัตโนมัติของเทิร์นนี้ */
  planAuto(u: Unit): Plan | null {
    if (this.aiLevel[u.team] === 'smart') {
      const c = this.ai.choose(u)
      return c ? { action: c.action, target: c.target, caster: c.caster } : null
    }
    const usable = (['attack', 'skill1', 'skill2'] as ActionName[]).filter(a => this.canUse(u, a))
    const action = usable[Math.floor(this.rand() * usable.length)]
    const list = this.selectableTargets(u, action)
    if (!list.length) return null
    if (this.aiLevel[u.team] === 'random') return { action, target: list[Math.floor(this.rand() * list.length)] }
    // basic: บัฟ → เพื่อนเลือดน้อยสุด (สัดส่วน) · โจมตี → ศัตรูเลือดน้อยสุด
    const ally = this.targetsAllies(u, action)
    return { action, target: list.reduce((a, b) => ((ally ? b.hp / b.maxHp < a.hp / a.maxHp : b.hp < a.hp) ? b : a)) }
  }

  /** ท่าที่ออโต้จะเลือก (ตาม aiLevel ของทีม) */
  autoAction(u: Unit): ActionName {
    return this.planAuto(u)?.action ?? 'attack'
  }

  /** เป้าที่ดีที่สุดของท่านี้ (ใช้ทั้งออโต้ และตอนผู้เล่นกดท่าที่ไม่ต้องเลือกเป้า) */
  autoTarget(u: Unit, action: ActionName = 'attack'): Unit | null {
    return this.ai.bestTarget(u, action)?.target ?? null
  }

  /** จ่าย/ได้พลังงานตอนเริ่มท่า */
  commitAction(u: Unit, action: ActionName): void {
    if (u.gameplayClass) {
      if (action === 'attack') {
        // Gauge is shared by the team. Continuous gauge modifiers from any living
        // ally are combined; negative values reduce gain, positive values increase it.
        const teamModifier = this.units
          .filter(ally => ally.team === u.team && ally.alive && !!ally.gameplayClass)
          .reduce((sum, ally) => sum + this.gameplayAbilityValue(ally, 'skillGaugeGainModifier'), 0)
        const gain = Math.max(0, u.gameplayClass.normalAttack.skillGaugeGain * (1 + teamModifier / 100))
        this.gameplayGauge[u.team] = clamp(
          this.gameplayGauge[u.team] + gain,
          0,
          this.gameplayGaugeMax(u),
        )
      } else if (action === 'skill1') {
        this.gameplayGauge[u.team] = 0
      }
      return
    }
    const t = u.team
    const gain = action === 'attack' ? ATTACK_ENERGY_GAIN : 0
    this.energy[t] = clamp(this.energy[t] - this.costOf(u, action) + gain, 0, ENERGY_MAX)
  }

  // ── ผลของท่า ──

  private addStatus(target: Unit, type: StatusType, pct: number, turns: number, shieldHp?: number, src?: Unit): void {
    target.statuses = target.statuses.filter(s => s.type !== type)
    const st: Status = { type, pct, turns: Math.max(1, turns), shieldHp, appliedTurn: this.turn }
    if (src && isDot(type)) { st.srcAtk = this.effAtk(src); st.srcElement = src.element }
    target.statuses.push(st)
  }

  /**
   * เร่งเทิร์นของเป้า n เทิร์น: ดาเมจต่อเนื่องทำงานทันที n ครั้ง (หรือเท่าที่เหลือ) · ทุกสถานะเหลือเทิร์นน้อยลง n
   * ใช้เผาบัฟอมตะ / ฟื้นฟูต่อเนื่องของศัตรูให้หมดก่อนกำหนด (ทำงานแม้เป้ามีบาเรีย)
   */
  private burnTurns(t: Unit, n: number, o: Outcome): void {
    for (const st of [...t.statuses]) {
      if (isDot(st.type)) {
        for (let i = 0; i < Math.min(n, st.turns) && t.alive; i++) {
          const d = this.dotTick(t, st)
          o.damage += d
          this.takeDamage(t, d, o)
        }
      }
      st.turns -= n
    }
    t.statuses = t.statuses.filter(st => st.turns > 0 && !(st.type === 'shield' && (st.shieldHp ?? 0) <= 0))
    o.burned = true
  }

  /** ดาเมจล้วน (ไม่เช็คหลบ/บาเรีย) — คืนดาเมจ คริ ธาตุ */
  private rollDamage(attacker: Unit, target: Unit, pct: number, normal = false, base?: number): { damage: number; crit: boolean; elementMult: number } {
    const crit = this.rand() * 100 < this.effCrit(attacker)
    if (attacker.gameplayClass) {
      // Gameplay V1 intentionally has no DEF, SPD, elements, role traits, random
      // damage variance, legacy global damage scale, or legacy hit cap.
      const raw = (base ?? this.effAtk(attacker)) * (pct / 100)
        * (crit ? this.effCritDmg(attacker) / 100 : 1)
        * this.takenMult(target, !normal)
      return { damage: Math.max(1, Math.round(raw)), crit, elementMult: 1 }
    }
    const variance = 0.85 + this.rand() * 0.3
    const defFactor = 1 - target.def / (target.def + DEF_K)
    const elementMult = elementMultiplier(this.effElement(attacker), this.effElement(target))
    const raw = (base ?? this.effAtk(attacker)) * (pct / 100) * defFactor * elementMult
      * (crit ? this.effCritDmg(attacker) / 100 : 1) * variance * this.damageMult * this.roleDamageMult(attacker, target, normal)
      * this.takenMult(target, !normal)
    const capped = this.capDamage(raw, target)
    return { damage: Math.max(1, Math.round(capped)), crit, elementMult }
  }

  /** ลงดาเมจโดยเพิกเฉยโล่ขาว pierce% (ส่วนที่เหลือโล่รับก่อนตามปกติ) */
  private dealWithPierce(target: Unit, damage: number, o: Outcome, pierce = 0): void {
    const through = Math.round(damage * Math.max(0, Math.min(100, pierce)) / 100)
    if (through > 0) this.takeDamage(target, through, o, true)
    if (damage - through > 0) this.takeDamage(target, damage - through, o)
  }

  /** ลงดาเมจ: โล่รับก่อน แล้วค่อย HP */
  private takeDamage(target: Unit, damage: number, o: Outcome, ignoreShield = false): void {
    let left = damage
    const shield = ignoreShield ? undefined : target.statuses.find(s => s.type === 'shield')
    if (shield && (shield.shieldHp ?? 0) > 0) {
      const absorb = Math.min(shield.shieldHp!, left)
      shield.shieldHp! -= absorb
      left -= absorb
      o.shieldAbsorbed += absorb
      if (shield.shieldHp! <= 0) target.statuses = target.statuses.filter(s => s !== shield)
    }
    target.hp = Math.max(0, target.hp - left)
    if (target.hp === 0) {
      target.alive = false
      target.statuses = []
      o.killed = true
    }
  }

  /** ฐานของฮีล/โล่ตามสเกลที่เลือก: เลือดเป้า (ปกติ) · เลือดผู้ร่าย · ATK ผู้ร่าย */
  healBase(caster: Unit, target: Unit, e: SkillEffect): number {
    const pct = (e.pct ?? 0) / 100
    const power = (traitOf(caster.role).supportPower ?? 1) * (1 + this.passive(caster, 'healUp') / 100)
    const base = e.scale === 'casterHp' ? caster.maxHp : e.scale === 'casterAtk' ? this.effAtk(caster) : target.maxHp
    return base * pct * power
  }

  /** ฟื้นเลือด amount (ไม่เกินเลือดเต็ม · โดนห้ามฟื้นฟู = 0) — คืนเลือดที่ได้จริง */
  private healUnit(u: Unit, amount: number): number {
    if (!this.canHeal(u) || amount <= 0) return 0
    const got = Math.min(u.maxHp - u.hp, Math.round(amount * this.healFactor(u)))
    u.hp += got
    return got
  }

  /** ตัวที่ได้เลือดจากดูดเลือด ตามขอบเขต */
  lifestealTargets(actor: Unit, scope: LifestealScope): Unit[] {
    const allies = this.units.filter(u => u.alive && u.team === actor.team)
    const me = actor.summoner ?? actor
    return scope === 'ally_all' ? allies : scope === 'own_row' ? allies.filter(u => u.row === actor.row) : me.alive ? [me] : []
  }

  /**
   * ไกด์ก่อนกด: ผลคาดการณ์ของท่านี้กับทุกตัวที่จะโดน
   * chosen = เป้าที่ชี้อยู่ (ได้แค่ตัวที่ท่านั้นเลือกได้) · null = ทุกตัวที่ท่านี้เลือกไปโดนได้
   * ดาเมจ = สูตรเดียวกับของจริง แต่ไม่คริ ไม่สุ่ม ±15% (ค่ากลาง) และไม่คิดหลบ
   */
  previewAction(actor: Unit, action: ActionName, chosen: Unit | null): ActionPreview[] {
    const skill = this.skillOf(actor, action)
    const normal = action === 'attack'
    const pool = this.selectableTargets(actor, action)
    const picks = chosen && pool.includes(chosen) ? [chosen] : pool
    const targets = [...new Set(picks.flatMap(t => this.affectedUnits(actor, action, t)))]
    const breaks = skill.effects.some(e => e.type === 'breakInvincible')
    return targets.map(t => {
      const p: ActionPreview = { uid: t.uid, damage: 0, trueDamage: 0, immune: false, heal: 0, shield: 0, statuses: [], dispel: false, cleanse: false }
      if (skill.kind === 'attack') {
        if (this.has(t, 'barrier') && !breaks) { p.immune = true; return p }
        for (const e of skill.effects) {
          if (e.type === 'damage') p.damage += this.previewHit(actor, t, e.pct ?? 100, normal)
          else if (e.type === 'damageHp') p.damage += this.previewHit(actor, t, e.pct ?? 100, normal, actor.maxHp)
          else if (e.type === 'trueDamage') { const d = this.trueHit(actor, t, e.pct ?? 100); p.damage += d; p.trueDamage += d }
          else if (e.type === 'dispelBuffs') p.dispel = true
          else if (STATUS_EFFECTS.has(e.type)) p.statuses.push({ type: e.type as StatusType, pct: e.pct ?? 0, turns: e.turns ?? 1 })
        }
      } else {
        for (const e of skill.effects) {
          if (e.type === 'heal') p.heal += Math.round(this.healBase(actor, t, e) * this.healFactor(t))
          else if (e.type === 'shield') p.shield += Math.round(this.healBase(actor, t, e))
          else if (e.type === 'cleanse') p.cleanse = true
          else if (STATUS_EFFECTS.has(e.type)) p.statuses.push({ type: e.type as StatusType, pct: e.pct ?? 0, turns: e.turns ?? 1 })
        }
        p.heal = Math.min(p.heal, t.maxHp - t.hp)
      }
      return p
    })
  }

  /** ความเสียหายจริง 1 ครั้ง: ATK × % × ความแรงเกม — ไม่หัก DEF ไม่คริ ไม่สุ่ม ไม่มีธาตุ/ตำแหน่ง (ติดเพดานต่อครั้ง) */
  trueHit(attacker: Unit, target: Unit, pct: number): number {
    if (attacker.gameplayClass) return Math.max(1, Math.round(this.effAtk(attacker) * (pct / 100) * this.takenMult(target, true)))
    return Math.max(1, Math.round(this.capDamage(this.effAtk(attacker) * (pct / 100) * this.damageMult * this.takenMult(target, true), target)))
  }

  /** ดาเมจ 1 ครั้งแบบค่ากลาง: ไม่คริ ไม่สุ่ม (ติดเพดานต่อครั้งเหมือนของจริง) */
  private previewHit(attacker: Unit, target: Unit, pct: number, normal: boolean, base?: number): number {
    if (attacker.gameplayClass) {
      return Math.max(1, Math.round((base ?? this.effAtk(attacker)) * (pct / 100) * this.takenMult(target, !normal)))
    }
    const defFactor = 1 - target.def / (target.def + DEF_K)
    const raw = (base ?? this.effAtk(attacker)) * (pct / 100) * defFactor * elementMultiplier(this.effElement(attacker), this.effElement(target))
      * this.damageMult * this.roleDamageMult(attacker, target, normal) * this.takenMult(target, !normal)
    return Math.max(1, Math.round(this.capDamage(raw, target)))
  }

  /** ใช้ท่า — คำนวณและลงผลกับทุกตัวที่โดน */
  resolveAction(actor: Unit, action: ActionName, chosen: Unit): ActionResult {
    const skill = this.skillOf(actor, action)
    const normal = action === 'attack'
    // กันพลาด: เป้าผิดฝั่ง (สกิลโจมตีเล็งเพื่อน / บัฟเล็งศัตรู) → เปลี่ยนเป็นเป้าที่ดีที่สุดของท่านี้ ไม่ลงผลกับทีมตัวเองเด็ดขาด
    if ((skill.kind === 'attack') === (chosen.team === actor.team)) {
      const fix = this.autoTarget(actor, action)
      if (fix) chosen = fix
    }
    const targets = this.affectedUnits(actor, action, chosen)
    const outcomes: Outcome[] = []
    let energyGained = 0
    const healed = new Map<string, number>()
    const addHeal = (u: Unit, amount: number) => { const got = this.healUnit(u, amount); if (got > 0) healed.set(u.uid, (healed.get(u.uid) ?? 0) + got) }

    // แลกของผู้ร่าย: เสียเลือด / ทำตัวเองเปราะบาง (ครั้งเดียวต่อการร่าย ไม่ใช่ต่อเป้า · ใช้ได้ทั้งสกิลโจมตีและบัฟ)
    for (const e of skill.effects) {
      if (e.type === 'selfHpCost') actor.hp = Math.max(1, actor.hp - Math.round(actor.maxHp * (e.pct ?? 0) / 100))
      else if (e.type === 'selfVulnerable') this.addStatus(actor, 'vulnerable', e.pct ?? 0, e.turns ?? 1)
    }

    if (skill.kind === 'attack') {
      const breaks = skill.effects.some(e => e.type === 'breakInvincible')
      const traitSteal = (traitOf(actor.role).lifesteal ?? 0) + this.passive(actor, 'lifesteal') / 100
      const controlChance = AREA_CONTROL_CHANCE[skill.area] ?? 1
      let dealt = 0
      for (const t of targets) {
        const o = emptyOutcome(t.uid, t.hp)
        outcomes.push(o)
        if (!t.alive) continue
        if (this.rand() * 100 < this.evadeChance(actor, t, normal)) { o.evaded = true; continue }
        if (this.has(t, 'barrier')) {
          // เร่งเทิร์นทำงานแม้โดนบาเรียกัน (ไว้เผาบาเรีย/บัฟให้หมดก่อนกำหนด) — ดาเมจยังโดนกันตามปกติ
          if (!breaks) {
            for (const e of skill.effects) if (e.type === 'turnBurn') this.burnTurns(t, Math.max(1, e.turns ?? 1), o)
            o.immune = true
            continue
          }
          t.statuses = t.statuses.filter(s => s.type !== 'barrier')
          o.barrierBroken = true
        }
        for (const e of skill.effects) {
          if (e.type === 'damage' || e.type === 'damageHp') {
            // damageHp = ฐานเป็น HP สูงสุดของผู้ร่ายแทน ATK
            const base = e.type === 'damageHp' ? actor.maxHp : undefined
            const r = this.rollDamage(actor, t, e.pct ?? 100, normal, base)
            o.damage += r.damage; o.crit ||= r.crit; o.elementMult = r.elementMult
            this.dealWithPierce(t, r.damage, o, e.pierce ?? 0)
            dealt += r.damage
            if (traitSteal > 0) addHeal(actor, r.damage * traitSteal)
          } else if (e.type === 'trueDamage') {
            // ความเสียหายจริง: ลงเลือดตรงๆ ข้ามโล่
            const d = this.trueHit(actor, t, e.pct ?? 100)
            o.damage += d; o.trueDamage += d
            this.takeDamage(t, d, o, true)
            dealt += d
            if (traitSteal > 0) addHeal(actor, d * traitSteal)
          }
        }
        if (!t.alive) continue
        for (const e of skill.effects) {
          if (e.type === 'turnBurn') {
            this.burnTurns(t, Math.max(1, e.turns ?? 1), o)
          } else if (e.type === 'energyGain') {
            const before = this.energy[actor.team]
            const amount = Math.min(e.amount ?? 1, Math.max(0, skill.cost) + 1)
            this.energy[actor.team] = clamp(before + amount, 0, ENERGY_MAX)
            energyGained += this.energy[actor.team] - before
          } else if (e.type === 'dispelBuffs') {
            const before = t.statuses.length
            t.statuses = t.statuses.filter(s => isDebuff(s.type))
            o.dispelled += before - t.statuses.length
          } else if (STATUS_EFFECTS.has(e.type)) {
            const type = e.type as StatusType
            if (type === 'stun' && (t.stunGuard > 0 || this.has(t, 'stun'))) o.resisted.push(type)
            else if (this.rand() * 100 < this.resistChance(t)) o.resisted.push(type)
            else if (CONTROL_TYPES.has(type) && this.rand() >= controlChance) o.resisted.push(type)
            else {
              this.addStatus(t, type, e.pct ?? 0, e.turns ?? 1, undefined, actor)
              if (type === 'elementShift') { const st = t.statuses.find(x => x.type === 'elementShift'); if (st) st.element = e.element }
              o.applied.push(type)
            }
          }
        }
      }
      // ดูดเลือด: % ของดาเมจรวมของท่า แบ่งเท่าๆ กันให้ทุกตัวในขอบเขต (ยอดรวมเท่ากันทุกขอบเขต)
      for (const e of skill.effects) {
        if (e.type !== 'lifesteal' || dealt <= 0) continue
        const list = this.lifestealTargets(actor, e.scope ?? 'self')
        for (const u of list) addHeal(u, dealt * (e.pct ?? 0) / 100 / list.length)
      }
    } else {
      for (const e of skill.effects) {
        if (e.type === 'energyGain') {
          const before = this.energy[actor.team]
          // ได้สุทธิไม่เกิน +1 ต่อท่า (Cost ที่จ่าย + 1)
          const amount = Math.min(e.amount ?? 1, Math.max(0, skill.cost) + 1)
          this.energy[actor.team] = clamp(before + amount, 0, ENERGY_MAX)
          energyGained += this.energy[actor.team] - before
        }
      }
      for (const t of targets) {
        const o = emptyOutcome(t.uid, t.hp)
        outcomes.push(o)
        if (!t.alive) continue
        for (const e of skill.effects) {
          if (e.type === 'heal') {
            o.healed += this.healUnit(t, this.healBase(actor, t, e))
          } else if (e.type === 'cleanse') {
            // โดน "ขัดขวางการล้างผลด้านลบ" อยู่ → ล้างไม่ออก
            if (!this.has(t, 'sealCleanse')) {
              const before = t.statuses.length
              t.statuses = t.statuses.filter(s => !isDebuff(s.type))
              o.cleansed += before - t.statuses.length
            }
          } else if (e.type === 'shield') {
            this.addStatus(t, 'shield', e.pct ?? 0, e.turns ?? 1, Math.round(this.healBase(actor, t, e)))
            o.applied.push('shield')
          } else if (STATUS_EFFECTS.has(e.type)) {
            this.addStatus(t, e.type as StatusType, e.pct ?? 0, e.turns ?? 1)
            // ฟื้นฟูต่อเนื่อง: ล็อกจำนวนเลือดต่อเทิร์นตามสเกลที่เลือก ณ ตอนใส่
            if (e.type === 'regen') {
              const st = t.statuses.find(x => x.type === 'regen')
              if (st) st.shieldHp = Math.round(this.healBase(actor, t, e))
            }
            o.applied.push(e.type as StatusType)
          }
        }
      }
    }
    // สถานะความเร็วเปลี่ยน → AV ปรับทันที · แล้วค่อยดึงเทิร์น (ดึงจากความเร็วใหม่)
    this.syncSpeed()
    if (skill.kind === 'buff') {
      for (const e of skill.effects) {
        if (e.type !== 'actionAdvance') continue
        for (const o of outcomes) {
          const t = this.unit(o.uid)
          // ใช้กับตัวเองไม่ได้ (กันได้เล่นวนไม่จบ)
          if (!t || !t.alive || t === actor || t === actor.summoner) continue
          this.advance(t, e.pct ?? 0)
          o.advanced = true
        }
      }
    }
    return { outcomes, energyGained, lifesteal: [...healed].map(([uid, amount]) => ({ uid, amount })) }
  }

  /** ตีครั้งเดียวแบบไม่เช็คหลบ/บาเรีย (ไว้ทดสอบสูตรดาเมจ) · pct ไม่ระบุ = ตามท่า */
  applyHit(attacker: Unit, target: Unit, action: ActionName, pct?: number): HitResult {
    if (!target.alive) return { damage: 0, crit: false, killed: false, elementMult: 1 }
    const p = pct ?? this.skillOf(attacker, action).effects.find(e => e.type === 'damage')?.pct ?? 100
    const r = this.rollDamage(attacker, target, p, action === 'attack')
    const o = emptyOutcome(target.uid)
    this.takeDamage(target, r.damage, o)
    return { ...r, killed: o.killed }
  }
}
