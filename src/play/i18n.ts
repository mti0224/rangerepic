// ====================================================
// i18n.ts — ภาษาของหน้าดวล (อังกฤษ / ไทย / จีนไต้หวัน / ญี่ปุ่น) · เลือกได้ในเมนูตั้งค่า
//
// 記住本機語言選擇；RangerEpic 預設 = 繁體中文
// ข้อความทั้งหมดของหน้าดวลมาจากไฟล์นี้: HUD · เมนู · ป้ายลอย · ป้ายสถานะ · คำอธิบายสกิล · การ์ดข้อมูล
// ชื่อเรนเจอร์/สกิลใช้ชื่อจากข้อมูลเกมตามภาษา (ภาษาที่เลือกไม่มี → ไล่ไปภาษาถัดไปที่มี)
// ตัวย่อค่าพลัง (HP ATK DEF SPD CRIT) และตัวเลขใช้แบบเดียวกันทุกภาษา
//
// ทุกตารางเก็บเป็นชุด 4 ช่องเรียงตาม LANGS: [en, th, zh, jp]
// เพิ่มภาษาใหม่ = เพิ่มรหัสใน LANGS แล้วเติมช่องที่ท้ายทุกตาราง (TypeScript จะฟ้องให้เองถ้าลืม)
// ====================================================

import type { Element, Role } from '@/lib/rangerClass'
import type { HealScale, LifestealScope, SkillArea, SkillEffect } from '@/lib/skills'
import type { StatusType } from './battle'

export type Lang = 'en' | 'th' | 'zh' | 'jp'
export const LANGS: Lang[] = ['en', 'th', 'zh', 'jp']
/** ป้ายชื่อภาษาบนปุ่มเลือกภาษา — เขียนด้วยภาษานั้นเอง */
export const LANG_LABEL: Record<Lang, string> = { en: 'EN', th: 'ไทย', zh: '繁中', jp: '日本語' }
/** ข้อความ 1 ชุด เรียงตาม LANGS */
type L4 = readonly [string, string, string, string]
const STORAGE_KEY = 'lr:lang:v3'

const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as string[]).includes(v)

let lang: Lang = (() => {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return isLang(v) ? v : 'zh'
  } catch { return 'zh' }
})()

export const getLang = (): Lang => lang
/** ช่องของภาษาปัจจุบันในตาราง L4 */
const li = (): number => {
  const i = LANGS.indexOf(lang)
  return i < 0 ? 0 : i
}

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

