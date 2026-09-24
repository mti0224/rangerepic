// ====================================================
// skills.ts — นิยามสกิล (ข้อมูลล้วน ไม่มีตรรกะการรบ — การรบอยู่ที่ play/battle.ts)
//
// สกิล 1 ท่า = ประเภท (โจมตี / บัฟ) + ค่า Cost + ความกว้าง + รายการความสามารถ
// ความสามารถแต่ละอย่างมีค่าตัวเลขของมันเอง (pct / turns / amount) และค่าเริ่มต้นที่ใส่ให้ตอนเพิ่มครั้งแรก
// "turns" นับเป็นเทิร์นของตัวที่ได้รับผล (เทิร์นที่ได้รับไม่นับ)
// บางความสามารถมี "ตัวเลือก" (choice) เพิ่ม เช่น ดูดเลือดให้ใคร (ตัวเอง / แถวตัวเอง / เพื่อนทั้งหมด)
// ====================================================

import type { Element } from './rangerClass'

export type SkillKind = 'attack' | 'buff'

export type AttackArea =
  | 'single_front'   // เดี่ยว แถวหน้าก่อน
  | 'single_any'     // เดี่ยว ตัวไหนก็ได้
  | 'row'            // ทั้งแถว (แถวหน้ายังมีตัวอยู่ → ได้แค่แถวหน้า)
  | 'row_any'        // ทั้งแถว เลือกแถวไหนก็ได้ (ไม่ต้องรอแถวหน้าตาย)
  | 'all'            // ศัตรูทั้งหมด
export type BuffArea =
  | 'self'           // ตัวเอง
  | 'own_row'        // เพื่อนแถวเดียวกับตัวเอง (รวมตัวเอง)
  | 'ally_single'    // เพื่อน 1 ตัวที่เลือก
  | 'ally_all'       // เพื่อนทั้งหมด
export type SkillArea = AttackArea | BuffArea

export const AREA_LABEL: Record<SkillArea, string> = {
  single_front: 'โจมตีเดี่ยว (แถวหน้าก่อน)',
  single_any: 'โจมตีเดี่ยว (ตัวไหนก็ได้)',
  row: 'โจมตีทั้งแถว (แถวหน้าก่อน)',
  row_any: 'โจมตีทั้งแถว (เลือกแถวได้)',
  all: 'โจมตีทั้งหมด',
  self: 'บัฟตัวเอง',
  own_row: 'บัฟแถวของตัวเอง',
  ally_single: 'บัฟเพื่อน 1 ตัวที่เลือก',
  ally_all: 'บัฟเพื่อนทั้งหมด',
}
export const AREAS_OF: Record<SkillKind, SkillArea[]> = {
  attack: ['single_front', 'single_any', 'row', 'row_any', 'all'],
  buff: ['self', 'own_row', 'ally_single', 'ally_all'],
}

export type AttackEffectType =
  | 'damage' | 'trueDamage' | 'breakInvincible' | 'stun' | 'skillEvadeDown' | 'skillResDown' | 'evadeDown'
  | 'dispelBuffs' | 'atkDown' | 'healBlock' | 'silence'
  | 'speedDown' | 'critDown' | 'critDmgDown' | 'hitDown' | 'skillHitDown' | 'poison' | 'burn' | 'bleed' | 'lifesteal'
  | 'vulnerable' | 'turnBurn' | 'sealCleanse' | 'damageHp' | 'elementShift' | 'selfHpCost' | 'selfVulnerable'
export type BuffEffectType =
  | 'atkUp' | 'heal' | 'regen' | 'shield' | 'barrier' | 'evadeUp' | 'skillEvadeUp' | 'skillResUp'
  | 'speedUp' | 'actionAdvance' | 'critDmgUp' | 'critUp' | 'hitUp' | 'skillHitUp' | 'cleanse' | 'energyGain'
  | 'toughUp' | 'skillDmgResUp' | 'taunt'
export type EffectType = AttackEffectType | BuffEffectType

export type ParamKey = 'pct' | 'turns' | 'amount' | 'pierce'
export interface ParamDef { label: string; min: number; max: number; step: number; default: number }

