// RangerEpic Gameplay Schema v1
// Shared by the production admin server and Vite dev API.
// Shared authoring/runtime contract for the Character -> Class -> Asset Variant architecture.

export const GAMEPLAY_SCHEMA_VERSION = 1
export const GAMEPLAY_ID_RE = /^[a-z0-9][a-z0-9_-]*$/i

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
]

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
]

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
]

export const ABILITY_EFFECT_TARGETS = ['self', 'allAllies', 'allEnemies', 'attacker']

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
]

export const CONDITION_TYPES = [
  'round',
  'allyAliveCount',
  'enemyAliveCount',
  'selfHpPercent',
  'receivedDamage',
  'statusType',
  'hasStatus',
  'hasShield',
]

export const CONDITION_OPERATORS = ['<', '<=', '=', '>=', '>']

export const DEFAULT_BATTLE_RULES = {
  schemaVersion: GAMEPLAY_SCHEMA_VERSION,
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

const asNum = v => typeof v === 'number' && Number.isFinite(v)
const asInt = v => Number.isInteger(v)
const asText = v => typeof v === 'string' && v.trim().length > 0

function validateNames(names, errors, prefix = 'names') {
  if (!names || typeof names !== 'object' || Array.isArray(names)) {
    errors.push(prefix + ' must be an object')
    return
  }
  for (const key of ['zh', 'en', 'th', 'jp']) {
    if (names[key] != null && typeof names[key] !== 'string') errors.push(prefix + '.' + key + ' must be a string')
  }
  if (![names.zh, names.en, names.th, names.jp].some(v => asText(v))) errors.push(prefix + ' needs at least one non-empty name')
}

function validateIcon(icon, errors, prefix) {
  if (icon != null && typeof icon !== 'string') errors.push(prefix + ' must be a string')
}

function validateEffect(effect, errors, prefix) {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) {
    errors.push(prefix + ' must be an object')
    return
  }
  if (!EFFECT_TYPES.includes(effect.type)) errors.push(prefix + '.type is invalid')
  if (effect.value != null && !asNum(effect.value)) errors.push(prefix + '.value must be a number')
  if (effect.duration != null && (!asInt(effect.duration) || effect.duration < 1)) errors.push(prefix + '.duration must be an integer >= 1')
  if (effect.hits != null && (!asInt(effect.hits) || effect.hits < 1)) errors.push(prefix + '.hits must be an integer >= 1')
  if (effect.abilityTarget != null && !ABILITY_EFFECT_TARGETS.includes(effect.abilityTarget)) errors.push(prefix + '.abilityTarget is invalid')
}

function validateEffects(effects, errors, prefix, allowed = EFFECT_TYPES) {
  if (!Array.isArray(effects)) {
    errors.push(prefix + ' must be an array')
    return
  }
  effects.forEach((effect, i) => {
    const p = prefix + '[' + i + ']'
    validateEffect(effect, errors, p)
    if (effect && typeof effect === 'object' && EFFECT_TYPES.includes(effect.type) && !allowed.includes(effect.type)) {
      errors.push(p + '.type is not allowed in this context')
    }
  })
}

function validateTarget(target, errors, prefix) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    errors.push(prefix + ' must be an object')
    return
  }
  if (!['enemy', 'ally'].includes(target.side)) errors.push(prefix + '.side must be enemy or ally')
  if (target.count !== 'all' && (!asInt(target.count) || target.count < 1)) errors.push(prefix + '.count must be "all" or an integer >= 1')
  const allowed = target.side === 'enemy'
    ? ['manual', 'random', 'lowestHp', 'highestHp']
    : ['manual', 'random', 'lowestHp', 'highestHp', 'lowestAttack', 'highestAttack']
  if (!allowed.includes(target.selector)) errors.push(prefix + '.selector is invalid for side ' + target.side)
}