/** ข้อความคงที่ [en, th, zh, jp] */
const TEXT = {
  turn: ['TURN', 'เทิร์น', '回合', 'ターン'],
  ally: ['ALLY', 'ทีมเรา', '我方', '味方'],
  enemy: ['ENEMY', 'ศัตรู', '敵方', '敵'],
  overtime: ['OVERTIME · DMG ×', 'ต่อเวลา · ดาเมจ ×', '延長賽 · 傷害 ×', '延長戦 · ダメージ ×'],
  attack: ['Attack', 'ตีธรรมดา', '普通攻擊', '通常攻撃'],
  skill1: ['Skill 1', 'สกิล 1', '技能 1', 'スキル1'],
  skill2: ['Skill 2', 'สกิล 2', '技能 2', 'スキル2'],
  teamCost: ['Team Cost +1', 'เพิ่ม Cost ให้ทีม +1', '隊伍能量 +1', 'チームコスト +1'],
  shieldPlus: ['SHIELD +', 'โล่ +', '護盾 +', 'シールド +'],
  shield: ['SHIELD', 'โล่', '護盾', 'シールド'],
  dispel: ['DISPEL', 'ล้างบัฟ', '驅散增益', 'バフ解除'],
  cleanse: ['CLEANSE', 'ล้างดีบัฟ', '淨化', '状態回復'],
  immune: ['IMMUNE', 'กันได้', '無效', '無効'],
  status: ['STATUS', 'สถานะ', '狀態', 'ステータス'],
  paused: ['PAUSED', 'หยุดชั่วคราว', '已暫停', '一時停止'],
  victory: ['VICTORY!', 'ชนะแล้ว!', '勝利！', '勝利！'],
  defeat: ['DEFEAT', 'แพ้', '敗北', '敗北'],
  draw: ['DRAW', 'เสมอ', '平手', '引き分け'],
  timeUp: ['TIME UP · HP', 'หมดเวลา · เลือด', '時間到 · HP', 'タイムアップ · HP'],
  turnLimit: ['TURN LIMIT · HP', 'ครบเทิร์น · เลือด', '回合上限 · HP', 'ターン上限 · HP'],
  retry: ['↻ RETRY', '↻ เล่นอีกครั้ง', '↻ 再試一次', '↻ もう一度'],
  team: ['← TEAM', '← จัดทีม', '← 隊伍', '← 編成'],
  settings: ['SETTINGS', 'ตั้งค่า', '設定', '設定'],
  resume: ['▶ RESUME', '▶ เล่นต่อ', '▶ 繼續', '▶ 再開'],
  pause: ['⏸ PAUSE', '⏸ หยุดชั่วคราว', '⏸ 暫停', '⏸ 一時停止'],
  restart: ['↻ RESTART', '↻ เริ่มใหม่', '↻ 重新開始', '↻ やり直す'],
  backToTeam: ['← BACK TO TEAM', '← กลับไปจัดทีม', '← 返回編隊', '← 編成に戻る'],
  close: ['CLOSE', 'ปิด', '關閉', '閉じる'],
  language: ['LANGUAGE · ENGLISH', 'ภาษา · ไทย', '語言 · 繁體中文', '言語 · 日本語'],
  cutinOn: ['SKILL CUT-IN · ON', 'คัตซีนสกิล · เปิด', '技能演出 · 開', 'スキル演出 · ON'],
  cutinOff: ['SKILL CUT-IN · OFF', 'คัตซีนสกิล · ปิด', '技能演出 · 關', 'スキル演出 · OFF'],
  unitCardOn: ['HOVER INFO · ON', 'ข้อมูลเมื่อชี้เรนเจอร์ · เปิด', '滑鼠資訊 · 開', 'カーソル情報 · ON'],
  unitCardOff: ['HOVER INFO · OFF', 'ข้อมูลเมื่อชี้เรนเจอร์ · ปิด', '滑鼠資訊 · 關', 'カーソル情報 · OFF'],
  // ป้ายลอยในฉาก
  stunned: ['STUNNED', 'ชะงัก!', '暈眩！', 'スタン！'],
  miss: ['MISS', 'หลบ', '閃避', 'ミス'],
  barrierBreak: ['BARRIER BREAK', 'บาเรียแตก', '無敵破除', 'バリア破壊'],
  blocked: ['BLOCKED', 'โล่รับไว้', '護盾擋下', 'シールドが吸収'],
  resist: ['RESIST', 'ต้าน', '抵抗', '耐性'],
  advanced: ['TURN ▲', 'ดึงเทิร์น', '行動提前', '行動短縮'],
  cooldown: ['TURNS', 'เทิร์น', '回合', 'ターン'],
} as const satisfies Record<string, L4>

export type TextKey = keyof typeof TEXT
export const t = (k: TextKey): string => TEXT[k][li()]

/** จำนวนเทิร์น แบบสั้น (ป้ายสถานะ) */
const TURNS_SHORT: L4 = ['{n}T', '{n} เทิร์น', '{n}回合', '{n}ターン']
export const turnsShort = (n: number): string => TURNS_SHORT[li()].replace('{n}', String(n))
/** วงเล็บบอกจำนวนเทิร์นท้ายข้อความ */
const TURNS_SUFFIX: L4 = [' ({n} turns)', ' ({n} เทิร์น)', '（{n} 回合）', '（{n}ターン）']

