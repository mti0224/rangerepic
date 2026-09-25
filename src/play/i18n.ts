// ====================================================
// i18n.ts — ภาษาของหน้าดวล (อังกฤษ / ไทย) · เลือกได้ในเมนูตั้งค่าของหน้าดวล
//
// จำค่าที่เลือกไว้ในเครื่อง (localStorage 'lr:lang') · ค่าเริ่มต้น = อังกฤษ
// ข้อความทั้งหมดของหน้าดวลมาจากไฟล์นี้: HUD · เมนู · ป้ายลอย · ป้ายสถานะ · คำอธิบายสกิล · การ์ดข้อมูล
// ชื่อเรนเจอร์/สกิลใช้ชื่อจากข้อมูลเกมตามภาษา (ไทยไม่มี → ใช้อังกฤษ)
// ตัวย่อค่าพลัง (HP ATK DEF SPD CRIT) และตัวเลขใช้แบบเดียวกันทั้งสองภาษา
// ====================================================

import { ELEMENT_LABEL, type Element, type Role } from '@/lib/rangerClass'
import type { HealScale, LifestealScope, SkillArea, SkillEffect } from '@/lib/skills'
import { EFFECTS } from '@/lib/skills'
import type { StatusType } from './battle'
import { properNameZhTw } from './zhNames'

export type Lang = 'zh-TW' | 'en' | 'th'
export const LANGS: Lang[] = ['zh-TW', 'en', 'th']
const STORAGE_KEY = 'lr:lang:v2'

let lang: Lang = (() => {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return v === 'en' || v === 'th' || v === 'zh-TW' ? v : 'zh-TW'
  } catch { return 'zh-TW' }
})()

export const getLang = (): Lang => lang
const listeners = new Set<(l: Lang) => void>()
export function setLang(next: Lang): void {
  lang = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* จำไม่ได้ก็ใช้ได้แค่รอบนี้ */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next === 'zh-TW' ? 'zh-Hant-TW' : next
  for (const fn of listeners) fn(next)
}
/** ฟังการเปลี่ยนภาษา (คืนฟังก์ชันเลิกฟัง) */
export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
/** สลับไปภาษาถัดไป */
export const cycleLang = (): void => setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length])

/** ข้อความคงที่ [อังกฤษ, ไทย] */
const TEXT = {
  turn: ['TURN', 'เทิร์น'],
  ally: ['ALLY', 'ทีมเรา'],
  enemy: ['ENEMY', 'ศัตรู'],
  overtime: ['OVERTIME · DMG ×', 'ต่อเวลา · ดาเมจ ×'],
  attack: ['Attack', 'ตีธรรมดา'],
  skill1: ['Skill 1', 'สกิล 1'],
  skill2: ['Skill 2', 'สกิล 2'],
  teamCost: ['Team Cost +1', 'เพิ่ม Cost ให้ทีม +1'],
  shieldPlus: ['SHIELD +', 'โล่ +'],
  shield: ['SHIELD', 'โล่'],
  dispel: ['DISPEL', 'ล้างบัฟ'],
  cleanse: ['CLEANSE', 'ล้างดีบัฟ'],
  immune: ['IMMUNE', 'กันได้'],
  status: ['STATUS', 'สถานะ'],
  paused: ['PAUSED', 'หยุดชั่วคราว'],
  victory: ['VICTORY!', 'ชนะแล้ว!'],
  defeat: ['DEFEAT', 'แพ้'],
  draw: ['DRAW', 'เสมอ'],
  timeUp: ['TIME UP · HP', 'หมดเวลา · เลือด'],
  turnLimit: ['TURN LIMIT · HP', 'ครบเทิร์น · เลือด'],
  retry: ['↻ RETRY', '↻ เล่นอีกครั้ง'],
  team: ['← TEAM', '← จัดทีม'],
  settings: ['SETTINGS', 'ตั้งค่า'],
  resume: ['▶ RESUME', '▶ เล่นต่อ'],
  pause: ['⏸ PAUSE', '⏸ หยุดชั่วคราว'],
  restart: ['↻ RESTART', '↻ เริ่มใหม่'],
  backToTeam: ['← BACK TO TEAM', '← กลับไปจัดทีม'],
  close: ['CLOSE', 'ปิด'],
  language: ['LANGUAGE · ENGLISH', 'ภาษา · ไทย'],
  cutinOn: ['SKILL CUT-IN · ON', 'คัตซีนสกิล · เปิด'],
  cutinOff: ['SKILL CUT-IN · OFF', 'คัตซีนสกิล · ปิด'],
  unitCardOn: ['HOVER INFO · ON', 'ข้อมูลเมื่อชี้เรนเจอร์ · เปิด'],
  unitCardOff: ['HOVER INFO · OFF', 'ข้อมูลเมื่อชี้เรนเจอร์ · ปิด'],
  // ป้ายลอยในฉาก
  stunned: ['STUNNED', 'ชะงัก!'],
  miss: ['MISS', 'หลบ'],
  barrierBreak: ['BARRIER BREAK', 'บาเรียแตก'],
  blocked: ['BLOCKED', 'โล่รับไว้'],
  resist: ['RESIST', 'ต้าน'],
  advanced: ['TURN ▲', 'ดึงเทิร์น'],
  cooldown: ['TURNS', 'เทิร์น'],
} as const satisfies Record<string, readonly [string, string]>