/** สเกลของฮีล/โล่: เลือดเป้า (ปกติ) · เลือดผู้ร่าย · ATK ผู้ร่าย */
export type HealScale = 'targetHp' | 'casterHp' | 'casterAtk'
export const HEAL_SCALE_LABEL: Record<HealScale, string> = {
  targetHp: '% ของ HP สูงสุดของเป้า', casterHp: '% ของ HP สูงสุดของผู้ร่าย', casterAtk: '% ของ ATK ผู้ร่าย',
}

/** ดูดเลือดให้ใคร */
export type LifestealScope = 'self' | 'own_row' | 'ally_all'
export const LIFESTEAL_SCOPE_LABEL: Record<LifestealScope, string> = {
  self: 'ฮีลแค่ตัวเอง', own_row: 'ฮีลแถวตัวเอง', ally_all: 'ฮีลเพื่อนทั้งหมด',
}

export interface EffectDef {
  /** 'both' = ใส่ได้ทั้งสกิลโจมตีและสกิลบัฟ */
  kind: SkillKind | 'both'
  label: string
  params: Partial<Record<ParamKey, ParamDef>>
  /** ตัวเลือกเพิ่ม (dropdown): ขอบเขตดูดเลือด · สเกลฮีล/โล่ · ธาตุที่เปลี่ยนเป็น */
  choice?:
    | { key: 'scope'; options: LifestealScope[]; default: LifestealScope }
    | { key: 'scale'; options: HealScale[]; default: HealScale }
    | { key: 'element'; options: Element[]; default: Element }
  /** คำอธิบายสั้นใต้ชื่อใน editor */
  note?: string
}

const pct = (label: string, def: number, max = 100): ParamDef => ({ label, min: 1, max, step: 1, default: def })
const turns = (def: number): ParamDef => ({ label: 'เทิร์น', min: 1, max: 5, step: 1, default: def })

