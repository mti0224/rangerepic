// ====================================================
// passives.ts — พาสซีฟพิเศษประจำตัวเรนเจอร์ (ติดตัวตลอดเกม ไม่ต้องร่าย ไม่เสีย Cost)
//
// ต่างจาก "ความสามารถประจำอาชีพ" (lib/roleTraits.ts) ตรงที่พาสซีฟตั้งเองได้รายตัวในหน้า editor
// ใส่ได้หลายอันต่อตัว · ชนิดเดียวกันหลายอัน = บวกกัน
// ใช้เป็นที่เก็บของพิเศษ เช่น โบนัส斬殺 (ที่ย้ายออกจากอาชีพนักฆ่ามา) หรือรางวัลจากการปลดขีดจำกัดในอนาคต
// ====================================================

export type PassiveType = 'execute' | 'lifesteal' | 'tough' | 'atkUp' | 'critUp' | 'speedUp' | 'healUp'

export interface PassiveDef {
  type: PassiveType
  /** ค่าของพาสซีฟ (%) */
  pct: number
}

export const PASSIVES: Record<PassiveType, { label: string; note: string; max: number; default: number }> = {
  execute: { label: '斬殺', note: '攻擊體力低於 50% 的目標時，傷害提高 x%', max: 100, default: 30 },
  lifesteal: { label: '吸血', note: '恢復自身相當於造成傷害 x% 的體力', max: 100, default: 15 },
  tough: { label: '強韌', note: '受到的所有傷害降低 x%', max: 50, default: 10 },
  atkUp: { label: '常駐攻擊力', note: '整場戰鬥攻擊力提高 x%', max: 100, default: 10 },
  critUp: { label: '常駐爆擊率', note: '整場戰鬥爆擊率提高 x 點', max: 100, default: 10 },
  speedUp: { label: '常駐速度', note: '整場戰鬥速度提高 x%', max: 50, default: 10 },
  healUp: { label: '治療強化', note: '此 Ranger 提供的治療／護盾效果提高 x%', max: 100, default: 20 },
}

export const PASSIVE_TYPES = Object.keys(PASSIVES) as PassiveType[]

/** รวมค่าพาสซีฟชนิดหนึ่ง (%) — ไม่มี = 0 */
export const passiveSum = (list: PassiveDef[] | undefined, type: PassiveType): number =>
  (list ?? []).filter(p => p.type === type).reduce((n, p) => n + (p.pct || 0), 0)

export const newPassive = (type: PassiveType): PassiveDef => ({ type, pct: PASSIVES[type].default })