const STATUS: Record<StatusType, L4> = {
  stun: ['STUN', 'ชะงัก', '暈眩', 'スタン'],
  silence: ['SILENCE', 'ห้ามสกิล', '沉默', '沈黙'],
  healBlock: ['HEAL BLOCK', 'ห้ามฟื้นฟู', '治療減少', '回復阻害'],
  atkDown: ['ATK▼', 'ATK▼', '攻擊▼', '攻撃▼'],
  evadeDown: ['EVA▼', 'หลบ▼', '閃避▼', '回避▼'],
  skillEvadeDown: ['S.EVA▼', 'หลบสกิล▼', '技閃▼', '技回避▼'],
  skillResDown: ['RES▼', 'ต้าน▼', '抗性▼', '耐性▼'],
  speedDown: ['SPD▼', 'SPD▼', '速度▼', '速度▼'],
  critDown: ['CRIT▼', 'คริ▼', '爆擊▼', '会心▼'],
  critDmgDown: ['C.DMG▼', 'คริดาเมจ▼', '爆傷▼', '会心DMG▼'],
  hitDown: ['HIT▼', 'แม่น▼', '命中▼', '命中▼'],
  skillHitDown: ['S.HIT▼', 'แม่นสกิล▼', '技命中▼', '技命中▼'],
  poison: ['POISON', 'พิษ', '中毒', '毒'],
  burn: ['BURN', 'ไฟไหม้', '燃燒', '火傷'],
  bleed: ['BLEED', 'เลือดไหล', '流血', '出血'],
  atkUp: ['ATK▲', 'ATK▲', '攻擊▲', '攻撃▲'],
  regen: ['REGEN', 'ฟื้นฟู', '持續治療', '継続回復'],
  shield: ['SHIELD', 'โล่', '護盾', 'シールド'],
  barrier: ['BARRIER', 'อมตะ', '無敵', '無敵'],
  evadeUp: ['EVA▲', 'หลบ▲', '閃避▲', '回避▲'],
  skillEvadeUp: ['S.EVA▲', 'หลบสกิล▲', '技閃▲', '技回避▲'],
  skillResUp: ['RES▲', 'ต้าน▲', '抗性▲', '耐性▲'],
  speedUp: ['SPD▲', 'SPD▲', '速度▲', '速度▲'],
  critDmgUp: ['C.DMG▲', 'คริดาเมจ▲', '爆傷▲', '会心DMG▲'],
  critUp: ['CRIT▲', 'คริ▲', '爆擊▲', '会心▲'],
  hitUp: ['HIT▲', 'แม่น▲', '命中▲', '命中▲'],
  skillHitUp: ['S.HIT▲', 'แม่นสกิล▲', '技命中▲', '技命中▲'],
  vulnerable: ['VULNERABLE', 'เปราะบาง', '脆弱', '被ダメ増'],
  sealCleanse: ['NO CLEANSE', 'ล้างไม่ได้', '無法淨化', '解除不可'],
  elementShift: ['ELEMENT', 'เปลี่ยนธาตุ', '屬性變更', '属性変化'],
  toughUp: ['TOUGH▲', 'ทนทาน▲', '堅韌▲', '耐久▲'],
  skillDmgResUp: ['S.DMG RES▲', 'ต้านดาเมจสกิล▲', '技傷抗▲', '技ダメ耐性▲'],
  reflect: ['REFLECT', 'สะท้อน', '反射', '反射'],
  taunt: ['TAUNT', 'ยั่วยุ', '嘲諷', '挑発'],
}
/** ชื่อสั้นของสถานะ (ป้ายลอย · ใต้หลอดเลือด · ชิป) */
export const statusLabel = (s: StatusType): string => STATUS[s][li()]

