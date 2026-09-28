/**
 * Enemy charge timing.
 *
 * The turn on which the enemy chooses the charged action is charge turn 1.
 * A 3-turn charge chosen on turn n therefore releases on n + 2.
 *
 * progress stores completed charge-bar fills. On the selection turn it starts
 * at 0, then the center charge animation visually fills it to 1 before the
 * actor returns home.
 */
export function initialChargeProgress(required: number): number {
  return required > 0 ? 0 : 0
}

export function shouldReleaseChargedAction(progress: number, required: number): boolean {
  if (required <= 1) return true
  return progress >= required - 1
}

export function advanceChargeProgress(progress: number, required: number): number {
  return Math.min(Math.max(1, required), progress + 1)
}
