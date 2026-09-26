/** Stage-clear rating: one star per surviving Ranger, clamped to the 1–3 star range. */
export function starsForSurvivors(survivors: number): number {
  return Math.max(1, Math.min(3, Math.floor(survivors)))
}