const ELEMENT: Record<Element, L4> = {
  fire: ['Fire', 'ไฟ', '火', '火'],
  water: ['Water', 'น้ำ', '水', '水'],
  wood: ['Wood', 'ไม้', '木', '木'],
  light: ['Light', 'แสง', '光', '光'],
  dark: ['Dark', 'มืด', '暗', '闇'],
}
export const elementName = (e: Element): string => ELEMENT[e][li()]

const ROLE: Record<Role, L4> = {
  tank: ['Tank', 'แทงค์', '坦克', 'タンク'],
  fighter: ['Fighter', 'ไฟเตอร์', '戰士', 'ファイター'],
  shooter: ['Shooter', 'นักยิง', '射手', 'シューター'],
  assassin: ['Assassin', 'นักฆ่า', '刺客', 'アサシン'],
  mage: ['Mage', 'นักเวท', '法師', 'メイジ'],
  support: ['Support', 'ซัพพอร์ต', '輔助', 'サポート'],
}
export const roleName = (r: Role): string => ROLE[r][li()]

const AREA_SHORT: Record<SkillArea, L4> = {
  single_front: ['Single · Front', 'เดี่ยว · แถวหน้า', '單體 · 前排', '単体 · 前列'],
  single_any: ['Single · Any', 'เดี่ยว · ตัวไหนก็ได้', '單體 · 任意', '単体 · 任意'],
  row: ['Row', 'ทั้งแถว', '整排', '一列'],
  row_any: ['Row · any', 'ทั้งแถว · เลือกแถว', '整排 · 指定', '一列 · 指定'],
  all: ['All enemies', 'ศัตรูทั้งหมด', '全體敵人', '敵全体'],
  self: ['Self', 'ตัวเอง', '自身', '自分'],
  own_row: ['Own row', 'แถวตัวเอง', '自身該排', '自分の列'],
  ally_single: ['One ally', 'เพื่อน 1 ตัว', '單一隊友', '味方1体'],
  ally_all: ['All allies', 'เพื่อนทั้งหมด', '全體隊友', '味方全体'],
}
const AREA_LONG: Record<SkillArea, L4> = {
  single_front: ['Single target (front row first)', 'โจมตีเดี่ยว (แถวหน้าก่อน)', '單體攻擊（優先前排）', '単体攻撃（前列優先）'],
  single_any: ['Single target (any enemy)', 'โจมตีเดี่ยว (ตัวไหนก็ได้)', '單體攻擊（任意目標）', '単体攻撃（任意の敵）'],
  row: ['Whole enemy row (front row first)', 'โจมตีทั้งแถว (แถวหน้าก่อน)', '整排敵人（優先前排）', '敵1列（前列優先）'],
  row_any: ['Whole enemy row (choose any row)', 'โจมตีทั้งแถว (เลือกแถวไหนก็ได้)', '整排敵人（可指定排）', '敵1列（列を指定）'],
  all: ['All enemies', 'โจมตีศัตรูทั้งหมด', '全體敵人', '敵全体'],
  self: ['Self', 'บัฟตัวเอง', '自身', '自分'],
  own_row: ['Allies in own row', 'บัฟแถวของตัวเอง', '自身該排的隊友', '自分の列の味方'],
  ally_single: ['One chosen ally', 'บัฟเพื่อน 1 ตัวที่เลือก', '指定的單一隊友', '選んだ味方1体'],
  ally_all: ['All allies', 'บัฟเพื่อนทั้งหมด', '全體隊友', '味方全体'],
}
export const areaShort = (a: SkillArea): string => AREA_SHORT[a][li()]
export const areaLong = (a: SkillArea): string => AREA_LONG[a][li()]

