// RangerEpic Gameplay authoring schema v1.
// This is intentionally independent from rangerConfig.ts: Ranger configs describe
// visual/animation assets; these definitions describe RangerEpic's own gameplay.

export const GAMEPLAY_SCHEMA_VERSION = 1 as const

export type LocalizedNames = {
  zh: string
  en: string
  th: string
  jp: string
}

export interface GameplayCharacter {
  schemaVersion: 1
  id: string
  names: LocalizedNames
  description: string
}

export interface GameplayStats {
  hp: number
  attack: number
  /** 0..100 */
  critRate: number
  /** multiplier; default is 3 (= x3) */
  critDamage: number
  /** 0..100 */
  hitRate: number
}

export type NormalAttackTarget = 'single' | 'all' | 'primaryPlusRandom'
export interface NormalAttackDef {
  target: NormalAttackTarget
  hits: number
  /** One normal-attack action adds this once, regardless of hit count. */
  skillGaugeGain: number
  extraTargets?: number
  /** Optional extra effects applied after the normal attack damage. Primarily used by enemies. */
  effects?: GameplayEffect[]
}

export type NormalSupportTarget = 'singleAlly' | 'allAllies'

export const EFFECT_TYPES = [
  'damage',
  'damageOverTime',
  'poison',
  'deadlyPoison',
  'attackDown',
  'critRateDown',
  'critDamageDown',
  'hitRateDown',
  'vulnerable',
  'stun',
  'silence',
  'healingDown',
  'removeShield',
  'dispelBuffs',
  'shield',
  'heal',
  'attackUp',
  'critRateUp',
  'critDamageUp',
  'reflect',
  'taunt',
  'damageReduction',
  'cleanseDebuffs',
  'cleanseDamageOverTime',
  'cleansePoison',
  'skillGaugeGainModifier',
  'fixedDamage',
  'poisonDamageReduction',
  'deadlyPoisonDamageReduction',
  'removeTaunt',
  'removeStun',
  'removeSilence',
] as const
export type GameplayEffectType = typeof EFFECT_TYPES[number]

/** Effects exposed when a skill targets enemies. */
export const ATTACK_SKILL_EFFECT_TYPES = [
  'damage',
  'damageOverTime',
  'poison',
  'deadlyPoison',
  'attackDown',
  'critRateDown',
  'critDamageDown',
  'hitRateDown',
  'vulnerable',
  'stun',
  'silence',
  'healingDown',
  'removeShield',
  'dispelBuffs',
] as const satisfies readonly GameplayEffectType[]

/** Effects exposed for normal support and skills that target allies. */
export const SUPPORT_SKILL_EFFECT_TYPES = [
  'shield',
  'heal',
  'attackUp',
  'critRateUp',
  'critDamageUp',
  'reflect',
  'taunt',
  'damageReduction',
  'cleanseDebuffs',
  'cleanseDamageOverTime',
  'cleansePoison',
] as const satisfies readonly GameplayEffectType[]

export const ABILITY_EFFECT_TARGETS = ['self', 'allAllies', 'allEnemies', 'attacker'] as const
export type AbilityEffectTarget = typeof ABILITY_EFFECT_TARGETS[number]

export interface GameplayEffect {
  type: GameplayEffectType
  /** Ability-only target scope. Omitted values are treated as "self" for backward compatibility. */
  abilityTarget?: AbilityEffectTarget
  /** Percentage or fixed value according to effect type. */
  value?: number
  /** duration=1 heal is immediate; duration>1 heal is HoT. */
  duration?: number
  /** Optional for future multi-hit skill damage; normal attack hits live on normalAttack. */
  hits?: number
}

export interface NormalSupportDef {
  target: NormalSupportTarget
  effects: GameplayEffect[]
}