function validateAbility(ability, errors, prefix) {
  if (!ability || typeof ability !== 'object' || Array.isArray(ability)) {
    errors.push(prefix + ' must be an object')
    return
  }
  if (!asText(ability.id) || !GAMEPLAY_ID_RE.test(ability.id)) errors.push(prefix + '.id is invalid')
  if (ability.name != null && typeof ability.name !== 'string') errors.push(prefix + '.name must be a string')
  if (ability.description != null && typeof ability.description !== 'string') errors.push(prefix + '.description must be a string')
  validateIcon(ability.icon, errors, prefix + '.icon')
  if (!ABILITY_TRIGGERS.includes(ability.trigger)) errors.push(prefix + '.trigger is invalid')
  if (ability.triggerValue != null && !asNum(ability.triggerValue)) errors.push(prefix + '.triggerValue must be a number')
  if (!Array.isArray(ability.conditions)) errors.push(prefix + '.conditions must be an array')
  else ability.conditions.forEach((condition, i) => {
    const p = prefix + '.conditions[' + i + ']'
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
      errors.push(p + ' must be an object')
      return
    }
    if (!CONDITION_TYPES.includes(condition.type)) errors.push(p + '.type is invalid')
    if (condition.operator != null && !CONDITION_OPERATORS.includes(condition.operator)) errors.push(p + '.operator is invalid')
    if (condition.value == null || (!asNum(condition.value) && typeof condition.value !== 'string')) errors.push(p + '.value must be a number or string')
  })
  validateEffects(ability.effects, errors, prefix + '.effects')
}

export function validateCharacter(data, expectedId) {
  const errors = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['character must be an object']
  if (data.schemaVersion !== GAMEPLAY_SCHEMA_VERSION) errors.push('schemaVersion must be ' + GAMEPLAY_SCHEMA_VERSION)
  if (!asText(data.id) || !GAMEPLAY_ID_RE.test(data.id)) errors.push('id is invalid')
  if (expectedId && data.id !== expectedId) errors.push('id mismatch')
  validateNames(data.names, errors)
  if (data.description != null && typeof data.description !== 'string') errors.push('description must be a string')
  return errors
}

export function validateClass(data, expectedId) {
  const errors = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['class must be an object']
  if (data.schemaVersion !== GAMEPLAY_SCHEMA_VERSION) errors.push('schemaVersion must be ' + GAMEPLAY_SCHEMA_VERSION)
  if (!asText(data.id) || !GAMEPLAY_ID_RE.test(data.id)) errors.push('id is invalid')
  if (expectedId && data.id !== expectedId) errors.push('id mismatch')
  if (!asText(data.characterId) || !GAMEPLAY_ID_RE.test(data.characterId)) errors.push('characterId is invalid')
  if (!asText(data.assetVariantId) || !GAMEPLAY_ID_RE.test(data.assetVariantId)) errors.push('assetVariantId is invalid')
  if (!asText(data.role)) errors.push('role is required')
  validateNames(data.names, errors)

  const stats = data.stats
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) errors.push('stats must be an object')
  else {
    if (!asNum(stats.hp) || stats.hp < 1) errors.push('stats.hp must be >= 1')
    if (!asNum(stats.attack) || stats.attack < 0) errors.push('stats.attack must be >= 0')
    if (!asNum(stats.critRate) || stats.critRate < 0 || stats.critRate > 100) errors.push('stats.critRate must be 0..100')
    if (!asNum(stats.critDamage) || stats.critDamage < 0) errors.push('stats.critDamage must be >= 0')
    if (!asNum(stats.hitRate) || stats.hitRate < 0 || stats.hitRate > 100) errors.push('stats.hitRate must be 0..100')
  }

  const attack = data.normalAttack
  if (!attack || typeof attack !== 'object' || Array.isArray(attack)) errors.push('normalAttack must be an object')
  else {
    if (!['single', 'all', 'primaryPlusRandom'].includes(attack.target)) errors.push('normalAttack.target is invalid')
    if (!asInt(attack.hits) || attack.hits < 1) errors.push('normalAttack.hits must be an integer >= 1')
    if (!asNum(attack.skillGaugeGain) || attack.skillGaugeGain < 0 || attack.skillGaugeGain > 100) errors.push('normalAttack.skillGaugeGain must be 0..100')
    if (attack.target === 'primaryPlusRandom' && (!asInt(attack.extraTargets) || attack.extraTargets < 1)) errors.push('normalAttack.extraTargets must be >= 1')
  }

  const support = data.normalSupport
  if (!support || typeof support !== 'object' || Array.isArray(support)) errors.push('normalSupport must be an object')
  else {
    if (!['singleAlly', 'allAllies'].includes(support.target)) errors.push('normalSupport.target is invalid')
    validateEffects(support.effects, errors, 'normalSupport.effects', SUPPORT_SKILL_EFFECT_TYPES)
  }

  const skill = data.skill
  if (!skill || typeof skill !== 'object' || Array.isArray(skill)) errors.push('skill must be an object')
  else {
    if (skill.name != null && typeof skill.name !== 'string') errors.push('skill.name must be a string')
    if (skill.description != null && typeof skill.description !== 'string') errors.push('skill.description must be a string')
    validateIcon(skill.icon, errors, 'skill.icon')
    validateTarget(skill.target, errors, 'skill.target')
    const allowedSkillEffects = skill.target?.side === 'ally' ? SUPPORT_SKILL_EFFECT_TYPES : ATTACK_SKILL_EFFECT_TYPES
    validateEffects(skill.effects, errors, 'skill.effects', allowedSkillEffects)
  }

  if (!Array.isArray(data.abilities)) errors.push('abilities must be an array')
  else data.abilities.forEach((ability, i) => validateAbility(ability, errors, 'abilities[' + i + ']'))

  return errors
}