/** ชื่อความสามารถแบบสั้น (ใช้เป็นข้อความสำรองเมื่อไม่มีประโยคเต็ม) */
const EFFECT_NAME: Record<SkillEffect['type'], L4> = {
  damage: ['Damage', 'สร้างความเสียหาย', '傷害', 'ダメージ'],
  damageHp: ["Damage (caster max HP)", 'ความเสียหายตามเลือดผู้ร่าย', '依施術者最大HP的傷害', '使用者の最大HP依存ダメージ'],
  trueDamage: ['True damage', 'ความเสียหายจริง', '真實傷害', '固定ダメージ'],
  breakInvincible: ['Pierce invincibility', 'ยกเลิกทักษะอมตะ', '破除無敵', '無敵貫通'],
  stun: ['Stun', 'ชะงัก', '暈眩', 'スタン'],
  silence: ['Silence', 'ห้ามสกิล', '沉默', '沈黙'],
  healBlock: ['Heal block', 'ลดการฟื้นฟู', '治療減少', '回復阻害'],
  dispelBuffs: ['Dispel enemy buffs', 'ล้างบัฟศัตรู', '驅散敵方增益', '敵のバフ解除'],
  skillEvadeDown: ['Skill Evade down', 'ลดหลบสกิล', '技能閃避下降', '技回避ダウン'],
  skillResDown: ['Skill Resistance down', 'ลดต้านสกิล', '技能抗性下降', '技耐性ダウン'],
  evadeDown: ['Evade down', 'ลดการหลบ', '閃避下降', '回避ダウン'],
  atkDown: ['ATK down', 'ลด ATK', '攻擊下降', '攻撃ダウン'],
  speedDown: ['Speed down', 'ลดความเร็ว', '速度下降', '速度ダウン'],
  critDown: ['Crit Rate down', 'ลดอัตราคริ', '爆擊率下降', '会心率ダウン'],
  critDmgDown: ['Crit Damage down', 'ลดคริดาเมจ', '爆擊傷害下降', '会心ダメージダウン'],
  hitDown: ['Hit Rate down', 'ลดความแม่น', '命中下降', '命中ダウン'],
  skillHitDown: ['Skill Hit down', 'ลดความแม่นสกิล', '技能命中下降', '技命中ダウン'],
  poison: ['Poison', 'พิษ', '中毒', '毒'],
  burn: ['Burn', 'ไฟไหม้', '燃燒', '火傷'],
  bleed: ['Bleed', 'เลือดไหล', '流血', '出血'],
  lifesteal: ['Lifesteal', 'ดูดเลือด', '吸血', '吸血'],
  actionAdvance: ['Action advance', 'ดึงเทิร์น', '行動提前', '行動短縮'],
  vulnerable: ['Vulnerable', 'เปราะบาง', '脆弱', '被ダメージ増加'],
  turnBurn: ['Burn turns', 'เร่งเทิร์น', '回合加速', 'ターン促進'],
  sealCleanse: ['Seal cleanse', 'ขัดขวางการล้าง', '封鎖淨化', '解除封印'],
  elementShift: ['Element shift', 'เปลี่ยนธาตุ', '屬性變更', '属性変化'],
  selfHpCost: ['Self HP cost', 'แลกด้วยเลือดตัวเอง', '消耗自身HP', '自身HP消費'],
  selfVulnerable: ['Self vulnerable', 'ตัวเองเปราะบาง', '自身脆弱', '自身被ダメ増'],
  toughUp: ['Tough up', 'ทนทาน', '堅韌提升', '耐久アップ'],
  skillDmgResUp: ['Skill DMG Res up', 'ต้านดาเมจสกิล', '技能傷害抗性提升', '技ダメ耐性アップ'],
  reflect: ['Reflect', 'สะท้อนดาเมจ', '反射', '反射'],
  taunt: ['Taunt', 'ยั่วยุ', '嘲諷', '挑発'],
  atkUp: ['ATK up', 'เพิ่ม ATK', '攻擊提升', '攻撃アップ'],
  heal: ['Heal', 'ฟื้นฟู', '治療', '回復'],
  regen: ['Regeneration', 'ฟื้นฟูต่อเนื่อง', '持續治療', '継続回復'],
  shield: ['Shield', 'โล่', '護盾', 'シールド'],
  barrier: ['Invincible barrier', 'ทักษะอมตะ', '無敵護罩', '無敵バリア'],
  evadeUp: ['Evade up', 'เพิ่มการหลบ', '閃避提升', '回避アップ'],
  skillEvadeUp: ['Skill Evade up', 'เพิ่มหลบสกิล', '技能閃避提升', '技回避アップ'],
  skillResUp: ['Skill Resistance up', 'เพิ่มต้านสกิล', '技能抗性提升', '技耐性アップ'],
  speedUp: ['Speed up', 'เพิ่มความเร็ว', '速度提升', '速度アップ'],
  critDmgUp: ['Crit Damage up', 'เพิ่มคริดาเมจ', '爆擊傷害提升', '会心ダメージアップ'],
  critUp: ['Crit Rate up', 'เพิ่มอัตราคริ', '爆擊率提升', '会心率アップ'],
  hitUp: ['Hit Rate up', 'เพิ่มความแม่น', '命中提升', '命中アップ'],
  skillHitUp: ['Skill Hit up', 'เพิ่มความแม่นสกิล', '技能命中提升', '技命中アップ'],
  cleanse: ['Cleanse', 'ล้างผลด้านลบ', '淨化', '状態異常解除'],
  energyGain: ['Team Cost', 'เพิ่ม Cost ให้ทีม', '隊伍能量', 'チームコスト'],
}