export type TargetSide = 'enemy' | 'ally'
export type TargetSelector = 'manual' | 'random' | 'lowestHp' | 'highestHp' | 'lowestAttack' | 'highestAttack'
export interface SkillTargetRule {
  side: TargetSide
  count: number | 'all'
  selector: TargetSelector
}
export interface GameplaySkill {
  /** Optional player-facing title. */
  name?: string
  /** Optional plain-language description. When set, UI prefers it over generated effect text. */
  description?: string
  /** Public URL under /gameplay-icons/, or empty when no icon is assigned. */
  icon?: string
  target: SkillTargetRule
  effects: GameplayEffect[]
}

export const ABILITY_TRIGGERS = [
  'whileOnField',
  'battleStart',
  'roundStart',
  'roundEnd',
  'everyNRounds',
  'selfDied',
  'allyDied',
  'enemyDied',
  'beforeDamaged',
  'afterDamaged',
  'statusApplied',
  'hpChanged',
] as const
export type AbilityTrigger = typeof ABILITY_TRIGGERS[number]

export const CONDITION_TYPES = [
  'round',
  'allyAliveCount',
  'enemyAliveCount',
  'selfHpPercent',
  'receivedDamage',
  'statusType',
  'hasStatus',
  'hasShield',
] as const
export type AbilityConditionType = typeof CONDITION_TYPES[number]

export const CONDITION_OPERATORS = ['<', '<=', '=', '>=', '>'] as const
export type ConditionOperator = typeof CONDITION_OPERATORS[number]

export interface AbilityCondition {
  type: AbilityConditionType
  operator?: ConditionOperator
  value: number | string
}

export interface GameplayAbility {
  id: string
  /** Optional player-facing title. */
  name?: string
  /** Optional plain-language description. When set, UI prefers it over generated effect text. */
  description?: string
  /** Public URL under /gameplay-icons/, or empty when no icon is assigned. */
  icon?: string
  trigger: AbilityTrigger
  /** Used by triggers such as everyNRounds. */
  triggerValue?: number
  conditions: AbilityCondition[]
  effects: GameplayEffect[]
}

export interface GameplayClass {
  schemaVersion: 1
  id: string
  characterId: string
  assetVariantId: string
  /** Classification label only; it never grants hidden combat effects. */
  role: string
  names: LocalizedNames
  stats: GameplayStats
  normalAttack: NormalAttackDef
  normalSupport: NormalSupportDef
  skill: GameplaySkill
  abilities: GameplayAbility[]
}

export interface BattleRulesV1 {
  schemaVersion: 1
  skillGaugeMax: number
  defaultNormalAttackGaugeGain: number
  defaultCritDamageMultiplier: number
  critRateMin: number
  critRateMax: number
  hitRateMin: number
  hitRateMax: number
  statFloor: number
  playerActsFirst: boolean
  freeOrderWithinPhase: boolean
  durationDecrementsAt: 'roundEnd'
  dotTicksAt: 'roundEnd'
  hotTicksAt: 'sidePhaseEnd'
  reflectCanCrit: boolean
  reflectTriggersReflect: boolean
  poisonCanKill: boolean
  shieldAbsorbsPoison: boolean
  shieldAbsorbsDeadlyPoison: boolean
}

export const DEFAULT_BATTLE_RULES: BattleRulesV1 = {
  schemaVersion: 1,
  skillGaugeMax: 100,
  defaultNormalAttackGaugeGain: 5,
  defaultCritDamageMultiplier: 3,
  critRateMin: 0,
  critRateMax: 100,
  hitRateMin: 0,
  hitRateMax: 100,
  statFloor: 0,
  playerActsFirst: true,
  freeOrderWithinPhase: true,
  durationDecrementsAt: 'roundEnd',
  dotTicksAt: 'roundEnd',
  hotTicksAt: 'sidePhaseEnd',
  reflectCanCrit: false,
  reflectTriggersReflect: false,
  poisonCanKill: true,
  shieldAbsorbsPoison: true,
  shieldAbsorbsDeadlyPoison: true,
}

