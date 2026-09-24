// ====================================================
// statusLabels.ts — ชื่อสั้นของสถานะ ใช้ร่วมกันระหว่างฉากรบ (ป้ายลอย/ใต้หลอดเลือด) กับ HUD
// หน้าดวลใช้ภาษาอังกฤษทั้งหมด (ฟอนต์ LineBold ครอบคลุมอังกฤษ/ตัวเลข)
// ====================================================

import { isDebuff, type StatusType } from './battle'

/** ป้ายสั้นของสถานะ (ลอยตอนได้รับ + แสดงใต้หลอดเลือด + ชิปในแผงคำสั่ง) */
export const STATUS_LABEL: Record<StatusType, string> = {
  stun: 'STUN', silence: 'SILENCE', healBlock: 'HEAL BLOCK', atkDown: 'ATK▼', evadeDown: 'EVA▼',
  skillEvadeDown: 'S.EVA▼', skillResDown: 'RES▼', speedDown: 'SPD▼', critDown: 'CRIT▼', critDmgDown: 'C.DMG▼', hitDown: 'HIT▼', skillHitDown: 'S.HIT▼',
  vulnerable: 'VULNERABLE', sealCleanse: 'NO CLEANSE', elementShift: 'ELEMENT',
  poison: 'POISON', burn: 'BURN', bleed: 'BLEED',
  atkUp: 'ATK▲', regen: 'REGEN', shield: 'SHIELD', barrier: 'BARRIER', evadeUp: 'EVA▲', skillEvadeUp: 'S.EVA▲',
  skillResUp: 'RES▲', speedUp: 'SPD▲', critDmgUp: 'C.DMG▲', critUp: 'CRIT▲', hitUp: 'HIT▲', skillHitUp: 'S.HIT▲',
  toughUp: 'TOUGH▲', skillDmgResUp: 'S.RES▲', taunt: 'TAUNT',
}

export const isDebuffLabel = (t: StatusType): boolean => isDebuff(t)
