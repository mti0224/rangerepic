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

export type Lang = 'en' | 'th'
export const LANGS: Lang[] = ['en', 'th']
const STORAGE_KEY = 'lr:lang'

let lang: Lang = (() => {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return v === 'th' ? 'th' : 'en'
  } catch { return 'en' }
})()

export const getLang = (): Lang => lang
const listeners = new Set<(l: Lang) => void>()
export function setLang(next: Lang): void {
  lang = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* จำไม่ได้ก็ใช้ได้แค่รอบนี้ */ }
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

export type TextKey = keyof typeof TEXT
export const t = (k: TextKey): string => TEXT[k][lang === 'th' ? 1 : 0]

/** จำนวนเทิร์น แบบสั้น (ป้ายสถานะ) */
export const turnsShort = (n: number): string => (lang === 'th' ? `${n} เทิร์น` : `${n}T`)

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
/** ชื่อสั้นของสถานะ (ป้ายลอย · ใต้หลอดเลือด · ชิป) */
export const statusLabel = (s: StatusType): string => STATUS[s][lang === 'th' ? 1 : 0]

const ELEMENT: Record<Element, readonly [string, string]> = {
  fire: ['Fire', 'ไฟ'], water: ['Water', 'น้ำ'], wood: ['Wood', 'ไม้'], light: ['Light', 'แสง'], dark: ['Dark', 'มืด'],
}
export const elementName = (e: Element): string => ELEMENT[e][lang === 'th' ? 1 : 0]

const ROLE: Record<Role, readonly [string, string]> = {
  tank: ['Tank', 'แทงค์'], fighter: ['Fighter', 'ไฟเตอร์'], shooter: ['Shooter', 'นักยิง'],
  assassin: ['Assassin', 'นักฆ่า'], mage: ['Mage', 'นักเวท'], support: ['Support', 'ซัพพอร์ต'],
}
export const roleName = (r: Role): string => ROLE[r][lang === 'th' ? 1 : 0]

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
export const areaShort = (a: SkillArea): string => AREA_SHORT[a][lang === 'th' ? 1 : 0]
export const areaLong = (a: SkillArea): string => AREA_LONG[a][lang === 'th' ? 1 : 0]

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

const SCALE_TH: Record<HealScale, string> = { targetHp: 'HP สูงสุดของเป้า', casterHp: 'HP สูงสุดของผู้ร่าย', casterAtk: 'ATK ผู้ร่าย' }
const SCALE_EN: Record<HealScale, string> = { targetHp: "target's max HP", casterHp: "caster's max HP", casterAtk: "caster's ATK" }
const ELEMENT_EN: Record<Element, string> = { fire: 'Fire', water: 'Water', wood: 'Wood', light: 'Light', dark: 'Dark' }
/** เพิกเฉยโล่ขาวกี่ % (ไม่มี = ไม่ต้องบอก) */
const pierceTh = (e: SkillEffect) => (e.pierce ? ` · ข้ามโล่ ${e.pierce}%` : '')
const pierceEn = (e: SkillEffect) => (e.pierce ? ` · ignores ${e.pierce}% of shields` : '')

const LIFESTEAL_TH: Record<LifestealScope, string> = { self: 'ตัวเอง', own_row: 'แถวตัวเอง', ally_all: 'เพื่อนทั้งหมด' }
const LIFESTEAL_EN: Record<LifestealScope, string> = { self: 'self', own_row: 'own row', ally_all: 'all allies' }

/** ข้อความสั้นของความสามารถ 1 อย่าง พร้อมตัวเลข (tooltip สกิล) */
export function describeEffect(e: SkillEffect): string {
  const pct = e.pct ?? 0
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

/** ชื่อจากข้อมูลเกมตามภาษา (ไทยไม่มี → อังกฤษ) */
export const localName = (name: { en: string | null; th: string | null } | null | undefined): string | null =>
  !name ? null : lang === 'th' ? name.th ?? name.en : name.en ?? name.th
