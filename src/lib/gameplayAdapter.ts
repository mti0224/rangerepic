import type { GameplayClass, GameplayEffect, GameplaySkill, NormalSupportDef } from './gameplaySchema'
import type { RangerConfig, Stats } from './rangerConfig'
import type { SkillArea, SkillDef, SkillEffect } from './skills'

const mappedEffect = (effect: GameplayEffect): SkillEffect | null => {
  const value = effect.value ?? 0
  const turns = effect.duration ?? 1
  switch (effect.type) {
    case 'damage': return { type: 'damage', pct: value }
    case 'fixedDamage': return { type: 'trueDamage', pct: value }
    case 'damageOverTime': return { type: 'burn', pct: value, turns }
    case 'poison':
    case 'deadlyPoison': return { type: 'poison', pct: value, turns }
    case 'attackDown': return { type: 'atkDown', pct: value, turns }
    case 'critRateDown': return { type: 'critDown', pct: value, turns }
    case 'critDamageDown': return { type: 'critDmgDown', pct: value, turns }
    case 'hitRateDown': return { type: 'hitDown', pct: value, turns }
    case 'vulnerable': return { type: 'vulnerable', pct: value, turns }
    case 'stun': return { type: 'stun', pct: value, turns }
    case 'silence': return { type: 'silence', pct: value, turns }
    case 'healingDown': return { type: 'healBlock', pct: value, turns }
    case 'dispelBuffs':
    case 'removeShield': return { type: 'dispelBuffs' }
    case 'shield': return { type: 'shield', pct: value, turns }
    case 'heal': return { type: 'heal', pct: value }
    case 'attackUp': return { type: 'atkUp', pct: value, turns }
    case 'critRateUp': return { type: 'critUp', pct: value, turns }
    case 'critDamageUp': return { type: 'critDmgUp', pct: value, turns }
    case 'taunt': return { type: 'taunt', pct: value, turns }
    case 'damageReduction': return { type: 'toughUp', pct: value, turns }
    case 'cleanseDebuffs':
    case 'cleanseDamageOverTime':
    case 'cleansePoison':
    case 'removeTaunt':
    case 'removeStun':
    case 'removeSilence': return { type: 'cleanse' }
    default:
      return null
  }
}

const mappedEffects = (effects: GameplayEffect[]): SkillEffect[] =>
  effects.flatMap(effect => {
    const mapped = mappedEffect(effect)
    if (!mapped) return []
    const hits = effect.type === 'damage' ? Math.max(1, Math.round(effect.hits ?? 1)) : 1
    return Array.from({ length: hits }, () => ({ ...mapped }))
  })

const areaOfGameplaySkill = (skill: GameplaySkill): SkillArea => {
  if (skill.target.side === 'ally') return skill.target.count === 'all' ? 'ally_all' : 'ally_single'
  if (skill.target.count === 'all' || (typeof skill.target.count === 'number' && skill.target.count > 1)) return 'all'
  return 'single_any'
}

export const gameplaySkillToLegacy = (skill: GameplaySkill): SkillDef => ({
  kind: skill.target.side === 'ally' ? 'buff' : 'attack',
  cost: 0,
  area: areaOfGameplaySkill(skill),
  effects: mappedEffects(skill.effects),
})

export const gameplayNormalSupportToLegacy = (support: NormalSupportDef): SkillDef => ({
  kind: 'buff',
  cost: 0,
  area: support.target === 'allAllies' ? 'ally_all' : 'ally_single',
  effects: mappedEffects(support.effects),
})

export const gameplayNormalAttackSkill = (cls: GameplayClass): SkillDef => {
  const area: SkillArea = cls.normalAttack.target === 'all' ? 'all' : 'single_any'
  return {
    kind: 'attack',
    cost: 0,
    area,
    effects: Array.from(
      { length: Math.max(1, Math.round(cls.normalAttack.hits || 1)) },
      () => ({ type: 'damage' as const, pct: 100 }),
    ),
  }
}

/**
 * Transitional renderer adapter.
 *
 * GameplayClass is authoritative for combat data. RangerConfig remains authoritative
 * only for animation clips, anchors and projectile timing until the visual battle
 * scene is fully migrated to the V2 runtime.
 */
export function adaptRangerConfigForGameplay(base: RangerConfig, cls: GameplayClass): RangerConfig {
  const stats: Stats = {
    ...base.stats,
    hp: Math.max(1, cls.stats.hp),
    atk: Math.max(0, cls.stats.attack),
    // These legacy-only stats are deliberately neutralized for Gameplay V1 classes.
    def: 0,
    spd: 100,
    crit: cls.stats.critRate,
    critDmg: cls.stats.critDamage * 100,
    evade: 0,
    hit: cls.stats.hitRate,
    skillEvade: 0,
    skillHit: cls.stats.hitRate,
    skillRes: 0,
    skillDmgRes: 0,
  }

  const displayName = cls.names.zh || cls.names.en || cls.names.th || cls.names.jp || base.name
  return {
    ...base,
    name: displayName,
    stats,
    skills: {
      skill1: gameplaySkillToLegacy(cls.skill),
      skill2: gameplayNormalSupportToLegacy(cls.normalSupport),
    },
    passives: [],
  }
}