const TEXT_ZH = {
  turn: '回合',
  ally: '我方',
  enemy: '敵方',
  overtime: '延長戰 · 傷害 ×',
  attack: '普通攻擊',
  skill1: '技能 1',
  skill2: '技能 2',
  teamCost: '隊伍 Cost +1',
  shieldPlus: '護盾 +',
  shield: '護盾',
  dispel: '解除增益',
  cleanse: '解除減益',
  immune: '免疫',
  status: '狀態',
  paused: '已暫停',
  victory: '勝利！',
  defeat: '敗北',
  draw: '平手',
  timeUp: '時間到 · HP',
  turnLimit: '回合上限 · HP',
  retry: '↻ 再試一次',
  team: '← 隊伍',
  settings: '設定',
  resume: '▶ 繼續',
  pause: '⏸ 暫停',
  restart: '↻ 重新開始',
  backToTeam: '← 返回隊伍',
  close: '關閉',
  language: '語言 · 繁體中文',
  cutinOn: '技能特寫 · 開',
  cutinOff: '技能特寫 · 關',
  unitCardOn: '滑鼠懸停資訊 · 開',
  unitCardOff: '滑鼠懸停資訊 · 關',
  stunned: '暈眩！',
  miss: 'MISS',
  barrierBreak: '護盾破壞',
  blocked: '已格擋',
  resist: '抵抗',
  advanced: '行動提前 ▲',
  cooldown: '回合',
} as const satisfies Record<keyof typeof TEXT, string>

export type TextKey = keyof typeof TEXT
export const t = (k: TextKey): string => lang === 'zh-TW' ? TEXT_ZH[k] : TEXT[k][lang === 'th' ? 1 : 0]

/** จำนวนเทิร์น แบบสั้น (ป้ายสถานะ) */
export const turnsShort = (n: number): string =>
  lang === 'zh-TW' ? `${n} 回合` : lang === 'th' ? `${n} เทิร์น` : `${n}T`