/** ความสามารถทั้งหมด + ค่าเริ่มต้นที่ใส่ให้ตอนเพิ่มครั้งแรก */
export const EFFECTS: Record<EffectType, EffectDef> = {
  // ── โจมตี ──
  damage:          { kind: 'attack', label: 'สร้างความเสียหาย', params: { pct: pct('% ของ ATK', 250, 1000), pierce: { label: 'เพิกเฉยโล่ขาว %', min: 0, max: 100, step: 5, default: 0 } } },
  damageHp:        { kind: 'attack', label: 'ความเสียหายตามเลือดผู้ร่าย', params: { pct: pct('% ของ HP สูงสุดของผู้ร่าย', 10, 100), pierce: { label: 'เพิกเฉยโล่ขาว %', min: 0, max: 100, step: 5, default: 0 } }, note: 'ฐานดาเมจ = HP สูงสุดของผู้ร่าย (ไม่ใช่ ATK) — เหมาะกับตัวถึก · หัก DEF/ธาตุ/คริ ตามปกติ' },
  elementShift:    { kind: 'attack', label: 'เปลี่ยนธาตุของเป้า', params: { turns: turns(2) }, choice: { key: 'element', options: ['fire', 'water', 'wood', 'light', 'dark'], default: 'fire' }, note: 'เป้ากลายเป็นธาตุนี้ชั่วคราว → ใช้แก้ทางธาตุให้ทีมเราตีแรงขึ้น' },
  selfHpCost:      { kind: 'both', label: 'แลกด้วยเลือดตัวเอง', params: { pct: pct('% ของ HP สูงสุดตัวเอง', 10, 50) }, note: 'เสียเลือดตอนร่าย (ไม่ตายจากท่านี้ — เหลืออย่างน้อย 1)' },
  selfVulnerable:  { kind: 'both', label: 'แลกด้วยความเปราะบางของตัวเอง', params: { pct: pct('%', 25, 100), turns: turns(2) }, note: 'ผู้ร่ายรับดาเมจเพิ่มขึ้นชั่วคราว' },
  trueDamage:      { kind: 'attack', label: 'ความเสียหายจริง', params: { pct: pct('% ของ ATK', 100, 1000) }, note: 'ลงเลือดตรงๆ ไม่สนโล่ขาว · ไม่หัก DEF · ไม่คริ · บาเรียอมตะยังกันได้ (ใส่ "ยกเลิกทักษะอมตะ" คู่กันเพื่อทะลุ)' },
  breakInvincible: { kind: 'attack', label: 'ยกเลิกทักษะอมตะ (ทะลุบาเรีย)', params: {} },
  stun:            { kind: 'attack', label: 'ทำให้ชะงัก', params: { turns: turns(1) } },
  skillEvadeDown:  { kind: 'attack', label: 'ลดอัตราหลบทักษะ', params: { pct: pct('%', 20), turns: turns(2) } },
  skillResDown:    { kind: 'attack', label: 'ลดอัตราต้านทักษะ', params: { pct: pct('%', 20), turns: turns(2) } },
  evadeDown:       { kind: 'attack', label: 'ลดอัตราหลบหลีก', params: { pct: pct('%', 20), turns: turns(2) } },
  dispelBuffs:     { kind: 'attack', label: 'ยกเลิกบัฟของศัตรู', params: {} },
  atkDown:         { kind: 'attack', label: 'ลดพลังโจมตี', params: { pct: pct('%', 20, 90), turns: turns(2) } },
  healBlock:       { kind: 'attack', label: 'ลดการฟื้นฟู', params: { pct: pct('% ที่ลด', 50), turns: turns(2) }, note: '100% = ฟื้นเลือดไม่ได้เลย · มีผลกับฮีล ฟื้นฟูต่อเนื่อง และดูดเลือด (โล่ยังได้)' },
  silence:         { kind: 'attack', label: 'ห้ามใช้ทักษะ', params: { turns: turns(1) } },
  speedDown:       { kind: 'attack', label: 'ลดความเร็ว', params: { pct: pct('% Speed', 20, 50), turns: turns(2) }, note: 'มีผลทันที: เทิร์นของเป้าถูกเลื่อนออกไป' },
  critDown:        { kind: 'attack', label: 'ลดอัตราคริติคอล', params: { pct: pct('%', 20), turns: turns(2) } },
  critDmgDown:     { kind: 'attack', label: 'ลดดาเมจคริติคอล', params: { pct: pct('%', 40, 300), turns: turns(2) } },
  hitDown:         { kind: 'attack', label: 'ลดความแม่นยำ (ตีปกติ)', params: { pct: pct('%', 20), turns: turns(2) }, note: 'ตีปกติของเป้าพลาดง่ายขึ้น (ตัวที่เป้าตีหลบได้มากขึ้น)' },
  skillHitDown:    { kind: 'attack', label: 'ลดความแม่นยำทักษะ', params: { pct: pct('%', 20), turns: turns(2) }, note: 'สกิลโจมตีของเป้าพลาดง่ายขึ้น' },
  poison:          { kind: 'attack', label: 'ติดพิษ (ดาเมจต่อเนื่อง)', params: { pct: pct('% ของ ATK/เทิร์น', 30, 200), turns: turns(2) }, note: 'ต้นเทิร์นของเป้า · หัก DEF · ไม่คริ · บาเรียไม่กัน' },
  burn:            { kind: 'attack', label: 'ติดไฟไหม้ (ดาเมจต่อเนื่อง)', params: { pct: pct('% ของ ATK/เทิร์น', 30, 200), turns: turns(2) }, note: 'ต้นเทิร์นของเป้า · หัก DEF · ไม่คริ · บาเรียไม่กัน' },
  bleed:           { kind: 'attack', label: 'ติดเลือดไหล (ดาเมจต่อเนื่อง)', params: { pct: pct('% ของ ATK/เทิร์น', 30, 200), turns: turns(2) }, note: 'ต้นเทิร์นของเป้า · หัก DEF · ไม่คริ · บาเรียไม่กัน' },
  vulnerable:      { kind: 'attack', label: 'เปราะบาง (รับดาเมจเพิ่ม)', params: { pct: pct('%', 25, 100), turns: turns(2) }, note: 'เป้ารับความเสียหายจากทุกแหล่งเพิ่มขึ้น (ใช้แทนการลด DEF)' },
  turnBurn:        { kind: 'attack', label: 'เร่งเทิร์นของเป้า', params: { turns: turns(1) }, note: 'บัฟ/ดีบัฟของเป้าหมดไวขึ้นเท่านี้เทิร์น · ดาเมจต่อเนื่องทำงานทันทีตามจำนวนเทิร์นที่เร่ง' },
  sealCleanse:     { kind: 'attack', label: 'ขัดขวางการล้างผลด้านลบ', params: { turns: turns(2) }, note: 'เป้าใช้สกิลล้างดีบัฟไม่ได้' },
  lifesteal:       { kind: 'attack', label: 'ดูดเลือด', params: { pct: pct('% ของดาเมจที่ทำ', 20, 100) }, choice: { key: 'scope', options: ['self', 'own_row', 'ally_all'], default: 'self' }, note: 'ยอดฮีลรวมแบ่งเท่าๆ กันให้ทุกตัวในขอบเขต · ติดห้ามฟื้นฟูจะไม่ได้' },
  // ── บัฟ ──
  atkUp:        { kind: 'buff', label: 'เพิ่มพลังโจมตี', params: { pct: pct('%', 25, 200), turns: turns(2) } },
  heal:         { kind: 'buff', label: 'ฟื้นฟูพลังชีวิต', params: { pct: pct('%', 20) }, choice: { key: 'scale', options: ['targetHp', 'casterHp', 'casterAtk'], default: 'targetHp' } },
  regen:        { kind: 'buff', label: 'ฟื้นฟูต่อเนื่อง', params: { pct: pct('% ต่อเทิร์น', 8), turns: turns(3) }, choice: { key: 'scale', options: ['targetHp', 'casterHp', 'casterAtk'], default: 'targetHp' } },
  shield:       { kind: 'buff', label: 'เพิ่มโล่', params: { pct: pct('%', 20), turns: turns(2) }, choice: { key: 'scale', options: ['targetHp', 'casterHp', 'casterAtk'], default: 'targetHp' } },
  barrier:      { kind: 'buff', label: 'บาเรียอมตะ', params: { turns: turns(1) } },
  evadeUp:      { kind: 'buff', label: 'เพิ่มอัตราหลบหลีก', params: { pct: pct('%', 20), turns: turns(2) } },
  skillEvadeUp: { kind: 'buff', label: 'เพิ่มอัตราหลบทักษะ', params: { pct: pct('%', 20), turns: turns(2) } },
  skillResUp:   { kind: 'buff', label: 'เพิ่มอัตราต้านทักษะ', params: { pct: pct('%', 25), turns: turns(2) } },
  speedUp:      { kind: 'buff', label: 'เร่งความเร็ว', params: { pct: pct('% Speed', 20, 100), turns: turns(2) }, note: 'มีผลทันที: เทิร์นถัดไปของเป้ามาเร็วขึ้น' },
  actionAdvance: { kind: 'buff', label: 'ดึงเทิร์น', params: { pct: pct('%', 30) }, note: '100% = ได้เล่นต่อทันที · ใช้กับตัวเองไม่ได้' },
  critDmgUp:    { kind: 'buff', label: 'เพิ่มความเสียหายคริ', params: { pct: pct('%', 40, 300), turns: turns(2) } },
  critUp:       { kind: 'buff', label: 'เพิ่มอัตราคริ', params: { pct: pct('%', 20), turns: turns(2) } },
  hitUp:        { kind: 'buff', label: 'เพิ่มความแม่นยำ (ตีปกติ)', params: { pct: pct('%', 20), turns: turns(2) } },
  skillHitUp:   { kind: 'buff', label: 'เพิ่มความแม่นยำทักษะ', params: { pct: pct('%', 20), turns: turns(2) } },
  cleanse:      { kind: 'buff', label: 'ล้างผลด้านลบ', params: {} },
  toughUp:      { kind: 'buff', label: 'เพิ่มความทนทาน (รับดาเมจลด)', params: { pct: pct('%', 20, 60), turns: turns(2) }, note: 'ตรงข้ามกับเปราะบาง — ใช้แทนการเพิ่ม DEF' },
  skillDmgResUp: { kind: 'buff', label: 'เพิ่มต้านความเสียหายสกิล', params: { pct: pct('%', 20, 60), turns: turns(2) } },
  taunt:        { kind: 'buff', label: 'ยั่วยุ (ศัตรูต้องตีปกติใส่ตัวนี้)', params: { turns: turns(2) }, note: 'มีผลกับการตีธรรมดาของศัตรู · หลายตัวยั่วยุพร้อมกัน = ศัตรูเลือกได้เฉพาะตัวที่ยั่วยุ' },
  energyGain:   { kind: 'both', label: 'เพิ่ม Cost พลังงานให้ทีม', params: { amount: { label: 'Cost', min: 1, max: 5, step: 1, default: 1 } } },
}

