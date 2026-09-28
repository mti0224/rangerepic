/**
 * Enemy charge timing.
 *
 * The turn on which the enemy chooses the charged action is charge turn 1.
 * Therefore a 3-turn charge chosen on turn n releases on n + 2.
 */
export function initialChargeProgress(required: number): number {
  return required > 0 ? 1 : 0
}

export function shouldReleaseChargedAction(progress: number, required: number): boolean {
  if (required <= 1) return true
  return progress >= required - 1
}

export function advanceChargeProgress(progress: number, required: number): number {
  return Math.min(Math.max(1, required), progress + 1)
}