const STATUS: Record<StatusType, readonly [string, string]> = {
  stun: ['STUN', 'ชะงัก'], silence: ['SILENCE', 'ห้ามสกิล'], healBlock: ['HEAL BLOCK', 'ห้ามฟื้นฟู'],
  atkDown: ['ATK▼', 'ATK▼'], evadeDown: ['EVA▼', 'หลบ▼'], skillEvadeDown: ['S.EVA▼', 'หลบสกิล▼'], skillResDown: ['RES▼', 'ต้าน▼'],
  speedDown: ['SPD▼', 'SPD▼'], critDown: ['CRIT▼', 'คริ▼'], critDmgDown: ['C.DMG▼', 'คริดาเมจ▼'],
  hitDown: ['HIT▼', 'แม่น▼'], skillHitDown: ['S.HIT▼', 'แม่นสกิล▼'],
  poison: ['POISON', 'พิษ'], burn: ['BURN', 'ไฟไหม้'], bleed: ['BLEED', 'เลือดไหล'],
  atkUp: ['ATK▲', 'ATK▲'], regen: ['REGEN', 'ฟื้นฟู'], shield: ['SHIELD', 'โล่'], barrier: ['BARRIER', 'อมตะ'],
  evadeUp: ['EVA▲', 'หลบ▲'], skillEvadeUp: ['S.EVA▲', 'หลบสกิล▲'], skillResUp: ['RES▲', 'ต้าน▲'], speedUp: ['SPD▲', 'SPD▲'],
  critDmgUp: ['C.DMG▲', 'คริดาเมจ▲'], critUp: ['CRIT▲', 'คริ▲'], hitUp: ['HIT▲', 'แม่น▲'], skillHitUp: ['S.HIT▲', 'แม่นสกิล▲'],
  vulnerable: ['VULNERABLE', 'เปราะบาง'], sealCleanse: ['NO CLEANSE', 'ล้างไม่ได้'], elementShift: ['ELEMENT', 'เปลี่ยนธาตุ'],
  toughUp: ['TOUGH▲', 'ทนทาน▲'], skillDmgResUp: ['S.DMG RES▲', 'ต้านดาเมจสกิล▲'], taunt: ['TAUNT', 'ยั่วยุ'],
}

const STATUS_ZH: Record<StatusType, string> = {
  stun: '暈眩', silence: '沉默', healBlock: '禁止恢復',
  atkDown: 'ATK▼', evadeDown: '閃避▼', skillEvadeDown: '技能閃避▼', skillResDown: '技能抵抗▼',
  speedDown: '攻速▼', critDown: '暴擊▼', critDmgDown: '暴傷▼',
  hitDown: '命中▼', skillHitDown: '技能命中▼',
  poison: '中毒', burn: '燃燒', bleed: '流血',
  atkUp: 'ATK▲', regen: '持續恢復', shield: '護盾', barrier: '無敵',
  evadeUp: '閃避▲', skillEvadeUp: '技能閃避▲', skillResUp: '技能抵抗▲', speedUp: '攻速▲',
  critDmgUp: '暴傷▲', critUp: '暴擊▲', hitUp: '命中▲', skillHitUp: '技能命中▲',
  vulnerable: '易傷', sealCleanse: '禁止解除', elementShift: '屬性變更',
  toughUp: '減傷▲', skillDmgResUp: '技能傷害抵抗▲', taunt: '嘲諷',
}

/** ชื่อสั้นของสถานะ (ป้ายลอย · ใต้หลอดเลือด · ชิป) */
export const statusLabel = (s: StatusType): string =>
  lang === 'zh-TW' ? STATUS_ZH[s] : STATUS[s][lang === 'th' ? 1 : 0]

const ELEMENT: Record<Element, readonly [string, string]> = {
  fire: ['Fire', 'ไฟ'], water: ['Water', 'น้ำ'], wood: ['Wood', 'ไม้'], light: ['Light', 'แสง'], dark: ['Dark', 'มืด'],
}
const ELEMENT_ZH: Record<Element, string> = { fire: '火', water: '水', wood: '木', light: '光', dark: '暗' }
export const elementName = (e: Element): string =>
  lang === 'zh-TW' ? ELEMENT_ZH[e] : ELEMENT[e][lang === 'th' ? 1 : 0]

const ROLE: Record<Role, readonly [string, string]> = {
  tank: ['Tank', 'แทงค์'], fighter: ['Fighter', 'ไฟเตอร์'], shooter: ['Shooter', 'นักยิง'],
  assassin: ['Assassin', 'นักฆ่า'], mage: ['Mage', 'นักเวท'], support: ['Support', 'ซัพพอร์ต'],
}
const ROLE_ZH: Record<Role, string> = {
  tank: '坦克', fighter: '戰士', shooter: '射手', assassin: '刺客', mage: '法師', support: '輔助',
}
export const roleName = (r: Role): string =>
  lang === 'zh-TW' ? ROLE_ZH[r] : ROLE[r][lang === 'th' ? 1 : 0]

