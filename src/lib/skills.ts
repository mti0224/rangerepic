// ====================================================
// skills.ts — นิยามสกิล (ข้อมูลล้วน ไม่มีตรรกะการรบ — การรบอยู่ที่ play/battle.ts)
//
// สกิล 1 ท่า = ประเภท (โจมตี / บัฟ) + ค่า Cost + ความกว้าง + รายการความสามารถ
// ความสามารถแต่ละอย่างมีค่าตัวเลขของมันเอง (pct / turns / amount) และค่าเริ่มต้นที่ใส่ให้ตอนเพิ่มครั้งแรก
// "turns" นับเป็น回合ของตัวที่ได้รับผล (回合ที่ได้รับไม่นับ)
// บางความสามารถมี "ตัวเลือก" (choice) เพิ่ม เช่น 吸血ให้ใคร (ตัวเอง / แถวตัวเอง / เพื่อนทั้งหมด)
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
  single_front: '單體攻擊（優先前排）',
  single_any: '單體攻擊（可選任意目標）',
  row: '整排攻擊（優先前排）',
  row_any: '整排攻擊（可選任一排）',
  all: '全體攻擊',
  self: '自身增益',
  own_row: '我方同排增益',
  ally_single: '指定 1 名隊友增益',
  ally_all: '我方全體增益',
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
  | 'toughUp' | 'skillDmgResUp' | 'reflect' | 'taunt'
export type EffectType = AttackEffectType | BuffEffectType

export type ParamKey = 'pct' | 'turns' | 'amount' | 'pierce'
export interface ParamDef { label: string; min: number; max: number; step: number; default: number }

/** สเกลของฮีล/โล่: เลือดเป้า (ปกติ) · เลือดผู้ร่าย · ATK ผู้ร่าย */
export type HealScale = 'targetHp' | 'casterHp' | 'casterAtk'
export const HEAL_SCALE_LABEL: Record<HealScale, string> = {
  targetHp: '目標最大體力的 %', casterHp: '施放者最大體力的 %', casterAtk: '施放者攻擊力的 %',
}

/** 吸血ให้ใคร */
export type LifestealScope = 'self' | 'own_row' | 'ally_all'
export const LIFESTEAL_SCOPE_LABEL: Record<LifestealScope, string> = {
  self: '僅治療自身', own_row: '治療我方同排', ally_all: '治療我方全體',
}

export interface EffectDef {
  /** 'both' = ใส่ได้ทั้งสกิลโจมตีและสกิลบัฟ */
  kind: SkillKind | 'both'
  label: string
  params: Partial<Record<ParamKey, ParamDef>>
  /** ตัวเลือกเพิ่ม (dropdown): ขอบเขต吸血 · สเกลฮีล/โล่ · ธาตุที่เปลี่ยนเป็น */
  choice?:
    | { key: 'scope'; options: LifestealScope[]; default: LifestealScope }
    | { key: 'scale'; options: HealScale[]; default: HealScale }
    | { key: 'element'; options: Element[]; default: Element }
  /** คำอธิบายสั้นใต้ชื่อใน editor */
  note?: string
}

const pct = (label: string, def: number, max = 100): ParamDef => ({ label, min: 1, max, step: 1, default: def })
const turns = (def: number): ParamDef => ({ label: '回合', min: 1, max: 5, step: 1, default: def })

