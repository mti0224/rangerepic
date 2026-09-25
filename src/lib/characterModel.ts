// Character / Class / Asset Variant compatibility model.
//
// Current RangerEpic data still stores existing LINE Rangers asset ids (uXXXX...) in
// formations and local saves.  This module separates the concepts now without
// invalidating those saves:
//
//   Character     = the persistent LINE character (Brown, Moon, Sally...)
//   Class         = a gameplay profession/build belonging to one Character
//   Asset Variant = the LINE Rangers sprite/animation resource used to render it
//
// During the migration period every legacy Ranger id becomes one compatibility
// class.  Later, class ids can be real game-owned ids while assetVariantId simply
// points at whichever Ranger resource provides the artwork.

export type CharacterId = string
export type ClassId = string
export type AssetVariantId = string
export type CharacterLocale = 'en' | 'th' | 'zh' | 'jp'

export interface PlayableIdentity {
  characterId: CharacterId
  classId: ClassId
  assetVariantId: AssetVariantId
  /** Original Ranger id while old saves/configs are still supported. */
  legacyRangerId: string
}

export interface CharacterDefinition {
  id: CharacterId
  suffix: string
  names: Record<CharacterLocale, string>
}

export interface CharacterGroup<T> {
  characterId: CharacterId
  variants: T[]
}

/**
 * Core LINE characters that should be one character even when many Ranger
 * resources/skins exist.  Add new canonical characters here as the playable
 * roster is designed.
 */
export const CORE_CHARACTERS: readonly CharacterDefinition[] = [
  { id: 'brown',   suffix: '-brown',   names: { en: 'Brown',   th: 'Brown',   zh: '熊大',   jp: 'ブラウン' } },
  { id: 'cony',    suffix: '-cony',    names: { en: 'Cony',    th: 'Cony',    zh: '兔兔',   jp: 'コニー' } },
  { id: 'moon',    suffix: '-moon',    names: { en: 'Moon',    th: 'Moon',    zh: '饅頭人', jp: 'ムーン' } },
  { id: 'james',   suffix: '-james',   names: { en: 'James',   th: 'James',   zh: '詹姆士', jp: 'ジェームズ' } },
  { id: 'jessica', suffix: '-jessica', names: { en: 'Jessica', th: 'Jessica', zh: '潔西卡', jp: 'ジェシカ' } },
  { id: 'sally',   suffix: '-sally',   names: { en: 'Sally',   th: 'Sally',   zh: '莎莉',   jp: 'サリー' } },
]

const CORE_BY_ID = new Map(CORE_CHARACTERS.map(c => [c.id, c]))

/** Existing non-core/collaboration Rangers remain independent compatibility characters. */
export function characterIdOfRanger(rangerId: string): CharacterId {
  const hit = CORE_CHARACTERS.find(c => rangerId.endsWith(c.suffix))
  return hit?.id ?? `legacy:${rangerId}`
}

/**
 * Compatibility class id.  It is intentionally NOT the same semantic field as
 * assetVariantId, even though every legacy class currently maps 1:1 to a Ranger.
 */
export const classIdOfRanger = (rangerId: string): ClassId => `legacy:${rangerId}`

export const assetVariantIdOfRanger = (rangerId: string): AssetVariantId => rangerId

export function playableIdentityOfRanger(rangerId: string): PlayableIdentity {
  return {
    characterId: characterIdOfRanger(rangerId),
    classId: classIdOfRanger(rangerId),
    assetVariantId: assetVariantIdOfRanger(rangerId),
    legacyRangerId: rangerId,
  }
}

export function characterName(id: CharacterId, locale: CharacterLocale, fallback: string): string {
  return CORE_BY_ID.get(id)?.names[locale] ?? fallback
}

export const isCoreCharacter = (id: CharacterId): boolean => CORE_BY_ID.has(id)

/**
 * Stable grouping helper used by UI.  The row order is preserved, so existing
 * sorting/filtering can happen before grouping.
 */
export function groupByCharacter<T>(rows: readonly T[], rangerIdOf: (row: T) => string): CharacterGroup<T>[] {
  const groups: CharacterGroup<T>[] = []
  const byId = new Map<CharacterId, CharacterGroup<T>>()
  for (const row of rows) {
    const characterId = characterIdOfRanger(rangerIdOf(row))
    let group = byId.get(characterId)
    if (!group) {
      group = { characterId, variants: [] }
      byId.set(characterId, group)
      groups.push(group)
    }
    group.variants.push(row)
  }
  return groups
}

/** Resolve the asset id for code that still receives a legacy Ranger id. */
export const assetIdFromLegacy = (rangerId: string): AssetVariantId =>
  playableIdentityOfRanger(rangerId).assetVariantId
