import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { validateEnemy, validateStage } from './adventure-schema.mjs'

const root = path.resolve(process.cwd())
const enemiesDir = path.join(root, 'data', 'game', 'enemies')
const stagesDir = path.join(root, 'data', 'game', 'stages')

async function docs(dir) {
  const names = (await fs.readdir(dir)).filter(name => name.endsWith('.json')).sort()
  return Promise.all(names.map(async name => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))))
}

const enemies = await docs(enemiesDir)
const stages = await docs(stagesDir)
assert.ok(enemies.length > 0, 'expected at least one enemy')
assert.ok(stages.length > 0, 'expected at least one stage')

for (const enemy of enemies) {
  assert.deepEqual(validateEnemy(enemy, enemy.id), [], 'invalid enemy ' + enemy.id)
  assert.ok(enemy.normalAttack, enemy.id + ' must have normalAttack')
  assert.ok(Array.isArray(enemy.abilities), enemy.id + ' abilities must be an array')
}

const enemyIds = new Set(enemies.map(enemy => enemy.id))
for (const stage of stages) {
  assert.deepEqual(validateStage(stage, stage.id), [], 'invalid stage ' + stage.id)
  assert.ok(stage.waves.length > 0, stage.id + ' must have waves')
  for (const wave of stage.waves) {
    assert.ok(wave.enemies.length > 0, stage.id + '/' + wave.id + ' must not be empty')
    for (const row of wave.enemies) assert.ok(enemyIds.has(row.enemyId), 'unknown enemy ' + row.enemyId)
  }
}

// Feature coverage uses synthetic fixtures so admin-authored content may change freely.
const syntheticEnemy = {
  schemaVersion: 1,
  id: 'test_enemy',
  names: { zh: '測試敵人', en: '', th: '', jp: '' },
  description: '',
  assetVariantId: 'u91003-bomby',
  stats: { hp: 100, attack: 10, critRate: 0, critDamage: 3, hitRate: 100 },
  normalAttack: {
    target: 'single',
    hits: 1,
    skillGaugeGain: 5,
    effects: [{ type: 'attackDown', value: 10, duration: 1 }],
  },
  skill: null,
  abilities: [],
}
assert.deepEqual(validateEnemy(syntheticEnemy, syntheticEnemy.id), [])
assert.equal(syntheticEnemy.skill, null, 'enemy skill must be optional')
assert.equal(
  syntheticEnemy.normalAttack.effects[0].type,
  'attackDown',
  'enemy normal attack extra effects must be supported',
)

const syntheticStage = {
  schemaVersion: 1,
  id: 'test_stage',
  chapter: 1,
  order: 1,
  names: { zh: '測試關卡', en: '', th: '', jp: '' },
  description: '',
  mapImage: '/maps/map1_full.jpg',
  waves: [
    { id: 'wave_1', name: '第一波', enemies: [{ enemyId: 'test_enemy', slot: 'front-0' }] },
    { id: 'wave_2', name: '第二波', enemies: [{ enemyId: 'test_enemy', slot: 'front-1' }] },
  ],
}
assert.deepEqual(validateStage(syntheticStage, syntheticStage.id), [])
assert.equal(syntheticStage.waves.length, 2, 'multi-wave stages must be supported')

console.log('Adventure data tests passed:', enemies.length, 'enemies,', stages.length, 'stages')