const AREA_SHORT: Record<SkillArea, readonly [string, string]> = {
  single_front: ['Single · Front', 'เดี่ยว · แถวหน้า'], single_any: ['Single · Any', 'เดี่ยว · ตัวไหนก็ได้'],
  row: ['Row', 'ทั้งแถว'], row_any: ['Row · any', 'ทั้งแถว · เลือกแถว'], all: ['All enemies', 'ศัตรูทั้งหมด'],
  self: ['Self', 'ตัวเอง'], own_row: ['Own row', 'แถวตัวเอง'], ally_single: ['One ally', 'เพื่อน 1 ตัว'], ally_all: ['All allies', 'เพื่อนทั้งหมด'],
}
const AREA_LONG: Record<SkillArea, readonly [string, string]> = {
  single_front: ['Single target (front row first)', 'โจมตีเดี่ยว (แถวหน้าก่อน)'],
  single_any: ['Single target (any enemy)', 'โจมตีเดี่ยว (ตัวไหนก็ได้)'],
  row: ['Whole enemy row (front row first)', 'โจมตีทั้งแถว (แถวหน้าก่อน)'],
  row_any: ['Whole enemy row (choose any row)', 'โจมตีทั้งแถว (เลือกแถวไหนก็ได้)'],
  all: ['All enemies', 'โจมตีศัตรูทั้งหมด'],
  self: ['Self', 'บัฟตัวเอง'], own_row: ['Allies in own row', 'บัฟแถวของตัวเอง'],
  ally_single: ['One chosen ally', 'บัฟเพื่อน 1 ตัวที่เลือก'], ally_all: ['All allies', 'บัฟเพื่อนทั้งหมด'],
}
const AREA_SHORT_ZH: Record<SkillArea, string> = {
  single_front: '單體 · 前排優先', single_any: '單體 · 任意',
  row: '整排', row_any: '整排 · 任選', all: '全體敵人',
  self: '自身', own_row: '自身所在排', ally_single: '單一隊友', ally_all: '全體隊友',
}
const AREA_LONG_ZH: Record<SkillArea, string> = {
  single_front: '單一目標（前排優先）',
  single_any: '單一目標（任意敵人）',
  row: '敵方整排（前排優先）',
  row_any: '敵方整排（可選任意一排）',
  all: '全體敵人',
  self: '自身',
  own_row: '自身所在排的隊友',
  ally_single: '指定 1 名隊友',
  ally_all: '全體隊友',
}
export const areaShort = (a: SkillArea): string =>
  lang === 'zh-TW' ? AREA_SHORT_ZH[a] : AREA_SHORT[a][lang === 'th' ? 1 : 0]
export const areaLong = (a: SkillArea): string =>
  lang === 'zh-TW' ? AREA_LONG_ZH[a] : AREA_LONG[a][lang === 'th' ? 1 : 0]

/** ชื่ออังกฤษของความสามารถ (ภาษาไทยใช้ label ใน EFFECTS ของ lib/skills.ts) */
const EFFECT_EN: Record<SkillEffect['type'], string> = {
  damage: 'Damage', trueDamage: 'True damage', breakInvincible: 'Pierce invincibility', stun: 'Stun', skillEvadeDown: 'Skill Evade down',
  skillResDown: 'Skill Resistance down', evadeDown: 'Evade down', dispelBuffs: 'Dispel enemy buffs', atkDown: 'ATK down',
  healBlock: 'Heal block', silence: 'Silence',
  speedDown: 'Speed down', critDown: 'Crit Rate down', critDmgDown: 'Crit Damage down', hitDown: 'Hit Rate down', skillHitDown: 'Skill Hit down',
  poison: 'Poison', burn: 'Burn', bleed: 'Bleed', lifesteal: 'Lifesteal', actionAdvance: 'Action advance',
  vulnerable: 'Vulnerable', turnBurn: 'Burn turns', sealCleanse: 'Seal cleanse',
  damageHp: 'Damage (caster max HP)', elementShift: 'Element shift', selfHpCost: 'Self HP cost', selfVulnerable: 'Self vulnerable',
  toughUp: 'Tough up', skillDmgResUp: 'Skill DMG Res up', taunt: 'Taunt',
  atkUp: 'ATK up', heal: 'Heal', regen: 'Regeneration', shield: 'Shield', barrier: 'Invincible barrier',
  evadeUp: 'Evade up', skillEvadeUp: 'Skill Evade up', skillResUp: 'Skill Resistance up', speedUp: 'Speed up',
  critDmgUp: 'Crit Damage up', critUp: 'Crit Rate up', hitUp: 'Hit Rate up', skillHitUp: 'Skill Hit up',
  cleanse: 'Cleanse', energyGain: 'Team Cost',
}


