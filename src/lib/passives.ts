// ====================================================
// passives.ts — พาสซีฟพิเศษประจำตัวเรนเจอร์ (ติดตัวตลอดเกม ไม่ต้องร่าย ไม่เสีย Cost)
//
// ต่างจาก "ความสามารถประจำอาชีพ" (lib/roleTraits.ts) ตรงที่พาสซีฟตั้งเองได้รายตัวในหน้า editor
// ใส่ได้หลายอันต่อตัว · ชนิดเดียวกันหลายอัน = บวกกัน
// ใช้เป็นที่เก็บของพิเศษ เช่น โบนัสลอบสังหาร (ที่ย้ายออกจากอาชีพนักฆ่ามา) หรือรางวัลจากการปลดขีดจำกัดในอนาคต
// ====================================================

export type PassiveType = 'execute' | 'lifesteal' | 'tough' | 'atkUp' | 'critUp' | 'speedUp' | 'healUp'

export interface PassiveDef {
  type: PassiveType
  /** ค่าของพาสซีฟ (%) */
  pct: number
}

export const PASSIVES: Record<PassiveType, { label: string; note: string; max: number; default: number }> = {
  execute: { label: 'ลอบสังหาร', note: 'ตีเป้าที่เลือดต่ำกว่าครึ่งหลอด แรงขึ้น x%', max: 100, default: 30 },
  lifesteal: { label: 'ดูดเลือด', note: 'ฟื้นเลือดตัวเอง x% ของดาเมจที่ทำได้', max: 100, default: 15 },
  tough: { label: 'อึด', note: 'รับความเสียหายทุกแหล่งลดลง x%', max: 50, default: 10 },
  atkUp: { label: 'พลังโจมตีติดตัว', note: 'พลังโจมตีมากขึ้น x% ตลอดเกม', max: 100, default: 10 },
  critUp: { label: 'คริติคอลติดตัว', note: 'อัตราคริมากขึ้น x จุด ตลอดเกม', max: 100, default: 10 },
  speedUp: { label: 'ความเร็วติดตัว', note: 'ความเร็วมากขึ้น x% ตลอดเกม', max: 50, default: 10 },
  healUp: { label: 'มือฟื้นฟู', note: 'ฮีล/โล่ที่ตัวนี้ให้ แรงขึ้น x%', max: 100, default: 20 },
}

export const PASSIVE_TYPES = Object.keys(PASSIVES) as PassiveType[]

/** รวมค่าพาสซีฟชนิดหนึ่ง (%) — ไม่มี = 0 */
export const passiveSum = (list: PassiveDef[] | undefined, type: PassiveType): number =>
  (list ?? []).filter(p => p.type === type).reduce((n, p) => n + (p.pct || 0), 0)

export const newPassive = (type: PassiveType): PassiveDef => ({ type, pct: PASSIVES[type].default })
