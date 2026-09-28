/**
 * Enemy charge timing.
 *
 * The turn on which the enemy chooses the charged action is charge turn 1.
 * A 3-turn charge chosen on turn n therefore fills 1/3 on n, 2/3 on n+1,
 * then visibly fills 3/3 on n+2 before the locked action is released.
 *
 * progress stores completed charge-bar fills. On the selection turn it starts
 * at 0, then the center charge animation visually fills it to 1.
 */
export function initialChargeProgress(required: number): number {
  return required > 0 ? 0 : 0
}

/**
 * True when the charge animation performed this turn will fill the final stage.
 * The action must release only after that fill animation (and return-home step)
 * has completed.
 */
export function shouldReleaseChargedAction(progress: number, required: number): boolean {
  if (required <= 0) return false
  return advanceChargeProgress(progress, required) >= required
}

export function advanceChargeProgress(progress: number, required: number): number {
  return Math.min(Math.max(1, required), progress + 1)
}