export function validateEnemy(data, expectedId) {
  const errors = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['enemy must be an object']
  if (data.schemaVersion !== GAMEPLAY_SCHEMA_VERSION) errors.push('schemaVersion must be ' + GAMEPLAY_SCHEMA_VERSION)
  if (!asText(data.id) || !GAMEPLAY_ID_RE.test(data.id)) errors.push('id is invalid')
  if (expectedId && data.id !== expectedId) errors.push('id mismatch')
  if (!asText(data.assetVariantId) || !GAMEPLAY_ID_RE.test(data.assetVariantId)) errors.push('assetVariantId is invalid')
  if (!asText(data.role)) errors.push('role is required')
  validateNames(data.names, errors)
  if (data.description != null && typeof data.description !== 'string') errors.push('description must be a string')

  const stats = data.stats
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) errors.push('stats must be an object')
  else {
    if (!asNum(stats.hp) || stats.hp < 1) errors.push('stats.hp must be >= 1')
    if (!asNum(stats.attack) || stats.attack < 0) errors.push('stats.attack must be >= 0')
    if (!asNum(stats.critRate) || stats.critRate < 0 || stats.critRate > 100) errors.push('stats.critRate must be 0..100')
    if (!asNum(stats.critDamage) || stats.critDamage < 0) errors.push('stats.critDamage must be >= 0')
    if (!asNum(stats.hitRate) || stats.hitRate < 0 || stats.hitRate > 100) errors.push('stats.hitRate must be 0..100')
  }

  const attack = data.normalAttack
  if (!attack || typeof attack !== 'object' || Array.isArray(attack)) errors.push('normalAttack must be an object')
  else {
    if (!['single', 'all', 'primaryPlusRandom'].includes(attack.target)) errors.push('normalAttack.target is invalid')
    if (!asInt(attack.hits) || attack.hits < 1) errors.push('normalAttack.hits must be an integer >= 1')
    if (!asNum(attack.skillGaugeGain) || attack.skillGaugeGain < 0 || attack.skillGaugeGain > 100) errors.push('normalAttack.skillGaugeGain must be 0..100')
    if (attack.target === 'primaryPlusRandom' && (!asInt(attack.extraTargets) || attack.extraTargets < 1)) errors.push('normalAttack.extraTargets must be >= 1')
    validateEffects(attack.effects, errors, 'normalAttack.effects', ATTACK_SKILL_EFFECT_TYPES)
  }

  if (data.skill != null) {
    const skill = data.skill
    if (!skill || typeof skill !== 'object' || Array.isArray(skill)) errors.push('skill must be an object when present')
    else {
      if (skill.name != null && typeof skill.name !== 'string') errors.push('skill.name must be a string')
      if (skill.description != null && typeof skill.description !== 'string') errors.push('skill.description must be a string')
      validateIcon(skill.icon, errors, 'skill.icon')
      validateTarget(skill.target, errors, 'skill.target')
      const allowedSkillEffects = skill.target?.side === 'ally' ? SUPPORT_SKILL_EFFECT_TYPES : ATTACK_SKILL_EFFECT_TYPES
      validateEffects(skill.effects, errors, 'skill.effects', allowedSkillEffects)
    }
  }

  if (!Array.isArray(data.abilities)) errors.push('abilities must be an array')
  else data.abilities.forEach((ability, i) => validateAbility(ability, errors, 'abilities[' + i + ']'))
  return errors
}