const SCALE: Record<HealScale, L4> = {
  targetHp: ["target's max HP", 'HP สูงสุดของเป้า', '目標最大HP', '対象の最大HP'],
  casterHp: ["caster's max HP", 'HP สูงสุดของผู้ร่าย', '施術者最大HP', '使用者の最大HP'],
  casterAtk: ["caster's ATK", 'ATK ผู้ร่าย', '施術者攻擊力', '使用者の攻撃力'],
}
const LIFESTEAL: Record<LifestealScope, L4> = {
  self: ['self', 'ตัวเอง', '自身', '自分'],
  own_row: ['own row', 'แถวตัวเอง', '自身該排', '自分の列'],
  ally_all: ['all allies', 'เพื่อนทั้งหมด', '全體隊友', '味方全体'],
}
/** ส่วนต่อท้ายตอนเพิกเฉยโล่ขาว */
const PIERCE: L4 = [' · ignores {n}% of shields', ' · ข้ามโล่ {n}%', ' · 無視 {n}% 護盾', ' · シールド{n}%無視'];

/**
 * ประโยคเต็มของความสามารถ — ช่องว่างที่แทนค่าได้:
 * {pct} {pct100} {turns} {amount} {scale} {el} {scope} {dot} {pierce} {tt}
 */
const EFFECT_TEXT: Partial<Record<SkillEffect['type'], L4>> = {
  damage: ['Damage {pct}% of ATK{pierce}', 'สร้างความเสียหาย {pct}% ของ ATK{pierce}', '造成攻擊力 {pct}% 的傷害{pierce}', '攻撃力の{pct}%のダメージ{pierce}'],
  damageHp: ["Damage {pct}% of caster's max HP{pierce}", 'สร้างความเสียหาย {pct}% ของ HP สูงสุดของผู้ร่าย{pierce}', '造成施術者最大HP {pct}% 的傷害{pierce}', '使用者の最大HPの{pct}%のダメージ{pierce}'],
  trueDamage: ['True damage {pct}% of ATK (ignores shield & DEF)', 'ความเสียหายจริง {pct}% ของ ATK (ไม่สนโล่ · ไม่หัก DEF)', '真實傷害：攻擊力 {pct}%（無視護盾與防禦）', '固定ダメージ：攻撃力の{pct}%（シールド・防御無視）'],
  elementShift: ["Target's element becomes {el}{tt}", 'เปลี่ยนธาตุเป้าเป็น{el}{tt}', '將目標屬性變為{el}{tt}', '対象の属性を{el}に変更{tt}'],
  selfHpCost: ["Costs {pct}% of caster's max HP (cannot kill)", 'แลกเลือดตัวเอง {pct}% ของ HP สูงสุด (ไม่ตาย)', '消耗自身最大HP {pct}%（不會致死）', '自身の最大HPの{pct}%を消費（戦闘不能にはならない）'],
  selfVulnerable: ['Caster becomes vulnerable: takes +{pct}% damage{tt}', 'ตัวเองเปราะบาง: รับดาเมจ +{pct}%{tt}', '自身脆弱：受到傷害 +{pct}%{tt}', '自身が脆弱化：被ダメージ +{pct}%{tt}'],
  heal: ['Heal {pct}% of {scale}', 'ฟื้นฟู {pct}% ของ{scale}', '回復{scale}的 {pct}%', '{scale}の{pct}%回復'],
  shield: ['Shield {pct}% of {scale}{tt}', 'โล่ {pct}% ของ{scale}{tt}', '護盾：{scale}的 {pct}%{tt}', 'シールド：{scale}の{pct}%{tt}'],
  regen: ['Regenerate {pct}% of {scale} per turn{tt}', 'ฟื้นฟูต่อเนื่อง {pct}% ของ{scale} ต่อเทิร์น{tt}', '每回合回復{scale}的 {pct}%{tt}', '毎ターン{scale}の{pct}%回復{tt}'],
  energyGain: ['Team Cost +{amount}', 'เพิ่ม Cost ให้ทีม +{amount}', '隊伍能量 +{amount}', 'チームコスト +{amount}'],
  poison: ['{dot} {pct}% ATK per turn{tt}', '{dot} {pct}% ของ ATK ต่อเทิร์น{tt}', '{dot}：每回合攻擊力 {pct}%{tt}', '{dot}：毎ターン攻撃力の{pct}%{tt}'],
  burn: ['{dot} {pct}% ATK per turn{tt}', '{dot} {pct}% ของ ATK ต่อเทิร์น{tt}', '{dot}：每回合攻擊力 {pct}%{tt}', '{dot}：毎ターン攻撃力の{pct}%{tt}'],
  bleed: ['{dot} {pct}% ATK per turn{tt}', '{dot} {pct}% ของ ATK ต่อเทิร์น{tt}', '{dot}：每回合攻擊力 {pct}%{tt}', '{dot}：毎ターン攻撃力の{pct}%{tt}'],
  lifesteal: ['Lifesteal {pct}% of damage, split among {scope}', 'ดูดเลือด {pct}% ของดาเมจ แบ่งให้{scope}', '吸血：傷害的 {pct}%，分給{scope}', '吸血：ダメージの{pct}%を{scope}に分配'],
  actionAdvance: ['Action advance {pct}%', 'ดึงเทิร์น {pct}%', '行動提前 {pct}%', '行動短縮 {pct}%'],
  speedUp: ['Speed +{pct}%{tt}', 'เร่งความเร็ว +{pct}% Speed{tt}', '速度 +{pct}%{tt}', '速度 +{pct}%{tt}'],
  speedDown: ['Speed −{pct}%{tt}', 'ลดความเร็ว −{pct}% Speed{tt}', '速度 −{pct}%{tt}', '速度 −{pct}%{tt}'],
  vulnerable: ['Vulnerable: target takes +{pct}% damage{tt}', 'เปราะบาง: เป้ารับดาเมจ +{pct}%{tt}', '脆弱：目標受到傷害 +{pct}%{tt}', '脆弱：対象の被ダメージ +{pct}%{tt}'],
  toughUp: ['Tough: takes −{pct}% damage{tt}', 'ทนทาน: รับดาเมจ −{pct}%{tt}', '堅韌：受到傷害 −{pct}%{tt}', '耐久：被ダメージ −{pct}%{tt}'],
  skillDmgResUp: ['Skill damage resistance +{pct}%{tt}', 'ต้านดาเมจสกิล +{pct}%{tt}', '技能傷害抗性 +{pct}%{tt}', '技ダメージ耐性 +{pct}%{tt}'],
  reflect: ['Reflect {pct}% of damage taken{tt}', 'สะท้อนดาเมจที่ได้รับ {pct}%{tt}', '反射受到傷害的 {pct}%{tt}', '受けたダメージの{pct}%を反射{tt}'],
  healBlock: ['Healing reduced {pct100}%{tt}', 'ลดการฟื้นฟู {pct100}%{tt}', '治療效果降低 {pct100}%{tt}', '回復量 {pct100}% ダウン{tt}'],
  turnBurn: ["Burn {turns} turn(s) off the target's statuses (DoT ticks now)", 'เร่งเทิร์นของเป้า {turns} เทิร์น (ดาเมจต่อเนื่องทำงานทันที)', '目標狀態加速 {turns} 回合（持續傷害立即生效）', '対象の状態を{turns}ターン進める（継続ダメージが即発動）'],
  sealCleanse: ['Cleanse sealed{tt}', 'ขัดขวางการล้างผลด้านลบ{tt}', '無法淨化負面狀態{tt}', '状態異常を解除できない{tt}'],
  taunt: ['Taunt: enemies must normal-attack this hero{tt}', 'ยั่วยุ: ศัตรูต้องตีปกติใส่ตัวนี้{tt}', '嘲諷：敵人普通攻擊只能打這名英雄{tt}', '挑発：敵の通常攻撃はこのヒーローを狙う{tt}'],
}