const EFFECT_ZH: Record<SkillEffect['type'], string> = {
  damage: '傷害', trueDamage: '真實傷害', breakInvincible: '解除無敵', stun: '暈眩', skillEvadeDown: '技能閃避率降低',
  skillResDown: '技能抵抗降低', evadeDown: '閃避率降低', dispelBuffs: '解除敵方增益', atkDown: '攻擊力降低',
  healBlock: '禁止恢復', silence: '沉默',
  speedDown: '攻擊速度降低', critDown: '暴擊率降低', critDmgDown: '暴擊傷害降低', hitDown: '命中率降低', skillHitDown: '技能命中率降低',
  poison: '中毒', burn: '燃燒', bleed: '流血', lifesteal: '吸血', actionAdvance: '行動提前',
  vulnerable: '易傷', turnBurn: '縮短狀態回合', sealCleanse: '禁止解除減益',
  damageHp: '依施放者最大 HP 造成傷害', elementShift: '屬性變更', selfHpCost: '消耗自身 HP', selfVulnerable: '自身易傷',
  toughUp: '受到傷害降低', skillDmgResUp: '技能傷害抵抗提升', taunt: '嘲諷',
  atkUp: '攻擊力提升', heal: '恢復', regen: '持續恢復', shield: '護盾', barrier: '無敵',
  evadeUp: '閃避率提升', skillEvadeUp: '技能閃避率提升', skillResUp: '技能抵抗提升', speedUp: '攻擊速度提升',
  critDmgUp: '暴擊傷害提升', critUp: '暴擊率提升', hitUp: '命中率提升', skillHitUp: '技能命中率提升',
  cleanse: '解除減益', energyGain: '隊伍 Cost',
}

const SCALE_ZH: Record<HealScale, string> = { targetHp: '目標最大 HP', casterHp: '施放者最大 HP', casterAtk: '施放者 ATK' }
const SCALE_TH: Record<HealScale, string> = { targetHp: 'HP สูงสุดของเป้า', casterHp: 'HP สูงสุดของผู้ร่าย', casterAtk: 'ATK ผู้ร่าย' }
const SCALE_EN: Record<HealScale, string> = { targetHp: "target's max HP", casterHp: "caster's max HP", casterAtk: "caster's ATK" }
const ELEMENT_EN: Record<Element, string> = { fire: 'Fire', water: 'Water', wood: 'Wood', light: 'Light', dark: 'Dark' }
/** เพิกเฉยโล่ขาวกี่ % (ไม่มี = ไม่ต้องบอก) */
const pierceTh = (e: SkillEffect) => (e.pierce ? ` · ข้ามโล่ ${e.pierce}%` : '')
const pierceEn = (e: SkillEffect) => (e.pierce ? ` · ignores ${e.pierce}% of shields` : '')

const LIFESTEAL_ZH: Record<LifestealScope, string> = { self: '自身', own_row: '自身所在排', ally_all: '全體隊友' }
const LIFESTEAL_TH: Record<LifestealScope, string> = { self: 'ตัวเอง', own_row: 'แถวตัวเอง', ally_all: 'เพื่อนทั้งหมด' }
const LIFESTEAL_EN: Record<LifestealScope, string> = { self: 'self', own_row: 'own row', ally_all: 'all allies' }

