import type { GameplayClass, GameplayEffect, GameplaySkill, NormalSupportDef } from './gameplaySchema'
import type { RangerConfig, Stats } from './rangerConfig'
import type { SkillArea, SkillDef, SkillEffect } from './skills'

export const gameplayEffectToLegacy = (effect: GameplayEffect): SkillEffect | null => {
  const value = effect.value ?? 0
  const turns = effect.duration ?? 1
  const tagged = (mapped: SkillEffect): SkillEffect => ({
    ...mapped,
    gameplayType: effect.type,
    gameplayValue: value,
    gameplayDuration: turns,
  })
  switch (effect.type) {
    case 'damage': return tagged({ type: 'damage', pct: value })
    case 'fixedDamage': return tagged({ type: 'trueDamage', amount: value })
    case 'damageOverTime': return tagged({ type: 'burn', pct: value, turns })
    case 'poison':
    case 'deadlyPoison': return tagged({ type: 'poison', pct: value, turns })
    case 'attackDown': return tagged({ type: 'atkDown', pct: value, turns })
    case 'critRateDown': return tagged({ type: 'critDown', pct: value, turns })
    case 'critDamageDown': return tagged({ type: 'critDmgDown', pct: value, turns })
    case 'hitRateDown': return tagged({ type: 'hitDown', pct: value, turns })
    case 'vulnerable': return tagged({ type: 'vulnerable', pct: value, turns })
    case 'stun': return tagged({ type: 'stun', pct: value, turns })
    case 'silence': return tagged({ type: 'silence', pct: value, turns })
    case 'healingDown': return tagged({ type: 'healBlock', pct: value, turns })
    case 'dispelBuffs':
    case 'removeShield': return tagged({ type: 'dispelBuffs' })
    case 'shield': return tagged({ type: 'shield', pct: value, turns })
    case 'heal': return turns > 1 ? tagged({ type: 'regen', pct: value, turns }) : tagged({ type: 'heal', pct: value })
    case 'attackUp': return tagged({ type: 'atkUp', pct: value, turns })
    case 'critRateUp': return tagged({ type: 'critUp', pct: value, turns })
    case 'critDamageUp': return tagged({ type: 'critDmgUp', pct: value, turns })
    case 'reflect': return tagged({ type: 'reflect', pct: value, turns })
    case 'taunt': return tagged({ type: 'taunt', pct: value, turns })
    case 'damageReduction': return tagged({ type: 'toughUp', pct: value, turns })
    case 'cleanseDebuffs':
    case 'cleanseDamageOverTime':
    case 'cleansePoison':
    case 'removeTaunt':
    case 'removeStun':
    case 'removeSilence': return tagged({ type: 'cleanse' })
    default:
      return null
  }
}

const mappedEffects = (effects: GameplayEffect[]): SkillEffect[] =>
  effects.flatMap(effect => {
    const mapped = gameplayEffectToLegacy(effect)
    if (!mapped) return []
    const hits = (effect.type === 'damage' || effect.type === 'fixedDamage') ? Math.max(1, Math.round(effect.hits ?? 1)) : 1
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
    effects: [
      ...Array.from(
        { length: Math.max(1, Math.round(cls.normalAttack.hits || 1)) },
        () => ({ type: 'damage' as const, pct: 100 }),
      ),
      ...mappedEffects(cls.normalAttack.effects ?? []),
    ],
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
  const actionFor = (slot: 'attack' | 'skill1' | 'skill2', fallback: 'attack' | 'skill1' | 'skill2') =>
    base.actions[slot ?? fallback] ?? base.actions[fallback]

  const attackAnim = cls.normalAttack.animation ?? 'attack'
  const supportAnim = cls.normalSupport.animation ?? 'skill2'
  const skillAnim = cls.skill.animation ?? 'skill1'

  return {
    ...base,
    name: displayName,
    stats,
    actions: {
      ...base.actions,
      attack: actionFor(attackAnim, 'attack'),
      skill1: actionFor(skillAnim, 'skill1'),
      skill2: actionFor(supportAnim, 'skill2'),
    },
    skills: {
      skill1: gameplaySkillToLegacy(cls.skill),
      skill2: gameplayNormalSupportToLegacy(cls.normalSupport),
    },
    passives: [],
  }
}
