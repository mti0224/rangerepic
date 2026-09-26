import { ABILITY_EFFECT_TARGETS, ABILITY_TRIGGERS, ATTACK_SKILL_EFFECT_TYPES, SUPPORT_SKILL_EFFECT_TYPES, CONDITION_OPERATORS, CONDITION_TYPES, EFFECT_TYPES } from './gameplay-schema.mjs'

export const ADVENTURE_SCHEMA_VERSION = 1
export const ADVENTURE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/i
export const ENEMY_SLOTS = ['front-0', 'front-1', 'back-0', 'back-1', 'back-2']

const asNum = v => typeof v === 'number' && Number.isFinite(v)
const asInt = v => Number.isInteger(v)
const asText = v => typeof v === 'string' && v.trim().length > 0

function validateNames(names, errors, prefix = 'names') {
  if (!names || typeof names !== 'object' || Array.isArray(names)) return errors.push(prefix + ' must be an object')
  for (const key of ['zh', 'en', 'th', 'jp']) if (names[key] != null && typeof names[key] !== 'string') errors.push(prefix + '.' + key + ' must be a string')
  if (![names.zh, names.en, names.th, names.jp].some(v => asText(v))) errors.push(prefix + ' needs at least one non-empty name')
}

function validateEffect(effect, errors, prefix) {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) return errors.push(prefix + ' must be an object')
  if (!EFFECT_TYPES.includes(effect.type)) errors.push(prefix + '.type is invalid')
  if (effect.value != null && !asNum(effect.value)) errors.push(prefix + '.value must be a number')
  if (effect.duration != null && (!asInt(effect.duration) || effect.duration < 1)) errors.push(prefix + '.duration must be an integer >= 1')
  if (effect.hits != null && (!asInt(effect.hits) || effect.hits < 1)) errors.push(prefix + '.hits must be an integer >= 1')
  if (effect.abilityTarget != null && !ABILITY_EFFECT_TARGETS.includes(effect.abilityTarget)) errors.push(prefix + '.abilityTarget is invalid')
}

function validateEffects(effects, errors, prefix, allowed = EFFECT_TYPES) {
  if (!Array.isArray(effects)) return errors.push(prefix + ' must be an array')
  effects.forEach((effect, i) => {
    validateEffect(effect, errors, prefix + '[' + i + ']')
    if (effect?.type && !allowed.includes(effect.type)) errors.push(prefix + '[' + i + '].type is not allowed here')
  })
}

function validateTarget(target, errors, prefix) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return errors.push(prefix + ' must be an object')
  if (!['enemy', 'ally'].includes(target.side)) errors.push(prefix + '.side is invalid')
  if (target.count !== 'all' && (!asInt(target.count) || target.count < 1)) errors.push(prefix + '.count is invalid')
  const allowed = target.side === 'ally' ? ['manual','random','lowestHp','highestHp','lowestAttack','highestAttack'] : ['manual','random','lowestHp','highestHp']
  if (!allowed.includes(target.selector)) errors.push(prefix + '.selector is invalid')
}

function validateSkill(skill, errors, prefix) {
  if (!skill || typeof skill !== 'object' || Array.isArray(skill)) return errors.push(prefix + ' must be an object')
  if (skill.name != null && typeof skill.name !== 'string') errors.push(prefix + '.name must be a string')
  if (skill.description != null && typeof skill.description !== 'string') errors.push(prefix + '.description must be a string')
  if (skill.icon != null && typeof skill.icon !== 'string') errors.push(prefix + '.icon must be a string')
  if (skill.animation != null && !['attack','skill1','skill2'].includes(skill.animation)) errors.push(prefix + '.animation is invalid')
  validateTarget(skill.target, errors, prefix + '.target')
  validateEffects(skill.effects, errors, prefix + '.effects', skill.target?.side === 'ally' ? SUPPORT_SKILL_EFFECT_TYPES : ATTACK_SKILL_EFFECT_TYPES)
}

function validateAbility(ability, errors, prefix) {
  if (!ability || typeof ability !== 'object' || Array.isArray(ability)) return errors.push(prefix + ' must be an object')
  if (!asText(ability.id) || !ADVENTURE_ID_RE.test(ability.id)) errors.push(prefix + '.id is invalid')
  if (ability.name != null && typeof ability.name !== 'string') errors.push(prefix + '.name must be a string')
  if (ability.description != null && typeof ability.description !== 'string') errors.push(prefix + '.description must be a string')
  if (ability.icon != null && typeof ability.icon !== 'string') errors.push(prefix + '.icon must be a string')
  if (!ABILITY_TRIGGERS.includes(ability.trigger)) errors.push(prefix + '.trigger is invalid')
  if (ability.triggerValue != null && !asNum(ability.triggerValue)) errors.push(prefix + '.triggerValue must be a number')
  if (!Array.isArray(ability.conditions)) errors.push(prefix + '.conditions must be an array')
  else ability.conditions.forEach((condition, i) => {
    const p = prefix + '.conditions[' + i + ']'
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return errors.push(p + ' must be an object')
    if (!CONDITION_TYPES.includes(condition.type)) errors.push(p + '.type is invalid')
    if (condition.operator != null && !CONDITION_OPERATORS.includes(condition.operator)) errors.push(p + '.operator is invalid')
    if (condition.value == null || (!asNum(condition.value) && typeof condition.value !== 'string')) errors.push(p + '.value is invalid')
  })
  validateEffects(ability.effects, errors, prefix + '.effects')
}