/** ข้อความสั้นของความสามารถ 1 อย่าง พร้อมตัวเลข (tooltip สกิล) */
export function describeEffect(e: SkillEffect): string {
  const pct = e.pct ?? 0
  if (lang === 'zh-TW') {
    const tt = e.turns ? `（${e.turns} 回合）` : ''
    const pierce = e.pierce ? ` · 無視 ${e.pierce}% 護盾` : ''
    switch (e.type) {
      case 'damage': return `造成 ATK ${pct}% 的傷害${pierce}`
      case 'damageHp': return `造成施放者最大 HP ${pct}% 的傷害${pierce}`
      case 'elementShift': return `將目標屬性變更為${ELEMENT_ZH[e.element ?? 'fire']}${tt}`
      case 'selfHpCost': return `消耗自身最大 HP 的 ${pct}%（不會因此死亡）`
      case 'selfVulnerable': return `自身受到傷害 +${pct}%${tt}`
      case 'trueDamage': return `造成 ATK ${pct}% 的真實傷害（無視護盾與 DEF）`
      case 'heal': return `恢復${SCALE_ZH[e.scale ?? 'targetHp']}的 ${pct}%`
      case 'shield': return `獲得相當於${SCALE_ZH[e.scale ?? 'targetHp']} ${pct}% 的護盾${tt}`
      case 'regen': return `每回合恢復${SCALE_ZH[e.scale ?? 'targetHp']}的 ${pct}%${tt}`
      case 'energyGain': return `隊伍 Cost +${e.amount ?? 1}`
      case 'poison': case 'burn': case 'bleed': return `${STATUS_ZH[e.type]}：每回合造成 ATK ${pct}% 的傷害${tt}`
      case 'lifesteal': return `吸收造成傷害的 ${pct}% 並分配給${LIFESTEAL_ZH[e.scope ?? 'self']}`
      case 'actionAdvance': return `行動提前 ${pct}%`
      case 'speedUp': return `攻擊速度 +${pct}%${tt}`
      case 'speedDown': return `攻擊速度 −${pct}%${tt}`
      case 'vulnerable': return `目標受到傷害 +${pct}%${tt}`
      case 'toughUp': return `受到傷害 −${pct}%${tt}`
      case 'skillDmgResUp': return `技能傷害抵抗 +${pct}%${tt}`
      case 'healBlock': return `恢復量 −${pct || 100}%${tt}`
      case 'turnBurn': return `目標的狀態回合數立即減少 ${e.turns ?? 1} 回合（持續傷害立即觸發）`
      case 'sealCleanse': return `禁止解除減益${tt}`
      case 'taunt': return `嘲諷：敵人必須以普通攻擊鎖定此 Ranger${tt}`
      default: return `${EFFECT_ZH[e.type]}${e.pct ? ` ${e.pct}%` : ''}${tt}`
    }
  }
  if (lang === 'th') {
    const tt = e.turns ? ` (${e.turns} เทิร์น)` : ''
    switch (e.type) {
      case 'damage': return `สร้างความเสียหาย ${pct}% ของ ATK${pierceTh(e)}`
      case 'damageHp': return `สร้างความเสียหาย ${pct}% ของ HP สูงสุดของผู้ร่าย${pierceTh(e)}`
      case 'elementShift': return `เปลี่ยนธาตุเป้าเป็น${ELEMENT_LABEL[e.element ?? 'fire']}${tt}`
      case 'selfHpCost': return `แลกเลือดตัวเอง ${pct}% ของ HP สูงสุด (ไม่ตาย)`
      case 'selfVulnerable': return `ตัวเองเปราะบาง: รับดาเมจ +${pct}%${tt}`
      case 'trueDamage': return `ความเสียหายจริง ${pct}% ของ ATK (ไม่สนโล่ · ไม่หัก DEF)`
      case 'heal': return `ฟื้นฟู ${pct}% ของ${SCALE_TH[e.scale ?? 'targetHp']}`
      case 'shield': return `โล่ ${pct}% ของ${SCALE_TH[e.scale ?? 'targetHp']}${tt}`
      case 'regen': return `ฟื้นฟูต่อเนื่อง ${pct}% ของ${SCALE_TH[e.scale ?? 'targetHp']} ต่อเทิร์น${tt}`
      case 'energyGain': return `เพิ่ม Cost ให้ทีม +${e.amount ?? 1}`
      case 'poison': case 'burn': case 'bleed': return `${STATUS[e.type][1]} ${pct}% ของ ATK ต่อเทิร์น${tt}`
      case 'lifesteal': return `ดูดเลือด ${pct}% ของดาเมจ แบ่งให้${LIFESTEAL_TH[e.scope ?? 'self']}`
      case 'actionAdvance': return `ดึงเทิร์น ${pct}%`
      case 'speedUp': return `เร่งความเร็ว +${pct}% Speed${tt}`
      case 'speedDown': return `ลดความเร็ว −${pct}% Speed${tt}`
      case 'vulnerable': return `เปราะบาง: เป้ารับดาเมจ +${pct}%${tt}`
      case 'toughUp': return `ทนทาน: รับดาเมจ −${pct}%${tt}`
      case 'skillDmgResUp': return `ต้านดาเมจสกิล +${pct}%${tt}`
      case 'healBlock': return `ลดการฟื้นฟู ${pct || 100}%${tt}`
      case 'turnBurn': return `เร่งเทิร์นของเป้า ${e.turns ?? 1} เทิร์น (ดาเมจต่อเนื่องทำงานทันที)`
      case 'sealCleanse': return `ขัดขวางการล้างผลด้านลบ${tt}`
      case 'taunt': return `ยั่วยุ: ศัตรูต้องตีปกติใส่ตัวนี้${tt}`
      default: return `${EFFECTS[e.type].label}${e.pct ? ` ${e.pct}%` : ''}${tt}`
    }
  }
  const tt = e.turns ? ` (${e.turns} turn${e.turns > 1 ? 's' : ''})` : ''
  switch (e.type) {
    case 'damage': return `Damage ${pct}% of ATK${pierceEn(e)}`
    case 'damageHp': return `Damage ${pct}% of caster's max HP${pierceEn(e)}`
    case 'elementShift': return `Target's element becomes ${ELEMENT_EN[e.element ?? 'fire']}${tt}`
    case 'selfHpCost': return `Costs ${pct}% of caster's max HP (cannot kill)`
    case 'selfVulnerable': return `Caster becomes vulnerable: takes +${pct}% damage${tt}`
    case 'trueDamage': return `True damage ${pct}% of ATK (ignores shield & DEF)`
    case 'heal': return `Heal ${pct}% of ${SCALE_EN[e.scale ?? 'targetHp']}`
    case 'shield': return `Shield ${pct}% of ${SCALE_EN[e.scale ?? 'targetHp']}${tt}`
    case 'regen': return `Regenerate ${pct}% of ${SCALE_EN[e.scale ?? 'targetHp']} per turn${tt}`
    case 'energyGain': return `Team Cost +${e.amount ?? 1}`
    case 'poison': case 'burn': case 'bleed': return `${EFFECT_EN[e.type]} ${pct}% ATK per turn${tt}`
    case 'lifesteal': return `Lifesteal ${pct}% of damage, split among ${LIFESTEAL_EN[e.scope ?? 'self']}`
    case 'actionAdvance': return `Action advance ${pct}%`
    case 'speedUp': return `Speed +${pct}%${tt}`
    case 'vulnerable': return `Vulnerable: target takes +${pct}% damage${tt}`
    case 'toughUp': return `Tough: takes −${pct}% damage${tt}`
    case 'skillDmgResUp': return `Skill damage resistance +${pct}%${tt}`
    case 'healBlock': return `Healing reduced ${pct || 100}%${tt}`
    case 'turnBurn': return `Burn ${e.turns ?? 1} turn(s) off the target's statuses (DoT ticks now)`
    case 'sealCleanse': return `Cleanse sealed${tt}`
    case 'taunt': return `Taunt: enemies must normal-attack this hero${tt}`
    case 'speedDown': return `Speed −${pct}%${tt}`
    default: return `${EFFECT_EN[e.type]}${e.pct ? ` ${e.pct}%` : ''}${tt}`
  }
}

/** ชื่อจากข้อมูลเกมตามภาษา (繁中 Ranger 名稱優先採用 Ranger Book 翻譯資料庫) */
export const localName = (
  name: { en: string | null; th: string | null; zh?: string | null } | null | undefined,
  idOrCode?: string | null,
): string | null => {
  if (lang === 'zh-TW') {
    return name?.zh ?? properNameZhTw(idOrCode) ?? name?.en ?? name?.th ?? null
  }
  if (!name) return null
  return lang === 'th' ? name.th ?? name.en : name.en ?? name.th
}