export const effectsOf = (kind: SkillKind): EffectType[] =>
  (Object.keys(EFFECTS) as EffectType[]).filter(t => EFFECTS[t].kind === kind || EFFECTS[t].kind === 'both')

export interface SkillEffect {
  type: EffectType
  pct?: number
  turns?: number
  amount?: number
  /** ดาเมจ: เพิกเฉยโล่ขาวกี่ % (0 = โล่กันก่อนตามปกติ · 100 = ทะลุโล่ลงเลือดตรงๆ) */
  pierce?: number
  scope?: LifestealScope
  /** ฮีล/โล่: อิงอะไรเป็นฐาน */
  scale?: HealScale
  /** เปลี่ยนธาตุ: เปลี่ยนเป็นธาตุนี้ */
  element?: Element
}

export interface SkillDef {
  kind: SkillKind
  cost: number
  area: SkillArea
  effects: SkillEffect[]
}

export type SkillSlot = 'skill1' | 'skill2'

/** ความสามารถพร้อมค่าเริ่มต้น */
export function newEffect(type: EffectType): SkillEffect {
  const e: SkillEffect = { type }
  for (const [k, p] of Object.entries(EFFECTS[type].params) as [ParamKey, ParamDef][]) e[k] = p.default
  const choice = EFFECTS[type].choice
  if (choice) {
    if (choice.key === 'scope') e.scope = choice.default
    else if (choice.key === 'scale') e.scale = choice.default
    else e.element = choice.default
  }
  return e
}