export const EFFECT_LABEL_ZH: Record<GameplayEffectType, string> = {
  damage: '傷害（攻擊力 N%）',
  damageOverTime: '持續傷害（攻擊力 N%）',
  poison: '中毒（當前體力 N%）',
  deadlyPoison: '劇毒（最高體力 N%）',
  attackDown: '降低攻擊力',
  critRateDown: '降低爆擊機率',
  critDamageDown: '降低爆擊傷害',
  hitRateDown: '降低命中率',
  vulnerable: '脆弱',
  stun: '暈眩',
  silence: '沈默',
  healingDown: '妨礙回復',
  removeShield: '解除護盾',
  dispelBuffs: '解除增益效果',
  shield: '護盾',
  heal: '回復體力',
  attackUp: '提升攻擊力',
  critRateUp: '提升爆擊機率',
  critDamageUp: '提升爆擊傷害',
  reflect: '反射',
  taunt: '挑釁',
  damageReduction: '減傷',
  cleanseDebuffs: '解除負面效果',
  cleanseDamageOverTime: '解除持續傷害',
  cleansePoison: '解除中毒／劇毒',
  skillGaugeGainModifier: '技能條累積量修正',
  fixedDamage: '固定傷害',
  poisonDamageReduction: '降低中毒傷害',
  deadlyPoisonDamageReduction: '降低劇毒傷害',
  removeTaunt: '解除挑釁',
  removeStun: '解除暈眩',
  removeSilence: '解除沈默',
}

export const TRIGGER_LABEL_ZH: Record<AbilityTrigger, string> = {
  whileOnField: '角色在場上時',
  battleStart: '戰鬥開始時',
  roundStart: 'Round Start',
  roundEnd: 'Round End',
  everyNRounds: '每經過 N Round',
  selfDied: '自身死亡時',
  allyDied: '我方角色死亡時',
  enemyDied: '敵方角色死亡時',
  beforeDamaged: '自身受到傷害前',
  afterDamaged: '自身受到傷害後',
  statusApplied: '自身被套用狀態時',
  hpChanged: '自身體力變化時',
}

export const CONDITION_LABEL_ZH: Record<AbilityConditionType, string> = {
  round: '目前 Round',
  allyAliveCount: '我方存活數',
  enemyAliveCount: '敵方存活數',
  selfHpPercent: '自身體力 %',
  receivedDamage: '本次受到傷害',
  statusType: '狀態類型',
  hasStatus: '持有指定狀態',
  hasShield: '自身持有護盾',
}

export function emptyNames(): LocalizedNames {
  return { zh: '', en: '', th: '', jp: '' }
}

export function newGameplayCharacter(id: string): GameplayCharacter {
  return { schemaVersion: 1, id, names: emptyNames(), description: '' }
}

export function newGameplayEffect(type: GameplayEffectType = 'damage'): GameplayEffect {
  if (['removeShield', 'dispelBuffs', 'cleanseDebuffs', 'cleanseDamageOverTime', 'cleansePoison', 'removeTaunt', 'removeStun', 'removeSilence'].includes(type)) return { type }
  if (['stun', 'silence', 'taunt'].includes(type)) return { type, duration: 1 }
  if (type === 'damage' || type === 'fixedDamage') return { type, value: type === 'damage' ? 100 : 0, hits: 1 }
  return { type, value: 10, duration: 1 }
}

export function newGameplayAbility(index = 1): GameplayAbility {
  return {
    id: 'ability_' + index,
    name: '',
    description: '',
    icon: '',
    trigger: 'whileOnField',
    conditions: [],
    effects: [{ ...newGameplayEffect('attackUp'), abilityTarget: 'self' }],
  }
}

export function newGameplayClass(id: string, characterId: string, assetVariantId: string): GameplayClass {
  return {
    schemaVersion: 1,
    id,
    characterId,
    assetVariantId,
    role: '未分類',
    names: emptyNames(),
    stats: { hp: 1000, attack: 100, critRate: 0, critDamage: 3, hitRate: 100 },
    normalAttack: { target: 'single', hits: 1, skillGaugeGain: 5 },
    normalSupport: { target: 'singleAlly', effects: [] },
    skill: { name: '', description: '', icon: '', target: { side: 'enemy', count: 1, selector: 'random' }, effects: [newGameplayEffect('damage')] },
    abilities: [],
  }
}
