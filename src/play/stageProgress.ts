import { useEffect, useState } from 'react'

const KEY = 'rangerepic:stage-stars'
export type StageStars = Record<string, number>

const clampStars = (stars: number): number => Math.max(1, Math.min(3, Math.floor(stars)))

function load(): StageStars {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(raw).flatMap(([id, value]) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? [[id, clampStars(value)]] : []))
  } catch {
    return {}
  }
}

let state: StageStars = load()
const listeners = new Set<(stars: StageStars) => void>()

function publish(next: StageStars): void {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* persistence is optional */ }
  for (const listener of listeners) listener(next)
}

export function useStageStars(): StageStars {
  const [stars, setStars] = useState(state)
  useEffect(() => {
    listeners.add(setStars)
    setStars(state)
    return () => { listeners.delete(setStars) }
  }, [])
  return stars
}

/** Keep the best clear rating for each stage. */
export function recordStageStars(stageId: string, stars: number): void {
  const next = clampStars(stars)
  if ((state[stageId] ?? 0) >= next) return
  publish({ ...state, [stageId]: next })
}