export function validateEnemy(data, expectedId) {
  const errors = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['enemy must be an object']
  if (data.schemaVersion !== ADVENTURE_SCHEMA_VERSION) errors.push('schemaVersion must be 1')
  if (!asText(data.id) || !ADVENTURE_ID_RE.test(data.id)) errors.push('id is invalid')
  if (expectedId && data.id !== expectedId) errors.push('id mismatch')
  validateNames(data.names, errors)
  if (data.description != null && typeof data.description !== 'string') errors.push('description must be a string')
  if (!asText(data.assetVariantId) || !ADVENTURE_ID_RE.test(data.assetVariantId)) errors.push('assetVariantId is invalid')
  const stats = data.stats
  if (!stats || typeof stats !== 'object') errors.push('stats must be an object')
  else {
    if (!asNum(stats.hp) || stats.hp < 1) errors.push('stats.hp must be >= 1')
    if (!asNum(stats.attack) || stats.attack < 0) errors.push('stats.attack must be >= 0')
    if (!asNum(stats.critRate) || stats.critRate < 0 || stats.critRate > 100) errors.push('stats.critRate must be 0..100')
    if (!asNum(stats.critDamage) || stats.critDamage < 0) errors.push('stats.critDamage must be >= 0')
    if (!asNum(stats.hitRate) || stats.hitRate < 0 || stats.hitRate > 100) errors.push('stats.hitRate must be 0..100')
  }
  const attack = data.normalAttack
  if (!attack || typeof attack !== 'object') errors.push('normalAttack must be an object')
  else {
    if (!['single','all','primaryPlusRandom'].includes(attack.target)) errors.push('normalAttack.target is invalid')
    if (!asInt(attack.hits) || attack.hits < 1) errors.push('normalAttack.hits must be >= 1')
    if (attack.animation != null && !['attack','skill1','skill2'].includes(attack.animation)) errors.push('normalAttack.animation is invalid')
    if (attack.skillGaugeGain != null && (!asNum(attack.skillGaugeGain) || attack.skillGaugeGain < 0 || attack.skillGaugeGain > 100)) errors.push('normalAttack.skillGaugeGain must be 0..100')
    if (attack.target === 'primaryPlusRandom' && (!asInt(attack.extraTargets) || attack.extraTargets < 1)) errors.push('normalAttack.extraTargets must be >= 1')
    validateEffects(attack.effects ?? [], errors, 'normalAttack.effects', ATTACK_SKILL_EFFECT_TYPES.filter(t => t !== 'damage'))
  }
  const support = data.normalSupport
  if (!support || typeof support !== 'object') errors.push('normalSupport must be an object')
  else {
    if (!['singleAlly','allAllies'].includes(support.target)) errors.push('normalSupport.target is invalid')
    if (support.animation != null && !['attack','skill1','skill2'].includes(support.animation)) errors.push('normalSupport.animation is invalid')
    validateEffects(support.effects ?? [], errors, 'normalSupport.effects', SUPPORT_SKILL_EFFECT_TYPES)
  }
  if (!asNum(data.skillActivationRate) || data.skillActivationRate < 0 || data.skillActivationRate > 100) errors.push('skillActivationRate must be 0..100')
  if (data.skill != null) validateSkill(data.skill, errors, 'skill')
  if (!Array.isArray(data.abilities)) errors.push('abilities must be an array')
  else data.abilities.forEach((a, i) => validateAbility(a, errors, 'abilities[' + i + ']'))
  return errors
}

export function validateStage(data, expectedId) {
  const errors = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['stage must be an object']
  if (data.schemaVersion !== ADVENTURE_SCHEMA_VERSION) errors.push('schemaVersion must be 1')
  if (!asText(data.id) || !ADVENTURE_ID_RE.test(data.id)) errors.push('id is invalid')
  if (expectedId && data.id !== expectedId) errors.push('id mismatch')
  if (!asInt(data.chapter) || data.chapter < 1) errors.push('chapter must be >= 1')
  if (!asInt(data.order) || data.order < 1) errors.push('order must be >= 1')
  validateNames(data.names, errors)
  if (data.description != null && typeof data.description !== 'string') errors.push('description must be a string')
  if (data.mapImage != null && typeof data.mapImage !== 'string') errors.push('mapImage must be a string')
  if (!Array.isArray(data.waves) || data.waves.length < 1) errors.push('waves must contain at least one wave')
  else data.waves.forEach((wave, wi) => {
    const p = 'waves[' + wi + ']'
    if (!wave || typeof wave !== 'object') return errors.push(p + ' must be an object')
    if (!asText(wave.id) || !ADVENTURE_ID_RE.test(wave.id)) errors.push(p + '.id is invalid')
    if (wave.name != null && typeof wave.name !== 'string') errors.push(p + '.name must be a string')
    if (!Array.isArray(wave.enemies) || wave.enemies.length < 1) errors.push(p + '.enemies must contain at least one enemy')
    else {
      const used = new Set()
      wave.enemies.forEach((row, ei) => {
        const ep = p + '.enemies[' + ei + ']'
        if (!row || typeof row !== 'object') return errors.push(ep + ' must be an object')
        if (!asText(row.enemyId) || !ADVENTURE_ID_RE.test(row.enemyId)) errors.push(ep + '.enemyId is invalid')
        if (!ENEMY_SLOTS.includes(row.slot)) errors.push(ep + '.slot is invalid')
        if (used.has(row.slot)) errors.push(p + ' has duplicate slot ' + row.slot)
        used.add(row.slot)
      })
    }
  })
  return errors
}
