import {
  emptyNames,
  newGameplayAbility,
  newGameplayEffect,
  type GameplayAbility,
  type GameplayClass,
  type GameplayEffect,
  type GameplaySkill,
  type GameplayStats,
  type LocalizedNames,
  type NormalAttackDef,
  type NormalSupportDef,
} from './gameplaySchema'

export const ADVENTURE_SCHEMA_VERSION = 1 as const

export type EnemySlot = 'front-0' | 'front-1' | 'back-0' | 'back-1' | 'back-2'
export const ENEMY_SLOTS: EnemySlot[] = ['front-0', 'front-1', 'back-0', 'back-1', 'back-2']

export interface GameplayEnemy {
  schemaVersion: 1
  id: string
  names: LocalizedNames
  description: string
  /** Ranger visual/animation asset. Combat values are defined below. */
  assetVariantId: string
  stats: GameplayStats
  /** Enemies always have a normal attack. Extra effects are optional. */
  normalAttack: NormalAttackDef
  /** Optional normal support action; it never uses a skill gauge. */
  normalSupport: NormalSupportDef
  /** Enemies may have no skill. */
  skill?: GameplaySkill | null
  /** Chance (0..100) to choose the skill on an automatic enemy action. */
  skillActivationRate: number
  abilities: GameplayAbility[]
}

export interface StageWaveEnemy {
  enemyId: string
  slot: EnemySlot
}

export interface GameplayStageWave {
  id: string
  name?: string
  enemies: StageWaveEnemy[]
}

export interface GameplayStage {
  schemaVersion: 1
  id: string
  chapter: number
  order: number
  names: LocalizedNames
  description: string
  /** Public image URL, for example /maps/map1_full.jpg. */
  mapImage: string
  waves: GameplayStageWave[]
}

export function newGameplayEnemy(id: string, assetVariantId: string): GameplayEnemy {
  return {
    schemaVersion: ADVENTURE_SCHEMA_VERSION,
    id,
    names: emptyNames(),
    description: '',
    assetVariantId,
    stats: { hp: 1000, attack: 100, critRate: 0, critDamage: 3, hitRate: 100 },
    normalAttack: {
      target: 'single',
      hits: 1,
      animation: 'attack',
      skillGaugeGain: 0,
      effects: [],
    },
    normalSupport: {
      target: 'singleAlly',
      animation: 'skill2',
      effects: [],
    },
    skill: null,
    skillActivationRate: 20,
    abilities: [],
  }
}

export function newEnemySkill(): GameplaySkill {
  return {
    name: '',
    description: '',
    icon: '',
    animation: 'skill1',
    target: { side: 'enemy', count: 1, selector: 'random' },
    effects: [newGameplayEffect('damage')],
  }
}

export function newGameplayStage(id: string): GameplayStage {
  return {
    schemaVersion: ADVENTURE_SCHEMA_VERSION,
    id,
    chapter: 1,
    order: 1,
    names: emptyNames(),
    description: '',
    mapImage: '/maps/map1_full.jpg',
    waves: [{ id: 'wave_1', name: 'Wave 1', enemies: [] }],
  }
}

export function nextWaveId(waves: GameplayStageWave[]): string {
  let n = waves.length + 1
  const used = new Set(waves.map(w => w.id))
  while (used.has('wave_' + n)) n += 1
  return 'wave_' + n
}

export const enemyAbilityTemplate = () => newGameplayAbility(1)

export function normalAttackExtraEffects(enemy: GameplayEnemy): GameplayEffect[] {
  return enemy.normalAttack.effects ?? []
}


/** Runtime adapter: enemies reuse the same battle engine without becoming player Classes. */
export function enemyAsCombatClass(enemy: GameplayEnemy): GameplayClass {
  return {
    schemaVersion: 1,
    id: 'enemy:' + enemy.id,
    characterId: 'enemy:' + enemy.id,
    assetVariantId: enemy.assetVariantId,
    role: 'enemy',
    names: enemy.names,
    stats: enemy.stats,
    normalAttack: { ...enemy.normalAttack, skillGaugeGain: 0 },
    normalSupport: enemy.normalSupport ?? { target: 'singleAlly', animation: 'skill2', effects: [] },
    skillEnabled: !!enemy.skill,
    usesSkillGauge: false,
    skillActivationRate: enemy.skillActivationRate ?? 20,
    skill: enemy.skill ?? {
      name: '',
      description: '',
      icon: '',
      target: { side: 'enemy', count: 1, selector: 'random' },
      effects: [newGameplayEffect('damage')],
    },
    abilities: enemy.abilities,
  }
}