/** ความสามารถทั้งหมด + ค่าเริ่มต้นที่ใส่ให้ตอนเพิ่มครั้งแรก */
export const EFFECTS: Record<EffectType, EffectDef> = {
  // ── โจมตี ──
  damage:          { kind: 'attack', label: '造成傷害', params: { pct: pct('攻擊力的 %', 250, 1000), pierce: { label: '無視白色護盾 %', min: 0, max: 100, step: 5, default: 0 } } },
  damageHp:        { kind: 'attack', label: '依施放者體力造成傷害', params: { pct: pct('施放者最大體力的 %', 10, 100), pierce: { label: '無視白色護盾 %', min: 0, max: 100, step: 5, default: 0 } }, note: '傷害基礎 = 施放者最大體力（不是 ATK）；適合高體力角色，仍正常計算 DEF／屬性／爆擊' },
  elementShift:    { kind: 'attack', label: '改變目標屬性', params: { turns: turns(2) }, choice: { key: 'element', options: ['fire', 'water', 'wood', 'light', 'dark'], default: 'fire' }, note: '目標暫時變為此屬性，可利用屬性相剋提高我方傷害' },
  selfHpCost:      { kind: 'both', label: '消耗自身體力', params: { pct: pct('自身最大體力的 %', 10, 50) }, note: '施放時消耗自身體力（不會因此死亡，至少保留 1）' },
  selfVulnerable:  { kind: 'both', label: '自身易傷代價', params: { pct: pct('%', 25, 100), turns: turns(2) }, note: '施放者暫時受到更多傷害' },
  trueDamage:      { kind: 'attack', label: '真實傷害', params: { pct: pct('攻擊力的 %', 100, 1000) }, note: '直接扣除體力，不受白色護盾／DEF／爆擊影響；無敵屏障仍可阻擋（搭配「解除無敵效果」可穿透）' },
  breakInvincible: { kind: 'attack', label: '解除無敵效果（穿透屏障）', params: {} },
  stun:            { kind: 'attack', label: '昏迷', params: { turns: turns(1) } },
  skillEvadeDown:  { kind: 'attack', label: '降低技能閃避', params: { pct: pct('%', 20), turns: turns(2) } },
  skillResDown:    { kind: 'attack', label: '降低技能抗性', params: { pct: pct('%', 20), turns: turns(2) } },
  evadeDown:       { kind: 'attack', label: '降低閃避率', params: { pct: pct('%', 20), turns: turns(2) } },
  dispelBuffs:     { kind: 'attack', label: '解除敵方增益', params: {} },
  atkDown:         { kind: 'attack', label: '降低攻擊力', params: { pct: pct('%', 20, 90), turns: turns(2) } },
  healBlock:       { kind: 'attack', label: '降低恢復量', params: { pct: pct('降低 %', 50), turns: turns(2) }, note: '100% = 完全無法恢復體力；影響治療、持續恢復與吸血（護盾不受影響）' },
  silence:         { kind: 'attack', label: '沉默', params: { turns: turns(1) } },
  speedDown:       { kind: 'attack', label: '降低速度', params: { pct: pct('% Speed', 20, 50), turns: turns(2) }, note: '立即生效：目標下一回合延後' },
  critDown:        { kind: 'attack', label: '降低爆擊率', params: { pct: pct('%', 20), turns: turns(2) } },
  critDmgDown:     { kind: 'attack', label: '降低爆擊傷害', params: { pct: pct('%', 40, 300), turns: turns(2) } },
  hitDown:         { kind: 'attack', label: '降低命中率（一般攻擊）', params: { pct: pct('%', 20), turns: turns(2) }, note: '目標的一般攻擊更容易失誤' },
  skillHitDown:    { kind: 'attack', label: '降低技能命中率', params: { pct: pct('%', 20), turns: turns(2) }, note: '目標的攻擊技能更容易失誤' },
  poison:          { kind: 'attack', label: '中毒（持續傷害）', params: { pct: pct('攻擊力的 %/回合', 30, 200), turns: turns(2) }, note: '於目標回合開始時觸發；計算 DEF、不會爆擊、屏障無法阻擋' },
  burn:            { kind: 'attack', label: '燃燒（持續傷害）', params: { pct: pct('攻擊力的 %/回合', 30, 200), turns: turns(2) }, note: '於目標回合開始時觸發；計算 DEF、不會爆擊、屏障無法阻擋' },
  bleed:           { kind: 'attack', label: '流血（持續傷害）', params: { pct: pct('攻擊力的 %/回合', 30, 200), turns: turns(2) }, note: '於目標回合開始時觸發；計算 DEF、不會爆擊、屏障無法阻擋' },
  vulnerable:      { kind: 'attack', label: '易傷（受到傷害增加）', params: { pct: pct('%', 25, 100), turns: turns(2) }, note: '目標受到所有來源的傷害提高（可作為降低 DEF 的替代設計）' },
  turnBurn:        { kind: 'attack', label: '加速目標回合', params: { turns: turns(1) }, note: '使目標的增益／減益提早消耗指定回合；持續傷害也會立即依加速回合數觸發' },
  sealCleanse:     { kind: 'attack', label: '阻止解除減益', params: { turns: turns(2) }, note: '目標無法使用解除減益技能' },
  lifesteal:       { kind: 'attack', label: '吸血', params: { pct: pct('造成傷害的 %', 20, 100) }, choice: { key: 'scope', options: ['self', 'own_row', 'ally_all'], default: 'self' }, note: '總治療量平均分配給範圍內所有角色；受到禁止恢復時無效' },
  // ── บัฟ ──
  atkUp:        { kind: 'buff', label: '提升攻擊力', params: { pct: pct('%', 25, 200), turns: turns(2) } },
  heal:         { kind: 'buff', label: '恢復體力', params: { pct: pct('%', 20) }, choice: { key: 'scale', options: ['targetHp', 'casterHp', 'casterAtk'], default: 'targetHp' } },
  regen:        { kind: 'buff', label: '持續恢復', params: { pct: pct('每回合 %', 8), turns: turns(3) }, choice: { key: 'scale', options: ['targetHp', 'casterHp', 'casterAtk'], default: 'targetHp' } },
  shield:       { kind: 'buff', label: '增加護盾', params: { pct: pct('%', 20), turns: turns(2) }, choice: { key: 'scale', options: ['targetHp', 'casterHp', 'casterAtk'], default: 'targetHp' } },
  barrier:      { kind: 'buff', label: '無敵屏障', params: { turns: turns(1) } },
  evadeUp:      { kind: 'buff', label: '提升閃避率', params: { pct: pct('%', 20), turns: turns(2) } },
  skillEvadeUp: { kind: 'buff', label: '提升技能閃避', params: { pct: pct('%', 20), turns: turns(2) } },
  skillResUp:   { kind: 'buff', label: '提升技能抗性', params: { pct: pct('%', 25), turns: turns(2) } },
  speedUp:      { kind: 'buff', label: '提升速度', params: { pct: pct('% Speed', 20, 100), turns: turns(2) }, note: '立即生效：目標下一回合提前' },
  actionAdvance: { kind: 'buff', label: '推進行動回合', params: { pct: pct('%', 30) }, note: '100% = 立即獲得下一次行動；不可對自身使用' },
  critDmgUp:    { kind: 'buff', label: '提升爆擊傷害', params: { pct: pct('%', 40, 300), turns: turns(2) } },
  critUp:       { kind: 'buff', label: '提升爆擊率', params: { pct: pct('%', 20), turns: turns(2) } },
  hitUp:        { kind: 'buff', label: '提升命中率（一般攻擊）', params: { pct: pct('%', 20), turns: turns(2) } },
  skillHitUp:   { kind: 'buff', label: '提升技能命中率', params: { pct: pct('%', 20), turns: turns(2) } },
  cleanse:      { kind: 'buff', label: '解除減益', params: {} },
  toughUp:      { kind: 'buff', label: '提升減傷', params: { pct: pct('%', 20, 60), turns: turns(2) }, note: '與易傷相反，可作為提高 DEF 的替代設計' },
  skillDmgResUp: { kind: 'buff', label: '提升技能傷害抗性', params: { pct: pct('%', 20, 60), turns: turns(2) } },
  reflect:      { kind: 'buff', label: '反射傷害', params: { pct: pct('%', 30, 100), turns: turns(2) }, note: '依實際受到的 HP 傷害反射；不爆擊、不再次觸發反射' },
  taunt:        { kind: 'buff', label: '嘲諷（敵方一般攻擊必須以此角色為目標）', params: { turns: turns(2) }, note: '只影響敵方一般攻擊；若同時有多名角色嘲諷，敵方只能從嘲諷角色中選擇目標' },
  energyGain:   { kind: 'both', label: '增加隊伍 Cost', params: { amount: { label: 'Cost', min: 1, max: 5, step: 1, default: 1 } } },
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
  /** Transitional RangerEpic Gameplay V1 metadata. Legacy skills leave these undefined. */
  gameplayType?: string
  gameplayValue?: number
  gameplayDuration?: number
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
