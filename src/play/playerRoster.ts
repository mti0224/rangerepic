import type { GameplayCatalog } from '../lib/gameplayApi'
import type { GameplayCharacter, GameplayClass } from '../lib/gameplaySchema'
import type { RangerListItem } from '../lib/rangerApi'
import type { RangerConfig } from '../lib/rangerConfig'
import { adaptRangerConfigForGameplay } from '../lib/gameplayAdapter'

export interface RangerData {
  playId: string
  item: RangerListItem
  config: RangerConfig
  gameplayClass: GameplayClass
  gameplayCharacter: GameplayCharacter
}

/** Assets supply artwork only. A character must have an authored, usable class. */
export function buildPlayerRoster(catalog: GameplayCatalog, assets: RangerListItem[], configs: Map<string, RangerConfig>): RangerData[] {
  const characters = new Map(catalog.characters.map(c => [c.id, c]))
  const items = new Map(assets.filter(a => a.approved).map(a => [a.id, a]))
  return catalog.classes.flatMap(cls => {
    const character = characters.get(cls.characterId)
    const item = items.get(cls.assetVariantId)
    const config = configs.get(cls.assetVariantId)
    if (!character || !item || !config) return []
    return [{ playId: cls.id, item, config: adaptRangerConfigForGameplay(config, cls), gameplayClass: cls, gameplayCharacter: character }]
  })
}

export function groupPlayerCharacters(data: RangerData[]) {
  const groups = new Map<string, { character: GameplayCharacter; classes: RangerData[] }>()
  for (const row of data) {
    const id = row.gameplayCharacter.id
    if (!groups.has(id)) groups.set(id, { character: row.gameplayCharacter, classes: [] })
    groups.get(id)!.classes.push(row)
  }
  return [...groups.values()]
}

export const SLOT_KEYS = ['front-0', 'front-1', 'back-0', 'back-1', 'back-2'] as const
/** Battle parties may occupy any formation slots, but can field at most 3 Rangers. */
export const MAX_BATTLE_RANGERS = 3
export type SlotKey = typeof SLOT_KEYS[number]
export type TeamSlots = Record<SlotKey, string | null>
export type Formation = [TeamSlots, TeamSlots]
export const emptyTeam = (): TeamSlots => ({ 'front-0': null, 'front-1': null, 'back-0': null, 'back-1': null, 'back-2': null })

/** Keep valid class ids, migrate old asset ids and drop retired/duplicate characters. */
export function cleanFormation(value: unknown, data: RangerData[]): Formation {
  const source = Array.isArray(value) ? value : []
  return [0, 1].map(side => {
    const team = emptyTeam()
    const seen = new Set<string>()
    let count = 0
    for (const key of SLOT_KEYS) {
      if (count >= MAX_BATTLE_RANGERS) break
      const old = source[side]?.[key]
      const row = data.find(d => d.playId === old) ?? data.find(d => d.item.id === old)
      if (!row || seen.has(row.gameplayCharacter.id)) continue
      team[key] = row.playId
      seen.add(row.gameplayCharacter.id)
      count++
    }
    return team
  }) as Formation
}

export function placeClass(formation: Formation, data: RangerData[], side: 0 | 1, slot: SlotKey, classId: string | null): Formation {
  const next: Formation = [{ ...formation[0] }, { ...formation[1] }]
  if (classId === null) { next[side][slot] = null; return next }
  const row = data.find(d => d.playId === classId)
  if (!row) return formation
  for (const key of SLOT_KEYS) {
    const existing = data.find(d => d.playId === next[side][key])
    if (existing?.gameplayCharacter.id === row.gameplayCharacter.id) next[side][key] = null
  }
  const occupied = SLOT_KEYS.filter(key => next[side][key]).length
  if (!next[side][slot] && occupied >= MAX_BATTLE_RANGERS) return formation
  next[side][slot] = row.playId
  return next
}