/** ข้อความสั้นของความสามารถ 1 อย่าง พร้อมตัวเลข (tooltip สกิล) */
export function describeEffect(e: SkillEffect): string {
  const i = li()
  const tt = e.turns ? TURNS_SUFFIX[i].replace('{n}', String(e.turns)) : ''
  const fill = (s: string): string => s
    .replaceAll('{pct}', String(e.pct ?? 0))
    .replaceAll('{pct100}', String(e.pct || 100))
    .replaceAll('{turns}', String(e.turns ?? 1))
    .replaceAll('{amount}', String(e.amount ?? 1))
    .replaceAll('{scale}', SCALE[e.scale ?? 'targetHp'][i])
    .replaceAll('{el}', ELEMENT[e.element ?? 'fire'][i])
    .replaceAll('{scope}', LIFESTEAL[e.scope ?? 'self'][i])
    .replaceAll('{dot}', STATUS[e.type as StatusType]?.[i] ?? EFFECT_NAME[e.type][i])
    .replaceAll('{pierce}', e.pierce ? PIERCE[i].replace('{n}', String(e.pierce)) : '')
    .replaceAll('{tt}', tt)

  const tmpl = EFFECT_TEXT[e.type]
  if (tmpl) return fill(tmpl[i])
  return `${EFFECT_NAME[e.type][i]}${e.pct ? ` ${e.pct}%` : ''}${tt}`
}

/** ชื่อในข้อมูลเกม — มีครบ 4 ภาษา (บางตัวข้อมูลต้นทางไม่มีบางภาษา = null) */
export interface GameName { en: string | null; th: string | null; zh?: string | null; jp?: string | null }

/** ชื่อจากข้อมูลเกมตามภาษา — ภาษาที่เลือกไม่มีก็ไล่หาภาษาถัดไปที่มี */
export function localName(name: GameName | null | undefined): string | null {
  if (!name) return null
  const order: Lang[] = [lang, ...LANGS.filter(l => l !== lang)]
  for (const l of order) {
    const v = name[l]
    if (v && v.trim()) return v
  }
  return null
}