export const GAMEPLAY_STAGE_SLOTS = ['front-0', 'front-1', 'back-0', 'back-1', 'back-2']

export function validateStage(data, expectedId) {
  const errors = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['stage must be an object']
  if (data.schemaVersion !== GAMEPLAY_SCHEMA_VERSION) errors.push('schemaVersion must be ' + GAMEPLAY_SCHEMA_VERSION)
  if (!asText(data.id) || !GAMEPLAY_ID_RE.test(data.id)) errors.push('id is invalid')
  if (expectedId && data.id !== expectedId) errors.push('id mismatch')
  validateNames(data.names, errors)
  if (data.description != null && typeof data.description !== 'string') errors.push('description must be a string')
  if (!asInt(data.chapter) || data.chapter < 1) errors.push('chapter must be an integer >= 1')
  if (!asInt(data.order) || data.order < 1) errors.push('order must be an integer >= 1')
  if (!asText(data.background)) errors.push('background is required')
  if (!Array.isArray(data.waves) || data.waves.length < 1) errors.push('waves must contain at least one wave')
  else data.waves.forEach((wave, wi) => {
    const prefix = 'waves[' + wi + ']'
    if (!wave || typeof wave !== 'object' || Array.isArray(wave)) {
      errors.push(prefix + ' must be an object')
      return
    }
    if (!asText(wave.id) || !GAMEPLAY_ID_RE.test(wave.id)) errors.push(prefix + '.id is invalid')
    if (wave.name != null && typeof wave.name !== 'string') errors.push(prefix + '.name must be a string')
    if (!Array.isArray(wave.enemies) || wave.enemies.length < 1) errors.push(prefix + '.enemies must contain at least one enemy')
    else {
      const usedSlots = new Set()
      wave.enemies.forEach((placement, pi) => {
        const p = prefix + '.enemies[' + pi + ']'
        if (!placement || typeof placement !== 'object' || Array.isArray(placement)) {
          errors.push(p + ' must be an object')
          return
        }
        if (!GAMEPLAY_STAGE_SLOTS.includes(placement.slot)) errors.push(p + '.slot is invalid')
        else if (usedSlots.has(placement.slot)) errors.push(prefix + ' contains duplicate slot ' + placement.slot)
        else usedSlots.add(placement.slot)
        if (!asText(placement.enemyId) || !GAMEPLAY_ID_RE.test(placement.enemyId)) errors.push(p + '.enemyId is invalid')
      })
    }
  })
  return errors
}

export function validateBattleRules(data) {
  const errors = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['rules must be an object']
  if (data.schemaVersion !== GAMEPLAY_SCHEMA_VERSION) errors.push('schemaVersion must be ' + GAMEPLAY_SCHEMA_VERSION)
  for (const key of ['skillGaugeMax', 'defaultNormalAttackGaugeGain', 'defaultCritDamageMultiplier', 'critRateMin', 'critRateMax', 'hitRateMin', 'hitRateMax', 'statFloor']) {
    if (!asNum(data[key])) errors.push(key + ' must be a number')
  }
  if (asNum(data.skillGaugeMax) && data.skillGaugeMax <= 0) errors.push('skillGaugeMax must be > 0')
  if (asNum(data.defaultNormalAttackGaugeGain) && (data.defaultNormalAttackGaugeGain < 0 || data.defaultNormalAttackGaugeGain > data.skillGaugeMax)) errors.push('defaultNormalAttackGaugeGain is out of range')
  if (asNum(data.defaultCritDamageMultiplier) && data.defaultCritDamageMultiplier < 0) errors.push('defaultCritDamageMultiplier must be >= 0')
  for (const key of ['playerActsFirst', 'freeOrderWithinPhase', 'reflectCanCrit', 'reflectTriggersReflect', 'poisonCanKill', 'shieldAbsorbsPoison', 'shieldAbsorbsDeadlyPoison']) {
    if (typeof data[key] !== 'boolean') errors.push(key + ' must be boolean')
  }
  if (data.durationDecrementsAt !== 'roundEnd') errors.push('durationDecrementsAt must be roundEnd')
  if (data.dotTicksAt !== 'roundEnd') errors.push('dotTicksAt must be roundEnd')
  if (data.hotTicksAt !== 'sidePhaseEnd') errors.push('hotTicksAt must be sidePhaseEnd')
  return errors
}
