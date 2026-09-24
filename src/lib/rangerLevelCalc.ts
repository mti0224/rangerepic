// ====================================================
// rangerLevelCalc.ts — สูตรค่าพลังตามเลเวล (ถอดจาก app.js ของ lerico ผ่าน Line Ranger Kiwi)
//
// ใช้กับ public/rangers/<id>/stats.json ที่ได้จาก scripts/fetch-lerico.mjs
//   tier: isHyperUnit → hyper | isTranscendentUnit → ultra | grade 9 → base9 | อื่นๆ → base8
//   combineMax = ultra/hyper ? 20 : 4
//   playerMaxLevel = maxLevel + combineMax × 5
//   i = min(level−1, maxLevel−1)     เลเวลปกติ
//   j = max(0, level − maxLevel)     เลเวลหลังปลดลิมิต
//   k = 1 + (base8 เท่านั้น ? 0.2 × combineCount : 0)
//   stat = (initial + perLevel × i + perLevelAfterMax × j) × k
//   cooldown = max(1.3, productionSpeed × (1 − rates[limitBreakTier]))
//   ATK Speed = 10000 / attackDelay · ATK ต่อวินาที = ATK × 30 / attackDelay
// ====================================================

export type RangerTier = 'base8' | 'base9' | 'ultra' | 'hyper'

export interface StatGrowth { initial: number; perLevel: number; perLevelAfterMax: number }

const COOLDOWN_RATES: Record<'high' | 'base', number[]> = {
  high: [0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.09, 0.12, 0.15, 0.18, 0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.33, 0.36, 0.4, 0.45, 0.5],
  base: [0, 0.2, 0.3, 0.4, 0.5],
}

const isHigh = (tier: RangerTier) => tier === 'ultra' || tier === 'hyper'

export function combineMax(tier: RangerTier): number {
  return isHigh(tier) ? 20 : 4
}

export function playerMaxLevel(tier: RangerTier, maxLevel: number): number {
  return maxLevel + combineMax(tier) * 5
}

/** ค่าพลัง 1 ค่า ณ เลเวลและจำนวนครั้งที่ปลดลิมิต (combineCount) */
export function statAtLevel(g: StatGrowth, tier: RangerTier, maxLevel: number, level: number, combineCount = 0): number {
  const i = Math.min(level - 1, maxLevel - 1)
  const j = Math.max(0, level - maxLevel)
  const k = 1 + (tier === 'base8' ? 0.2 * combineCount : 0)
  return (g.initial + g.perLevel * i + g.perLevelAfterMax * j) * k
}

export function cooldownAt(productionSpeed: number, tier: RangerTier, limitBreakTier: number): number {
  const rates = COOLDOWN_RATES[isHigh(tier) ? 'high' : 'base']
  const r = rates[Math.max(0, Math.min(limitBreakTier, rates.length - 1))]
  return Math.max(1.3, productionSpeed * (1 - r))
}

/** attackDelay เป็นเฟรมที่ 30fps */
export const attackSpeed = (attackDelay: number): number => 10000 / attackDelay
export const atkPerSecond = (atk: number, attackDelay: number): number => (atk * 30) / attackDelay