const fx = (type: EffectType, over: Partial<SkillEffect> = {}): SkillEffect => ({ ...newEffect(type), ...over })

/** สกิลเริ่มต้นตามตำแหน่ง — ใช้ตอนสร้าง config ใหม่ / แปลงไฟล์เก่า (แก้เองทีหลังได้หมด) */
export function defaultSkills(role: string): Record<SkillSlot, SkillDef> {
  switch (role) {
    case 'tank': return {
      skill1: { kind: 'buff', cost: 2, area: 'own_row', effects: [fx('shield', { pct: 20 }), fx('skillResUp')] },
      skill2: { kind: 'attack', cost: 3, area: 'single_front', effects: [fx('damage', { pct: 260 }), fx('atkDown')] },
    }
    case 'shooter': return {
      skill1: { kind: 'attack', cost: 2, area: 'single_front', effects: [fx('damage', { pct: 320 })] },
      skill2: { kind: 'attack', cost: 3, area: 'row', effects: [fx('damage', { pct: 210 }), fx('evadeDown')] },
    }
    case 'assassin': return {
      skill1: { kind: 'attack', cost: 2, area: 'single_any', effects: [fx('damage', { pct: 250 })] },
      skill2: { kind: 'attack', cost: 3, area: 'single_any', effects: [fx('damage', { pct: 330 }), fx('breakInvincible')] },
    }
    case 'mage': return {
      skill1: { kind: 'attack', cost: 2, area: 'row', effects: [fx('damage', { pct: 220 })] },
      skill2: { kind: 'attack', cost: 3, area: 'all', effects: [fx('damage', { pct: 170 }), fx('skillResDown')] },
    }
    case 'support': return {
      skill1: { kind: 'buff', cost: 2, area: 'ally_all', effects: [fx('heal', { pct: 28 }), fx('regen', { pct: 8, turns: 2 })] },
      skill2: { kind: 'buff', cost: 3, area: 'ally_all', effects: [fx('atkUp', { pct: 35 }), fx('shield', { pct: 15 }), fx('cleanse'), fx('energyGain', { amount: 1 })] },
    }
    case 'fighter':
    default: return {
      skill1: { kind: 'attack', cost: 2, area: 'single_front', effects: [fx('damage', { pct: 300 })] },
      skill2: { kind: 'attack', cost: 3, area: 'row', effects: [fx('damage', { pct: 200 }), fx('stun')] },
    }
  }
}

/** สำเนาลึก (config เก็บเป็น JSON — กันแก้ของกลางโดยไม่ตั้งใจ) */
export const cloneSkill = (s: SkillDef): SkillDef => ({ ...s, effects: s.effects.map(e => ({ ...e })) })
